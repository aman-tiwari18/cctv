"""
TCS Zero-Person Detection Script
==================================
Detects frames where person count drops to zero/low occupancy
in Outdoor / Entry / Parking camera feeds.

Architecture: GPU-batched YOLO worker + per-camera feeder threads
  - NO motion pre-filter (empty area = no motion = would skip exactly
    the frames we want to catch)
  - Single GPU worker drains shared queue in true batches
  - Rate limiter (25 detections/min globally)

Compatible with TCS streaming links (HLS format).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
import queue
import threading
import signal
import logging
import torch

# Fix threading/BLAS errors
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter
from utils.db_client import get_hls_cameras, get_rtsp_cameras

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logging.warning("YOLO not available — install ultralytics.")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

_STOP_EVENT = threading.Event()


def _handle_stop(sig, frame):
    _STOP_EVENT.set()


if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ─────────────────────────── paths ────────────────────────────────────────────
TCS_ZERO_SAVE_FOLDER = os.path.join(
    PROJECT_ROOT, "results/tcs_detections/zero_person_detection"
)

os.makedirs(TCS_ZERO_SAVE_FOLDER, exist_ok=True)

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_threshold")
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)

logger.info(f"TCS Zero-person detections will be saved to: {TCS_ZERO_SAVE_FOLDER}")

MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# ─────────────────────────── thresholds ───────────────────────────────────────
LOW_PERSON_THRESHOLD = 1      # save when person_count < this (zero/low occupancy)
COOLDOWN_TIME        = 240    # 4 min between saves per camera (matches original)
CONFIDENCE           = 0.45   # YOLO confidence threshold (matches original)

# target scenes — same as original crowd_det_zero
TARGET_SCENES = [
    "Computer Lab"
]

# ─────────────────────────── queue / batching ─────────────────────────────────
SAMPLE_EVERY   = int(os.environ.get("TCS_CROWD_ZERO_SAMPLE_EVERY",  10))
GPU_BATCH_SIZE = int(os.environ.get("TCS_CROWD_ZERO_BATCH_SIZE",    64))
GPU_QUEUE_SIZE = int(os.environ.get("TCS_CROWD_ZERO_QUEUE_SIZE",  1024))
THREAD_DELAY   = float(os.environ.get("TCS_CROWD_ZERO_THREAD_DELAY", 0.05))

# ─────────────────────────── globals ──────────────────────────────────────────
gpu_queue: queue.Queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter("crowd_zero", max_per_minute=25)
df_lock      = threading.Lock()

# single shared YOLO model
_yolo_model = None
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()

def get_yolo_model():
    global _yolo_model
    if _yolo_model is None and YOLO_AVAILABLE:
        logger.info("Loading YOLO model...")
        _yolo_model = YOLO(MODEL_PATH)
        logger.info("YOLO model loaded successfully")
    return _yolo_model

# ══════════════════════════════════════════════════════════════════════════════
#  RTSP Worker  — standalone process entry point
# ══════════════════════════════════════════════════════════════════════════════
_rtsp_last_save = {}

def detect_zero_crowd(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = ""):
    model = get_yolo_model()
    if model is None:
        return

    results = model(frame, conf=CONFIDENCE, verbose=False)[0]
    person_boxes = [b for b in results.boxes if int(b.cls[0]) == 0]
    person_count = len(person_boxes)

    if person_count < LOW_PERSON_THRESHOLD:
        key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
        log_key = f"{device_id}_{camera_no}"
        now = time.time()
        
        if now - _rtsp_last_save.get(key, 0) >= COOLDOWN_TIME:
            _rtsp_last_save[key] = now
            ts = time.strftime("%Y%m%d_%H%M%S")
            if camera_id_pk:
                fname = f"zero_{camera_id_pk}_{camera_no}_{ts}_persons{person_count}.jpg"
            else:
                fname = f"zero_{key}_{ts}_persons{person_count}.jpg"
            
            filename = os.path.join(save_folder, fname)
            
            # draw boxes
            for b in person_boxes:
                x1, y1, x2, y2 = map(int, b.xyxy[0])
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
            cv2.imwrite(filename, frame)
            logger.warning(
                f"[CrowdZeroWorker] ZERO/LOW PERSON: pk={camera_id_pk} {log_key} "
                f"({person_count} persons) saved → {filename}"
            )

def crowd_zero_worker(frame_queue):
    logger.info("🟢 [CrowdZeroWorker] RTSP worker started")
    get_yolo_model()

    while True:
        data = frame_queue.get()
        if data is None:
            logger.info("🔴 [CrowdZeroWorker] RTSP worker stopping")
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

        detect_zero_crowd(
            frame.copy(),
            str(device_id),
            str(camera_no),
            save_folder=RTSP_SAVE_FOLDER,
            camera_id_pk=str(camera_id_pk)
        )


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
                "url":       url,
                "camera_id": camera_id,
                "ch_no":     ch_no,
                "classification": scene,
            })

        logger.info(f"Loaded {len(configs)} camera configs")
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
      2. Run a single batched YOLO forward pass (true GPU batching).
      3. Save frames where person_count < LOW_PERSON_THRESHOLD.
      4. Apply cooldown and rate limiter before saving.
    """
    logger.info("GPU worker started (zero-person batch mode)")

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

        # ── true batch YOLO inference ─────────────────────────────────────────
        frames = [item["frame"] for item in batch]
        try:
            results = model(frames, conf=CONFIDENCE, verbose=False)
        except Exception as exc:
            logger.error(f"[GPU] YOLO batch error: {exc}")
            continue

        # ── per-frame post-processing ─────────────────────────────────────────
        for item, result in zip(batch, results):
            person_count  = sum(1 for b in result.boxes if int(b.cls[0]) == 0)
            zero_detected = person_count < LOW_PERSON_THRESHOLD

            camera_id = item["camera_id"]
            ch_no     = item["ch_no"]
            state     = item["state"]
            frame     = item["frame"]

            if not zero_detected:
                continue

            now = time.time()

            # per-camera cooldown
            if now - state["last_save"] < COOLDOWN_TIME:
                continue

            # global rate limiter
            should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
            if not should_save:
                logger.info(
                    f"[{camera_id}] Zero-person rate-limited "
                    f"({current_rate}/25 this min)"
                )
                continue

            state["last_save"] = now

            ts       = time.strftime("%Y%m%d_%H%M%S")
            filename = os.path.join(
                TCS_ZERO_SAVE_FOLDER,
                f"zero_ch{ch_no}_{ts}_persons{person_count}.jpg",
            )
            cv2.imwrite(filename, frame)
            logger.warning(
                f"[{camera_id}] ZERO/LOW PERSON: {person_count} — "
                f"saved: {filename} ({current_rate}/25 this min)"
            )
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
                name="crowd_zero_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()
            logger.info("[CrowdZeroWorker] Shared GPU worker started")


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

    frame_count        = 0
    skipped_queue_full = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[{camera_id}] Stream ended / read failed.")
            break

        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        # NOTE: No motion pre-filter — if the area is empty (zero persons)
        # there will be no motion. Filtering on motion would skip exactly
        # the frames we want to detect.

        try:
            gpu_queue.put_nowait({
                "frame":     frame,
                "camera_id": camera_id,
                "ch_no":     ch_no,
                "state":     state,
            })
        except queue.Full:
            skipped_queue_full += 1

    cap.release()
    logger.info(
        f"[{camera_id}] Done. frames={frame_count} "
        f"queue-full-dropped={skipped_queue_full}"
    )


