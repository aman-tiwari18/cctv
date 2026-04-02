# workers/camera_tampering_worker.py
"""
Camera Tampering Worker — HLS only (pure OpenCV, CPU-based).

Detects camera tampering via frame analysis:
  - Brightness check  → "Camera Blocked"
  - Blur score (Laplacian variance) → "Camera Blurred"
  - Edge density → "Camera Covered"

No GPU or ML model required — runs entirely on CPU.
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

if threading.current_thread() is threading.main_thread():
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
    _DETECTION_ROOT, "results/tcs_detections/camera_tampering_detection"
)
os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

THREAD_DELAY  = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
COOLDOWN_TIME = int(os.environ.get("TAMPER_COOLDOWN_SEC", "45"))
SAMPLE_EVERY  = int(os.environ.get("TAMPER_SAMPLE_EVERY", "5"))

# ================= IMPORTS =================
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process

# ================= SHARED STATE ============
_last_save_time = {}
_state_lock = threading.Lock()


# =====================================================
# 🔍 TAMPERING DETECTION (pure OpenCV, CPU-only)
# =====================================================
def _detect_camera_tampering(frame):
    """
    Detect tampering via brightness / blur / edge density.
    Returns (status, brightness, blur_score, edge_density).
    status ∈ {"Normal", "Camera Blocked", "Camera Blurred", "Camera Covered"}
    """
    resized    = cv2.resize(frame, (320, 240))
    brightness = np.mean(resized)
    gray       = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    edges      = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / (320 * 240)

    if brightness < 60:
        return "Camera Blocked", brightness, blur_score, edge_density
    if blur_score < 300:
        return "Camera Blurred", brightness, blur_score, edge_density
    if edge_density < 0.03:
        return "Camera Covered", brightness, blur_score, edge_density
    return "Normal", brightness, blur_score, edge_density


# =====================================================
# 📡 CAMERA THREAD
# =====================================================
def _hls_camera_thread(cfg, stop_event):
    """Per-camera HLS reader — detects tampering directly on CPU."""
    camera_id   = cfg['camera_id']
    ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        logger.error(f"[TamperingWorker] ❌ Stream failed for {camera_id}")
        return

    cap = open_hls_stream(hls)
    if cap is None:
        logger.error(f"[TamperingWorker] ❌ Could not open stream for {camera_id}")
        return

    logger.info(f"[TamperingWorker] 🟢 Camera thread started → {camera_id}")

    frame_count = 0
    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)

            if status != "Normal":
                now = time.time()
                with _state_lock:
                    if now - _last_save_time.get(camera_id, 0) < COOLDOWN_TIME:
                        continue
                    _last_save_time[camera_id] = now

                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = os.path.join(HLS_SAVE_FOLDER, f"Tampering_ch{ch_no}_{ts}.jpg")
                cv2.imwrite(filename, frame)
                logger.warning(
                    f"[TamperingWorker] ⚠️ {status} | {camera_id} "
                    f"bright={brightness:.1f} blur={blur_score:.1f} "
                    f"edge={edge_density:.3f} → {filename}"
                )
        except Exception as e:
            logger.error(f"[TamperingWorker] {camera_id} → {e}")

    cap.release()
    logger.info(f"[TamperingWorker] 🔴 Camera thread stopped → {camera_id}")


# =====================================================
# 📡 RTSP WORKER (queue-based, receives frames from producer)
# =====================================================
RTSP_SAVE_FOLDER = os.path.join(
    _DETECTION_ROOT, "results/camera_tampering_detection"
)
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)


def camera_tampering_worker(frame_queue):
    """
    Queue-based worker — receives (frame, device_id, camera_no) tuples
    from the RTSP producer.
    """
    logger.info("🟢 [TamperingWorker] RTSP worker started")

    while True:
        data = frame_queue.get()
        if data is None:
            logger.info("🔴 [TamperingWorker] RTSP worker stopping")
            break

        if isinstance(data, dict):
            frame = data.get("frame")
            device_id = str(data.get("device_id", "unknown"))
            camera_no = str(data.get("camera_no", "0"))
            camera_id_pk = str(data.get("camera_id_pk", ""))
        elif len(data) == 4:
            frame, device_id, camera_no, camera_id_pk = data
        else:
            frame, device_id, camera_no = data
            camera_id_pk = ""

        try:
            status, brightness, blur_score, edge_density = _detect_camera_tampering(frame.copy())

            if status != "Normal":
                key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
                log_key = f"{device_id}_{camera_no}"
                now = time.time()
                with _state_lock:
                    if now - _last_save_time.get(key, 0) < COOLDOWN_TIME:
                        continue
                    _last_save_time[key] = now

                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                if camera_id_pk:
                    fname = f"tamper_{camera_id_pk}_{camera_no}_{ts}.jpg"
                else:
                    fname = f"tamper_{key}_{ts}.jpg"
                filename = os.path.join(RTSP_SAVE_FOLDER, fname)
                cv2.imwrite(filename, frame)
                logger.warning(
                    f"[TamperingWorker] ⚠️ {status} | pk={camera_id_pk} {log_key} "
                    f"bright={brightness:.1f} blur={blur_score:.1f} "
                    f"edge={edge_density:.3f} → {filename}"
                )
        except Exception as e:
            logger.error(f"[TamperingWorker] RTSP error for {device_id}_{camera_no}: {e}")


# =====================================================
# 📡 HLS WORKER ENTRY POINT
# =====================================================
def camera_tampering_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point for camera tampering detection.
    Pure OpenCV — no GPU or ML model needed.
    Accepts a LIST of camera configs or a single dict.
    """
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    # Require at least a valid stream URL
    filtered_configs = [
        cfg for cfg in camera_configs
        if cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
    ]

    if not filtered_configs:
        logger.warning("[TamperingWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    camera_configs = filtered_configs

    # Start per-camera threads (no GPU worker — pure CPU detection)
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
        time.sleep(THREAD_DELAY)

        if (i + 1) % 100 == 0:
            logger.info(f"  {i + 1}/{total} tampering camera threads started...")

    logger.info(f"[TamperingWorker][HLS] Started {total} camera threads (pure CPU)")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[TamperingWorker][HLS] ✅ Camera threads completed")
        return

    stop_event.set()
    logger.info("[TamperingWorker][HLS] ✅ All cameras completed")
