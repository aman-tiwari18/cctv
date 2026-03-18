# import os
# import time
# import cv2
# import logging
# import numpy as np
# from collections import deque
# from datetime import datetime
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO,
#                     format="%(asctime)s - %(levelname)s - %(message)s")

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# BASE_DIR = os.path.join(PROJECT_ROOT, "results/invigilator_tracking")

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# STATIC_DISTANCE_THRESHOLD = 35      # pixels
# STATIC_TIME_THRESHOLD = 600         # seconds (10 min)
# NO_TARGET_TIME_THRESHOLD = 20       # seconds
# ANNOTATED_SAVE_INTERVAL = 10        # seconds
# MIN_HEIGHT = 250                    # ignore small persons

# # ================= DIRECTORIES =================
# STATIC_DIR = os.path.join(BASE_DIR, "static_person")
# NO_TARGET_DIR = os.path.join(BASE_DIR, "no_targets")
# ANNOTATED_DIR = os.path.join(BASE_DIR, "annotated")

# os.makedirs(STATIC_DIR, exist_ok=True)
# os.makedirs(NO_TARGET_DIR, exist_ok=True)
# os.makedirs(ANNOTATED_DIR, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [InvigilatorWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# # ================= TRACKER =================
# class Track:
#     def __init__(self, track_id, bbox):
#         self.id = track_id
#         self.bbox = bbox
#         self.history = deque(maxlen=10)
#         self.static_since = None

#     def center(self):
#         x1, y1, x2, y2 = self.bbox
#         return ((x1 + x2) / 2, (y1 + y2) / 2)


# class SimpleTracker:
#     def __init__(self):
#         self.tracks = {}
#         self.next_id = 0

#     def iou(self, b1, b2):
#         x1 = max(b1[0], b2[0])
#         y1 = max(b1[1], b2[1])
#         x2 = min(b1[2], b2[2])
#         y2 = min(b1[3], b2[3])
#         if x2 < x1 or y2 < y1:
#             return 0.0
#         inter = (x2 - x1) * (y2 - y1)
#         a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
#         a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
#         return inter / (a1 + a2 - inter)

#     def update(self, detections):
#         updated = set()

#         for tid, track in list(self.tracks.items()):
#             best_iou = 0
#             best_det = None
#             for det in detections:
#                 i = self.iou(track.bbox, det)
#                 if i > best_iou:
#                     best_iou = i
#                     best_det = det
#             if best_iou > 0.3:
#                 track.bbox = best_det
#                 updated.add(tid)

#         for det in detections:
#             if not any(self.iou(det, t.bbox) > 0.3 for t in self.tracks.values()):
#                 self.tracks[self.next_id] = Track(self.next_id, det)
#                 updated.add(self.next_id)
#                 self.next_id += 1

#         self.tracks = {k: v for k, v in self.tracks.items() if k in updated}


# # ================= STATE =================
# tracker = SimpleTracker()
# last_no_target_time = None
# last_annotated_time = 0

# # =====================================================
# # INVIGILATOR FRAME PROCESSING
# # =====================================================
# def process_frame(frame):
#     global last_no_target_time, last_annotated_time

#     results = yolo_model(frame, conf=0.5, verbose=False)[0]

#     detections = []
#     for box in results.boxes:
#         if int(box.cls[0]) == 0:
#             x1, y1, x2, y2 = map(int, box.xyxy[0])
#             if (y2 - y1) >= MIN_HEIGHT:
#                 detections.append((x1, y1, x2, y2))

#     tracker.update(detections)

#     now = time.time()
#     annotated = frame.copy()
#     has_target = False

#     # ================= TRACK PROCESS =================
#     for track in tracker.tracks.values():
#         has_target = True
#         cx, cy = track.center()
#         track.history.append((cx, cy))

#         # draw bounding box
#         x1, y1, x2, y2 = map(int, track.bbox)
#         color = (0, 0, 255) if track.static_since else (0, 255, 0)
#         cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
#         cv2.putText(
#             annotated,
#             f"ID {track.id}",
#             (x1, y1 - 6),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.6,
#             color,
#             2
#         )

#         # check static
#         if len(track.history) == track.history.maxlen:
#             moves = [
#                 np.linalg.norm(np.subtract(track.history[i], track.history[i - 1]))
#                 for i in range(1, len(track.history))
#             ]
#             static = max(moves) < STATIC_DISTANCE_THRESHOLD

