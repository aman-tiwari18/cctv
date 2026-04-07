"""
Invigilator Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - invigilator_worker.py       (RTSP / DSS flow)
  - invigilator_tracking_tcs.py (HLS / TCS flow)
"""

import os
import time
import cv2
import logging
import threading
import signal
import numpy as np
from collections import deque, OrderedDict
from datetime import datetime

from ultralytics import YOLO

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

# ================= CONFIG ==================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# RTSP saves go here (same structure as original invigilator_worker)
RTSP_BASE_DIR = os.path.join(PROJECT_ROOT, "results/invigilator_detection")
# HLS saves go here
HLS_BASE_DIR  = os.path.join(PROJECT_ROOT, "results/tcs_detections/invigilator_detection")

for d in [RTSP_BASE_DIR, HLS_BASE_DIR]:
    os.makedirs(d, exist_ok=True)

DETECTION_THRESHOLD     = 0.5
MIN_HEIGHT              = 250
STATIC_DISTANCE_THRESHOLD = 35
STATIC_TIME_THRESHOLD   = 600   # 10 min — person considered static
NO_TARGET_TIME_THRESHOLD = 20   # 20 sec — no person in frame
ANNOTATED_SAVE_INTERVAL  = 10   # sec between annotated saves
COOLDOWN_PERIOD          = 600  # sec between no-target alerts

HLS_SAMPLE_EVERY = 2
HLS_FAIL_LIMIT   = 3

# ================= SHARED STATE ============
trackers          = {}   # camera_id → SimplifiedTracker
invigilator_stats = {}   # camera_id → {static_alerts, total_tracked}
_state_lock       = threading.Lock()

# ================= YOLO ====================
logger.info("🔄 [InvigilatorWorker] Loading YOLO model...")
try:
    yolo_model = YOLO(MODEL_PATH)
    logger.info("✅ [InvigilatorWorker] YOLO model loaded")
except Exception as e:
    logger.error(f"❌ [InvigilatorWorker] Failed to load YOLO model: {e}")
    yolo_model = None


# =====================================================
# 🔧 TRACKER CLASSES  (from invigilator_tracking.py)
# =====================================================
class Track:
    def __init__(self, track_id, bbox):
        self.track_id   = track_id
        self.bbox       = bbox

    def update_bbox(self, bbox):
        self.bbox = bbox


class Tracker:
    def __init__(self):
        self.tracks         = []
        self.track_id_count = 0

    def iou(self, b1, b2):
        x1 = max(b1[0], b2[0]); y1 = max(b1[1], b2[1])
        x2 = min(b1[2], b2[2]); y2 = min(b1[3], b2[3])
        if x2 < x1 or y2 < y1:
            return 0.0
        inter = (x2 - x1) * (y2 - y1)
        a1    = (b1[2] - b1[0]) * (b1[3] - b1[1])
        a2    = (b2[2] - b2[0]) * (b2[3] - b2[1])
        union = a1 + a2 - inter
        return inter / union if union > 0 else 0.0

    def update(self, frame, detections, min_height):
        filtered = [d for d in detections if d[5] >= min_height]

        if not self.tracks:
            for det in filtered:
                self._add(det[:4])
            return

        if not filtered:
            self.tracks = []
            return

        iou_matrix = np.zeros((len(self.tracks), len(filtered)))
        for i, track in enumerate(self.tracks):
            for j, det in enumerate(filtered):
                iou_matrix[i, j] = self.iou(track.bbox, det[:4])

        matched_t = set(); matched_d = set()
        while True:
            if iou_matrix.max() < 0.3:
                break
            i, j = np.unravel_index(iou_matrix.argmax(), iou_matrix.shape)
            matched_t.add(i); matched_d.add(j)
            self.tracks[i].update_bbox(filtered[j][:4])
            iou_matrix[i, :] = 0; iou_matrix[:, j] = 0

        for j in range(len(filtered)):
            if j not in matched_d:
                self._add(filtered[j][:4])

        self.tracks = [t for i, t in enumerate(self.tracks) if i in matched_t]

    def _add(self, bbox):
        self.tracks.append(Track(self.track_id_count, bbox))
        self.track_id_count += 1


