"""
Server Room Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - Server_room_det.py      (RTSP / DSS flow)
  - server_room_det_tcs.py  (HLS / TCS flow)
"""

import queue
import time
import os
import logging
import threading
import signal
from datetime import datetime

import cv2
from ultralytics import YOLO

# ================= GRACEFUL STOP FLAG =================
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

import threading
if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT,  _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/server_room_detection")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/server_room_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

MIN_PERSONS    = 1      # server room = 1 person enough
CONF_THRESHOLD = 0.45
COOLDOWN_TIME  = 45     # seconds between saves per camera

HLS_SAMPLE_EVERY = 5
HLS_FAIL_LIMIT   = 3

# ================= SHARED STATE ============
last_save_times = {}
person_counts   = {}
_state_lock     = threading.Lock()

# ================= YOLO ====================
print("🔄 [ServerRoomWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [ServerRoomWorker] YOLO model loaded")


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_persons_in_frame(frame, device_id: str, camera_no: str, save_folder: str,
                             script_name: str = "server", camera_id_pk: str = ""):
    """
    Detect persons in server room frame.
    Save if >= MIN_PERSONS detected and cooldown passed.

    Returns:
        (server_violation: bool, person_count: int)
    """
    results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_boxes = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
    ]

    person_count = len(person_boxes)
    max_conf     = float(max((box.conf[0] for box in person_boxes), default=0))

    logger.debug(
        f"[ServerRoom DEBUG] cam={device_id}_{camera_no} "
        f"persons={person_count} conf_th={CONF_THRESHOLD}"
    )

    # ── Draw bounding boxes ──────────────────────────────
    for box in person_boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame, f"Person {conf:.2f}",
            (x1, y1 - 6),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
        )

    # ── Overlay info ─────────────────────────────────────
    cv2.putText(frame, f"Persons: {person_count}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # ── Save logic ───────────────────────────────────────
    # key uses camera_id_pk (unique DB primary key) if available, else device_id+camera_no
    key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
    now = time.time()

    with _state_lock:
        elapsed           = now - last_save_times.get(key, 0)
        server_violation  = person_count >= MIN_PERSONS

        if server_violation and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            # Filename format: {script_name}_{device_id}_{camera_no}_{ts}.jpg
            # device_id and camera_no are used for lookup in the backend
            fname = f"{script_name}_{device_id}_{camera_no}_{ts}.jpg"
            path = os.path.join(save_folder, fname)
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.warning(
                f"[ServerRoom] 🚨 Person detected! "
                f"pk={camera_id_pk} cam={device_id}_{camera_no} count={person_count} "
                f"💾 Saved → {path}"
            )
        elif server_violation:
            remaining = int(COOLDOWN_TIME - elapsed)
            logger.debug(
                f"[ServerRoom] ⏳ Detected but cooldown active "
                f"({remaining}s left) → {key}"
            )

        person_counts[key] = person_counts.get(key, 0) + person_count

    return server_violation, person_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def server_room_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives (frame, device_id, camera_no[, camera_id_pk]) or dict packets
    from the RTSP producer and pushes them into the shared _gpu_queue.
    The _hls_gpu_worker processes frames in batches of GPU_BATCH_SIZE.
    """
    import torch
    logger.info("🟢 [ServerRoom] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the SAME GPU batch worker that HLS uses
    gpu_t = threading.Thread(
        target=_hls_gpu_worker,
        args=(stop_event, RTSP_SAVE_FOLDER),
        daemon=True
    )
    gpu_t.start()

    try:
        while True:
            packet = frame_queue.get()
            if packet is None:
                logger.info("🔴 [ServerRoom] RTSP batch-worker stopping")
                break

            # Unpack — supports dict, 4-tuple, 3-tuple
            if isinstance(packet, dict):
                frame        = packet.get("frame")
                device_id    = str(packet.get("device_id", "unknown"))
                camera_no    = str(packet.get("camera_no") or packet.get("ch_no") or "0")
                camera_id_pk = str(packet.get("camera_id_pk", ""))
            elif len(packet) == 4:
                frame, device_id, camera_no, camera_id_pk = packet
            else:
                frame, device_id, camera_no = packet
                camera_id_pk = ""

            if frame is None:
                continue

            try:
                _gpu_queue.put({
                    "frame":        frame.copy(),
                    "device_id":    str(device_id),
                    "camera_no":    str(camera_no),
                    "ch_no":        str(camera_no), # for code compatibility
                    "camera_id_pk": str(camera_id_pk),
                    "script_name":  "server",
                    "source_type":  "RTSP",
                    "state":        {},
                }, timeout=0.1)
            except queue.Full:
                pass
            del frame

    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("🔴 [ServerRoom] GPU worker shut down")


# =====================================================
# 📡  HLS PATH  — GPU Batch Queue Architecture
# =====================================================
#
# Architecture (from server_room_det_tcs.py):
#   - Camera threads read HLS streams → push frames to gpu_queue
#   - Single gpu_worker thread pulls batches → runs detection
#   - Uses server_core (Server_room_det.py) for actual detection
#   - tcs_scheduler for frame sampling
#   - detection_rate_limiter for save frequency control
# =====================================================

import sys

# Ensure detection root is on path for imports
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Import core detection module + utilities
from scripts.detection import Server_room_det as server_core
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter

# ── GPU Queue Config ─────────────────────────────────
GPU_BATCH_SIZE      = 64     # Standardized to 64 as per PDF
GPU_QUEUE_SIZE      = 128    # Reduced to 128 to prevent OOM
BATCH_WAIT_TIMEOUT  = 0.2    # Standardized timeout
THREAD_DELAY        = 0.1    # Stagger

_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)


def _hls_gpu_worker(stop_event, save_folder, cooldown_time=60):
    """
    GPU batch worker — TRUE batch inference.

    Pulls up to GPU_BATCH_SIZE frames from _gpu_queue within
    BATCH_WAIT_TIMEOUT seconds, then calls detect_persons_batch()
    once — all frames hit the GPU in a single YOLO forward pass.
    """
    import torch
    logger.info("🚀 [ServerRoom][HLS] GPU worker started (true batch mode)")

    # Warm up model + pre-allocate GPU memory
    server_core.get_yolo_model()

    rate_limiter = get_rate_limiter('server_room', max_per_minute=25)
    log_counter  = 0

    while not stop_event.is_set():

        # ── Step 1: Wait for at least one frame ──────────────
        batch = []
        try:
            batch.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        # ── Step 2: Fill batch within BATCH_WAIT_TIMEOUT ─────
        deadline = time.time() + BATCH_WAIT_TIMEOUT
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(_gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        # ── Step 3: Build inference_items list ────────────────
        inference_items = [
            {
                'frame':     item['frame'],
                'ch_no':     item['ch_no'],
                'camera_id': item.get('device_id') or item.get('camera_id'),
                'state':     item.get('state', {}),
            }
            for item in batch
        ]

        # ── Step 4: TRUE BATCH inference ─────────────────────
        try:
            batch_results = server_core.detect_persons_batch(inference_items)
        except Exception as e:
            logger.error(f"[ServerRoom][HLS] Batch inference error: {e}")
            for item in batch:
                if 'frame' in item: del item['frame']
            del batch
            continue

        # ── Step 5: GPU memory logging (every 30s) ────────────
        log_counter += 1
        if torch.cuda.is_available() and log_counter % 50 == 0:
            allocated = torch.cuda.memory_allocated() / 1e9
            reserved  = torch.cuda.memory_reserved()  / 1e9
            logger.info(
                f"[ServerRoom][GPU] batch={len(batch)} | "
                f"allocated={allocated:.2f}GB | reserved={reserved:.2f}GB"
            )

        # ── Step 6: Process results per frame ────────────────
        for item, (annotated_frame, detected, person_count) in zip(batch, batch_results):
            camera_id   = item['camera_id']
            ch_no       = item['ch_no']
            script_name = item.get('script_name', 'server')
            state       = item.get('state', {})

            if not detected:
                continue

            now = time.time()
            if now - state.get("last_save", 0) < cooldown_time:
                continue

            should_save, _, _ = rate_limiter.should_save_detection(camera_id)
            if not should_save:
                continue

            state["last_save"] = now
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            
            # ── Source-Aware Naming Format ──────────────
            if item.get("source_type") == "HLS":
                filename = os.path.join(
                    save_folder,
                    f"{script_name}_ch{ch_no}_{timestamp}.jpg"
                )
            else:
                # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
                dev_id = item.get("device_id") or camera_id
                filename = os.path.join(
                    save_folder,
                    f"{script_name}_{dev_id}_{ch_no}_{timestamp}.jpg"
                )
            
            cv2.imwrite(filename, annotated_frame)
            logger.warning(
                f"[ServerRoom][HLS] 🚨 SAVED persons={person_count} → {filename}"
            )
            
            # Explicit cleanup
            del annotated_frame
            if 'frame' in item: del item['frame']

        del batch
        if 'batch_results' in locals(): del batch_results

    logger.info("🔴 [ServerRoom][HLS] GPU worker stopped")


def _hls_camera_thread(cfg, stop_event):
    """
    Camera reader thread — opens HLS stream, reads frames,
    pushes to gpu_queue for batch processing.
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

    camera_id   = cfg['camera_id']
    script_name = cfg.get('script_code', 'server')
    ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        logger.error(f"[ServerRoom][HLS] ❌ Stream failed for {camera_id}")
        return

    cap = open_hls_stream(hls)
    if cap is None:
        logger.error(f"[ServerRoom][HLS] ❌ Could not open stream for {camera_id}")
        return

    logger.info(f"[ServerRoom][HLS] 🟢 Camera thread started → {camera_id}")

    frame_count = 0
    state = {"last_save": 0}

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[ServerRoom][HLS] ⚠️ Stream ended → {camera_id}")
            break

        frame_count += 1

        if not frame_should_process(frame_count, HLS_SAMPLE_EVERY):
            continue

        try:
            _gpu_queue.put_nowait({
                "frame":       frame,
                "camera_id":   camera_id,
                "ch_no":       ch_no,
                "script_name": script_name,
                "source_type": "HLS",
                "state":       state,
            })
            logger.debug(f"[HLS-QUEUE] 📤 Frame sent → {camera_id}")
        except queue.Full:
            logger.debug(f"[HLS-QUEUE] ❌ Queue full → {camera_id}")
            del frame
            continue
        
        # Cleanup frame from this scope
        del frame

    cap.release()
    logger.info(f"[ServerRoom][HLS] 🔴 Camera thread stopped → {camera_id}")


def server_room_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point — GPU batch queue architecture.

    Accepts a LIST of camera configs (from camera_loader) and runs
    all cameras with a shared GPU worker thread.

    Each camera_config dict should contain:
        camera_id, cctv_url (or stream_url), camera_name,
        classification, script_code

    Can also accept a single dict for backward compatibility.
    """
    import torch
    cv2.setNumThreads(0) # Prevent thread explosion

    # Handle single config (backward compat)
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT

    # Keep unclassified cameras and common exam/lab/server scenes.
    valid_configs = []
    for cfg in camera_configs:
        cls_val = str(cfg.get('classification', '')).lower()
        stream_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
        if not stream_url:
            continue
        if not cls_val or any(scene in cls_val for scene in ('server room', 'computer lab', 'classroom', 'exam', 'lab')):
            valid_configs.append(cfg)
        else:
            logger.info(f"[ServerRoom] 🚫 Skipping {cfg.get('camera_id', 'unknown')} (Scene: {cls_val})")
            
    if not valid_configs:
        logger.warning("[ServerRoom][HLS] ❌ No valid cameras found after Scene Classification filter. Exiting.")
        return
        
    camera_configs = valid_configs

    # Override save folder on server_core
    server_core.SAVE_FOLDER = HLS_SAVE_FOLDER

    # Start GPU worker thread
    gpu_t = threading.Thread(
        target=_hls_gpu_worker,
        args=(stop_event, HLS_SAVE_FOLDER),
        daemon=True
    )
    gpu_t.start()

    # Start camera threads using ThreadPoolExecutor
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in camera_configs:
            executor.submit(_hls_camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    logger.info(f"[ServerRoom][HLS] Started {len(camera_configs)} camera threads + 1 GPU worker")

    # Signal GPU worker to stop
    stop_event.wait() # Or rely on camera thread completion if loop is broken
    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("[ServerRoom][HLS] ✅ All HLS cameras completed")