#             if static:
#                 if track.static_since is None:
#                     track.static_since = now
#                 elif now - track.static_since > STATIC_TIME_THRESHOLD:
#                     ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#                     path = f"{STATIC_DIR}/{DEVICE_ID}_{CAMERA_NO}_{ts}_static.jpg"
#                     cv2.imwrite(path, annotated)
#                     logging.warning(f"[Invigilator] 🧍 Static person saved: {path}")
#                     track.static_since = now
#             else:
#                 track.static_since = None

#     # ================= NO TARGET =================
#     if not has_target:
#         if last_no_target_time is None:
#             last_no_target_time = now
#         elif now - last_no_target_time > NO_TARGET_TIME_THRESHOLD:
#             ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = f"{NO_TARGET_DIR}/{DEVICE_ID}_{CAMERA_NO}_{ts}_no_target.jpg"
#             cv2.imwrite(path, frame)
#             logging.warning(f"[Invigilator] 🚫 No target saved: {path}")
#             last_no_target_time = now
#     else:
#         last_no_target_time = None

#     # ================= ANNOTATED SAVE =================
#     if has_target and (now - last_annotated_time) >= ANNOTATED_SAVE_INTERVAL:
#         last_annotated_time = now
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = f"{ANNOTATED_DIR}/{DEVICE_ID}_{CAMERA_NO}_{ts}_annotated.jpg"
#         cv2.imwrite(path, annotated)

# # =====================================================
# # WORKER LOOP
# # =====================================================
# def invigilator_worker(frame_queue):
#     logging.info("🟢 Invigilator Worker started")

#     while True:
#         frame = frame_queue.get()

#         if frame is None:
#             logging.info("🔴 Invigilator Worker stopping")
#             break

#         # IMPORTANT: work on a copy
#         frame = frame.copy()
#         process_frame(frame)
























#working before hls
#invigilator_worker.py
# import os
# import time
# import cv2
# import logging
# import numpy as np
# from collections import deque
# from datetime import datetime
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# BASE_DIR = os.path.join(PROJECT_ROOT, "results/invigilator_tracking")

# STATIC_DISTANCE_THRESHOLD = 35
# STATIC_TIME_THRESHOLD = 600
# NO_TARGET_TIME_THRESHOLD = 20
# ANNOTATED_SAVE_INTERVAL = 10
# MIN_HEIGHT = 250

# # ================= DIRECTORIES =================
# STATIC_DIR = os.path.join(BASE_DIR, "static_person")
# NO_TARGET_DIR = os.path.join(BASE_DIR, "no_targets")
# ANNOTATED_DIR = os.path.join(BASE_DIR, "annotated")

# os.makedirs(STATIC_DIR, exist_ok=True)
# os.makedirs(NO_TARGET_DIR, exist_ok=True)
# os.makedirs(ANNOTATED_DIR, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [InvigilatorWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# # ================= TRACKER =================
# class Track:
#     def __init__(self, track_id, bbox):
#         self.id = track_id
#         self.bbox = bbox
#         self.history = deque(maxlen=10)
#         self.static_since = None

#     def center(self):
#         x1, y1, x2, y2 = self.bbox
#         return ((x1 + x2) / 2, (y1 + y2) / 2)


# class SimpleTracker:
#     def __init__(self):
#         self.tracks = {}
#         self.next_id = 0

#     def iou(self, b1, b2):
#         x1 = max(b1[0], b2[0])
#         y1 = max(b1[1], b2[1])
#         x2 = min(b1[2], b2[2])
#         y2 = min(b1[3], b2[3])
#         if x2 < x1 or y2 < y1:
#             return 0.0
#         inter = (x2 - x1) * (y2 - y1)
#         a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
#         a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
#         return inter / (a1 + a2 - inter)

#     def update(self, detections):
#         updated = set()

#         for tid, track in list(self.tracks.items()):
#             best_iou = 0
#             best_det = None
#             for det in detections:
#                 i = self.iou(track.bbox, det)
#                 if i > best_iou:
#                     best_iou = i
#                     best_det = det
#             if best_iou > 0.3:
#                 track.bbox = best_det
#                 updated.add(tid)

#         for det in detections:
#             if not any(self.iou(det, t.bbox) > 0.3 for t in self.tracks.values()):
#                 self.tracks[self.next_id] = Track(self.next_id, det)
#                 updated.add(self.next_id)
#                 self.next_id += 1

#         self.tracks = {k: v for k, v in self.tracks.items() if k in updated}


