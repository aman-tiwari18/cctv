import asyncio
import re
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.config import HTTP_PORT, MAIN_BACKEND_URL, POLL_INTERVAL_MS, SCRIPTS_DIR
from app.logger import logger
from app.log_manager import log_manager
from app.poller import poller_service

# Import legacy pipeline functionality from the old backend
from scripts.detection.backend.schemas import (
    StartRequest, StopRequest, StatusResponse as AnalyticsStatusResponse, MessageResponse
)
from scripts.detection.backend.pipeline_manager import (
    start_analytics, stop_analytics, status_analytics,
    cleanup_old_pipelines, processes, ALL_ANALYTICS
)

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
    
    # Background log cleanup task
    async def cleanup_loop():
        while True:
            await asyncio.sleep(24 * 60 * 60)  # Run daily
            log_manager.cleanup_old_logs(30)
            
    cleanup_task = asyncio.create_task(cleanup_loop())
    logger.info("Script execution server started successfully")
    
    yield
    
    # Shutdown logic
    logger.info("Shutting down...")
    await poller_service.stop()
    cleanup_task.cancel()

app = FastAPI(lifespan=lifespan)

# ── Static file serving for detection images ──────────────────
RESULTS_DIR = Path(SCRIPTS_DIR).resolve() / "detection" / "results" / "tcs_detections"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/detection-images", StaticFiles(directory=str(RESULTS_DIR)), name="detection-images")

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

    killed = script_runner.cancel(execution_id)

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
    "server":     "server_room_detection",
    "intruder":   "intruder_detection",
    "entry_exit": "entry_exit_detection",
    "phone":      "phone_detection",
    "invigilator":"invigilator_detection",
}

DETECTION_LABELS = {
    "proximity":   "Close Proximity",
    "crowd":       "Crowd Detection",
    "server":      "Server Room",
    "intruder":    "Intruder Detection",
    "entry_exit":  "Entry/Exit",
    "phone":       "Phone Detection",
    "invigilator": "Invigilator Tracking",
}

def parse_detection_filename(filename: str, type_key: str) -> dict:
    """Parse metadata from a detection image filename."""
    stem = Path(filename).stem  # without extension
    # Pattern: {camera_id}_{date}_{time}_{extra}.jpg
    # e.g. 11365_ENTRY_S39__20260318_161308_violations1
    #      11365_ENTRY_S39__20260318_161308_persons2_conf0.83
    date_str, time_str = "", ""
    dt_match = re.search(r'(\d{8})_(\d{6})', stem)
    if dt_match:
        date_str = dt_match.group(1)  # 20260318
        time_str = dt_match.group(2)  # 161308
        camera_id = stem[:dt_match.start()].strip('_')
        suffix = stem[dt_match.end():].strip('_')
    else:
        camera_id = stem
        suffix = ""

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

    return {
        "filename":    filename,
        "type":        type_key,
        "label":       DETECTION_LABELS.get(type_key, type_key),
        "camera_id":   camera_id,
        "detected_at": detected_at,
        "date":        f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}" if date_str else "",
        "confidence":  confidence,
        "count":       count,
        "image_url":   f"/detection-images/{DETECTION_FOLDERS[type_key]}/{filename}",
    }

@app.get("/detections")
def list_detections(
    type: Optional[str] = None,
    date: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    results = []
    folders = {type: DETECTION_FOLDERS[type]} if type and type in DETECTION_FOLDERS else DETECTION_FOLDERS

    for type_key, folder_name in folders.items():
        folder = RESULTS_DIR / folder_name
        if not folder.exists():
            continue
        for f in sorted(folder.iterdir(), reverse=True):
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            item = parse_detection_filename(f.name, type_key)
            if date and not item["date"].startswith(date):
                continue
            if search and search.lower() not in item["camera_id"].lower():
                continue
            results.append(item)

    # Sort by detected_at descending (filename already has timestamp)
    results.sort(key=lambda x: x["filename"], reverse=True)

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
