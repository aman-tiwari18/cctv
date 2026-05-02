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
import requests
import json
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import HTTP_PORT, MAIN_BACKEND_URL, POLL_INTERVAL_MS, SCRIPTS_DIR
from app.logger import logger
from app.log_manager import log_manager
from app.poller import poller_service, IS_MAIN_WORKER
from scripts.detection.utils.db_client import get_hls_camera_by_ch_code, get_rtsp_camera_by_id, get_hls_cameras, get_rtsp_cameras, get_rtsp_camera_by_device_and_ch, _get_connection

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
                
                # Emit detection to all users
                await sio.emit("detection:new", payload)
                
                # Emit updated counts to all users
                # We need to re-scan or just increment from known state
                # For simplicity and accuracy, let's re-calculate from known_detection_files
                counts = {k: len(v) for k, v in current_snapshot.items()}
                await sio.emit("detection:counts", counts)
                
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
    
    # Get worker info if available
    worker_info = {}
    try:
        from app.camera_distributor import distributor
        worker_info = distributor.get_worker_stats()
    except ImportError:
        pass
    
    return {
        "success": True,
        "message": "Script execution server is running",
        "timestamp": datetime.now().isoformat(),
        "uptime": time.monotonic(),
        "worker": worker_info
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
    if IS_MAIN_WORKER:
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
    "strongroom": "strongroom_detection",
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
    "strongroom":  "Strong Room Movement",
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
    exam_id = None
    uid = None

    # Extract exam_id if present
    exam_match = re.search(r'_exam(\d+)_', stem, flags=re.IGNORECASE)
    if not exam_match:
        # Check without trailing underscore just in case ts follows directly 
        exam_match = re.search(r'_exam(\d+)', stem, flags=re.IGNORECASE)
    if exam_match:
        exam_id = int(exam_match.group(1))

    # The uid is typically the the last segment of the stem
    uid = stem.split("_")[-1]

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

    # Calculate detectedAt timestamp in milliseconds from the filename date/time
    detected_at_ms = None
    if date_str and time_str:
        try:
            dt = datetime.strptime(date_str + time_str, "%Y%m%d%H%M%S")
            detected_at_ms = int(dt.timestamp() * 1000)
        except Exception:
            detected_at_ms = now_ms  # Fallback to current time

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
        "detectedAt":  detected_at_ms,  # ← Actual detection timestamp in ms
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
        "exam_id":     exam_id,
        "uid":         uid,
    }