def crowd_zero_det_worker_hls(camera_configs, stop_event=None):
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
        logger.warning("[CrowdZeroWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    camera_configs = filtered_configs

    if persistent_mode:
        _ensure_shared_hls_gpu_worker()
    else:
        gpu_t = threading.Thread(
            target=gpu_worker,
            args=(None, stop_event),
            daemon=True,
            name="crowd_zero_gpu_worker",
        )
        gpu_t.start()

    threads = []
    for cfg in camera_configs:
        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"crowd_zero_{cfg.get('camera_id', 'cam')}",
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(f"[CrowdZeroWorker][HLS] Started {len(threads)} camera threads")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[CrowdZeroWorker][HLS] Camera threads completed (shared GPU worker still running)")
        return

    stop_event.set()
    logger.info("[CrowdZeroWorker][HLS] All cameras completed")


# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    logger.info("=== TCS Zero-Person Detection — Outdoor/Entry Cameras (batch-GPU architecture) ===")

    if not YOLO_AVAILABLE:
        logger.error("YOLO is not available. Install with: pip install ultralytics")
        return

    camera_configs, _ = load_camera_config()
    if not camera_configs:
        logger.warning("No cameras found — exiting.")
        return

    stop_event = threading.Event()

    # single GPU worker
    gpu_t = threading.Thread(
        target=gpu_worker, args=(None, stop_event), daemon=True, name="gpu_worker"
    )
    gpu_t.start()

    # per-camera feeder threads
    cam_threads = []
    for cfg in camera_configs:
        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"cam_{cfg['camera_id']}",
        )
        t.start()
        cam_threads.append(t)
        time.sleep(THREAD_DELAY)

    try:
        for t in cam_threads:
            t.join()
    except KeyboardInterrupt:
        logger.info("Interrupted — stopping...")
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()


if __name__ == "__main__":
    main()