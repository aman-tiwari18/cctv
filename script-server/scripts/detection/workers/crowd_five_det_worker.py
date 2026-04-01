"""
TCS Crowd Detection Script — Final
====================================
Detection Logic  : crowd_det_less_than_5   (less-than-5 persons trigger)
Camera Source    : Computer Lab cameras only
Architecture     : True GPU Batch Mode (Script 2 pattern)

Excel columns used:
  - Centre Name
  - Camera Name
  - CCTV URL
  - ch_no(unique key value)   ← used in saved filename
  - Scene Classification      ← filtered to "Computer Lab"

Saved filename format:  lessthan5_ch{ch_no}_{timestamp}.jpg
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
from ultralytics import YOLO

# ── Fix MKL / oneDNN thread-safety issues ─────────────────────────────────────
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

# ── Project root setup ────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

# ── Local TCS utils ───────────────────────────────────────────────────────────
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process, get_sample_every
from detection_rate_limiter import get_rate_limiter
from motion_detector import get_motion_detector
from utils.db_client import get_hls_cameras, get_rtsp_cameras

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════

SAVE_FOLDER = os.path.join(
    PROJECT_ROOT, "results/tcs_detections/crowd_detection_threshold"
)
os.makedirs(SAVE_FOLDER, exist_ok=True)

# Thresholds
MIN_PERSONS   = int(os.getenv("TCS_CROWD_FIVE_THRESHOLD", "5"))
COOLDOWN_TIME = int(os.getenv("TCS_CROWD_FIVE_COOLDOWN", "240"))
CONFIDENCE    = float(os.getenv("TCS_CROWD_FIVE_CONF", "0.45"))
person_counts = {}

# Frame sampling
SAMPLE_EVERY = get_sample_every("TCS_CROWD_SAMPLE_EVERY", default=10)

# GPU Batch Worker
GPU_BATCH_SIZE  = int(os.getenv("TCS_GPU_BATCH_SIZE",    "32"))
GPU_QUEUE_SIZE  = int(os.getenv("TCS_GPU_QUEUE_SIZE",    "512"))
GPU_FILL_WINDOW = float(os.getenv("TCS_GPU_FILL_WINDOW", "0.2"))
THREAD_DELAY    = float(os.getenv("TCS_THREAD_DELAY",    "0.05"))

# Rate limiter
RATE_LIMIT_PER_MIN = int(os.getenv("TCS_RATE_LIMIT", "25"))

# Scene filter
TARGET_SCENES = ["Computer Lab"]

# ══════════════════════════════════════════════════════════════════════════════
#  LOGGING
# ══════════════════════════════════════════════════════════════════════════════

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

logger.info(f"Save folder  : {SAVE_FOLDER}")
logger.info(f"MIN_PERSONS  : {MIN_PERSONS}")
logger.info(f"COOLDOWN     : {COOLDOWN_TIME}s")
logger.info(f"SAMPLE_EVERY : {SAMPLE_EVERY}")
logger.info(f"BATCH SIZE   : {GPU_BATCH_SIZE}")
logger.info(f"RATE LIMIT   : {RATE_LIMIT_PER_MIN}/min")

_STOP_EVENT = threading.Event()


def _handle_stop(sig, frame):
    _STOP_EVENT.set()


if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ══════════════════════════════════════════════════════════════════════════════
#  SHARED OBJECTS
# ══════════════════════════════════════════════════════════════════════════════

gpu_queue    = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter("crowd_five", max_per_minute=RATE_LIMIT_PER_MIN)
df_lock      = threading.Lock()
_yolo_model = None
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        model_path = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
        logger.info("Loading YOLO model for crowd_five worker...")
        _yolo_model = YOLO(model_path)
    return _yolo_model

# ══════════════════════════════════════════════════════════════════════════════
#  EXCEL LOADER
# ══════════════════════════════════════════════════════════════════════════════

def load_camera_config():
    """Load camera configs from DB tables using assignment context env vars."""
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
        logger.info(f"DB loaded: {len(rows)} camera rows (link_type={link_type})")
    except Exception as exc:
        logger.error(f"Cannot read cameras from DB: {exc}")
        return [], None

    configs = []
    for row in rows:
        url = str(row.get("cctv_url") or "").strip()
        if not url:
            continue

        scene = str(row.get("classification") or "")
        if scene and scene not in TARGET_SCENES:
            continue

        if link_type == "RTSP":
            cam_id = str(row.get("device_id") or "").strip()
            ch_no = cam_id or "0"
        else:
            ch_no = str(row.get("ch_code") or "").strip() or "0"
            cam_name = str(row.get("camera_name") or "camera").strip()
            cam_id = f"{cam_name}_{ch_no}".replace(" ", "_").replace("/", "_")

        if not cam_id:
            continue

        configs.append({
            "initial_url": url,
            "camera_id":   cam_id,
            "ch_no":       ch_no,
            "classification": scene,
        })

    logger.info(f"Total cameras to process: {len(configs)}")
    return configs, None

# ══════════════════════════════════════════════════════════════════════════════
#  GPU BATCH WORKER
# ══════════════════════════════════════════════════════════════════════════════

def gpu_worker(stop_event: threading.Event):
    """
    Single GPU worker thread.
    Fills batches from gpu_queue, runs detection, saves crowd frames.
    """
    logger.info("GPU batch worker started")
    get_yolo_model()    # warm up YOLO once
    logger.info("YOLO model ready")

    while not stop_event.is_set():

        # Step 1 — wait for first frame
        batch = []
        try:
            batch.append(gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        # Step 2 — fill batch within time window
        deadline = time.time() + GPU_FILL_WINDOW
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        logger.debug(f"[GPU] Batch: {len(batch)} frames")

        # Step 3 — detect + save each item
        for item in batch:
            _detect_and_save(item)

        # Step 4 — VRAM stats
        if torch.cuda.is_available():
            logger.debug(f"[GPU] VRAM: {torch.cuda.memory_allocated()/1e9:.2f} GB")

    logger.info("GPU worker stopped.")


def _ensure_shared_hls_gpu_worker():
    global _HLS_GPU_WORKER
    with _HLS_GPU_LOCK:
        if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
            _HLS_GPU_WORKER = threading.Thread(
                target=gpu_worker,
                args=(_STOP_EVENT,),
                daemon=True,
                name="crowd_five_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()
            logger.info("[CrowdFiveWorker] Shared GPU worker started")


def _detect_and_save(item: dict):
    """
    Run crowd_det_less_than_5 on one frame.
    Filename format: lessthan5_ch{ch_no}_{timestamp}.jpg
    """
    frame     = item["frame"]
    camera_id = item["camera_id"]
    ch_no     = item["ch_no"]
    state     = item["state"]   # {"last_save": float}

    # ── Detection ─────────────────────────────────────────────────────────
    try:
        model = get_yolo_model()
        result = model(frame, conf=CONFIDENCE, verbose=False)[0]
        person_boxes = [b for b in result.boxes if int(b.cls[0]) == 0]
        person_count = len(person_boxes)
        processed_frame = frame.copy()
        for b in person_boxes:
            x1, y1, x2, y2 = map(int, b.xyxy[0])
            cv2.rectangle(processed_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
    except Exception as exc:
        logger.error(f"[{camera_id}] Detection error: {exc}")
        return

    person_counts[camera_id] = person_count
    low_count_detected = person_count < MIN_PERSONS
    logger.debug(f"[{camera_id}] persons={person_count} low={low_count_detected}")

    if not low_count_detected:
        return

    now = time.time()

    # ── Cooldown ──────────────────────────────────────────────────────────
    if now - state["last_save"] < COOLDOWN_TIME:
        logger.debug(f"[{camera_id}] Cooldown active — skip")
        return

    # ── Rate limit ────────────────────────────────────────────────────────
    should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
    if not should_save:
        logger.info(f"[{camera_id}] Rate limit {current_rate}/{RATE_LIMIT_PER_MIN}/min — skip")
        return

    # ── Save  →  lessthan5_ch{ch_no}_{timestamp}.jpg ─────────────────────
    state["last_save"] = now
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    filename  = os.path.join(SAVE_FOLDER, f"lessthan5_ch{ch_no}_{timestamp}.jpg")

    save_frame = processed_frame if processed_frame is not None else frame
    cv2.imwrite(filename, save_frame)

    logger.warning(
        f"[{camera_id}] CROWD SAVED — {person_count} persons | "
        f"{os.path.basename(filename)} | rate {current_rate}/{RATE_LIMIT_PER_MIN}/min"
    )

# ══════════════════════════════════════════════════════════════════════════════
#  CAMERA THREAD
# ══════════════════════════════════════════════════════════════════════════════

def camera_thread(cfg: dict, stop_event: threading.Event):
    """One thread per camera — read HLS, motion filter, enqueue frames."""
    camera_id = cfg["camera_id"]

    initial_url = cfg.get("initial_url") or cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url") or ""
    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url or not test_hls_stream(hls_url):
        logger.error(f"[{camera_id}] HLS stream unavailable — skipping")
        return

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Cannot open stream — skipping")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    logger.info(f"[{camera_id}] Stream open @ {fps:.1f} FPS | ch_no={cfg['ch_no']}")

    per_camera_state = {"last_save": 0.0}
    motion_detector  = get_motion_detector(camera_id, motion_threshold=1000)

    frame_count = skip_motion = skip_queue = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[{camera_id}] Stream ended")
            break

        frame_count += 1

        # Frame sampling
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        # Motion pre-filter
        if not motion_detector.has_motion(frame):
            skip_motion += 1
            continue

        # Enqueue
        try:
            gpu_queue.put_nowait({
                "frame":     frame,
                "camera_id": camera_id,
                "ch_no":     cfg.get("ch_no") or cfg.get("camera_no") or "0",
                "state":     per_camera_state,
            })
        except queue.Full:
            skip_queue += 1
            if skip_queue % 100 == 1:
                logger.warning(f"[{camera_id}] Queue full — drops: {skip_queue}")

        # Periodic stats
        if frame_count % 500 == 0:
            rl = rate_limiter.get_stats()
            logger.info(
                f"[{camera_id}] frames={frame_count} | "
                f"no_motion={skip_motion} | queue_drops={skip_queue} | "
                f"rate={rl.get('current_rate','?')}/{RATE_LIMIT_PER_MIN}/min"
            )

    cap.release()
    logger.info(
        f"[{camera_id}] Done | frames={frame_count} | "
        f"no_motion={skip_motion} | queue_drops={skip_queue}"
    )


def crowd_five_det_worker_hls(camera_configs, stop_event=None):
    """HLS worker entry point for low-person (<5) detection analytics."""
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    filtered_configs = []
    for cfg in camera_configs:
        stream_url = cfg.get("initial_url") or cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url")
        if stream_url:
            filtered_configs.append(cfg)

    if not filtered_configs:
        logger.warning("[CrowdFiveWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    if persistent_mode:
        _ensure_shared_hls_gpu_worker()
    else:
        gpu_t = threading.Thread(
            target=gpu_worker,
            args=(stop_event,),
            daemon=True,
            name="crowd_five_gpu_worker",
        )
        gpu_t.start()

    threads = []
    for cfg in filtered_configs:
        if "camera_id" not in cfg:
            cam_name = str(cfg.get("camera_name") or "camera")
            ch = str(cfg.get("ch_no") or cfg.get("camera_no") or "0")
            cfg = {
                **cfg,
                "camera_id": f"{cam_name}_{ch}".replace(" ", "_"),
            }

        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"crowd_five_{cfg.get('camera_id', 'cam')}",
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(f"[CrowdFiveWorker][HLS] Started {len(threads)} camera threads")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[CrowdFiveWorker][HLS] Camera threads completed (shared GPU worker still running)")
        return

    stop_event.set()
    logger.info("[CrowdFiveWorker][HLS] All cameras completed")

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    logger.info("=" * 65)
    logger.info("  TCS Crowd Detection  |  crowd_det_less_than_5  |  GPU Batch")
    logger.info("=" * 65)

    configs, _ = load_camera_config()
    if not configs:
        logger.error("No cameras found — exiting.")
        return

    stop_event = threading.Event()

    # GPU batch worker
    gpu_t = threading.Thread(
        target=gpu_worker, args=(stop_event,), daemon=True, name="gpu-batch-worker"
    )
    gpu_t.start()

    # One thread per camera
    cam_threads = []
    for cfg in configs:
        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"cam-{cfg['camera_id']}",
        )
        t.start()
        cam_threads.append((t, cfg))
        time.sleep(THREAD_DELAY)

    logger.info(f"Launched {len(cam_threads)} camera threads")

    try:
        for t, _ in cam_threads:
            t.join()
    except KeyboardInterrupt:
        logger.info("Interrupted — shutting down…")
        stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("All done.")


if __name__ == "__main__":
    main()