@app.get("/detections")
def list_detections(
    type: Optional[str] = None,
    date: Optional[str] = None,
    search: Optional[str] = None,
    source: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    exam_id: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    rows = []
    
    # Handle comma-separated type query
    selected_types = type.split(',') if type else []
    folders = {k: v for k, v in DETECTION_FOLDERS.items() if k in selected_types} if selected_types else DETECTION_FOLDERS

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
                
                if exam_id and str(item.get("exam_id")) != str(exam_id):
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

    # Fetch pushed_to_client statuses for paginated items securely
    uids_to_check = [item.get("uid") for item in paginated if item.get("uid")]
    pushed_uids = set()
    if uids_to_check:
        try:
            from scripts.detection.utils.db_client import _get_connection
            conn = _get_connection()
            with conn.cursor() as cur:
                format_strings = ','.join(['%s'] * len(uids_to_check))
                
                # Fetch from HLS
                try:
                    cur.execute(f"SELECT unique_id FROM camera_report_hls WHERE unique_id IN ({format_strings}) AND pushed_to_client = 1", tuple(uids_to_check))
                    for row in cur.fetchall():
                        if row.get("unique_id"):
                            pushed_uids.add(row["unique_id"])
                except Exception as e:
                    logger.error(f"HLS pushed uids fetch failed: {e}")

                # Fetch from RTSP
                try:
                    cur.execute(f"SELECT unique_id FROM camera_report_rtsp WHERE unique_id IN ({format_strings}) AND pushed_to_client = 1", tuple(uids_to_check))
                    for row in cur.fetchall():
                        if row.get("unique_id"):
                            pushed_uids.add(row["unique_id"])
                except Exception as e:
                    logger.error(f"RTSP pushed uids fetch failed: {e}")
            conn.close()
        except Exception as e:
            logger.error(f"Failed to fetch pushed uids for paginated data: {e}")

    for item in paginated:
        if item.get("uid") in pushed_uids:
            item["pushed_to_client"] = 1
        else:
            item["pushed_to_client"] = 0

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
    uid: Optional[str] = None


class ClientDetectionCopyRequest(BaseModel):
    items: list[ClientDetectionCopyItem]


@app.post("/client-detections/copy")
async def copy_client_detections(payload: ClientDetectionCopyRequest):
    copied = []
    failed = []

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            for item in payload.items:
                if not item.uid:
                    failed.append({"relativePath": item.relativePath, "error": "No uid provided"})
                    continue
                
                table_name = "camera_report_rtsp" if item.source == "rtsp" else "camera_report_hls"
                
                # Update the DB
                try:
                    sql = f"UPDATE {table_name} SET pushed_to_client = 1 WHERE unique_id = %s"
                    cur.execute(sql, (item.uid,))
                except Exception as e:
                    failed.append({"uid": item.uid, "error": f"DB update failed on {table_name}: {e}"})
                    continue
                
                if cur.rowcount == 0:
                    failed.append({"uid": item.uid, "error": f"uid {item.uid} not found"})
                    continue
                
                # Fetch row to reconstruct the socket payload
                cur.execute(f"SELECT * FROM {table_name} WHERE unique_id = %s LIMIT 1", (item.uid,))
                row = cur.fetchone()
                
                if row:
                    imageurl_full = str(row.get("imageurl", ""))
                    filename = imageurl_full.split("/")[-1] if "/" in imageurl_full else imageurl_full
                    
                    copied_item = parse_detection_filename(
                        filename,
                        item.type,
                        file_path=None,
                        is_new_image=False,
                        source=item.source,
                    )
                    
                    copied_item.update({
                        "source": item.source,
                        "type": item.type,
                        "relativePath": item.relativePath,
                        "id": row.get("id"),
                        "cameraName": row.get("camera_name"),
                        "centerName": row.get("center_name", "") or row.get("centre_name", ""),
                        "city": row.get("city"),
                        "state": row.get("state"),
                        "tcCode": row.get("tc_code"),
                        "category": row.get("camera_category", ""),
                        "uid": row.get("unique_id"),
                    })
                    copied.append(copied_item)
                    
            # After all updates, emit client detections and updated client counts
            for item in copied:
                await sio.emit("client-detection:new", item)
            
            # Re-fetch total client counts for today
            try:
                today_iso = datetime.now().date().isoformat()
                cur.execute("SELECT camera_category, COUNT(*) as count FROM camera_report_hls WHERE exam_date = %s AND pushed_to_client = 1 GROUP BY camera_category", (today_iso,))
                hls_c = cur.fetchall()
                cur.execute("SELECT camera_category, COUNT(*) as count FROM camera_report_rtsp WHERE exam_date = %s AND pushed_to_client = 1 GROUP BY camera_category", (today_iso,))
                rtsp_c = cur.fetchall()
                
                client_counts = {}
                for row in hls_c + rtsp_c:
                    cat = row["camera_category"]
                    client_counts[cat] = client_counts.get(cat, 0) + row["count"]
                
                await sio.emit("client-detection:counts", client_counts)
            except Exception as e:
                logger.error(f"Failed to emit client counts: {e}")
                
        conn.commit()
    except Exception as e:
        logger.error(f"DB Error in /client-detections/copy: {e}")
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

    return {"success": True, "copied": copied, "failed": failed}


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
    
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            db_rows = []
            try:
                cur.execute("SELECT * FROM camera_report_hls WHERE pushed_to_client = 1 AND remove_from_client = 0")
                db_rows.extend(cur.fetchall())
            except Exception as e:
                logger.error(f"HLS Client Detections fetch failed: {e}")

            try:
                cur.execute("SELECT * FROM camera_report_rtsp WHERE pushed_to_client = 1 AND remove_from_client = 0")
                db_rows.extend(cur.fetchall())
            except Exception as e:
                logger.error(f"RTSP Client Detections fetch failed: {e}")

            db_rows.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
            
            for row in db_rows:
                imageurl_full = str(row.get("imageurl", ""))
                filename = imageurl_full.split("/")[-1] if "/" in imageurl_full else imageurl_full
                folder_name = row.get("detection_type", "")
                
                type_key = next((k for k, v in DETECTION_FOLDERS.items() if v == folder_name), folder_name)
                source_part = "rtsp" if "rtsp" in imageurl_full else "hls"
                
                if source and source != source_part:
                    continue
                if type and type_key not in type.split(','):
                    continue

                item = parse_detection_filename(
                    filename,
                    type_key,
                    file_path=None,
                    is_new_image=False,
                    source=source_part,
                )
                
                item.update({
                    "source": source_part,
                    "type": type_key,
                    "filename": filename,
                    "relativePath": f"{filename}",
                    "cameraName": row.get("camera_name"),
                    "centerName": row.get("center_name", "") or row.get("centre_name", ""),
                    "city": row.get("city"),
                    "state": row.get("state"),
                    "tcCode": row.get("tc_code"),
                    "category": row.get("camera_category", ""),
                    "uid": row.get("unique_id"),
                    "_mtime": row.get("created_at").timestamp() if hasattr(row.get("created_at"), "timestamp") else 0,
                    "updated_at": row.get("updated_at").timestamp() if hasattr(row.get("updated_at"), "timestamp") else 0,
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
    finally:
        conn.close()

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

class ClientDetectionRemoveRequest(BaseModel):
    uid: str

@app.post("/client-detections/remove")
async def remove_client_detection(payload: ClientDetectionRemoveRequest):
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            try:
                sql_hls = "UPDATE camera_report_hls SET remove_from_client = 1 WHERE unique_id = %s"
                cur.execute(sql_hls, (payload.uid,))
            except Exception: pass
            
            try:
                sql_rtsp = "UPDATE camera_report_rtsp SET remove_from_client = 1 WHERE unique_id = %s"
                cur.execute(sql_rtsp, (payload.uid,))
            except Exception: pass
        conn.commit()
        
        await sio.emit("client-detection:remove", {"uid": payload.uid, "success": True})
        
        return {"success": True, "message": "Removed successfully"}
    except Exception as e:
        logger.error(f"DB Error in /client-detections/remove: {e}")
        return {"success": False, "error": str(e)}
    finally:
        conn.close()


@sio.event
async def connect(sid, environ, auth):
    logger.info(f"Socket.IO client connected: {sid}")
    await sio.emit("detections:connected", {"success": True}, to=sid)


@sio.event
async def disconnect(sid):
    logger.info(f"Socket.IO client disconnected: {sid}")


fastapi_app = app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="socket.io")