# workers/camera_inversion_worker.py
"""
Camera Inversion Worker — HLS only (GPU-based detection).

Detects camera inversion/rotation using YOLO + Places365:
  - Tries all 4 rotations (0° / 90° / 180° / 270°)
  - Picks the one with best combined YOLO + scene score
  - Saves corrected frame if orientation != "original"

Based on: tcs_camera_inversion_detection.py
"""

import os
import sys
import time
import cv2
import logging
import threading
import signal
import queue
import numpy as np
from datetime import datetime

import torch
from ultralytics import YOLO
from torchvision import models, transforms
from PIL import Image

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
    "results/camera_inversion_detection_results"
)
os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

GPU_BATCH_SIZE = int(os.environ.get("GPU_BATCH_SIZE", "8"))
GPU_QUEUE_SIZE = int(os.environ.get("GPU_QUEUE_SIZE", "32"))
THREAD_DELAY   = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
COOLDOWN_TIME  = int(os.environ.get("INVERSION_COOLDOWN_SEC", "120"))
SAMPLE_EVERY   = 5  # process every 5th frame

# ================= IMPORTS =================
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process

# ================= DEVICE =================
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"[InversionWorker] Using device: {device}")

# ================= MODELS (lazy load) =================
_yolo_model = None
_places_model = None
_places_classes = []
_places_transform = None
_model_lock = threading.Lock()


def _load_models():
    """Lazy-load YOLO + Places365 models."""
    global _yolo_model, _places_model, _places_classes, _places_transform

    with _model_lock:
        if _yolo_model is not None:
            return

        logger.info("[InversionWorker] Loading YOLO model...")
        _yolo_model = YOLO(os.path.join(_PROJECT_ROOT, "models/yolo11n.pt"))
        _yolo_model.to(device)

        logger.info("[InversionWorker] Loading Places365 model...")
        _places_model = models.resnet50(num_classes=365)
        ckpt_path = os.path.join(_DETECTION_ROOT, "resnet50_places365.pth.tar")
        checkpoint = torch.load(ckpt_path, map_location=device)
        state_dict = {k.replace("module.", ""): v
                      for k, v in checkpoint["state_dict"].items()}
        _places_model.load_state_dict(state_dict)
        _places_model = _places_model.to(device)
        _places_model.eval()

        classes_path = os.path.join(_DETECTION_ROOT, "categories_places365.txt")
        with open(classes_path) as f:
            for line in f:
                _places_classes.append(line.strip().split(" ")[0][3:])

        _places_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
        ])

        logger.info("[InversionWorker] ✅ All models loaded")


# ================= SHARED STATE ============
_last_save_time = {}
_state_lock = threading.Lock()

# ================= GPU QUEUE ===============
_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)


# =====================================================
# 🔍 DETECTION HELPERS
# =====================================================
def _get_scene(frame):
    """Get scene classification via Places365."""
    img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    tensor = _places_transform(img).unsqueeze(0).to(device)

    with torch.no_grad():
        out = _places_model(tensor)

    prob = torch.nn.functional.softmax(out, dim=1)
    top_prob, top_idx = prob.topk(1)

    return _places_classes[top_idx[0]], top_prob.item()


def _run_yolo(frame):
    """Run YOLO detection, return (count, avg_confidence)."""
    results = _yolo_model(frame, conf=0.35, device=device)
    boxes = results[0].boxes

    count = len(boxes)
    confs = [float(b.conf) for b in boxes]
    avg_conf = sum(confs) / len(confs) if confs else 0

    return count, avg_conf


def _detect_orientation(frame):
    """
    Try all 4 rotations, pick the one with best combined score.
    Returns (best_frame, best_orientation_name).
    """
    rotations = {
        "original": frame,
        "90":  cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE),
        "180": cv2.rotate(frame, cv2.ROTATE_180),
        "270": cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE),
    }

    best_score  = -1
    best_frame  = frame
    best_orient = "original"

    for name, img in rotations.items():
        obj_count, conf = _run_yolo(img)
        _, scene_conf = _get_scene(img)

        score = obj_count * conf + scene_conf

        if score > best_score:
            best_score  = score
            best_frame  = img
            best_orient = name

    return best_frame, best_orient


