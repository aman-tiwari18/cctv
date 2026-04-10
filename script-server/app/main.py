#main.py
import asyncio
import re
import os
import shutil
import openpyxl
from openpyxl.styles import Font
from pydantic import BaseModel
from datetime import datetime,time
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote
from typing import Optional, List
import socketio
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import HTTP_PORT, MAIN_BACKEND_URL, POLL_INTERVAL_MS, SCRIPTS_DIR
from app.logger import logger
from app.log_manager import log_manager
from app.poller import poller_service
from scripts.detection.utils.db_client import get_hls_camera_by_ch_code, get_rtsp_camera_by_id, get_hls_cameras, get_rtsp_cameras, get_rtsp_camera_by_device_and_ch

# Import legacy pipeline functionality from the old backend
from scripts.detection.backend.schemas import (
    StartRequest, StopRequest, StatusResponse as AnalyticsStatusResponse, MessageResponse
)
from scripts.detection.backend.pipeline_manager import (
    start_analytics, stop_analytics, status_analytics,
    cleanup_old_pipelines, processes, ALL_ANALYTICS
)

DETECTION_SCAN_INTERVAL_SECONDS = 2
known_detection_files = {}


@lru_cache(maxsize=4096)
def _camera_meta_for_ch(ch_no: str, exam_date_iso: str) -> dict:
    if not ch_no:
        return {}
    return get_hls_camera_by_ch_code(ch_no, exam_date_iso) or {}


@lru_cache(maxsize=4096)
def _camera_meta_for_rtsp_pk(camera_id_pk: int) -> dict:
    """Fetch RTSP camera metadata by primary key."""
    if not camera_id_pk:
        return {}
    return get_rtsp_camera_by_id(camera_id_pk) or {}


# RTSP filenames follow: {script}_{camera_id_pk}_{camera_no}_{date}_{time}_{extra}.jpg
# The prefix (script name like server, phone, crowd, etc.) comes before the pk.
_RTSP_SCRIPT_PREFIXES = {
    "server", "crowd", "intruder", "entry", "phone", "proximity",
    "invigilator", "tamper", "inversion", "blind", "zero", "five",
    "tampering", "violation", "entry_exit", "server_room", "blind_spot",
    "inversion", "tamper", "zero_person", "detection", "crowd_zero", "crowd_five",
    "blindspot"
}


def _is_rtsp_filename(stem: str) -> bool:
    """Check if filename matches RTSP naming: {prefix}_{pk}_{cam_no}_{date}_{time}..."""
    parts = stem.split("_")
    if len(parts) >= 3:
        prefix = parts[0].lower()
        if prefix in _RTSP_SCRIPT_PREFIXES and parts[1].isdigit():
            return True
    return False


def _extract_rtsp_pk(stem: str) -> int:
    """Extract the camera_id_pk (second segment) from an RTSP filename."""
    parts = stem.split("_")
    if len(parts) >= 2 and parts[1].isdigit():
        return int(parts[1])
    return 0


def _extract_ch_no(camera_id: str) -> str:
    if not camera_id:
        return ""
    # Supports invigilator ids like 11365_54703_* where second segment is ch code.
    m = re.search(r"^\d+_(\d+)", camera_id)
    if m:
        return m.group(1)

    # Prefer pattern like phone_ch11365_54703 -> use 54703 as channel code.
    m = re.search(r"ch\d+_(\d+)", camera_id, flags=re.IGNORECASE)
    if m:
        return m.group(1)

    # Supports ids like blind_ch22760, ch22760, 22760
    m = re.search(r"ch(\d+)", camera_id, flags=re.IGNORECASE)
    if m:
        return m.group(1)
    m = re.search(r"(\d+)", camera_id)
    return m.group(1) if m else ""


def _iter_detection_files(type_key: str, folder: Path):
    """Yield image files for one detection type.

    Uses recursive discovery so nested folders (for example invigilator camera
    subfolders) are included in API listing and live Socket.IO notifications.
    """
    if not folder.exists():
        return

    for f in folder.rglob("*"):
        if not f.is_file() or f.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue

        # Invigilator keeps periodic snapshots in /annotated; show event images only.
        if type_key == "invigilator" and "annotated" in {p.lower() for p in f.parts}:
            continue

        yield f


def list_detection_files() -> dict:
    """Scan both HLS (tcs_detections/) and RTSP (results/) directories."""
    snapshot = {}
    for type_key, folder_name in DETECTION_FOLDERS.items():
        files = set()

        # HLS directory
        hls_folder = RESULTS_DIR / folder_name
        if hls_folder.exists():
            for f in _iter_detection_files(type_key, hls_folder):
                # prefix with hls: so we know the origin
                files.add("hls:" + str(f.relative_to(hls_folder).as_posix()))

        # RTSP directory
        rtsp_folder = RTSP_RESULTS_DIR / folder_name
        if rtsp_folder.exists():
            for f in _iter_detection_files(type_key, rtsp_folder):
                files.add("rtsp:" + str(f.relative_to(rtsp_folder).as_posix()))

        snapshot[type_key] = files
    return snapshot


async def detection_watch_loop():
    global known_detection_files

    while True:
        await asyncio.sleep(DETECTION_SCAN_INTERVAL_SECONDS)
        current_snapshot = list_detection_files()

        for type_key, current_files in current_snapshot.items():
            previous_files = known_detection_files.get(type_key, set())
            new_files = sorted(current_files - previous_files)

            for tagged_path in new_files:
                # tagged_path is "hls:relative" or "rtsp:relative"
                origin, relative_path = tagged_path.split(":", 1)
                if origin == "rtsp":
                    base_dir = RTSP_RESULTS_DIR
                else:
                    base_dir = RESULTS_DIR
                file_path = base_dir / DETECTION_FOLDERS[type_key] / relative_path
                payload = parse_detection_filename(
                    relative_path, type_key, file_path,
                    is_new_image=True, source=origin,
                )
                await sio.emit("detection:new", payload)
                logger.info(f"Live detection emitted ({origin}): {type_key} {relative_path}")

        known_detection_files = current_snapshot


sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Old fastAPI startup hook logic for pipeline cleanup 
    cleanup_old_pipelines()
    
    # Startup logic
    logger.info("Starting CCTV Script Execution Server (FastAPI)...")
    logger.info(f"Main backend URL: {MAIN_BACKEND_URL}")
    logger.info(f"Poll interval: {POLL_INTERVAL_MS}ms")
    logger.info(f"Scripts directory: {SCRIPTS_DIR}")
    logger.info(f"HTTP server port: {HTTP_PORT}")
    
    # Start poller
    await poller_service.start()

    global known_detection_files
    known_detection_files = list_detection_files()
    
    # Background log cleanup task
    async def cleanup_loop():
        while True:
            await asyncio.sleep(24 * 60 * 60)  # Run daily
            log_manager.cleanup_old_logs(30)
            
    cleanup_task = asyncio.create_task(cleanup_loop())
    detection_task = asyncio.create_task(detection_watch_loop())
    logger.info("Script execution server started successfully")
    
    yield
    
    # Shutdown logic
    logger.info("Shutting down...")
    await poller_service.stop()
    cleanup_task.cancel()
    detection_task.cancel()

# app = FastAPI(lifespan=lifespan)
app = FastAPI(
    lifespan=lifespan,
    root_path="/cctv_dev"
)

# ── Detection image directories ──────────────────────────────
RESULTS_DIR = Path(SCRIPTS_DIR).resolve() / "detection" / "results" / "tcs_detections"
RTSP_RESULTS_DIR = Path(SCRIPTS_DIR).resolve() / "detection" / "results"
CLIENT_SELECTED_DIR = Path(SCRIPTS_DIR).resolve() / "detection" / "results" / "client_selected_images"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
RTSP_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
CLIENT_SELECTED_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.debug(f"{request.method} {request.url.path}")
    response = await call_next(request)
    return response


