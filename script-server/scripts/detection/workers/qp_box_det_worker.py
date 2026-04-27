"""
QP Box Detection Worker (HLS)
==============================
Detects when Question Paper (QP) box is NOT visible in strong room cameras.
The QP box is typically white/grey/brown colored and should be present in the frame.

Architecture: GPU-batched YOLO worker + per-camera feeder threads
  - Uses YOLO object detection to identify boxes/containers
  - Color-based filtering for white/grey/brown boxes
  - Single GPU worker drains shared queue in true batches
  - Rate limiter (25 detections/min globally)

Compatible with TCS streaming links (HLS format).
"""

import queue
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
import threading
import signal
import logging
import uuid
import torch
import numpy as np

# Fix threading/BLAS errors
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, PROJECT_ROOT)

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter
from utils.db_client import get_hls_cameras, get_rtsp_cameras

# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logging.warning("YOLO not available — install ultralytics.")

logger = logging.getLogger(__name__)

_STOP_EVENT = threading.Event()


def _handle_stop(sig, frame):
    _STOP_EVENT.set()


if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ─────────────────────────── paths ────────────────────────────────────────────
QP_BOX_SAVE_FOLDER = os.path.join(
    PROJECT_ROOT, "results/tcs_detections/qp_box_missing"
)

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/qp_box_missing")


def ensure_save_paths():
    os.makedirs(QP_BOX_SAVE_FOLDER, exist_ok=True)
    os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
    logger.info(f"QP Box missing detections will be saved to: {QP_BOX_SAVE_FOLDER}")

MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# ─────────────────────────── thresholds ───────────────────────────────────────
COOLDOWN_TIME = 240    # 4 min between saves per camera
CONFIDENCE = 0.45      # YOLO confidence threshold
MIN_BOX_AREA = 5000    # Minimum area for QP box detection (pixels)
MAX_BOX_AREA = 200000  # Maximum area for QP box detection (pixels)

# Color ranges for QP box detection (HSV)
# White/Grey/Brown color ranges
COLOR_RANGES = {
    'white': {
        'lower': np.array([0, 0, 180]),
        'upper': np.array([180, 30, 255])
    },
    'grey': {
        'lower': np.array([0, 0, 80]),
        'upper': np.array([180, 50, 180])
    },
    'brown': {
        'lower': np.array([10, 50, 50]),
        'upper': np.array([20, 255, 200])
    }
}

# target scenes — Strong Room cameras only
TARGET_SCENES = [
    "Server Room",
    "Strong Room"
]

# ─────────────────────────── queue / batching ─────────────────────────────────
SAMPLE_EVERY = int(os.environ.get("TCS_QP_BOX_SAMPLE_EVERY", 10))
GPU_BATCH_SIZE = int(os.environ.get("TCS_QP_BOX_BATCH_SIZE", 64))
GPU_QUEUE_SIZE = int(os.environ.get("TCS_QP_BOX_QUEUE_SIZE", 128))
THREAD_DELAY = float(os.environ.get("TCS_QP_BOX_THREAD_DELAY", 0.1))

# ─────────────────────────── globals ──────────────────────────────────────────
gpu_queue: queue.Queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter("qp_box", max_per_minute=25)
df_lock = threading.Lock()

# single shared YOLO model
_yolo_model = None
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()


def get_yolo_model():
    global _yolo_model
    ensure_save_paths()
    if _yolo_model is None and YOLO_AVAILABLE:
        logger.info("Loading YOLO model...")
        _yolo_model = YOLO(MODEL_PATH)
        logger.info("YOLO model loaded successfully")
    return _yolo_model


def detect_qp_box_color(frame, bbox):
    """
    Check if the detected box matches QP box color (white/grey/brown).
    
    Args:
        frame: Input frame
        bbox: Bounding box [x1, y1, x2, y2]
    
    Returns:
        bool: True if box matches QP box color
    """
    x1, y1, x2, y2 = map(int, bbox)
    
    # Extract ROI
    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return False
    
    # Convert to HSV
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    
    # Check each color range
    for color_name, color_range in COLOR_RANGES.items():
        mask = cv2.inRange(hsv, color_range['lower'], color_range['upper'])
        color_ratio = np.count_nonzero(mask) / mask.size
        
        # If more than 30% of the box matches the color, consider it a QP box
        if color_ratio > 0.3:
            return True
    
    return False