class SimplifiedTracker(Tracker):
    """
    Per-camera tracker — handles static detection, no-target detection,
    and saving annotated frames.  Identical logic to invigilator_tracking.py.
    """
    def __init__(self, stream_id, cam_name, base_dir,
                 static_threshold=35, history_length=10):
        super().__init__()
        self.stream_id      = stream_id
        self.cam_name       = cam_name
        self.position_history      = {}
        self.static_status         = {}
        self.visibility_status     = {}
        self.static_threshold      = static_threshold
        self.history_length        = history_length
        self.invisible_notifications = OrderedDict()
        self.notification_duration = 3.0
        self.static_start_times    = {}
        self.static_events_saved   = set()

        self.base_dir      = os.path.join(base_dir, cam_name)
        self.static_dir    = os.path.join(self.base_dir, "static_person")
        self.invisible_dir = os.path.join(self.base_dir, "no_targets")
        self.annotated_dir = os.path.join(self.base_dir, "annotated")
        for d in [self.static_dir, self.invisible_dir, self.annotated_dir]:
            os.makedirs(d, exist_ok=True)

        self.last_invisible_save_time  = 0
        self.last_static_save_times    = {}
        self.last_annotated_time       = 0
        self.no_target_start_time      = None
        self.cooldown_period           = COOLDOWN_PERIOD
        self.static_threshold_time     = STATIC_TIME_THRESHOLD
        self.invisible_threshold_time  = NO_TARGET_TIME_THRESHOLD

    # ── helpers ────────────────────────────────────────────
    def save_frame(self, frame, directory, prefix, annotated=False):
        if frame is None:
            raise ValueError("Frame is None")
        os.makedirs(directory, exist_ok=True)
        ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
        sfx = "_annotated" if annotated else ""
        
        # Standard format for RTSP: invigilator_{device_id}_{camera_no}_{ts}.jpg
        # self.cam_name is set to {device_id}_{camera_no} in RTSP flow
        path = os.path.join(directory, f"invigilator_{self.cam_name}_{ts}{sfx}.jpg")
        success = cv2.imwrite(path, frame)
        if not success:
            raise Exception(f"cv2.imwrite failed for {path}")
        logger.info(f"[InvigilatorWorker] 💾 Saved → {path}")
        return path

    def mark_visible(self, track_id):
        self.visibility_status[track_id] = True

    def mark_invisible(self, track_id):
        if track_id in self.visibility_status:
            self.visibility_status[track_id] = False

    def is_static(self, track_id):
        return self.static_status.get(track_id, False)

    def update_track_status(self, track_id, bbox):
        center = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
        if track_id not in self.position_history:
            self.position_history[track_id] = deque(maxlen=self.history_length)
        self.position_history[track_id].append(center)

        if len(self.position_history[track_id]) >= self.history_length:
            pos  = list(self.position_history[track_id])
            moves = [np.linalg.norm(np.subtract(pos[i], pos[i-1]))
                     for i in range(1, len(pos))]
            is_static = max(moves) < self.static_threshold
            was_static = self.static_status.get(track_id, False)

            if is_static and not was_static:
                self.static_start_times[track_id] = time.time()
            elif not is_static and was_static:
                self.static_start_times.pop(track_id, None)

            self.static_status[track_id] = is_static

    def check_and_save_static_frames(self, display_frame, original_frame, track_id):
        if not self.is_static(track_id):
            return
        now        = time.time()
        static_dur = now - self.static_start_times.get(track_id, now)
        event_id   = f"{track_id}_{int(self.static_start_times.get(track_id, 0))}"

        logger.debug(f"[InvigilatorWorker] Track {track_id} static for {static_dur:.1f}s → {self.cam_name}")

        if static_dur >= self.static_threshold_time and event_id not in self.static_events_saved:
            try:
                orig_path = self.save_frame(original_frame, self.static_dir, f"static_person_{track_id}")
                ann_path  = self.save_frame(display_frame,  self.annotated_dir, f"static_person_{track_id}", annotated=True)
                self.static_events_saved.add(event_id)
                self._log_event("static_person", track_id, orig_path, ann_path)
                logger.warning(f"[InvigilatorWorker] 🧍 Static person! Camera={self.cam_name} Track={track_id} Duration={static_dur:.0f}s")
            except Exception as e:
                logger.error(f"[InvigilatorWorker] Error saving static frame: {e}")

    def check_and_save_invisible_frames(self, frame):
        now = time.time()
        if not self.visibility_status:
            if self.no_target_start_time is None:
                self.no_target_start_time = now
        else:
            self.no_target_start_time = None

        if self.no_target_start_time is not None:
            dur = now - self.no_target_start_time
            if (dur >= self.invisible_threshold_time and
                    now - self.last_invisible_save_time >= self.cooldown_period):
                try:
                    path = self.save_frame(frame, self.invisible_dir, "no_targets")
                    self.last_invisible_save_time = now
                    self._log_event("no_targets", None, path, None)
                    logger.warning(f"[InvigilatorWorker] 🚫 No target! Camera={self.cam_name} Duration={dur:.0f}s")
                except Exception as e:
                    logger.error(f"[InvigilatorWorker] Error saving no-target frame: {e}")

    def check_and_save_annotated(self, frame):
        now = time.time()
        if now - self.last_annotated_time >= ANNOTATED_SAVE_INTERVAL:
            self.last_annotated_time = now
            try:
                self.save_frame(frame, self.annotated_dir, "annotated", annotated=True)
            except Exception as e:
                logger.error(f"[InvigilatorWorker] Error saving annotated frame: {e}")

    def _log_event(self, event_type, track_id, original_path, annotated_path):
        """Log event to events.json for audit trail."""
        import json as _json
        log_entry = {
            "timestamp":      datetime.now().isoformat(),
            "camera_name":    self.cam_name,
            "event_type":     event_type,
            "track_id":       track_id,
            "original_frame": original_path,
            "annotated_frame": annotated_path,
        }
        log_file = os.path.join(self.base_dir, "events.json")
        try:
            logs = []
            if os.path.exists(log_file):
                with open(log_file, "r") as f:
                    logs = _json.load(f)
            logs.append(log_entry)
            with open(log_file, "w") as f:
                _json.dump(logs, f, indent=4)
        except Exception as e:
            logger.error(f"[InvigilatorWorker] Error writing events.json: {e}")

    def draw_notifications(self, frame):
        now        = time.time()
        y_pos      = 30
        font       = cv2.FONT_HERSHEY_SIMPLEX
        expired    = [tid for tid, ts in self.invisible_notifications.items()
                      if now - ts > self.notification_duration]
        for tid in expired:
            self.invisible_notifications.pop(tid)
        for tid in self.invisible_notifications:
            cv2.putText(frame, f"Track {tid} lost", (10, y_pos), font, 0.7, (0, 0, 255), 2)
            y_pos += 30


