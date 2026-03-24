# workers/camera_tampering_worker.py
"""
Camera Tampering Worker — HLS only (CPU-only detection).

Detects camera tampering via OpenCV blur/brightness/edge checks.
No GPU needed — pure CV operations.

Based on: tcs_camera_tampering_detection.py
"""

import os
import sys
import time
import cv2
import logging
import threading
import signal
import numpy as np
from datetime import datetime

# ================= GRACEFUL STOP FLAG =================
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

signal.signal(signal.SIGINT,  _handle_stop)
signal.signal(signal.SIGTERM, _handle_stop)

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ================= PATH SETUP =================
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# ================= CONFIG ==================
HLS_SAVE_FOLDER = os.path.join(
    _PROJECT_ROOT,
    "results/camera_tampering_detection_results"
)
os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

# ================= IMPORTS =================
from detection_rate_limiter import get_rate_limiter
from tcs_scheduler import (
    camera_slot,
    frame_should_process,
    get_sample_every,
    get_max_concurrency,
    get_max_frames_per_run,
    get_bool,
    get_positive_float,
    CameraWorkerPool,
)

# ================= DETECTION CONFIG =================
SAMPLE_EVERY       = get_sample_every("TCS_TAMPER_SAMPLE_EVERY", 5)
MAX_CONCURRENCY    = get_max_concurrency("TCS_TAMPER_MAX_CONCURRENCY", None)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_TAMPER_MAX_FRAMES_PER_RUN", None)
USE_POOL           = get_bool("TCS_USE_WORKER_POOL", False)
POOL_WORKERS       = get_max_concurrency("TCS_WORKER_COUNT", 8)
POOL_COOLDOWN      = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)

_rate_limiter = get_rate_limiter('camera_tamper', max_per_minute=50)

THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0


# =====================================================
# 📐 HELPERS
# =====================================================
def _safe_name(s: str) -> str:
    """Strip characters that would create subdirectories or break filenames."""
    return s.replace('/', '_').replace('\\', '_').replace(' ', '_').replace(':', '_')


# =====================================================
# 🔍 CORE DETECTION (CPU-only, no GPU)
# =====================================================
def detect_camera_tampering(frame):
    """
    Returns (status, brightness, blur_score, edge_density).
    status: "Normal" | "Camera Blocked" | "Camera Blurred" | "Camera Covered"
    """
    frame_resized = cv2.resize(frame, (320, 240))

    brightness   = np.mean(frame_resized)
    gray         = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2GRAY)
    blur_score   = cv2.Laplacian(gray, cv2.CV_64F).var()

    edges        = cv2.Canny(gray, 50, 150)
    edge_pixels  = np.sum(edges > 0)
    edge_density = edge_pixels / (320 * 240)

    status = "Normal"

    if brightness < 80:
        status = "Camera Blocked"
    elif blur_score < 500:
        status = "Camera Blurred"
    elif edge_density < 0.055:
        status = "Camera Covered"

    return status, brightness, blur_score, edge_density


# =====================================================
# 📡  HLS STREAM PROCESSING
# =====================================================
def _process_hls_stream(hls_url, camera_id, script_name,
                        ch_no="unknown", stop_event=None,
                        max_frames=None):
    """
    Process a single HLS stream for camera tampering.
    CPU-only — no GPU needed.
    """
    from tcs_hls_utils import open_hls_stream

    if stop_event is None:
        stop_event = _STOP_EVENT

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Failed to open HLS stream")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0

    logger.info(f"[{camera_id}] Stream opened @ {fps:.1f} FPS | ch_no={ch_no}")

    frame_count        = 0
    detection_count    = 0
    skipped_rate_limit = 0
    start_time         = time.time()

    try:
        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            if frame_should_process(frame_count, SAMPLE_EVERY):
                status, brightness, blur_score, edge_density = detect_camera_tampering(frame)

                if status != "Normal":
                    should_save, current_rate, _ = _rate_limiter.should_save_detection(camera_id)

                    if should_save:
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        # Image naming: {script_name}_ch{ch_no}_{timestamp}_{status}.jpg
                        filename = os.path.join(
                            HLS_SAVE_FOLDER,
                            f"{script_name}_ch{ch_no}_{timestamp}_{status.replace(' ', '_')}.jpg"
                        )
                        success = cv2.imwrite(filename, frame)
                        if success:
                            detection_count += 1
                            logger.warning(
                                f"[{camera_id}] ALERT: {status} "
                                f"| B:{brightness:.1f} | Blur:{blur_score:.1f} "
                                f"| Edge:{edge_density:.3f} "
                                f"({current_rate}/50/min) → {filename}"
                            )
                    else:
                        skipped_rate_limit += 1

            if max_frames and frame_count >= max_frames:
                break

    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")
    finally:
        cap.release()
        elapsed = time.time() - start_time
        logger.info(
            f"[{camera_id}] Done: {frame_count} frames in {elapsed:.1f}s | "
            f"Saved: {detection_count} | Rate-limited: {skipped_rate_limit}"
        )

    return True


# =====================================================
# 📡  HLS CAMERA THREAD
# =====================================================
def _hls_camera_thread(cfg, stop_event):
    """Per-camera HLS thread — resolves URL then processes."""
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

    camera_id   = cfg['camera_id']
    script_name = cfg.get('script_code', 'tamper')
    ch_no       = cfg.get('ch_no', cfg.get('camera_id', 'unknown'))
    initial_url = cfg.get('cctv_url') or cfg.get('initial_url') or cfg.get('stream_url', '')

    try:
        with camera_slot("tampering", MAX_CONCURRENCY):
            hls_url = extract_hls_streaming_url(initial_url)
            if not hls_url or not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] Failed to resolve HLS stream")
                return

            _process_hls_stream(
                hls_url,
                camera_id,
                script_name,
                ch_no=ch_no,
                stop_event=stop_event,
                max_frames=MAX_FRAMES_PER_RUN,
            )
    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")


# =====================================================
# 📡  HLS WORKER ENTRY POINT
# =====================================================
def camera_tampering_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point for camera tampering detection.

    Accepts a LIST of camera configs (from camera_loader).
    CPU-only — no GPU queue needed.

    Can also accept a single dict for backward compatibility.
    """
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT

    if USE_POOL:
        pool = CameraWorkerPool(worker_count=POOL_WORKERS, cooldown_sec=POOL_COOLDOWN)
        pool.start()
        for cfg in camera_configs:
            pool.submit(_hls_camera_thread, cfg, stop_event)
        try:
            pool.wait_forever()
        finally:
            pool.stop()
    else:
        threads = []
        total = len(camera_configs)
        for i, cfg in enumerate(camera_configs):
            t = threading.Thread(
                target=_hls_camera_thread,
                args=(cfg, stop_event),
                name=f"Tamper-{cfg.get('camera_id', i)}",
                daemon=True
            )
            t.start()
            threads.append(t)
            time.sleep(THREAD_START_DELAY)

            if (i + 1) % 100 == 0:
                logger.info(f"  {i + 1}/{total} tampering camera threads started...")

        logger.info(f"[TamperWorker][HLS] All {total} cameras started")

        try:
            for t in threads:
                t.join()
        except KeyboardInterrupt:
            stop_event.set()

        stop_event.set()

    logger.info("[TamperWorker][HLS] ✅ All cameras completed")
