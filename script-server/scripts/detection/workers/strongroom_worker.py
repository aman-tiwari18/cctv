"""
Strong Room Movement Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Purpose: Monitor movement in strong rooms for security purposes.
"""

import time
import os
import logging
import threading
import signal
import queue
from datetime import datetime

import cv2
from ultralytics import YOLO

# ================= GRACEFUL STOP FLAG =================
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

# Signal handlers can only be set in the main thread
# When imported from worker threads, this will fail silently
try:
    signal.signal(signal.SIGINT,  _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)
except ValueError:
    # Not in main thread, signal handlers will be set by master_pipeline
    pass

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# Separate save folders for RTSP and HLS results
RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/strongroom_detection")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/strongroom_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

MIN_PERSONS      = 0      # alert if persons > this (any movement)
CONF_THRESHOLD   = 0.30
COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# HLS-specific tuning
HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# ── GPU Queue Config ─────────────────────────────────
GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "128"))
THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0

_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)

# ================= SHARED STATE ============
last_save_times = {}   # key → last save epoch
person_counts   = {}   # key → cumulative person count (for reporting)
_state_lock     = threading.Lock()

# ================= YOLO ====================
logger.info("🔄 [StrongRoomWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [StrongRoomWorker] YOLO model loaded")


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_movement(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = "", source_type: str = "RTSP"):
    """
    Run YOLO on *frame*, draw boxes, save if movement found.
    camera_id_pk is the DB primary key, used for unique file naming.

    Returns:
        (movement_detected: bool, person_count: int)
    """
    results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_detections = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
    ]

    person_count = len(person_detections)
    max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

    # ── Draw bounding boxes ──────────────────────────────────
    for box in person_detections:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            frame, f"Person {conf:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2
        )

    # ── Overlay info ─────────────────────────────────────────
    cv2.putText(frame, f"Persons: {person_count}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # ── Save logic ───────────────────────────────────────────
    # Use DB primary key if available
    key     = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
    now     = time.time()

    with _state_lock:
        elapsed          = now - last_save_times.get(key, 0)
        movement_detected = person_count > MIN_PERSONS

        if movement_detected and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # ── Source-Aware Naming Format ──────────────
            if source_type == "HLS":
                # strongroom_ch[ch_no]_[timestamp].jpg
                fname = f"strongroom_ch{camera_no}_{ts}.jpg"
            else:
                # RTSP: strongroom_[device_id]_[camera_no]_[timestamp].jpg
                dev_id = camera_id_pk or device_id
                fname = f"strongroom_{dev_id}_{camera_no}_{ts}.jpg"
            
            path = os.path.join(save_folder, fname)
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.warning(
                f"[StrongRoomWorker] 🚨 Movement! "
                f"pk={camera_id_pk} Device={device_id} Cam={camera_no} "
                f"Count={person_count} Conf={max_conf:.2f} "
                f"💾 Saved → {path}"
            )
        elif movement_detected:
            remaining = int(COOLDOWN_TIME - elapsed)
            logger.debug(
                f"[StrongRoomWorker] ⏳ Movement detected but cooldown "
                f"active ({remaining}s left) → {key}"
            )

        # Update cumulative counter
        person_counts[key] = person_counts.get(key, 0) + person_count

    return movement_detected, person_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def strongroom_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives packets from the RTSP producer and pushes them into
    the shared _gpu_queue for batch inference.
    """
    import torch
    logger.info("🟢 [StrongRoomWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the GPU batch worker
    gpu_t = threading.Thread(
        target=_hls_gpu_batch_worker,
        args=(stop_event,),
        daemon=True
    )
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None:
                logger.info("🔴 [StrongRoomWorker] RTSP batch-worker stopping")
                break

            # Unpack — supports dict, 4-tuple, 3-tuple
            if isinstance(data, dict):
                frame        = data.get("frame")
                device_id    = str(data.get("device_id", "unknown"))
                camera_no    = str(data.get("camera_no") or data.get("ch_no") or "0")
                camera_id_pk = str(data.get("camera_id_pk", ""))
            elif len(data) == 4:
                frame, device_id, camera_no, camera_id_pk = data
            else:
                frame, device_id, camera_no = data
                camera_id_pk = ""

            if frame is None:
                continue

            try:
                _gpu_queue.put({
                    "frame":        frame.copy(),
                    "device_id":    str(device_id),
                    "camera_no":    str(camera_no),
                    "camera_id_pk": str(camera_id_pk),
                    "source_type":  "RTSP",
                    "save_folder":  RTSP_SAVE_FOLDER,
                }, timeout=0.1)
            except queue.Full:
                pass
            del frame

    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("🔴 [StrongRoomWorker] GPU worker shut down")


# =====================================================
# 📡  HLS PATH  — standalone, reads its own stream
# =====================================================
def _hls_gpu_batch_worker(stop_event):
    """
    GPU batch worker — pulls frames from _gpu_queue and runs batched YOLO.
    """
    logger.info(f"🚀 [StrongRoomWorker][HLS] GPU worker started (batch={GPU_BATCH_SIZE})")

    while not stop_event.is_set():
        batch = []
        try:
            batch.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + 0.2
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(_gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        if not batch: continue

        try:
            frames = [item['frame'] for item in batch]
            # TRUE GPU BATCHING
            results = yolo_model(frames, conf=CONF_THRESHOLD, verbose=False)

            for item, result in zip(batch, results):
                camera_id = item.get('camera_id', 'unknown')
                camera_name = item.get('camera_name', '')
                frame = item['frame']
                
                person_detections = [
                    box for box in result.boxes
                    if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
                ]

                person_count = len(person_detections)
                if person_count > MIN_PERSONS:
                    src_type = item.get("source_type", "HLS")
                    c_no = item.get("ch_no") or item.get("camera_no") or ""
                    detect_movement(frame, camera_id, c_no, HLS_SAVE_FOLDER, source_type=src_type)

                # Cleanup
                if 'frame' in item: del item['frame']

            del batch
            if 'results' in locals(): del results

        except Exception as e:
            logger.error(f"[BATCH ERROR][StrongRoom] {e}")
            for item in batch:
                if 'frame' in item: del item['frame']
            del batch

    logger.info("🔴 [StrongRoomWorker][HLS] GPU worker stopped")


def _hls_camera_thread(cfg, stop_event):
    """
    Refactored camera thread: reads HLS and pushes to _gpu_queue.
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
    from tcs_scheduler import frame_should_process

    camera_id = cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url', '')
    camera_name = cfg.get('camera_name', '')

    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url or not test_hls_stream(hls_url):
        return

    cap = open_hls_stream(hls_url)
    if not cap or not cap.isOpened():
        return

    logger.info(f"[StrongRoomWorker][HLS] 🟢 Started camera thread → {camera_id}")
    frame_count = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret: break

        frame_count += 1
        if not frame_should_process(frame_count, HLS_SAMPLE_EVERY):
            continue

        try:
            _gpu_queue.put({
                "frame": frame.copy(),
                "camera_id": camera_id,
                "camera_name": camera_name,
                "ch_no": cfg.get("ch_no") or cfg.get("camera_no") or "unknown",
                "source_type": "HLS"
            }, timeout=0.1)
        except queue.Full:
            del frame
            continue
        
        # Cleanup
        del frame

    cap.release()
    logger.info(f"[StrongRoomWorker][HLS] 🔴 Stopped camera thread → {camera_id}")


def strongroom_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point — GPU batch queue architecture.
    """
    import torch
    cv2.setNumThreads(0) # Prevent thread explosion

    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT
    
    # 🔥 SCENE FILTER (case-insensitive) - Strong rooms are indoor secure areas
    valid_scenes = ['strong room', 'strongroom', 'vault', 'secure room', 'treasury']
    filtered_configs = []
    for cfg in camera_configs:
        if not cfg.get('cctv_url'): continue
        cls_val = str(cfg.get('classification', '')).lower()
        if any(scene in cls_val for scene in valid_scenes):
            filtered_configs.append(cfg)
    
    if not filtered_configs:
        logger.warning(f"[StrongRoomWorker][HLS] No cameras matched Strong Room scenes. Skipping.")
        return
    
    camera_configs = filtered_configs
    logger.info(f"[StrongRoomWorker][HLS] Processing {len(camera_configs)} strong room cameras")

    # Start GPU Worker
    gpu_t = threading.Thread(
        target=_hls_gpu_batch_worker,
        args=(stop_event,),
        daemon=True
    )
    gpu_t.start()

    # Start camera threads using ThreadPoolExecutor
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in camera_configs:
            executor.submit(_hls_camera_thread, cfg, stop_event)
            time.sleep(THREAD_START_DELAY)

    try:
        stop_event.wait()
    except KeyboardInterrupt:
        stop_event.set()
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("[StrongRoomWorker][HLS] ✅ Strong Room detection completed")