# # ================= STATE =================
# tracker = SimpleTracker()
# last_no_target_time = None
# last_annotated_time = 0

# # =====================================================
# # FRAME PROCESSING (UPDATED)
# # =====================================================
# def process_frame(frame, device_id, camera_no):
#     global last_no_target_time, last_annotated_time

#     results = yolo_model(frame, conf=0.5, verbose=False)[0]

#     detections = []
#     for box in results.boxes:
#         if int(box.cls[0]) == 0:
#             x1, y1, x2, y2 = map(int, box.xyxy[0])
#             if (y2 - y1) >= MIN_HEIGHT:
#                 detections.append((x1, y1, x2, y2))

#     tracker.update(detections)

#     now = time.time()
#     annotated = frame.copy()
#     has_target = False

#     # ================= TRACK PROCESS =================
#     for track in tracker.tracks.values():
#         has_target = True
#         cx, cy = track.center()
#         track.history.append((cx, cy))

#         x1, y1, x2, y2 = map(int, track.bbox)
#         color = (0, 0, 255) if track.static_since else (0, 255, 0)

#         cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
#         cv2.putText(
#             annotated,
#             f"ID {track.id}",
#             (x1, y1 - 6),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.6,
#             color,
#             2
#         )

#         # ---------- static detection ----------
#         if len(track.history) == track.history.maxlen:
#             moves = [
#                 np.linalg.norm(np.subtract(track.history[i], track.history[i - 1]))
#                 for i in range(1, len(track.history))
#             ]

#             static = max(moves) < STATIC_DISTANCE_THRESHOLD

#             if static:
#                 if track.static_since is None:
#                     track.static_since = now
#                 elif now - track.static_since > STATIC_TIME_THRESHOLD:
#                     ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#                     path = f"{STATIC_DIR}/{device_id}_{camera_no}_{ts}_static.jpg"
#                     cv2.imwrite(path, annotated)
#                     logging.warning(f"[Invigilator] 🧍 Static person saved: {path}")
#                     track.static_since = now
#             else:
#                 track.static_since = None

#     # ================= NO TARGET =================
#     if not has_target:
#         if last_no_target_time is None:
#             last_no_target_time = now
#         elif now - last_no_target_time > NO_TARGET_TIME_THRESHOLD:
#             ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = f"{NO_TARGET_DIR}/{device_id}_{camera_no}_{ts}_no_target.jpg"
#             cv2.imwrite(path, frame)
#             logging.warning(f"[Invigilator] 🚫 No target saved: {path}")
#             last_no_target_time = now
#     else:
#         last_no_target_time = None

#     # ================= ANNOTATED SAVE =================
#     if has_target and (now - last_annotated_time) >= ANNOTATED_SAVE_INTERVAL:
#         last_annotated_time = now
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = f"{ANNOTATED_DIR}/{device_id}_{camera_no}_{ts}_annotated.jpg"
#         cv2.imwrite(path, annotated)


# # =====================================================
# # WORKER LOOP (UPDATED)
# # =====================================================
# def invigilator_worker(frame_queue):
#     logging.info("🟢 Invigilator Worker started")

#     while True:
#         data = frame_queue.get()

#         if data is None:
#             logging.info("🔴 Invigilator Worker stopping")
#             break

#         # 🔥 unpack metadata
#         frame, device_id, camera_no = data

#         frame = frame.copy()

#         process_frame(frame, device_id, camera_no)


























#test
# workers/invigilator_worker.py
# workers/invigilator_worker.py
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
RTSP_BASE_DIR = os.path.join(PROJECT_ROOT, "results/invigilator_tracking")
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
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [InvigilatorWorker] YOLO model loaded")


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
        path = os.path.join(directory, f"{self.cam_name}_{prefix}{sfx}_{ts}.jpg")
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


def track_invigilator(frame, device_id: str, camera_no: str, base_dir: str):
    """
    Run YOLO, update tracker, save static/no-target/annotated frames.

    Returns:
        (static_detected: bool, person_count: int)
    """
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

        frame, device_id, camera_no = data
        track_invigilator(
            frame.copy(),
            str(device_id),
            str(camera_no),
            base_dir=RTSP_BASE_DIR
        )


