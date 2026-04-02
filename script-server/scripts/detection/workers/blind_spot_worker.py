"""
TCS Blind Spot Detection Script
=================================
Detects blind spots in camera feeds based on:
1. Partial seats/candidates visible in frame
2. Camera placement issues or obstructions
3. Lack of movement detection in inside lab cameras

Architecture: GPU-batched YOLO worker + per-camera feeder threads
(matches crowd detection pattern)

Compatible with TCS streaming links (HLS format).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import numpy as np
import time
import queue
import threading
import signal
import logging
import torch

# Fix threading/BLAS errors (same as crowd detection)
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from datetime import datetime
from collections import deque

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter
from utils.db_client import get_hls_cameras, get_rtsp_cameras

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

# Import YOLO
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logging.warning("YOLO not available. Person detection will be disabled.")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Shared stop event used by HLS pipeline worker mode.
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ─────────────────────────── paths ────────────────────────────────────────────
BLIND_SPOT_SAVE_FOLDER = os.path.join(
    PROJECT_ROOT, "results/tcs_detections/blind_spot_detection"
)
RTSP_SAVE_FOLDER = os.path.join(
    PROJECT_ROOT, "results/blind_spot_detection"
)
os.makedirs(BLIND_SPOT_SAVE_FOLDER, exist_ok=True)
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
logger.info(f"HLS blind spot: {BLIND_SPOT_SAVE_FOLDER}")
logger.info(f"RTSP blind spot: {RTSP_SAVE_FOLDER}")

MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# ─────────────────────────── detection thresholds ─────────────────────────────
EDGE_OBSTRUCTION_THRESHOLD = 0.15   # fraction of edges that must be obstructed to flag
PARTIAL_DETECTION_THRESHOLD = 0.3   # minimum visibility for a person not to be "partial"
MIN_MOVEMENT_PIXELS = 500           # pixels of diff to count as movement
MOVEMENT_HISTORY_FRAMES = 100       # rolling window length
STATIC_THRESHOLD = 10               # consecutive no-movement frames before flagging
CONFIDENCE_THRESHOLD = 0.4          # YOLO confidence threshold
TARGET_SCENES = ["Computer Lab"]

# ─────────────────────────── queue / batching ─────────────────────────────────
SAMPLE_EVERY = int(os.environ.get("TCS_BLINDSPOT_SAMPLE_EVERY", 2))
GPU_BATCH_SIZE = int(os.environ.get("TCS_BLINDSPOT_BATCH_SIZE", 32))
GPU_QUEUE_SIZE = int(os.environ.get("TCS_BLINDSPOT_QUEUE_SIZE", 512))
THREAD_DELAY = float(os.environ.get("TCS_BLINDSPOT_THREAD_DELAY", 0.05))
COOLDOWN_TIME = int(os.environ.get("TCS_BLINDSPOT_COOLDOWN_SEC", 180))

# ─────────────────────────── globals ──────────────────────────────────────────
gpu_queue: queue.Queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter("blind_spot", max_per_minute=10)

# single shared YOLO model (loaded once in gpu_worker)
_yolo_model = None
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()


def get_yolo_model() -> "YOLO":
    global _yolo_model
    if _yolo_model is None and YOLO_AVAILABLE:
        logger.info("Loading YOLO model…")
        _yolo_model = YOLO(MODEL_PATH)
        logger.info("YOLO model loaded successfully")
    return _yolo_model


# ══════════════════════════════════════════════════════════════════════════════
#  BlindSpotDetector  — holds per-camera state; all CV logic lives here
# ══════════════════════════════════════════════════════════════════════════════

class BlindSpotDetector:
    """Stateful per-camera blind-spot analyser.

    The YOLO model is *not* stored here — inference is done externally in the
    GPU worker and the results are passed in via ``analyze_frame_with_detections``.
    All other CV operations (edge analysis, movement, obstruction patterns) run
    in the GPU worker thread and are CPU-only.
    """

    def __init__(self, camera_id: str, ch_no: str = "unknown", camera_id_pk: str = ""):
        self.camera_id = camera_id
        self.ch_no = ch_no
        self.camera_id_pk = camera_id_pk
        self.movement_history: deque = deque(maxlen=MOVEMENT_HISTORY_FRAMES)
        self.static_frame_count = 0
        self.previous_frame_gray: np.ndarray | None = None
        self.last_save_time = 0.0

        self.issue_counts = {
            "edge_obstruction": 0,
            "partial_persons": 0,
            "no_movement": 0,
            "obstruction_detected": 0,
        }

    # ── edge obstruction ──────────────────────────────────────────────────────

    def detect_edge_obstruction(self, frame: np.ndarray):
        """Detect dark / uniform regions at frame edges."""
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edge_size = int(min(h, w) * 0.1)

        edges = {
            "top":    gray[0:edge_size, :],
            "bottom": gray[h - edge_size:h, :],
            "left":   gray[:, 0:edge_size],
            "right":  gray[:, w - edge_size:w],
        }

        obstruction_info = {}
        total_obstruction = 0.0

        for name, region in edges.items():
            mean = float(np.mean(region))
            std  = float(np.std(region))
            is_dark    = mean < 30
            is_uniform = std  < 15
            obstructed = is_dark or is_uniform
            obstruction_info[name] = {"obstructed": obstructed, "mean": mean, "std": std}
            if obstructed:
                total_obstruction += 0.25

        has_obstruction = total_obstruction >= EDGE_OBSTRUCTION_THRESHOLD

        annotated = frame.copy()
        cv2.putText(
            annotated,
            f"Blind Spot Area: {total_obstruction * 100:.1f}%",
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2,
        )
        if obstruction_info["top"]["obstructed"]:
            cv2.rectangle(annotated, (0, 0), (w, edge_size), (0, 255, 0), 3)
        if obstruction_info["bottom"]["obstructed"]:
            cv2.rectangle(annotated, (0, h - edge_size), (w, h), (0, 255, 0), 3)
        if obstruction_info["left"]["obstructed"]:
            cv2.rectangle(annotated, (0, 0), (edge_size, h), (0, 255, 0), 3)
        if obstruction_info["right"]["obstructed"]:
            cv2.rectangle(annotated, (w - edge_size, 0), (w, h), (0, 255, 0), 3)

        return has_obstruction, total_obstruction, annotated, obstruction_info

    # ── partial-person detection (uses pre-run YOLO boxes) ────────────────────

    def detect_partial_persons(self, frame: np.ndarray, person_boxes):
        """Classify already-detected person boxes as partial/full."""
        h, w = frame.shape[:2]
        margin = int(min(h, w) * 0.05)

        partial_persons = []
        full_persons    = []

        for box in person_boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])

            at_left   = x1 <= margin
            at_right  = x2 >= (w - margin)
            at_top    = y1 <= margin
            at_bottom = y2 >= (h - margin)

            if at_left or at_right or at_top or at_bottom:
                partial_persons.append({"box": (x1, y1, x2, y2), "conf": conf})
            else:
                full_persons.append({"box": (x1, y1, x2, y2), "conf": conf})

        annotated = frame.copy()
        for p in partial_persons:
            x1, y1, x2, y2 = p["box"]
            pw = int((x2 - x1) * 0.1)
            ph = int((y2 - y1) * 0.1)
            cv2.rectangle(
                annotated,
                (max(0, x1 - pw), max(0, y1 - ph)),
                (min(w, x2 + pw), min(h, y2 + ph)),
                (0, 255, 0), 3,
            )

        total   = len(person_boxes)
        partial = len(partial_persons)
        color   = (0, 0, 255) if partial else (0, 255, 0)
        cv2.putText(
            annotated, f"Partial: {partial}/{total}",
            (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
        )

        return partial > 0, partial, total, annotated

    # ── movement detection ────────────────────────────────────────────────────

    def detect_no_movement(self, frame: np.ndarray):
        """Frame-diff movement detector (inside-lab cameras only)."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if self.previous_frame_gray is None:
            self.previous_frame_gray = gray
            return False, 0, frame

        diff = cv2.absdiff(self.previous_frame_gray, gray)
        _, thresh = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
        movement_pixels = int(np.count_nonzero(thresh))

        self.movement_history.append(movement_pixels)

        if movement_pixels > MIN_MOVEMENT_PIXELS:
            self.static_frame_count = 0
        else:
            self.static_frame_count += 1

        is_static  = self.static_frame_count >= STATIC_THRESHOLD
        avg_movement = float(np.mean(self.movement_history)) if self.movement_history else 0.0

        annotated = frame.copy()
        color = (0, 0, 255) if is_static else (0, 255, 0)
        cv2.putText(
            annotated,
            f"Movement: {movement_pixels} px (Avg: {avg_movement:.0f})",
            (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
        )
        if is_static:
            cv2.putText(
                annotated,
                f"WARNING: NO MOVEMENT ({self.static_frame_count} frames)",
                (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2,
            )

        self.previous_frame_gray = gray
        return is_static, movement_pixels, annotated

    # ── obstruction patterns ──────────────────────────────────────────────────

    def detect_obstruction_patterns(self, frame: np.ndarray):
        """Flag very dark, washed-out, or textureless frames."""
        gray        = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        total_px    = gray.size
        dark_ratio  = float(np.sum(gray < 30))  / total_px
        bright_ratio= float(np.sum(gray > 220)) / total_px
        is_uniform  = float(np.std(gray)) < 20

        types = []
        if dark_ratio   > 0.3: types.append("Dark/Covered")
        if bright_ratio > 0.3: types.append("Overexposed/Washed")
        if is_uniform:          types.append("Uniform/No-Texture")

        annotated = frame.copy()
        y = 150
        for t in types:
            cv2.putText(
                annotated, f"OBSTRUCTION: {t}",
                (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2,
            )
            y += 30

        return bool(types), types, annotated

    # ── combined analysis  (person_boxes come from the GPU worker) ─────────────

    def analyze_frame(self, frame: np.ndarray, person_boxes, is_inside_lab: bool = False):
        """Run all blind-spot checks and return (annotated_frame, issues_dict)."""
        issues = {}

        # 1. edge obstruction
        edge_obst, edge_pct, frame, edge_info = self.detect_edge_obstruction(frame)
        issues["edge_obstruction"] = {
            "detected": edge_obst, "percentage": edge_pct, "details": edge_info
        }
        if edge_obst:
            self.issue_counts["edge_obstruction"] += 1

        # 2. partial persons  (uses pre-run boxes — no second YOLO call)
        has_partial, partial_cnt, total_cnt, frame = self.detect_partial_persons(
            frame, person_boxes
        )
        issues["partial_persons"] = {
            "detected": has_partial, "partial_count": partial_cnt, "total_count": total_cnt
        }
        if has_partial:
            self.issue_counts["partial_persons"] += 1

        # 3. movement (inside-lab cameras only)
        if is_inside_lab:
            is_static, movement, frame = self.detect_no_movement(frame)
            issues["no_movement"] = {
                "detected": is_static,
                "movement_pixels": movement,
                "static_frames": self.static_frame_count,
            }
            if is_static:
                self.issue_counts["no_movement"] += 1

        # 4. obstruction patterns
        has_obst, obst_types, frame = self.detect_obstruction_patterns(frame)
        issues["obstruction_patterns"] = {"detected": has_obst, "types": obst_types}
        if has_obst:
            self.issue_counts["obstruction_detected"] += 1

        cv2.putText(
            frame,
            f"Camera: {self.camera_id}",
            (10, frame.shape[0] - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1,
        )
        return frame, issues

    # ── save helper ───────────────────────────────────────────────────────────

    def save_detection(self, frame: np.ndarray, issues: dict, save_folder: str = None) -> str | None:
        """Persist annotated frame if issues found and cooldown elapsed."""
        if save_folder is None:
            save_folder = BLIND_SPOT_SAVE_FOLDER
            
        now = time.time()
        if now - self.last_save_time < COOLDOWN_TIME:
            return None

        total_persons = issues.get("partial_persons", {}).get("total_count", 0)
        issue_tags = []
        if issues.get("edge_obstruction", {}).get("detected"):   issue_tags.append("edge_obst")
        if issues.get("partial_persons", {}).get("detected"):    issue_tags.append("partial")
        if issues.get("no_movement", {}).get("detected"):        issue_tags.append("static")
        if issues.get("obstruction_patterns", {}).get("detected"):issue_tags.append("obstructed")

        if not issue_tags:
            return None

        # Save obstruction-only blind spots even when no person is currently visible.
        if total_persons == 0 and not any(tag in issue_tags for tag in ("edge_obst", "static", "obstructed")):
            return None

        ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
        tag_str  = "_".join(issue_tags)
        
        if self.camera_id_pk:
            fname = f"blind_{self.camera_id_pk}_{self.ch_no}_{tag_str}_{ts}.jpg"
        else:
            fname = f"blind_ch{self.ch_no}_{tag_str}_{ts}.jpg"
            
        filepath = os.path.join(save_folder, fname)
        cv2.imwrite(filepath, frame)
        self.last_save_time = now
        logger.warning(
            f"[{self.camera_id}] Blind spot detected ({total_persons} persons) pk={self.camera_id_pk} — saved: {filepath}"
        )
        return filepath


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
            if scene and not any(target.lower() in scene.lower() for target in TARGET_SCENES):
                continue

            if link_type == "RTSP":
                ch_no = str(row.get("device_id") or "").strip() or "unknown"
                camera_id = ch_no
            else:
                ch_no = str(row.get("ch_code") or "").strip() or "unknown"
                cam_name = str(row.get("camera_name") or "camera").strip()
                camera_id = f"{cam_name}_{ch_no}".replace("/", "_").replace(" ", "_")

            if not camera_id:
                continue

            is_inside_lab = "lab" in scene.lower() or "inside" in str(row.get("camera_name") or "").lower()

            configs.append({
                "url": url,
                "camera_id": camera_id,
                "ch_no": ch_no,
                "scene_classification": scene,
                "is_inside_lab": is_inside_lab,
                "camera_name": str(row.get("camera_name") or ""),
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
    Drain gpu_queue in batches.  For each batch:
      1. Run a single batched YOLO forward pass to get person boxes.
      2. Dispatch per-camera CV analysis (BlindSpotDetector.analyze_frame).
    3. Save detections.
    """
    logger.info("GPU worker started (batch blind-spot mode)")

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

        logger.debug(f"[GPU] batch size: {len(batch)}")

        frames = [item["frame"] for item in batch]

        # ── batched YOLO inference ────────────────────────────────────────────
        try:
            results = model(frames, conf=CONFIDENCE_THRESHOLD, verbose=False)
        except Exception as exc:
            logger.error(f"[GPU] YOLO batch error: {exc}")
            continue

        # ── per-frame processing ──────────────────────────────────────────────
        for item, result in zip(batch, results):
            camera_id     = item["camera_id"]
            frame         = item["frame"]
            is_inside_lab = item["is_inside_lab"]
            detector: BlindSpotDetector = item["detector"]
            cfg           = item["cfg"]

            # extract person boxes (class 0)
            person_boxes = [b for b in result.boxes if int(b.cls[0]) == 0]

            # full blind-spot analysis (CPU, uses pre-run boxes)
            annotated, issues = detector.analyze_frame(frame, person_boxes, is_inside_lab)

            # rate-limiter check
            should_save, _, _ = rate_limiter.should_save_detection(camera_id)
            if should_save:
                saved = detector.save_detection(annotated, issues)
                if saved:
                    logger.info(f"[{camera_id}] Saved: {saved}")

        # GPU memory report
        if torch.cuda.is_available():
            mem = torch.cuda.memory_allocated() / 1e9
            logger.debug(f"[GPU] {mem:.2f} GB allocated")


def _ensure_shared_hls_gpu_worker():
    """Start one shared GPU worker for pipeline-driven persistent mode."""
    global _HLS_GPU_WORKER
    with _HLS_GPU_LOCK:
        if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
            _HLS_GPU_WORKER = threading.Thread(
                target=gpu_worker,
                args=(None, _STOP_EVENT),
                daemon=True,
                name="blind_spot_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()
            logger.info("[BlindSpotWorker] Shared GPU worker started")


# ══════════════════════════════════════════════════════════════════════════════
#  Camera feeder thread  — opens HLS, pushes frames to gpu_queue
# ══════════════════════════════════════════════════════════════════════════════

def camera_thread(cfg: dict, stop_event: threading.Event):
    camera_id = cfg.get("camera_id") or "unknown_camera"
    scene_classification = str(cfg.get("scene_classification") or cfg.get("classification") or "")
    camera_location = str(cfg.get("camera_location") or cfg.get("camera_name") or "")
    is_inside_lab = bool(cfg.get("is_inside_lab", ("lab" in scene_classification.lower() or "inside" in camera_location.lower())))

    initial_url = cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url") or ""
    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url or not test_hls_stream(hls_url):
        logger.error(f"[{camera_id}] Failed to open stream — skipping.")
        return

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] cap.isOpened() == False — skipping.")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    logger.info(f"[{camera_id}] Stream open @ {fps:.1f} FPS (inside_lab={is_inside_lab})")

    # one detector per camera (holds movement history, issue counts, etc.)
    detector   = BlindSpotDetector(camera_id, ch_no=cfg.get("ch_no", "unknown"))
    frame_count = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[{camera_id}] Stream ended / read failed.")
            break

        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            gpu_queue.put_nowait({
                "frame":         frame,
                "camera_id":     camera_id,
                "is_inside_lab": is_inside_lab,
                "detector":      detector,   # stateful; only this thread writes to it
                "cfg":           cfg,
            })
        except queue.Full:
            pass  # drop frame if queue is backed up

    cap.release()
    logger.info(
        f"[{camera_id}] Finished. "
        f"edge={detector.issue_counts['edge_obstruction']} "
        f"partial={detector.issue_counts['partial_persons']} "
        f"static={detector.issue_counts['no_movement']} "
        f"obstructed={detector.issue_counts['obstruction_detected']}"
    )


# ══════════════════════════════════════════════════════════════════════════════
#  RTSP WORKER  — Queue-based execution
# ══════════════════════════════════════════════════════════════════════════════
_rtsp_detectors = {}
_rtsp_lock = threading.Lock()

def blind_spot_worker(frame_queue):
    logger.info("🟢 [BlindSpotWorker] RTSP worker started")
    model = get_yolo_model()

    while True:
        data = frame_queue.get()
        if data is None:
            logger.info("🔴 [BlindSpotWorker] RTSP worker stopping")
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

        key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
        log_key = f"{device_id}_{camera_no}"

        with _rtsp_lock:
            if key not in _rtsp_detectors:
                _rtsp_detectors[key] = BlindSpotDetector(
                    camera_id=log_key, 
                    ch_no=camera_no,
                    camera_id_pk=camera_id_pk
                )
            detector = _rtsp_detectors[key]

        try:
            results = model(frame, conf=CONFIDENCE_THRESHOLD, verbose=False)[0]
            person_boxes = [b for b in results.boxes if int(b.cls[0]) == 0]

            # True for is_inside_lab because RTSP streams are primarily lab cameras, 
            # or could be extracted from a DB check in reality. Defaults to True for safety checks.
            annotated, issues = detector.analyze_frame(frame.copy(), person_boxes, is_inside_lab=True)
            
            should_save, _, _ = rate_limiter.should_save_detection(key)
            if should_save:
                saved = detector.save_detection(annotated, issues, save_folder=RTSP_SAVE_FOLDER)
                if saved:
                    logger.info(f"[BlindSpotWorker] Saved RTSP: {saved}")
        except Exception as e:
            logger.error(f"[BlindSpotWorker] RTSP Error for {log_key}: {e}")

def blind_spot_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entrypoint used by master_pipeline.
    Accepts one camera config dict or a list of config dicts.
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
        logger.warning("[BlindSpotWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    camera_configs = filtered_configs

    if persistent_mode:
        _ensure_shared_hls_gpu_worker()
    else:
        gpu_t = threading.Thread(
            target=gpu_worker,
            args=(None, stop_event),
            daemon=True,
            name="blind_spot_gpu_worker",
        )
        gpu_t.start()

    threads = []
    for cfg in camera_configs:
        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"blind_spot_{cfg.get('camera_id', 'cam')}",
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(f"[BlindSpotWorker][HLS] Started {len(threads)} camera threads")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[BlindSpotWorker][HLS] Camera threads completed (shared GPU worker still running)")
        return

    stop_event.set()
    logger.info("[BlindSpotWorker][HLS] All cameras completed")


# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    logger.info("=== TCS Blind Spot Detection System (batch-GPU architecture) ===")

    if not YOLO_AVAILABLE:
        logger.error(
            "YOLO is not available. Install with: pip install ultralytics"
        )
        return

    camera_configs, _ = load_camera_config()
    if not camera_configs:
        logger.warning("No cameras found — exiting.")
        return

    stop_event = threading.Event()

    # start the single GPU worker
    gpu_t = threading.Thread(
        target=gpu_worker, args=(None, stop_event), daemon=True, name="gpu_worker"
    )
    gpu_t.start()

    # start per-camera feeder threads
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
        time.sleep(THREAD_DELAY)   # stagger stream opens

    try:
        for t in cam_threads:
            t.join()
    except KeyboardInterrupt:
        logger.info("Interrupted — stopping…")
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()


if __name__ == "__main__":
    main()