# =====================================================
# 🔍 CORE TRACKING  (shared by RTSP + HLS paths)
# =====================================================
def _get_tracker(camera_id: str, base_dir: str) -> SimplifiedTracker:
    with _state_lock:
        if camera_id not in trackers:
            trackers[camera_id] = SimplifiedTracker(
                stream_id=camera_id,
                cam_name=camera_id,
                base_dir=base_dir,
                static_threshold=STATIC_DISTANCE_THRESHOLD,
                history_length=10,
            )
            invigilator_stats[camera_id] = {'static_alerts': 0, 'total_tracked': 0}
    return trackers[camera_id]


def track_invigilator(frame, device_id: str, camera_no: str, base_dir: str, camera_id_pk: str = ""):
    """
    Run YOLO, update tracker, save static/no-target/annotated frames.
    camera_id_pk is the DB primary key, used for unique file naming.

    Returns:
        (static_detected: bool, person_count: int)
    """
    # RTSP: cam_key should be device_id_camera_no
    cam_key = f"{device_id}_{camera_no}" if camera_no else device_id
    tracker = _get_tracker(cam_key, base_dir)

    results      = yolo_model(frame, conf=DETECTION_THRESHOLD, verbose=False)
    display      = frame.copy()
    visible_ids  = set()
    det_count    = 0

    for result in results:
        detections = []
        for r in result.boxes.data.tolist():
            x1, y1, x2, y2, score, class_id = r
            x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
            if int(class_id) == 0 and score >= DETECTION_THRESHOLD:
                h = y2 - y1
                if h >= MIN_HEIGHT:
                    detections.append([x1, y1, x2, y2, score, h])
                    det_count += 1

        tracker.update(display, detections, MIN_HEIGHT)

        for track in tracker.tracks:
            tid   = track.track_id
            visible_ids.add(tid)
            tracker.mark_visible(tid)
            tracker.update_track_status(tid, track.bbox)
            tracker.check_and_save_static_frames(display, frame, tid)

            x1, y1, x2, y2 = map(int, track.bbox)
            color = (0, 0, 255) if tracker.is_static(tid) else (0, 255, 0)
            cv2.rectangle(display, (x1, y1), (x2, y2), color, 2)
            cv2.putText(display, f"ID {tid}", (x1, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # Mark invisible tracks
    for tid in set(tracker.visibility_status.keys()) - visible_ids:
        tracker.mark_invisible(tid)

    tracker.check_and_save_invisible_frames(display)
    tracker.draw_notifications(display)

    if visible_ids:
        tracker.check_and_save_annotated(display)

    static_detected = any(tracker.is_static(tid) for tid in visible_ids)

    with _state_lock:
        invigilator_stats[cam_key]['total_tracked']  = det_count
        invigilator_stats[cam_key]['static_alerts']  = len(tracker.static_events_saved)

    return static_detected, det_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def invigilator_worker(frame_queue):
    """
    Queue-based worker — receives (frame, device_id, camera_no)
    packets from the RTSP producer.
    """
    logger.info("🟢 [InvigilatorWorker] RTSP worker started")

    while True:
        data = frame_queue.get()
        if data is None:
            logger.info("🔴 [InvigilatorWorker] RTSP worker stopping")
            break

        # Unpack: (frame, device_id, camera_no) or (frame, device_id, camera_no, camera_id_pk)
        if len(data) == 4:
            frame, device_id, camera_no, camera_id_pk = data
        else:
            frame, device_id, camera_no = data
            camera_id_pk = ""

        track_invigilator(
            frame.copy(),
            str(device_id),
            str(camera_no),
            base_dir=RTSP_BASE_DIR,
            camera_id_pk=str(camera_id_pk)
        )


# =====================================================
# 📡  HLS PATH  — GPU Batch Queue + Motion Filter
# =====================================================
#
# Architecture (from invigilator_tracking_tcs.py):
#   - Camera threads read HLS + motion filter (CPU only)
#   - Push frames to GPU queue
#   - Single GPU batch worker runs YOLO on batches
#   - Callback sends detections back to camera thread
#   - Camera thread runs inv_core.SimplifiedTracker for tracking + save
#   - Samples every 2 frames, staggered starts (200ms)
# =====================================================

import sys
import gc
import queue

_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from scripts.detection import invigilator_tracking as inv_core
from motion_detector import get_motion_detector
from tcs_scheduler import frame_should_process, get_sample_every

# ── GPU Queue Config ─────────────────────────────────
GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "1024"))
THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
INV_SAMPLE_EVERY   = get_sample_every("TCS_INVIGILATOR_SAMPLE_EVERY", 2)