# =====================================================
# 🔧 GPU BATCH WORKER
# =====================================================
def _hls_gpu_worker(stop_event):
    """
    GPU batch worker — pulls frames, runs orientation detection,
    saves if inverted.
    """
    _load_models()
    logger.info(f"🚀 [InversionWorker] GPU worker started (batch={GPU_BATCH_SIZE})")

    while not stop_event.is_set():
        batch = []

        try:
            batch.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        while len(batch) < GPU_BATCH_SIZE:
            try:
                batch.append(_gpu_queue.get_nowait())
            except queue.Empty:
                break

        for item in batch:
            frame       = item['frame']
            camera_id   = item['camera_id']
            ch_no       = item['ch_no']
            script_name = item.get('script_name', 'Inversion')

            try:
                corrected, orientation = _detect_orientation(frame)

                if orientation != "original":
                    now = time.time()

                    with _state_lock:
                        last_time = _last_save_time.get(camera_id, 0)
                        if now - last_time < COOLDOWN_TIME:
                            continue
                        _last_save_time[camera_id] = now

                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    # Image naming: {script_name}_ch{ch_no}_{timestamp}.jpg
                    filename = os.path.join(
                        HLS_SAVE_FOLDER,
                        f"{script_name}_ch{ch_no}_{timestamp}.jpg"
                    )
                    cv2.imwrite(filename, corrected)
                    logger.warning(
                        f"[InversionWorker] 🔄 Inverted! {camera_id} "
                        f"orient={orientation} → {filename}"
                    )

            except Exception as e:
                logger.error(f"[InversionWorker GPU] {camera_id} → {e}")

    logger.info("🔴 [InversionWorker] GPU worker stopped")


# =====================================================
# 📡 CAMERA THREAD
# =====================================================
def _hls_camera_thread(cfg, stop_event):
    """Per-camera HLS reader → pushes frames to GPU queue."""

    camera_id   = cfg['camera_id']
    script_name = cfg.get('script_code', 'Inversion')
    ch_no       = cfg.get('ch_no', cfg.get('camera_id', 'unknown'))
    initial_url = cfg.get('cctv_url') or cfg.get('url') or cfg.get('stream_url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        logger.error(f"[InversionWorker] ❌ Stream failed for {camera_id}")
        return

    cap = open_hls_stream(hls)
    if cap is None:
        logger.error(f"[InversionWorker] ❌ Could not open stream for {camera_id}")
        return

    logger.info(f"[InversionWorker] 🟢 Camera thread started → {camera_id}")

    frame_count = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            _gpu_queue.put_nowait({
                "frame":       frame,
                "camera_id":   camera_id,
                "ch_no":       ch_no,
                "script_name": script_name,
            })
        except queue.Full:
            continue

    cap.release()
    logger.info(f"[InversionWorker] 🔴 Camera thread stopped → {camera_id}")


# =====================================================
# 📡 HLS WORKER ENTRY POINT
# =====================================================
def camera_inversion_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point for camera inversion detection.

    Accepts a LIST of camera configs (from camera_loader).
    Uses GPU batch queue for YOLO + Places365 inference.

    Can also accept a single dict for backward compatibility.
    """
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT

    # Start GPU batch worker
    gpu_t = threading.Thread(
        target=_hls_gpu_worker,
        args=(stop_event,),
        name="Inversion-GPU-worker",
        daemon=True
    )
    gpu_t.start()

    # Start camera threads with staggered delay
    threads = []
    total = len(camera_configs)
    for i, cfg in enumerate(camera_configs):
        t = threading.Thread(
            target=_hls_camera_thread,
            args=(cfg, stop_event),
            name=f"Inv-{cfg.get('camera_id', i)}",
            daemon=True
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

        if (i + 1) % 100 == 0:
            logger.info(f"  {i + 1}/{total} inversion camera threads started...")

    logger.info(f"[InversionWorker] All {total} cameras started + 1 GPU worker")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("[InversionWorker] ✅ All cameras completed")