def detect_qp_box_in_frame(frame):
    """
    Detect if QP box is present in the frame.
    
    Returns:
        tuple: (qp_box_found, detected_boxes)
    """
    model = get_yolo_model()
    if model is None:
        return False, []
    
    results = model(frame, conf=CONFIDENCE, verbose=False)[0]
    
    # Look for objects that could be boxes (class IDs: 0=person, 24=backpack, 25=umbrella, 26=handbag, 28=suitcase, 73=book, 84=book)
    # We're primarily interested in detecting rectangular objects
    box_class_ids = [24, 25, 26, 28, 73, 84]  # Potential box-like objects
    
    detected_boxes = []
    qp_box_found = False
    
    for box in results.boxes:
        class_id = int(box.cls[0])
        conf = float(box.conf[0])
        
        if class_id in box_class_ids and conf >= CONFIDENCE:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            area = (x2 - x1) * (y2 - y1)
            
            # Check if size is appropriate for QP box
            if MIN_BOX_AREA <= area <= MAX_BOX_AREA:
                # Check color
                if detect_qp_box_color(frame, [x1, y1, x2, y2]):
                    detected_boxes.append({
                        'bbox': [x1, y1, x2, y2],
                        'conf': conf,
                        'class_id': class_id,
                        'area': area
                    })
                    qp_box_found = True
    
    return qp_box_found, detected_boxes


# ══════════════════════════════════════════════════════════════════════════════
#  RTSP Worker  — standalone process entry point
# ══════════════════════════════════════════════════════════════════════════════
_rtsp_last_save = {}


def detect_qp_box_missing(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = ""):
    """Detect if QP box is missing from the frame."""
    qp_box_found, detected_boxes = detect_qp_box_in_frame(frame)
    
    # Alert if QP box is NOT found (violation)
    if not qp_box_found:
        key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
        log_key = f"{device_id}_{camera_no}"
        now = time.time()
        
        if now - _rtsp_last_save.get(key, 0) >= COOLDOWN_TIME:
            _rtsp_last_save[key] = now
            ts = time.strftime("%Y%m%d_%H%M%S")
            fname = f"qp_box_missing_{device_id}_{camera_no}_{ts}.jpg"
            
            filename = os.path.join(save_folder, fname)
            
            # Draw warning on frame
            cv2.putText(frame, "QP BOX NOT DETECTED!", (50, 50),
                       cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)
            
            cv2.imwrite(filename, frame)
            logger.warning(
                f"[QPBoxWorker] QP BOX MISSING: pk={camera_id_pk} {log_key} "
                f"saved → {filename}"
            )