_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)


# Tracker registry for HLS cameras
_hls_trackers = {}
_hls_inv_stats = {}


def _get_hls_tracker(camera_id, results_dir):
    """Get or create SimplifiedTracker for HLS camera."""
    if camera_id not in _hls_trackers:
        _hls_trackers[camera_id] = inv_core.SimplifiedTracker(
            cam_name=camera_id,
            base_dir=results_dir,
        )
        _hls_inv_stats[camera_id] = {'static_alerts': 0, 'total_tracked': 0}
    return _hls_trackers[camera_id]


def _hls_gpu_batch_worker(stop_event):
    """
    GPU batch worker — single thread, owns GPU.
    Runs YOLO on batches via inv_core.
    """
    logger.info(f"🚀 [InvigilatorWorker][HLS] GPU worker started (batch={GPU_BATCH_SIZE})")

    model = yolo_model  # reuse the already-loaded model

    while not stop_event.is_set():
        batch = []

        try:
            batch.append(_gpu_queue.get(timeout=0.2))
        except queue.Empty:
            continue

        while len(batch) < GPU_BATCH_SIZE:
            try:
                batch.append(_gpu_queue.get_nowait())
            except queue.Empty:
                break

        if batch:
            try:
                inv_core.detect_invigilators_batch(
                    batch, 
                    model=model, 
                    conf_threshold=DETECTION_THRESHOLD, 
                    min_height=MIN_HEIGHT
                )
            except Exception as e:
                logger.error(f"❌ [InvigilatorWorker] GPU batch processing error: {e}")
                # Continue processing despite error
                for item in batch:
                    if 'callback' in item and callable(item['callback']):
                        try:
                            # Return empty detections on error
                            item['callback']([], item['frame'])
                        except Exception as cb_err:
                            logger.error(f"❌ [InvigilatorWorker] Callback error: {cb_err}")

    logger.info("🔴 [InvigilatorWorker][HLS] GPU worker stopped")