# ── Image serving endpoints (replaces StaticFiles mounts) ─────
def _safe_resolve(base_dir: Path, relative: str) -> Path:
    """Resolve a relative path against base_dir, preventing directory traversal."""
    candidate = (base_dir / relative).resolve()
    if not str(candidate).startswith(str(base_dir.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return candidate


@app.get("/serve-detection-images/{file_path:path}")
async def serve_detection_image(file_path: str):
    resolved = _safe_resolve(RESULTS_DIR, file_path)
    return FileResponse(resolved, media_type="image/jpeg")


@app.get("/serve-rtsp-detection-images/{file_path:path}")
async def serve_rtsp_detection_image(file_path: str):
    resolved = _safe_resolve(RTSP_RESULTS_DIR, file_path)
    return FileResponse(resolved, media_type="image/jpeg")


@app.get("/serve-client-detection-images/{file_path:path}")
async def serve_client_detection_image(file_path: str):
    resolved = _safe_resolve(CLIENT_SELECTED_DIR, file_path)
    return FileResponse(resolved, media_type="image/jpeg")

@app.get("/health")
async def health_check():
    import time
    return {
        "success": True,
        "message": "Script execution server is running",
        "timestamp": datetime.now().isoformat(),
        "uptime": time.monotonic()  # Basic uptime metric
    }

@app.get("/status")
async def status():
    return {
        "success": True,
        "data": poller_service.get_status()
    }

@app.get("/executions/running")
async def get_running():
    running_scripts = list(poller_service.running_scripts)
    return {
        "success": True,
        "count": len(running_scripts),
        "data": [{"assignmentId": id} for id in running_scripts]
    }

@app.post("/executions/{execution_id}/cancel")
async def cancel_execution(execution_id: str):
    """
    Manually cancel a running script without stopping the server.
    Sends SIGTERM to the subprocess, marks the assignment CANCELLED in the DB,
    and removes it from the poller's running set.
    """
    from app.script_runner import script_runner

    killed = await script_runner.cancel(execution_id)

    if not killed:
        # Not in active processes — check if it's tracked by poller at all
        if execution_id not in poller_service.running_scripts:
            raise HTTPException(
                status_code=404,
                detail=f"No running script with execution_id={execution_id}"
            )

    # Remove from poller's running set so it won't be re-queued
    poller_service.running_scripts.discard(execution_id)

    # Mark CANCELLED in the main backend DB
    await poller_service.update_assignment_status(
        execution_id, "CANCELLED", {"error_log": "Manually cancelled via API"}
    )

    logger.info(f"⏹ Assignment {execution_id} cancelled by user request")
    return {
        "success": True,
        "message": f"Assignment {execution_id} has been cancelled",
        "process_killed": killed,
    }

@app.get("/executions/recent")
async def get_recent(limit: int = 20, date: Optional[str] = None):
    try:
        parsed_date = datetime.fromisoformat(date) if date else datetime.now()
    except ValueError:
        parsed_date = datetime.now()
        
    log_files = log_manager.get_log_files_for_date(parsed_date)
    recent = []
    
    for file in log_files[:limit]:
        recent.append({
            "executionId": file["executionId"],
            "filename": file["filename"],
            "summary": log_manager.get_log_summary(file["executionId"], parsed_date)
        })
        
    return {
        "success": True,
        "count": len(recent),
        "data": recent
    }

@app.get("/logs/{execution_id}")
async def get_logs(execution_id: str, date: Optional[str] = None):
    try:
        parsed_date = datetime.fromisoformat(date) if date else datetime.now()
    except ValueError:
        parsed_date = datetime.now()
        
    logs = log_manager.read_logs(execution_id, parsed_date)
    
    if not logs:
        raise HTTPException(status_code=404, detail="Logs not found for this execution")
        
    return {
        "success": True,
        "data": {
            "executionId": execution_id,
            "logs": logs,
            "summary": log_manager.get_log_summary(execution_id, parsed_date)
        }
    }

# ==========================================
# Legacy Manual Analytics Endpoints
# ==========================================

@app.post("/analytics/start", response_model=MessageResponse)
def start_analytics_route(req: StartRequest):
    if req.all:
        started = start_analytics(ALL_ANALYTICS)
        return {"message": f"Started ALL analytics: {started}"}

    if not req.analytics:
        raise HTTPException(400, "Provide analytics list or set all=true")

    started = start_analytics(req.analytics)
    return {"message": f"Started analytics: {started}"}

@app.post("/analytics/stop", response_model=MessageResponse)
def stop_analytics_route(req: StopRequest):
    if req.all:
        stopped = stop_analytics(list(processes.keys()))
        return {"message": f"Stopped ALL analytics: {stopped}"}

    if not req.analytics:
        raise HTTPException(400, "Provide analytics list or set all=true")

    stopped = stop_analytics(req.analytics)
    return {"message": f"Stopped analytics: {stopped}"}

@app.get("/analytics/status", response_model=AnalyticsStatusResponse)
def status_analytics_route():
    running, stopped = status_analytics()
    return {"running": running, "stopped": stopped}


# ==========================================
# Detections Endpoints
# ==========================================

DETECTION_FOLDERS = {
    "proximity":  "proximity_detection",
    "crowd":      "crowd_detection",
    "crowd_five": "crowd_detection_threshold",
    "crowd_zero": "zero_person_detection",
    "server":     "server_room_detection",
    "intruder":   "intruder_detection",
    "entry_exit": "entry_exit_detection",
    "phone":      "phone_detection",
    "blind_spot": "blind_spot_detection",
    "invigilator":"invigilator_detection",
    "inversion" : "camera_inversion_detection",
    "tamper" : "camera_tampering_detection",
}

DETECTION_LABELS = {
    "proximity":   "Close Proximity",
    "crowd":       "Crowd Detection",
    "crowd_five":  "Crowd < 5",
    "crowd_zero":  "Zero Person",
    "server":      "Server Room",
    "intruder":    "Intruder Detection",
    "entry_exit":  "Entry/Exit",
    "phone":       "Phone Detection",
    "blind_spot":  "Blind Spot",
    "invigilator": "Invigilator Tracking",
    "tamper" : "Camera Tampering",
    "inversion" : "Camera Inversion",
    
}

def parse_detection_filename(
    filename: str,
    type_key: str,
    file_path: Optional[Path] = None,
    is_new_image: bool = False,
    source: str = "hls",
) -> dict:
    """Parse metadata from a detection image filename.

    For RTSP files the naming convention is:
        {script}_{camera_id_pk}_{camera_no}_{date}_{time}_{extra}.jpg
    For HLS files the naming convention is:
        {camera_id}_{date}_{time}_{extra}.jpg
    """
    file_obj = Path(filename)
    basename = file_obj.name
    stem = file_obj.stem  # without extension

    date_str, time_str = "", ""
    camera_id = ""
    suffix = ""
    rtsp_pk = 0

    # ── Try RTSP naming pattern: {prefix}_{pk}_{camNo}_{date}_{time}... ──
    # Now agnostic to the source directory to handle complex samarth-style paths
    if _is_rtsp_filename(stem):
        # rtsp_pk = _extract_rtsp_pk(stem)
        parts = stem.split("_")
        rtsp_device_id = parts[1]
        rtsp_camera_no = parts[2]
        dt_match = re.search(r'(\d{8})_(\d{6})', stem)
        if dt_match:
            date_str = dt_match.group(1)
            time_str = dt_match.group(2)
            camera_id = f"{rtsp_device_id}_{rtsp_camera_no}"
            suffix = stem[dt_match.end():].strip('_')
        else:
            camera_id = stem
    else:
        # ── HLS / legacy naming ──
        dt_match = re.search(r'(\d{8})_(\d{6})', stem)
        if dt_match:
            date_str = dt_match.group(1)
            time_str = dt_match.group(2)
            camera_id = stem[:dt_match.start()].strip('_')
            suffix = stem[dt_match.end():].strip('_')
        else:
            camera_id = stem

    # Format datetime
    detected_at = ""
    if date_str and time_str:
        try:
            dt = datetime.strptime(date_str + time_str, "%Y%m%d%H%M%S")
            detected_at = dt.strftime("%d %b %Y, %I:%M:%S %p")
        except Exception:
            detected_at = f"{date_str} {time_str}"

    # Extract confidence
    conf_match = re.search(r'conf([\d.]+)', suffix)
    confidence = float(conf_match.group(1)) if conf_match else None

    # Extract count (persons / violations)
    count_match = re.search(r'(?:persons|violations)(\d+)', suffix)
    count = int(count_match.group(1)) if count_match else None

    issue_match = re.search(r'([a-zA-Z]+)\d*$', suffix)
    issue_type = issue_match.group(1).lower() if issue_match else ""
    if type_key == "invigilator":
        inv_parts = {p.lower() for p in file_obj.parts}
        if "no_targets" in inv_parts:
            issue_type = "no_targets"
        elif "static_person" in inv_parts:
            issue_type = "static_person"
        elif not issue_type:
            stem_l = stem.lower()
            if "static_person" in stem_l:
                issue_type = "static_person"
            elif "no_targets" in stem_l:
                issue_type = "no_targets"

    exam_date_iso = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}" if date_str else ""

    # ── Metadata lookup: RTSP uses pk, HLS uses ch_code ──
    # if source == "rtsp" and rtsp_pk:
    #     cam_meta = _camera_meta_for_rtsp_pk(rtsp_pk)
    if source == "rtsp" and _is_rtsp_filename(stem):
        parts = stem.split("_")
        dev_id = parts[1]
        cam_no_part = parts[2]
        cam_meta = get_rtsp_camera_by_device_and_ch(dev_id, cam_no_part)
    else:
        ch_no = _extract_ch_no(camera_id)
        cam_meta = _camera_meta_for_ch(ch_no, exam_date_iso)

    ch_no_display = str(cam_meta.get("camera_no") or cam_meta.get("ch_code") or _extract_ch_no(camera_id))
    camera_name = cam_meta.get("camera_name") or camera_id
    center_name = cam_meta.get("centre_name") or ""
    city = cam_meta.get("city") or ""
    state = cam_meta.get("state") or ""
    tc_code = cam_meta.get("tc_code")
    category = cam_meta.get("camera_category") or cam_meta.get("classification") or ""
    cctv_url = cam_meta.get("cctv_url") or ""

    now_ms = int(datetime.now().timestamp() * 1000)
    timestamp_iso = datetime.now().isoformat()
    date_display = ""
    if date_str:
        date_display = f"{date_str[6:]}-{date_str[4:6]}-{date_str[:4]}"

    image_rel = quote(str(file_obj.as_posix()), safe="/")
    issue_label_map = {
        "no_targets": "No Targets",
        "static_person": "Static Person",
    }

    # ── Image URL: different endpoint for RTSP vs HLS ──
    if source == "rtsp":
        image_url = f"/serve-rtsp-detection-images/{DETECTION_FOLDERS[type_key]}/{image_rel}"
    else:
        image_url = f"/serve-detection-images/{DETECTION_FOLDERS[type_key]}/{image_rel}"

    return {
        "filename":    basename,
        "relativePath": str(file_obj.as_posix()),
        "type":        type_key,
        "label":       DETECTION_LABELS.get(type_key, type_key),
        "camera_id":   camera_id,
        "cameraId":    camera_id,
        "chNo":        int(ch_no_display) if ch_no_display and ch_no_display.isdigit() else None,
        "time":        time_str,
        "rawDate":     date_str,
        "issueType":   issue_type,
        "issueLabel":  issue_label_map.get(issue_type, issue_type.replace("_", " ").title() if issue_type else ""),
        "detectionType": type_key,
        "addedAt":     now_ms,
        "timestamp":   timestamp_iso,
        "isNewImage":  is_new_image,
        "source":      source,
        "cameraName":  camera_name,
        "centerName":  center_name,
        "city":        city,
        "state":       state,
        "tcCode":      tc_code,
        "category":    category,
        "cctvUrl":     cctv_url,
        "path":        str(file_path) if file_path else "",
        "detected_at": detected_at,
        "date":        exam_date_iso,
        "examDate":    date_display,
        "confidence":  confidence,
        "count":       count,
        "image_url":   image_url,
    }

# @app.get("/detections")
# def list_detections(
#     type: Optional[str] = None,
#     date: Optional[str] = None,
#     search: Optional[str] = None,
#     source: Optional[str] = None,
#     page: int = 1,
#     limit: int = 50,
# ):
#     rows = []
#     folders = {type: DETECTION_FOLDERS[type]} if type and type in DETECTION_FOLDERS else DETECTION_FOLDERS

#     def _scan_dir(base_dir: Path, origin: str):
#         for type_key, folder_name in folders.items():
#             folder = base_dir / folder_name
#             if not folder.exists():
#                 continue
#             for f in _iter_detection_files(type_key, folder):
#                 relative_path = str(f.relative_to(folder).as_posix())
#                 item = parse_detection_filename(
#                     relative_path, type_key, f,
#                     is_new_image=False, source=origin,
#                 )

#                 if date and not item["date"].startswith(date):
#                     continue

#                 if search:
#                     q = search.lower()
#                     haystack = " ".join([
#                         str(item.get("camera_id") or ""),
#                         str(item.get("cameraName") or ""),
#                         str(item.get("centerName") or ""),
#                         str(item.get("city") or ""),
#                         str(item.get("state") or ""),
#                         str(item.get("tcCode") or ""),
#                     ]).lower()
#                     if q not in haystack:
#                         continue

#                 rows.append((f.stat().st_mtime, item))

#     # Scan based on source filter or both
#     if source != "rtsp":
#         _scan_dir(RESULTS_DIR, "hls")
#     if source != "hls":
#         _scan_dir(RTSP_RESULTS_DIR, "rtsp")

#     # Sort by file write time descending (newest first).
#     rows.sort(key=lambda x: x[0], reverse=True)
#     results = [item for _, item in rows]

#     total = len(results)
#     start = (page - 1) * limit
#     paginated = results[start: start + limit]

#     # Summary counts per type
#     counts = {k: 0 for k in DETECTION_FOLDERS}
#     for r in results:
#         counts[r["type"]] = counts.get(r["type"], 0) + 1

#     return {
#         "success": True,
#         "total":   total,
#         "page":    page,
#         "limit":   limit,
#         "counts":  counts,
#         "data":    paginated,
#     }


@app.get("/detections")
def list_detections(
    type: Optional[str] = None,
    date: Optional[str] = None,
    search: Optional[str] = None,
    source: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    rows = []
    folders = {type: DETECTION_FOLDERS[type]} if type and type in DETECTION_FOLDERS else DETECTION_FOLDERS

    def _scan_dir(base_dir: Path, origin: str):
        for type_key, folder_name in folders.items():
            folder = base_dir / folder_name
            if not folder.exists():
                continue
            for f in _iter_detection_files(type_key, folder):
                relative_path = str(f.relative_to(folder).as_posix())
                item = parse_detection_filename(
                    relative_path, type_key, f,
                    is_new_image=False, source=origin,
                )

                if date and not item["date"].startswith(date):
                    continue

                if start_time or end_time:
                    time_str = item.get("time")
                    if time_str and len(time_str) >= 4:
                        h_m = f"{time_str[:2]}:{time_str[2:4]}"
                        if start_time and h_m < start_time:
                            continue
                        if end_time and h_m > end_time:
                            continue

                if search:
                    q = search.lower()
                    haystack = " ".join([
                        str(item.get("camera_id") or ""),
                        str(item.get("cameraName") or ""),
                        str(item.get("centerName") or ""),
                        str(item.get("city") or ""),
                        str(item.get("state") or ""),
                        str(item.get("tcCode") or ""),
                    ]).lower()
                    if q not in haystack:
                        continue

                rows.append((f.stat().st_mtime, item))

    # Scan based on source filter or both
    if source != "rtsp":
        _scan_dir(RESULTS_DIR, "hls")
    if source != "hls":
        _scan_dir(RTSP_RESULTS_DIR, "rtsp")

    # Sort by file write time descending (newest first).
    rows.sort(key=lambda x: x[0], reverse=True)
    results = [item for _, item in rows]

    total = len(results)
    start = (page - 1) * limit
    paginated = results[start: start + limit]

    # Summary counts per type
    counts = {k: 0 for k in DETECTION_FOLDERS}
    for r in results:
        counts[r["type"]] = counts.get(r["type"], 0) + 1

    return {
        "success": True,
        "total":   total,
        "page":    page,
        "limit":   limit,
        "counts":  counts,
        "data":    paginated,
    }



def _validate_relative_path(path_str: str) -> Path:
    candidate = Path(path_str)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise HTTPException(status_code=400, detail="Invalid relative path")
    return candidate


def _resolve_detection_source_path(source: str, type_key: str, relative_path: str) -> Path:
    if source not in {"hls", "rtsp"}:
        raise HTTPException(status_code=400, detail="Invalid source")
    if type_key not in DETECTION_FOLDERS:
        raise HTTPException(status_code=400, detail="Invalid detection type")

    folder_name = DETECTION_FOLDERS[type_key]
    base_dir = RESULTS_DIR if source == "hls" else RTSP_RESULTS_DIR
    safe_rel = _validate_relative_path(relative_path)
    abs_path = (base_dir / folder_name / safe_rel).resolve()

    if not str(abs_path).startswith(str((base_dir / folder_name).resolve())):
        raise HTTPException(status_code=400, detail="Invalid relative path")
    if not abs_path.exists() or not abs_path.is_file():
        raise HTTPException(status_code=404, detail=f"Source file not found: {relative_path}")

    return abs_path


class ClientDetectionCopyItem(BaseModel):
    source: str
    type: str
    relativePath: str


class ClientDetectionCopyRequest(BaseModel):
    items: list[ClientDetectionCopyItem]


@app.post("/client-detections/copy")
async def copy_client_detections(payload: ClientDetectionCopyRequest):
    copied = []
    failed = []

    for item in payload.items:
        try:
            src_path = _resolve_detection_source_path(item.source, item.type, item.relativePath)
        except HTTPException as e:
            logger.warning(f"Skipping copy for {item.relativePath}: {e.detail}")
            failed.append({"relativePath": item.relativePath, "error": e.detail})
            continue

        dest_path = CLIENT_SELECTED_DIR / item.source / DETECTION_FOLDERS[item.type] / item.relativePath
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dest_path)

        copied_item = parse_detection_filename(
            item.relativePath,
            item.type,
            dest_path,
            is_new_image=False,
            source=item.source,
        )
        copied_item.update({
            "source": item.source,
            "type": item.type,
            "relativePath": item.relativePath,
            "image_url": f"/serve-client-detection-images/{item.source}/{DETECTION_FOLDERS[item.type]}/{item.relativePath}",
        })
        copied.append(copied_item)

        try:
            await sio.emit("client-detection:new", copied_item)
            logger.info(f"Emitted client-detection:new for {item.relativePath}")
        except Exception as e:
            logger.warning(f"Failed to emit client detection socket event: {e}")

    return {"success": True, "copied": copied, "failed": failed}


# @app.get("/client-detections")
# def list_client_detections(page: int = 1, limit: int = 100, source: Optional[str] = None, type: Optional[str] = None):
#     rows = []

#     for root, _, files in os.walk(CLIENT_SELECTED_DIR):
#         for filename in files:
#             if not filename.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
#                 continue

#             file_path = Path(root) / filename
#             rel = file_path.relative_to(CLIENT_SELECTED_DIR).as_posix()
#             parts = rel.split("/")
#             if len(parts) < 3:
#                 continue

#             source_part = parts[0]
#             folder_name = parts[1]
#             relative_path = "/".join(parts[2:])
#             type_key = next((k for k, v in DETECTION_FOLDERS.items() if v == folder_name), folder_name)

#             if source and source != source_part:
#                 continue
#             if type and type != type_key:
#                 continue

#             item = parse_detection_filename(
#                 relative_path,
#                 type_key,
#                 file_path,
#                 is_new_image=False,
#                 source=source_part,
#             )
#             item.update({
#                 "source": source_part,
#                 "type": type_key,
#                 "filename": filename,
#                 "relativePath": relative_path,
#                 "image_url": f"/serve-client-detection-images/{rel}",
#                 "_mtime": file_path.stat().st_mtime,
#             })
#             rows.append(item)

#     rows.sort(key=lambda item: item.get("_mtime", 0), reverse=True)

#     total = len(rows)
#     start = (page - 1) * limit
#     paginated = rows[start: start + limit]

#     counts = {k: 0 for k in DETECTION_FOLDERS}
#     for row in rows:
#         counts[row["type"]] = counts.get(row["type"], 0) + 1

#     return {
#         "success": True,
#         "total": total,
#         "page": page,
#         "limit": limit,
#         "counts": counts,
#         "data": paginated,
#     }


@app.get("/client-detections")
def list_client_detections(
    page: int = 1, 
    limit: int = 100, 
    source: Optional[str] = None, 
    type: Optional[str] = None,
    date: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    search: Optional[str] = None,
):
    rows = []

    for root, _, files in os.walk(CLIENT_SELECTED_DIR):
        for filename in files:
            if not filename.lower().endswith((".jpg", ".jpeg", ".png", ".bmp", ".webp")):
                continue

            file_path = Path(root) / filename
            rel = file_path.relative_to(CLIENT_SELECTED_DIR).as_posix()
            parts = rel.split("/")
            if len(parts) < 3:
                continue

            source_part = parts[0]
            folder_name = parts[1]
            relative_path = "/".join(parts[2:])
            type_key = next((k for k, v in DETECTION_FOLDERS.items() if v == folder_name), folder_name)

            if source and source != source_part:
                continue
            if type and type != type_key:
                continue

            item = parse_detection_filename(
                relative_path,
                type_key,
                file_path,
                is_new_image=False,
                source=source_part,
            )
            item.update({
                "source": source_part,
                "type": type_key,
                "filename": filename,
                "relativePath": relative_path,
                "image_url": f"/serve-client-detection-images/{rel}",
                "_mtime": file_path.stat().st_mtime,
            })

            if date and not item["date"].startswith(date):
                continue
            
            if start_time or end_time:
                time_str = item.get("time")
                if time_str and len(time_str) >= 4:
                    h_m = f"{time_str[:2]}:{time_str[2:4]}"
                    if start_time and h_m < start_time:
                        continue
                    if end_time and h_m > end_time:
                        continue
                        
            if search:
                q = search.lower()
                haystack = " ".join([
                    str(item.get("filename") or ""),
                    str(item.get("cameraName") or ""),
                    str(item.get("centerName") or ""),
                    str(item.get("city") or ""),
                    str(item.get("state") or ""),
                    str(item.get("tcCode") or ""),
                ]).lower()
                if q not in haystack:
                    continue

            rows.append(item)

    rows.sort(key=lambda item: item.get("_mtime", 0), reverse=True)

    total = len(rows)
    start = (page - 1) * limit
    paginated = rows[start: start + limit]

    counts = {k: 0 for k in DETECTION_FOLDERS}
    for row in rows:
        counts[row["type"]] = counts.get(row["type"], 0) + 1

    return {
        "success": True,
        "total": total,
        "page": page,
        "limit": limit,
        "counts": counts,
        "data": paginated,
    }


@sio.event
async def connect(sid, environ, auth):
    logger.info(f"Socket.IO client connected: {sid}")
    await sio.emit("detections:connected", {"success": True}, to=sid)


@sio.event
async def disconnect(sid):
    logger.info(f"Socket.IO client disconnected: {sid}")


fastapi_app = app
# ==========================================
# Report Generation Endpoint
# ==========================================
# Yeh poora block main.py mein paste karo —
# existing imports ke neeche aur @app routes ke saath.
#
# Required imports (main.py ke top pe already nahi hain toh add karo):
#   import sys, openpyxl
#   from openpyxl.styles import Font
#   from pydantic import BaseModel
#   from scripts.detection.utils.db_client import DB_CONFIG, get_hls_cameras, get_rtsp_cameras
# ==========================================

import sys
import openpyxl
from openpyxl.styles import Font
from pydantic import BaseModel
import pymysql

# db_client already imported in main.py — sirf ye 2 functions add karo
from scripts.detection.utils.db_client import (
    DB_CONFIG,
    get_hls_cameras,
    get_rtsp_cameras,
)

# ── Config ──────────────────────────────────────────────────────
_REPORT_OUTPUT_DIR  = "/data/cctv_backup/cctv-analytics-system"
_REPORT_BASE_IMG    = "http://www.examscctvmonitoring.com/cctv/images/results/new_tcs_results"
_REPORT_RESULTS_DIR = str(Path(SCRIPTS_DIR).resolve() / "detection" / "results" / "tcs_detections")

os.makedirs(_REPORT_OUTPUT_DIR, exist_ok=True)

_REPORT_PREFIX_MAP = {
    "crowd":      "Crowd",
    "EntryExit":  "Entry Exit",
    "phone":      "Phone",
    "violation":  "Proximity",
    "server":     "Server Room",
    "tampering":  "Camera Tampering",
    "Inversion":  "Camera Inversion",
    "lessthan5":  "Crowd Threshold",
    "zero":       "Zero Person",
    "blind":      "Blind Spot",
}

_REPORT_SCAN_FOLDERS = [
    "crowd_detection",
    "entry_exit_detection",
    "phone_detection",
    "proximity_detection",
    "server_room_detection",
    "camera_tampering_detection",
    "camera_inversion_detection",
    "crowd_detection_threshold",
    "zero_person_detection",
    "blind_spot_detection",
]


# ── Request schema ───────────────────────────────────────────────
class ReportRequest(BaseModel):
    exam_id: int
    date: str   # "YYYY-MM-DD"


# ── Extra DB helpers (db_client mein nahi hain) ──────────────────
def _report_db_conn():
    """db_client ka DB_CONFIG reuse — no duplication."""
    cfg = {k: v for k, v in DB_CONFIG.items() if k != "cursorclass"}
    return pymysql.connect(**cfg, cursorclass=pymysql.cursors.DictCursor)


def _fetch_exam(exam_id: int) -> dict | None:
    with _report_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, exam_name, link_type FROM exams WHERE id=%s LIMIT 1",
                (exam_id,)
            )
            return cur.fetchone()