def qp_box_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives packets from the RTSP producer and pushes them into
    the shared gpu_queue for batch inference.
    """
    import torch
    logger.info("🟢 [QPBoxWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the GPU batch worker
    gpu_t = threading.Thread(
        target=gpu_worker,
        args=(None, stop_event),
        daemon=True,
        name="qp_box_rtsp_gpu_worker"
    )
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None:
                logger.info("🔴 [QPBoxWorker] RTSP batch-worker stopping")
                break

            # Unpack — supports dict, 4-tuple, 3-tuple
            if isinstance(data, dict):
                frame = data.get("frame")
                device_id = str(data.get("device_id", "unknown"))
                camera_no = str(data.get("camera_no") or data.get("ch_no") or "0")
                camera_id_pk = str(data.get("camera_id_pk", ""))
            elif len(data) == 4:
                frame, device_id, camera_no, camera_id_pk = data
            else:
                frame, device_id, camera_no = data
                camera_id_pk = ""

            if frame is None:
                continue

            try:
                gpu_queue.put({
                    "frame": frame.copy(),
                    "device_id": str(device_id),
                    "camera_no": str(camera_no),
                    "ch_no": str(camera_no),
                    "source_type": "RTSP",
                    "state": {"last_save": 0},
                }, timeout=0.1)
            except queue.Full:
                pass
            del frame

    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("🔴 [QPBoxWorker] GPU worker shut down")


# ══════════════════════════════════════════════════════════════════════════════
#  Config loader
# ══════════════════════════════════════════════════════════════════════════════

def load_camera_config():
    """Load camera list from DB tables using assignment context env vars."""
    exam_id = str(os.environ.get("EXAM_ID", "")).strip()
    shift_id = str(os.environ.get("SHIFT_ID", "")).strip()
    assignment_date = str(os.environ.get("ASSIGNMENT_DATE", "")).strip() or time.strftime("%Y-%m-%d")
    link_type = str(os.environ.get("LINK_TYPE", "HLS")).strip().upper()

    if not exam_id:
        logger.error("EXAM_ID is required for DB camera loading")
        return [], None

    try:
        exam_id_int = int(exam_id)
        if link_type == "RTSP":
            rows = get_rtsp_cameras(exam_id_int)
        else:
            shift_id_int = int(shift_id) if shift_id else -1
            rows = get_hls_cameras(exam_id_int, shift_id_int, assignment_date)

        logger.info(f"Loaded {len(rows)} cameras from DB (link_type={link_type})")
        configs = []
        for row in rows:
            url = str(row.get("cctv_url") or "").strip()
            if not url:
                continue

            scene = str(row.get("classification") or "")
            if scene and scene not in TARGET_SCENES:
                continue

            if link_type == "RTSP":
                camera_id = str(row.get("device_id") or "").strip()
                ch_no = camera_id or "unknown"
            else:
                ch_no = str(row.get("ch_code") or "").strip() or "unknown"
                camera_id = ch_no

            if not camera_id:
                continue

            configs.append({
                "url": url,
                "camera_id": camera_id,
                "ch_no": ch_no,
                "classification": scene,
            })

        logger.info(f"Loaded {len(configs)} camera configs for QP Box detection")
        return configs, None

    except Exception as exc:
        logger.error(f"Error loading cameras from DB: {exc}")
        return [], None


# ══════════════════════════════════════════════════════════════════════════════
#  GPU worker  — single thread, true batch YOLO inference
# ══════════════════════════════════════════════════════════════════════════════

def gpu_worker(df, stop_event: threading.Event):
    """
    Drain gpu_queue in batches.
      1. Collect up to GPU_BATCH_SIZE frames within a 200 ms window.
      2. Run QP box detection on each frame.
      3. Save frames where QP box is NOT detected (violation).
      4. Apply cooldown and rate limiter before saving.
    """
    logger.info("GPU worker started (QP box detection mode)")

    model = get_yolo_model()
    if model is None:
        logger.error("YOLO unavailable — GPU worker exiting.")
        return

    while not stop_event.is_set():

        # ── collect a batch ───────────────────────────────────────────────────
        batch = []
        try:
            batch.append(gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + 0.2
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        # ── per-frame QP box detection ────────────────────────────────────────
        for item in batch:
            camera_id = item["camera_id"]
            ch_no = item["ch_no"]
            state = item["state"]
            frame = item["frame"]

            # Detect QP box
            qp_box_found, detected_boxes = detect_qp_box_in_frame(frame)
            
            # Alert if QP box is NOT found (violation)
            if not qp_box_found:
                now = time.time()

                # per-camera cooldown
                if now - state["last_save"] < COOLDOWN_TIME:
                    continue
                
                # global rate limiter
                should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
                if should_save:
                    state['last_save'] = now
                    timestamp = time.strftime("%Y%m%d_%H%M%S")
                    
                    # ── Source-Aware Naming Format ──────────────
                    if item.get("source_type") == "HLS":
                        _uid = str(uuid.uuid4())
                        _exam_id = str(os.environ.get("EXAM_ID", "0")).strip()
                        filename = os.path.join(
                            QP_BOX_SAVE_FOLDER,
                            f"qp_box_missing_ch{ch_no}_exam{_exam_id}_{timestamp}_{_uid}.jpg"
                        )
                    else:
                        # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
                        dev_id = item.get("device_id") or camera_id
                        filename = os.path.join(
                            QP_BOX_SAVE_FOLDER,
                            f"qp_box_missing_{dev_id}_{ch_no}_{timestamp}.jpg"
                        )
                    
                    # Draw warning on frame
                    annotated_frame = frame.copy()
                    cv2.putText(annotated_frame, "QP BOX NOT DETECTED!", (50, 50),
                               cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)
                    cv2.putText(annotated_frame, f"Camera: {camera_id}", (50, 100),
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    
                    cv2.imwrite(filename, annotated_frame)
                    logger.warning(f"🚨 ALERT: QP BOX MISSING at {camera_id}")
                    
                    # --- Report to DB (HLS only) ---
                    if item.get("source_type") == "HLS":
                        try:
                            report_to_db_hls(
                                ch_code=str(ch_no),
                                image_name=os.path.basename(filename),
                                folder="qp_box_missing"
                            )
                        except Exception as e:
                            logger.error(f"[QPBoxWorker] DB Reporting Error: {e}")
            
            if 'frame' in item:
                del item['frame']

        del batch
        
        # GPU memory report
        if torch.cuda.is_available():
            mem = torch.cuda.memory_allocated() / 1e9
            logger.debug(f"[GPU] {mem:.2f} GB allocated")


def _ensure_shared_hls_gpu_worker():
    global _HLS_GPU_WORKER
    with _HLS_GPU_LOCK:
        if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
            _HLS_GPU_WORKER = threading.Thread(
                target=gpu_worker,
                args=(None, _STOP_EVENT),
                daemon=True,
                name="qp_box_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()
            logger.info("[QPBoxWorker] Shared GPU worker started")


# ══════════════════════════════════════════════════════════════════════════════
#  Camera feeder thread
# ══════════════════════════════════════════════════════════════════════════════

def camera_thread(cfg: dict, stop_event: threading.Event):
    camera_id = cfg.get("camera_id") or "unknown_camera"
    ch_no = cfg.get("ch_no") or cfg.get("camera_no") or "unknown"

    initial_url = cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url") or ""
    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url or not test_hls_stream(hls_url):
        logger.error(f"[{camera_id}] Stream failed — skipping.")
        return

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] cap.isOpened() == False — skipping.")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    logger.info(f"[{camera_id}] Stream open @ {fps:.1f} FPS")

    state = {"last_save": 0}

    frame_count = 0
    skipped_queue_full = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[{camera_id}] Stream ended / read failed.")
            break

        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            gpu_queue.put({
                'frame': frame.copy(),
                'camera_id': camera_id,
                'ch_no': ch_no,
                'source_type': 'HLS',
                'state': state
            }, timeout=0.1)
        except queue.Full:
            skipped_queue_full += 1
            del frame
            continue
        
        # Cleanup
        del frame

    cap.release()
    logger.info(
        f"[{camera_id}] Done. frames={frame_count} "
        f"queue-full-dropped={skipped_queue_full}"
    )


def qp_box_det_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point used by master_pipeline.
    Accepts one camera config dict or a list of configs.
    """
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    filtered_configs = []
    for cfg in camera_configs:
        stream_url = cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url")
        if stream_url:
            filtered_configs.append(cfg)

    if not filtered_configs:
        logger.warning("[QPBoxWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    camera_configs = filtered_configs

    cv2.setNumThreads(0)  # Prevent thread explosion
    if persistent_mode:
        _ensure_shared_hls_gpu_worker()
    else:
        gpu_t = threading.Thread(
            target=gpu_worker,
            args=(None, stop_event),
            daemon=True,
            name="qp_box_gpu_worker",
        )
        gpu_t.start()

    threads = []
    for cfg in camera_configs:
        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"qp_box_{cfg.get('camera_id', 'cam')}",
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(f"[QPBoxWorker][HLS] Started {len(threads)} camera threads")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[QPBoxWorker][HLS] Camera threads completed (shared GPU worker still running)")
        return

    stop_event.set()
    logger.info("[QPBoxWorker][HLS] All cameras completed")


# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    logger.info("=== QP Box Detection — Strong Room Cameras (batch-GPU architecture) ===")

    if not YOLO_AVAILABLE:
        logger.error("YOLO is not available. Install with: pip install ultralytics")
        return

    camera_configs, _ = load_camera_config()
    if not camera_configs:
        logger.warning("No cameras found — exiting.")
        return

    cv2.setNumThreads(0)
    stop_event = threading.Event()

    # single GPU worker
    gpu_t = threading.Thread(
        target=gpu_worker, args=(None, stop_event), daemon=True, name="gpu_worker"
    )
    gpu_t.start()

    # per-camera feeder threads
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in camera_configs:
            executor.submit(camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    try:
        stop_event.wait()
    except KeyboardInterrupt:
        logger.info("Interrupted — stopping...")
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    logger.info("✅ All QP box HLS cameras completed")


if __name__ == "__main__":
    main()