def _hls_camera_thread(cfg, stop_event, results_dir):
    """
    Camera reader thread — opens HLS, reads frames, motion filters,
    pushes to GPU queue. Callback runs tracking + save.
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

    camera_id   = cfg['camera_id']
    initial_url = cfg.get('cctv_url') or cfg.get('initial_url') or cfg.get('stream_url', '')

    cap = None
    motion_detector = get_motion_detector(camera_id, motion_threshold=800)

    # Callback — GPU worker calls this with YOLO detections
    # def on_result(detections, frame):
    #     tracker = _get_hls_tracker(camera_id, results_dir)

    #     display_frame = frame.copy()
    #     current_visible_ids = set()

    #     tracker.update(detections, MIN_HEIGHT)

    #     for track in tracker.tracks:
    #         track_id = track.track_id
    #         current_visible_ids.add(track_id)

    #     _hls_inv_stats[camera_id]['total_tracked'] = len(detections)

    def on_result(detections, frame):
        tracker = _get_hls_tracker(camera_id, results_dir)
        display_frame = frame.copy()
        visible_ids = set()

        # tracker.update expects (frame, detections, min_height)
        tracker.update(display_frame, detections, MIN_HEIGHT)

        for track in tracker.tracks:
            tid = track.track_id
            visible_ids.add(tid)
            tracker.mark_visible(tid)
            tracker.update_track_status(tid, track.bbox)
            tracker.check_and_save_static_frames(display_frame, frame, tid)

            # Draw boxes
            x1, y1, x2, y2 = map(int, track.bbox)
            color = (0, 0, 255) if tracker.is_static(tid) else (0, 255, 0)
            cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(display_frame, f"ID {tid}", (x1, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        # Mark disappeared tracks as invisible
        for tid in set(tracker.visibility_status.keys()) - visible_ids:
            tracker.mark_invisible(tid)

        tracker.check_and_save_invisible_frames(display_frame)

        if visible_ids:
            tracker.check_and_save_annotated(display_frame)

        _hls_inv_stats[camera_id]['total_tracked'] = len(detections)
        _hls_inv_stats[camera_id]['static_alerts'] = len(tracker.static_events_saved)

    try:
        hls_url = extract_hls_streaming_url(initial_url)
        if not hls_url or not test_hls_stream(hls_url):
            return

        cap = open_hls_stream(hls_url)
        if not cap:
            return

        logger.info(f"[InvigilatorWorker][HLS] 🟢 Camera thread started → {camera_id}")

        frame_count = 0

        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            if not frame_should_process(frame_count, INV_SAMPLE_EVERY):
                continue

            if not motion_detector.has_motion(frame):
                continue

            try:
                _gpu_queue.put_nowait({
                    'frame':     frame,
                    'camera_id': camera_id,
                    'result_cb': on_result,
                })
            except queue.Full:
                continue

    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")
    finally:
        if cap:
            cap.release()
        gc.collect()

    logger.info(f"[InvigilatorWorker][HLS] 🔴 Camera thread stopped → {camera_id}")


def invigilator_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point — GPU batch queue + motion filter architecture.

    Accepts a LIST of camera configs (from camera_loader) and runs
    all cameras with a shared GPU worker thread.

    Can also accept a single dict for backward compatibility.
    """
    import torch

    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT

    # ── Scene Classification Filter ──────────────────────
    valid_configs = []
    for cfg in camera_configs:
        cls_val = str(cfg.get('classification', '')).lower()
        if 'computer lab' in cls_val:
            valid_configs.append(cfg)
        else:
            logger.info(f"[InvigilatorWorker] 🚫 Skipping {cfg.get('camera_id', 'unknown')} (Scene: {cls_val})")
            
    if not valid_configs:
        logger.warning("[InvigilatorWorker][HLS] ❌ No valid cameras found after Scene Classification filter. Exiting.")
        return
        
    camera_configs = valid_configs
    results_dir = HLS_BASE_DIR


    # Start GPU batch worker FIRST
    gpu_t = threading.Thread(
        target=_hls_gpu_batch_worker,
        args=(stop_event,),
        name="Invigilator-GPU-worker",
        daemon=True
    )
    gpu_t.start()

    # Start camera threads with staggered delay
    threads = []
    total = len(camera_configs)
    for i, cfg in enumerate(camera_configs):
        t = threading.Thread(
            target=_hls_camera_thread,
            args=(cfg, stop_event, results_dir),
            name=f"Inv-{cfg.get('camera_id', i)}",
            daemon=True
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_START_DELAY)

        if (i + 1) % 100 == 0:
            logger.info(f"  {i + 1}/{total} invigilator camera threads started...")

    logger.info(f"[InvigilatorWorker][HLS] All {total} cameras started + 1 GPU worker")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("[InvigilatorWorker][HLS] ✅ All cameras completed")