def _fetch_shifts(exam_id: int) -> list:
    with _report_db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, shift_name, start_time, end_time "
                "FROM exam_shifts WHERE exam_id=%s AND is_active=1 ORDER BY start_time",
                (exam_id,)
            )
            rows = cur.fetchall()

    result = []
    for r in rows:
        val = r["start_time"]
        # MySQL TIME → Python time (comes as timedelta from pymysql)
        def _td(v):
            if isinstance(v, time):
                return v
            t = int(v.total_seconds())
            return time(t // 3600, (t % 3600) // 60, t % 60)

        result.append({
            "id":         r["id"],
            "shift_name": r["shift_name"],
            "start_time": _td(r["start_time"]),
            "end_time":   _td(r["end_time"]),
        })
    return result


# ── Scan helpers ─────────────────────────────────────────────────
def _report_ch_from_file(filename: str) -> str | None:
    m = re.search(r'_ch?(\d+)_\d{8}_\d{6}', os.path.basename(filename), re.IGNORECASE)
    return m.group(1) if m else None


def _report_dt_from_file(filename: str) -> datetime | None:
    m = re.search(r'(\d{8})_(\d{6})', filename)
    if m:
        try:
            return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
        except Exception:
            return None
    return None


def _report_det_type(filename: str) -> str:
    name = os.path.basename(filename)
    for prefix, label in _REPORT_PREFIX_MAP.items():
        if name.startswith(prefix + "_"):
            return label
    return "Unknown"


def _report_shift_for(image_time, shifts: list) -> dict | None:
    for s in shifts:
        if s["start_time"] <= image_time <= s["end_time"]:
            return s
    return None


def _auto_width(ws, max_w=40):
    for col in ws.columns:
        mx = max((len(str(c.value)) for c in col if c.value), default=0)
        ws.column_dimensions[col[0].column_letter].width = min(mx + 2, max_w)


# ── Scan detection images ────────────────────────────────────────
def _scan_detections(cameras: list, shifts: list, target_date: str):
    ch_map       = {str(c["ch_code"]).strip().lower(): c for c in cameras if c.get("ch_code")}
    shift_counts = {s["shift_name"]: {} for s in shifts}
    detections   = []
    matched = unmatched = 0

    for folder in _REPORT_SCAN_FOLDERS:
        fpath = os.path.join(_REPORT_RESULTS_DIR, folder)
        if not os.path.exists(fpath):
            continue

        for root, _, files in os.walk(fpath):
            if "false_positives" in root.lower():
                continue
            for fname in files:
                if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    continue

                dt = _report_dt_from_file(fname)
                if not dt or dt.strftime("%Y-%m-%d") != target_date:
                    continue

                shift = _report_shift_for(dt.time(), shifts)
                if not shift:
                    continue

                ch = _report_ch_from_file(fname)
                cam = ch_map.get(ch) if ch else None

                if not cam:
                    unmatched += 1
                    cam = {
                        "ch_code": ch,
                        "camera_name": "Unknown",
                        "centre_name": "",
                        "city": "",
                        "state": "",
                        "tc_code": ""
                    }

                matched += 1
                sname = shift["shift_name"]
                key   = cam["ch_code"]
                shift_counts[sname][key] = shift_counts[sname].get(key, 0) + 1

                detections.append([
                    sname, cam["ch_code"], cam.get("camera_name"),
                    cam.get("centre_name"), cam.get("city"), cam.get("state"),
                    cam.get("tc_code"), _report_det_type(fname),
                    dt.strftime("%Y-%m-%d %H:%M:%S"),
                    fname, "View",
                ])

    logger.info(f"[Report] Matched={matched} Unmatched={unmatched}")
    return shift_counts, detections


# ── Excel builders ───────────────────────────────────────────────
def _build_excel(cameras, shift_counts, shifts, detections) -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # --- Per-shift sheets ---
    shift_headers = [
        "City", "State", "Center", "TC Code", "Ch Code",
        "Camera Name", "Cam Type", "Classification",
        "Events (Excl. Rejected)", "Rejected Events", "Camera Status",
    ]
    for shift in shifts:
        ws = wb.create_sheet(shift["shift_name"])
        ws.append(shift_headers)
        for c in range(1, len(shift_headers) + 1):
            ws.cell(row=1, column=c).font = Font(bold=True)
        for cam in cameras:
            ch    = cam.get("ch_code", "")
            count = shift_counts.get(shift["shift_name"], {}).get(ch, 0)
            ws.append([
                cam.get("city"), cam.get("state"), cam.get("centre_name"),
                cam.get("tc_code"), ch, cam.get("camera_name"),
                cam.get("camera_category"), cam.get("classification"),
                count, 0,
                "Online" if cam.get("is_active") == 1 else "Offline",
            ])
        _auto_width(ws)

    # --- Detections List sheet ---
    ws = wb.create_sheet("Detections List")
    det_headers = [
        "Shift", "Ch Code", "Camera Name", "Center Name",
        "City", "State", "TC Code",
        "Detection Type", "Detection Time", "Image URL", "View",
    ]
    ws.append(det_headers)
    for c in range(1, len(det_headers) + 1):
        ws.cell(row=1, column=c).font = Font(bold=True)
    for row in detections:
        ws.append(row)
    _auto_width(ws)

    # --- Analysis sheet ---
    ws  = wb.create_sheet("Analysis")
    row = 1
    total_all = 0

    for shift in shifts:
        sname = shift["shift_name"]
        ws.cell(row=row, column=1, value=f"{sname} ANALYSIS").font = Font(bold=True)
        row += 1
        total_cams  = len(cameras)
        online_cams = sum(1 for c in cameras if c.get("is_active") == 1)
        total_det   = sum(shift_counts.get(sname, {}).values())
        total_all  += total_det

        for label, val in [
            ("Total Cameras",    total_cams),
            ("Online Cameras",   online_cams),
            ("Offline Cameras",  total_cams - online_cams),
            ("Total Detections", total_det),
            ("Online Rate",      f"{(online_cams/total_cams*100) if total_cams else 0:.2f}%"),
            ("Shift Start",      str(shift["start_time"])),
            ("Shift End",        str(shift["end_time"])),
        ]:
            ws.cell(row=row, column=1, value=label)
            ws.cell(row=row, column=2, value=val)
            row += 1

        row += 1
        ws.cell(row=row, column=1,
                value=f"Top 5 Most Active ({sname})").font = Font(bold=True)
        row += 1
        cam_map = {c["ch_code"]: c for c in cameras}
        for i, (ch, cnt) in enumerate(
            sorted(shift_counts.get(sname, {}).items(), key=lambda x: -x[1])[:5], 1
        ):
            cam = cam_map.get(ch, {})
            ws.cell(row=row, column=1, value=f"{i}. {ch} — {cam.get('camera_name','N/A')}")
            ws.cell(row=row, column=2, value=f"{cnt} detections")
            row += 1
        row += 2

    ws.cell(row=row, column=1, value="OVERALL SUMMARY").font = Font(bold=True)
    row += 1
    for label, val in [
        ("Total Detections (All Shifts)", total_all),
        ("Total Shifts",                  len(shifts)),
        ("Total Cameras",                 len(cameras)),
    ]:
        ws.cell(row=row, column=1, value=label)
        ws.cell(row=row, column=2, value=val)
        row += 1

    _auto_width(ws)
    return wb


# ── Route ────────────────────────────────────────────────────────
@fastapi_app.post("/generate-report")
def generate_report(req: ReportRequest):
    """
    POST /cctv_dev/generate-report
    Body: { "exam_id": 1, "date": "2026-04-05" }
    """
    # Validate date
    try:
        datetime.strptime(req.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")

    # Step 1 — exam info
    try:
        exam = _fetch_exam(req.exam_id)
    except Exception as e:
        raise HTTPException(500, f"DB error: {e}")

    if not exam:
        raise HTTPException(404, f"exam_id {req.exam_id} not found")

    link_type = (exam.get("link_type") or "").upper()
    logger.info(f"[Report] exam={exam['exam_name']} link_type={link_type} date={req.date}")

    # Step 2 — shifts (dynamic)
    try:
        shifts = _fetch_shifts(req.exam_id)
    except Exception as e:
        raise HTTPException(500, f"DB error: {e}")

    if not shifts:
        raise HTTPException(404, f"No active shifts for exam_id={req.exam_id}")

    logger.info(f"[Report] Shifts: {[s['shift_name'] for s in shifts]}")

    # Step 3 — cameras via existing db_client
    cameras = []

    if link_type == "HLS":
        seen = set()
        for shift in shifts:
            for cam in get_hls_cameras(req.exam_id, shift["id"], req.date):
                ch = str(cam.get("ch_code", "")).strip().lower()
                if ch and ch not in seen:
                    seen.add(ch)
                    cameras.append(cam)

    elif link_type == "RTSP":
        cameras = get_rtsp_cameras(req.exam_id)

    else:
        raise HTTPException(400, f"Unsupported link_type='{link_type}'")

    if not cameras:
        raise HTTPException(404,
            f"No cameras for exam_id={req.exam_id} link_type={link_type} date={req.date}")

    logger.info(f"[Report] Cameras loaded: {len(cameras)}")

    # Step 4 — scan detection images
    shift_counts, detections = _scan_detections(cameras, shifts, req.date)

    # Step 5 — build & save Excel
    wb = _build_excel(cameras, shift_counts, shifts, detections)
    output_file = os.path.join(_REPORT_OUTPUT_DIR, f"exam_{req.exam_id}_{req.date}.xlsx")
    wb.save(output_file)

    total_det = sum(sum(sc.values()) for sc in shift_counts.values())
    logger.info(f"[Report] Saved: {output_file}")

    return {
        "success":          True,
        "exam_id":          req.exam_id,
        "exam_name":        exam.get("exam_name"),
        "link_type":        link_type,
        "date":             req.date,
        "shifts":           [s["shift_name"] for s in shifts],
        "total_cameras":    len(cameras),
        "total_detections": total_det,
        "output_file":      output_file,
    }
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="socket.io")