# =====================================================
# 📡  HLS PATH  — standalone, reads its own stream
# =====================================================
def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
    """Open HLS stream and run invigilator tracking until stopped."""
    from tcs_hls_utils import open_hls_stream

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[InvigilatorWorker][HLS] ❌ Could not open stream for {camera_id}")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0

    logger.info(f"[InvigilatorWorker][HLS] 🟢 Tracking started for {camera_id} @ {fps:.1f} FPS")

    frame_count = 0
    fail_count  = 0
    start_time  = time.time()
    label       = camera_name if camera_name else camera_id

    try:
        while not _STOP_EVENT.is_set():
            # Non-blocking read with 5s timeout
            read_result = [None, None]
            def _read():
                read_result[0], read_result[1] = cap.read()
            t = threading.Thread(target=_read, daemon=True)
            t.start()
            t.join(timeout=5)

            if _STOP_EVENT.is_set():
                break

            ret, frame = read_result
            if not ret or frame is None:
                fail_count += 1
                logger.warning(f"[InvigilatorWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
                if fail_count >= HLS_FAIL_LIMIT:
                    logger.error(f"[InvigilatorWorker][HLS] ❌ Max failures → {camera_id}")
                    break
                time.sleep(3)
                continue

            fail_count   = 0
            frame_count += 1

            if frame_count % HLS_SAMPLE_EVERY == 0:
                static_detected, person_count = track_invigilator(
                    frame.copy(),
                    device_id=label,
                    camera_no="",
                    base_dir=HLS_BASE_DIR
                )

                if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
                    if static_detected:
                        logger.warning(
                            f"[InvigilatorWorker][HLS] 🧍 Static invigilator → {camera_id}"
                        )
                    else:
                        logger.info(
                            f"[InvigilatorWorker][HLS] ✅ Tracking OK → {camera_id} ({person_count} people)"
                        )

            if max_frames and frame_count >= max_frames:
                break

    except KeyboardInterrupt:
        _STOP_EVENT.set()
        logger.info(f"[InvigilatorWorker][HLS] Interrupted → {camera_id}")
    except Exception as e:
        logger.error(f"[InvigilatorWorker][HLS] Error → {camera_id}: {e}")
    finally:
        cap.release()
        elapsed    = time.time() - start_time
        actual_fps = frame_count / elapsed if elapsed > 0 else 0
        logger.info(
            f"[InvigilatorWorker][HLS] 🔴 Stopped → {camera_id} | "
            f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
        )

    return True


def invigilator_worker_hls(camera_config: dict, max_frames=None):
    """
    HLS worker entry point — used by master_pipeline for HLS cameras.

    camera_config = {
        'camera_id':   str,
        'stream_url':  str,
        'camera_name': str,
    }
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

    camera_id   = camera_config.get("camera_id", "unknown")
    initial_url = camera_config.get("stream_url", "")
    camera_name = camera_config.get("camera_name", "")

    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url:
        logger.error(f"[InvigilatorWorker][HLS] ❌ Could not resolve URL for {camera_id}")
        return

    if not test_hls_stream(hls_url):
        logger.error(f"[InvigilatorWorker][HLS] ❌ Stream test failed for {camera_id}")
        return

    logger.info(f"[InvigilatorWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
    _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)























#code with logs
# workers/invigilator_worker.py
# """
# Invigilator Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - invigilator_worker.py       (RTSP / DSS flow)
#   - invigilator_tracking_tcs.py (HLS / TCS flow)
# """

# import os
# import time
# import cv2
# import logging
# import threading
# import signal
# import numpy as np
# from collections import deque, OrderedDict
# from datetime import datetime

# from ultralytics import YOLO

# # ================= GRACEFUL STOP FLAG =================
# _STOP_EVENT = threading.Event()

# def _handle_stop(sig, frame):
#     _STOP_EVENT.set()

# signal.signal(signal.SIGINT,  _handle_stop)
# signal.signal(signal.SIGTERM, _handle_stop)

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # RTSP saves go here (same structure as original invigilator_worker)
# RTSP_BASE_DIR = os.path.join(PROJECT_ROOT, "results/invigilator_tracking")
# # HLS saves go here
# HLS_BASE_DIR  = os.path.join(PROJECT_ROOT, "results/tcs_detections/invigilator_detection")

# for d in [RTSP_BASE_DIR, HLS_BASE_DIR]:
#     os.makedirs(d, exist_ok=True)

# DETECTION_THRESHOLD     = 0.5
# MIN_HEIGHT              = 250
# STATIC_DISTANCE_THRESHOLD = 35
# STATIC_TIME_THRESHOLD   = 600   # 10 min — person considered static
# NO_TARGET_TIME_THRESHOLD = 20   # 20 sec — no person in frame
# ANNOTATED_SAVE_INTERVAL  = 10   # sec between annotated saves
# COOLDOWN_PERIOD          = 600  # sec between no-target alerts

# HLS_SAMPLE_EVERY = 2
# HLS_FAIL_LIMIT   = 3

# # ================= SHARED STATE ============
# trackers          = {}   # camera_id → SimplifiedTracker
# invigilator_stats = {}   # camera_id → {static_alerts, total_tracked}
# _state_lock       = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [InvigilatorWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [InvigilatorWorker] YOLO model loaded")


# # =====================================================
# # 🔧 TRACKER CLASSES  (from invigilator_tracking.py)
# # =====================================================
# class Track:
#     def __init__(self, track_id, bbox):
#         self.track_id   = track_id
#         self.bbox       = bbox

#     def update_bbox(self, bbox):
#         self.bbox = bbox


# class Tracker:
#     def __init__(self):
#         self.tracks         = []
#         self.track_id_count = 0

#     def iou(self, b1, b2):
#         x1 = max(b1[0], b2[0]); y1 = max(b1[1], b2[1])
#         x2 = min(b1[2], b2[2]); y2 = min(b1[3], b2[3])
#         if x2 < x1 or y2 < y1:
#             return 0.0
#         inter = (x2 - x1) * (y2 - y1)
#         a1    = (b1[2] - b1[0]) * (b1[3] - b1[1])
#         a2    = (b2[2] - b2[0]) * (b2[3] - b2[1])
#         union = a1 + a2 - inter
#         return inter / union if union > 0 else 0.0

#     def update(self, frame, detections, min_height):
#         filtered = [d for d in detections if d[5] >= min_height]

#         if not self.tracks:
#             for det in filtered:
#                 self._add(det[:4])
#             return

#         if not filtered:
#             self.tracks = []
#             return

#         iou_matrix = np.zeros((len(self.tracks), len(filtered)))
#         for i, track in enumerate(self.tracks):
#             for j, det in enumerate(filtered):
#                 iou_matrix[i, j] = self.iou(track.bbox, det[:4])

#         matched_t = set(); matched_d = set()
#         while True:
#             if iou_matrix.max() < 0.3:
#                 break
#             i, j = np.unravel_index(iou_matrix.argmax(), iou_matrix.shape)
#             matched_t.add(i); matched_d.add(j)
#             self.tracks[i].update_bbox(filtered[j][:4])
#             iou_matrix[i, :] = 0; iou_matrix[:, j] = 0

#         for j in range(len(filtered)):
#             if j not in matched_d:
#                 self._add(filtered[j][:4])

#         self.tracks = [t for i, t in enumerate(self.tracks) if i in matched_t]

#     def _add(self, bbox):
#         self.tracks.append(Track(self.track_id_count, bbox))
#         self.track_id_count += 1


# class SimplifiedTracker(Tracker):
#     """
#     Per-camera tracker — handles static detection, no-target detection,
#     and saving annotated frames.  Identical logic to invigilator_tracking.py.
#     """
#     def __init__(self, stream_id, cam_name, base_dir,
#                  static_threshold=35, history_length=10):
#         super().__init__()
#         self.stream_id      = stream_id
#         self.cam_name       = cam_name
#         self.position_history      = {}
#         self.static_status         = {}
#         self.visibility_status     = {}
#         self.static_threshold      = static_threshold
#         self.history_length        = history_length
#         self.invisible_notifications = OrderedDict()
#         self.notification_duration = 3.0
#         self.static_start_times    = {}
#         self.static_events_saved   = set()

#         self.base_dir      = os.path.join(base_dir, cam_name)
#         self.static_dir    = os.path.join(self.base_dir, "static_person")
#         self.invisible_dir = os.path.join(self.base_dir, "no_targets")
#         self.annotated_dir = os.path.join(self.base_dir, "annotated")
#         for d in [self.static_dir, self.invisible_dir, self.annotated_dir]:
#             os.makedirs(d, exist_ok=True)

#         self.last_invisible_save_time  = 0
#         self.last_static_save_times    = {}
#         self.last_annotated_time       = 0
#         self.no_target_start_time      = None
#         self.cooldown_period           = COOLDOWN_PERIOD
#         self.static_threshold_time     = STATIC_TIME_THRESHOLD
#         self.invisible_threshold_time  = NO_TARGET_TIME_THRESHOLD

#     # ── helpers ────────────────────────────────────────────
#     def save_frame(self, frame, directory, prefix, annotated=False):
#         try:
#             if frame is None:
#                 raise ValueError("Frame is None")
#             if not os.path.exists(directory):
#                 print(f"Debug: Creating directory {directory}")
#                 os.makedirs(directory, exist_ok=True)
#             current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
#             annotation_str = "_annotated" if annotated else ""
#             filename = f"{self.cam_name}_{prefix}{annotation_str}_{current_time}.jpg"
#             filepath = os.path.join(directory, filename)
#             print(f"Debug: Attempting to save frame to {filepath}")
#             success = cv2.imwrite(filepath, frame)
#             if not success:
#                 raise Exception("cv2.imwrite failed to save the frame")
#             print(f"Camera {self.cam_name} - Successfully saved frame: {filepath}")
#             return filepath
#         except Exception as e:
#             print(f"Error in save_frame for camera {self.cam_name}: {str(e)}")
#             raise

#     def mark_visible(self, track_id):
#         self.visibility_status[track_id] = True

#     def mark_invisible(self, track_id):
#         if track_id in self.visibility_status:
#             self.visibility_status[track_id] = False

#     def is_static(self, track_id):
#         return self.static_status.get(track_id, False)

#     def update_track_status(self, track_id, bbox):
#         center = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
#         if track_id not in self.position_history:
#             self.position_history[track_id] = deque(maxlen=self.history_length)
#         self.position_history[track_id].append(center)

#         if len(self.position_history[track_id]) >= self.history_length:
#             pos  = list(self.position_history[track_id])
#             moves = [np.linalg.norm(np.subtract(pos[i], pos[i-1]))
#                      for i in range(1, len(pos))]
#             is_static = max(moves) < self.static_threshold
#             was_static = self.static_status.get(track_id, False)

#             if is_static and not was_static:
#                 self.static_start_times[track_id] = time.time()
#             elif not is_static and was_static:
#                 self.static_start_times.pop(track_id, None)

#             self.static_status[track_id] = is_static

#     def check_and_save_static_frames(self, display_frame, original_frame, track_id):
#         current_time = time.time()
#         if track_id not in self.last_static_save_times:
#             self.last_static_save_times[track_id] = 0
#         if self.is_static(track_id):
#             static_duration = current_time - self.static_start_times[track_id]
#             static_event_id = f"{track_id}_{int(self.static_start_times[track_id])}"
#             print(f"Debug: Camera {self.cam_name} - Track {track_id} static for {static_duration:.1f} seconds")
#             if static_duration >= self.static_threshold_time:
#                 print(f"Debug: Camera {self.cam_name} - Static threshold reached for track {track_id}")
#                 if static_event_id not in self.static_events_saved:
#                     print(f"Debug: Camera {self.cam_name} - Attempting to save static event {static_event_id}")
#                     try:
#                         original_path = self.save_frame(original_frame, self.static_dir, f"static_person_{track_id}")
#                         annotated_path = self.save_frame(display_frame, self.annotated_dir, f"static_person_{track_id}", annotated=True)
#                         self.static_events_saved.add(static_event_id)
#                         self.last_static_save_times[track_id] = current_time
#                         print(f"Debug: Camera {self.cam_name} - Successfully saved static event frames")
#                         self._log_event("static_person", track_id, original_path, annotated_path)
#                     except Exception as e:
#                         print(f"Error saving static frames for camera {self.cam_name}: {str(e)}")

#     def check_and_save_invisible_frames(self, frame):
#         current_time = time.time()
#         if not self.visibility_status:
#             if self.no_target_start_time is None:
#                 self.no_target_start_time = current_time
#                 print(f"Debug: Camera {self.cam_name} - Starting no targets timer")
#         else:
#             if self.no_target_start_time is not None:
#                 print(f"Debug: Camera {self.cam_name} - Resetting no targets timer")
#             self.no_target_start_time = None
#         if self.no_target_start_time is not None:
#             duration = current_time - self.no_target_start_time
#             print(f"Debug: Camera {self.cam_name} - No targets for {duration:.1f} seconds")
#             if (duration >= self.invisible_threshold_time and
#                     current_time - self.last_invisible_save_time >= self.cooldown_period):
#                 print(f"Debug: Camera {self.cam_name} - Attempting to save no targets frame")
#                 try:
#                     original_path = self.save_frame(frame, self.invisible_dir, "no_targets")
#                     self.last_invisible_save_time = current_time
#                     self._log_event("no_targets", None, original_path, None)
#                     print(f"Debug: Camera {self.cam_name} - Successfully saved no targets frame")
#                 except Exception as e:
#                     print(f"Error saving invisible frame for camera {self.cam_name}: {str(e)}")

#     def check_and_save_annotated(self, frame):
#         now = time.time()
#         if now - self.last_annotated_time >= ANNOTATED_SAVE_INTERVAL:
#             self.last_annotated_time = now
#             try:
#                 self.save_frame(frame, self.annotated_dir, "annotated", annotated=True)
#             except Exception as e:
#                 logger.error(f"[InvigilatorWorker] Error saving annotated frame: {e}")

#     def _log_event(self, event_type, track_id, original_path, annotated_path):
#         """Log event to events.json for audit trail."""
#         import json as _json
#         log_entry = {
#             "timestamp":      datetime.now().isoformat(),
#             "camera_name":    self.cam_name,
#             "event_type":     event_type,
#             "track_id":       track_id,
#             "original_frame": original_path,
#             "annotated_frame": annotated_path,
#         }
#         log_file = os.path.join(self.base_dir, "events.json")
#         try:
#             logs = []
#             if os.path.exists(log_file):
#                 with open(log_file, "r") as f:
#                     logs = _json.load(f)
#             logs.append(log_entry)
#             with open(log_file, "w") as f:
#                 _json.dump(logs, f, indent=4)
#         except Exception as e:
#             logger.error(f"[InvigilatorWorker] Error writing events.json: {e}")

#     def draw_notifications(self, frame):
#         now        = time.time()
#         y_pos      = 30
#         font       = cv2.FONT_HERSHEY_SIMPLEX
#         expired    = [tid for tid, ts in self.invisible_notifications.items()
#                       if now - ts > self.notification_duration]
#         for tid in expired:
#             self.invisible_notifications.pop(tid)
#         for tid in self.invisible_notifications:
#             cv2.putText(frame, f"Track {tid} lost", (10, y_pos), font, 0.7, (0, 0, 255), 2)
#             y_pos += 30


# # =====================================================
# # 🔍 CORE TRACKING  (shared by RTSP + HLS paths)
# # =====================================================
# def _get_tracker(camera_id: str, base_dir: str) -> SimplifiedTracker:
#     with _state_lock:
#         if camera_id not in trackers:
#             trackers[camera_id] = SimplifiedTracker(
#                 stream_id=camera_id,
#                 cam_name=camera_id,
#                 base_dir=base_dir,
#                 static_threshold=STATIC_DISTANCE_THRESHOLD,
#                 history_length=10,
#             )
#             invigilator_stats[camera_id] = {'static_alerts': 0, 'total_tracked': 0}
#     return trackers[camera_id]


# def track_invigilator(frame, device_id: str, camera_no: str, base_dir: str):
#     """
#     Run YOLO, update tracker, save static/no-target/annotated frames.

#     Returns:
#         (static_detected: bool, person_count: int)
#     """
#     cam_key = f"{device_id}_{camera_no}" if camera_no else device_id
#     tracker = _get_tracker(cam_key, base_dir)

#     results      = yolo_model(frame, conf=DETECTION_THRESHOLD, verbose=False)
#     display      = frame.copy()
#     visible_ids  = set()
#     det_count    = 0

#     for result in results:
#         detections = []
#         for r in result.boxes.data.tolist():
#             x1, y1, x2, y2, score, class_id = r
#             x1, y1, x2, y2 = map(int, (x1, y1, x2, y2))
#             if int(class_id) == 0 and score >= DETECTION_THRESHOLD:
#                 h = y2 - y1
#                 if h >= MIN_HEIGHT:
#                     detections.append([x1, y1, x2, y2, score, h])
#                     det_count += 1

#         tracker.update(display, detections, MIN_HEIGHT)

#         for track in tracker.tracks:
#             tid   = track.track_id
#             visible_ids.add(tid)
#             tracker.mark_visible(tid)
#             tracker.update_track_status(tid, track.bbox)
#             tracker.check_and_save_static_frames(display, frame, tid)

#             x1, y1, x2, y2 = map(int, track.bbox)
#             color = (0, 0, 255) if tracker.is_static(tid) else (0, 255, 0)
#             cv2.rectangle(display, (x1, y1), (x2, y2), color, 2)
#             cv2.putText(display, f"ID {tid}", (x1, y1 - 6),
#                         cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

#     # Mark invisible tracks
#     for tid in set(tracker.visibility_status.keys()) - visible_ids:
#         tracker.mark_invisible(tid)

#     tracker.check_and_save_invisible_frames(display)
#     tracker.draw_notifications(display)

#     if visible_ids:
#         tracker.check_and_save_annotated(display)

#     static_detected = any(tracker.is_static(tid) for tid in visible_ids)

#     with _state_lock:
#         invigilator_stats[cam_key]['total_tracked']  = det_count
#         invigilator_stats[cam_key]['static_alerts']  = len(tracker.static_events_saved)

#     return static_detected, det_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def invigilator_worker(frame_queue):
#     """
#     Queue-based worker — receives (frame, device_id, camera_no)
#     packets from the RTSP producer.
#     """
#     logger.info("🟢 [InvigilatorWorker] RTSP worker started")

#     while True:
#         data = frame_queue.get()
#         if data is None:
#             logger.info("🔴 [InvigilatorWorker] RTSP worker stopping")
#             break

#         frame, device_id, camera_no = data
#         track_invigilator(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             base_dir=RTSP_BASE_DIR
#         )


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
# def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
#     """Open HLS stream and run invigilator tracking until stopped."""
#     from tcs_hls_utils import open_hls_stream

#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[InvigilatorWorker][HLS] ❌ Could not open stream for {camera_id}")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[InvigilatorWorker][HLS] 🟢 Tracking started for {camera_id} @ {fps:.1f} FPS")

#     frame_count = 0
#     fail_count  = 0
#     start_time  = time.time()
#     label       = camera_name if camera_name else camera_id

#     try:
#         while not _STOP_EVENT.is_set():
#             # Non-blocking read with 5s timeout
#             read_result = [None, None]
#             def _read():
#                 read_result[0], read_result[1] = cap.read()
#             t = threading.Thread(target=_read, daemon=True)
#             t.start()
#             t.join(timeout=5)

#             if _STOP_EVENT.is_set():
#                 break

#             ret, frame = read_result
#             if not ret or frame is None:
#                 fail_count += 1
#                 logger.warning(f"[InvigilatorWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
#                 if fail_count >= HLS_FAIL_LIMIT:
#                     logger.error(f"[InvigilatorWorker][HLS] ❌ Max failures → {camera_id}")
#                     break
#                 time.sleep(3)
#                 continue

#             fail_count   = 0
#             frame_count += 1

#             if frame_count % HLS_SAMPLE_EVERY == 0:
#                 static_detected, person_count = track_invigilator(
#                     frame.copy(),
#                     device_id=label,
#                     camera_no="",
#                     base_dir=HLS_BASE_DIR
#                 )

#                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
#                     if static_detected:
#                         logger.warning(
#                             f"[InvigilatorWorker][HLS] 🧍 Static invigilator → {camera_id}"
#                         )
#                     else:
#                         logger.info(
#                             f"[InvigilatorWorker][HLS] ✅ Tracking OK → {camera_id} ({person_count} people)"
#                         )

#             if max_frames and frame_count >= max_frames:
#                 break

#     except KeyboardInterrupt:
#         _STOP_EVENT.set()
#         logger.info(f"[InvigilatorWorker][HLS] Interrupted → {camera_id}")
#     except Exception as e:
#         logger.error(f"[InvigilatorWorker][HLS] Error → {camera_id}: {e}")
#     finally:
#         cap.release()
#         elapsed    = time.time() - start_time
#         actual_fps = frame_count / elapsed if elapsed > 0 else 0
#         logger.info(
#             f"[InvigilatorWorker][HLS] 🔴 Stopped → {camera_id} | "
#             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
#         )

#     return True


# def invigilator_worker_hls(camera_config: dict, max_frames=None):
#     """
#     HLS worker entry point — used by master_pipeline for HLS cameras.

#     camera_config = {
#         'camera_id':   str,
#         'stream_url':  str,
#         'camera_name': str,
#     }
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

#     camera_id   = camera_config.get("camera_id", "unknown")
#     initial_url = camera_config.get("stream_url", "")
#     camera_name = camera_config.get("camera_name", "")

#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url:
#         logger.error(f"[InvigilatorWorker][HLS] ❌ Could not resolve URL for {camera_id}")
#         return

#     if not test_hls_stream(hls_url):
#         logger.error(f"[InvigilatorWorker][HLS] ❌ Stream test failed for {camera_id}")
#         return

#     logger.info(f"[InvigilatorWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
#     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)