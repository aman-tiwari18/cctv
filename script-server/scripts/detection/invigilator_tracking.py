import cv2
import time
import os
_DET_GPU_ID = int(os.environ["WORKER_INDEX"]) if os.environ.get("WORKER_INDEX", "").strip().isdigit() else int("".join(c for c in os.environ.get("WORKER_ID", "main").split("-")[-1] if c.isdigit()) or "0")
import logging
import threading
import torch
import numpy as np
from datetime import datetime
from ultralytics import YOLO
from collections import deque

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "yolov10m.pt")
SAVE_FOLDER = os.path.join(BASE_DIR, "results/invigilator_detection")

# CAMERA CLASSIFICATION: Inside Lab
# This detection runs on cameras classified as:
# - Computer Lab / Inside Lab / Exam Lab / Inside Classroom

# --- Standing-person classification (used by both ABSENT and STATIC) ---
CONF_THRESHOLD = 0.40          # Tightened from 0.30 — weak phantom standing shapes were polluting the tracker
MIN_HEIGHT = 100               # Minimum bbox height (px) to be considered standing
STANDING_ASPECT_RATIO = 1.5    # h/w >= 1.5 → "standing" pose. Below this → sitting / wide-box / not invigilator.

# --- ABSENT violation (no invigilator in the room) ---
NO_TARGET_TIME_THRESH = 45     # Seconds of zero-standing-person before ABSENT fires

# --- STATIC violation (per-person, perspective-aware) ---
STATIC_TIME_THRESH    = 420    # Seconds — 7 min of continuous stillness before STATIC fires (per detection frequency spec)
STATIC_THRESH_FLOOR   = 35     # Baseline pixel radius for "still"
STATIC_THRESH_RATIO   = 0.20   # Adaptive radius = max(floor, bbox_h * ratio) — absorbs jitter on close-up cameras
POSITION_WINDOW_SEC   = 30     # Rolling foot-position window in seconds (replaces fixed-frame deque)

# --- Identity tracking (per-person) ---
TRACK_MATCH_DIST_RATIO = 0.5   # Match current box to existing track if foot-dist < avg_h * ratio
TRACK_TTL_SEC          = 5     # Evict a track unseen for this long (handles brief occlusion)
STILLNESS_WARMUP_SEC   = 5     # Need this much position history before judging a track as "still"

os.makedirs(SAVE_FOLDER, exist_ok=True)

# ================= YOLO ====================
yolo_model = None
_model_lock = threading.Lock()

def get_yolo_model():
    """Return a shared YOLO model instance."""
    global yolo_model
    if yolo_model is None:
        with _model_lock:
            if yolo_model is None:
                logger.info(f"Loading YOLO model from {MODEL_PATH}...")
                yolo_model = YOLO(MODEL_PATH)
                if torch.cuda.is_available():
                    yolo_model.to('cuda')
                    logger.info("YOLO model moved to CUDA")
    return yolo_model

# ================= TRACKING =================
class PersonTracker:
    """
    Per-camera multi-person tracker.

      ABSENT → fires when zero standing persons are detected for
               NO_TARGET_TIME_THRESH continuous seconds.
      STATIC → fires when ANY tracked person's foot-position stays
               inside its adaptive stillness radius for
               STATIC_TIME_THRESH continuous seconds.

    Each standing detection is matched to an existing track by
    foot-position proximity (greedy, scaled by avg_h). Unmatched
    detections start new tracks; tracks unseen for TRACK_TTL_SEC are
    evicted. Each track keeps its own time-windowed foot-position
    buffer and its own stillness timer — so two-invigilator labs no
    longer reset the timer when the "tallest" identity switches
    between frames.
    """
    def __init__(self):
        self.no_target_start = None
        self.tracks = {}                # track_id -> dict
        self._next_id = 0

    @staticmethod
    def _foot(box):
        return ((box[0] + box[2]) / 2.0, float(box[3]))

    @staticmethod
    def _height(box):
        return max(float(box[3] - box[1]), 1.0)

    def _evict_stale(self, now):
        stale = [tid for tid, t in self.tracks.items()
                 if now - t['last_seen'] > TRACK_TTL_SEC]
        for tid in stale:
            del self.tracks[tid]

    def update(self, person_boxes):
        """
        person_boxes : list of [x1,y1,x2,y2] for STANDING-classified boxes.
        Returns (absent_violation: bool, static_violation: bool).
        """
        now = time.time()

        # --- ABSENT branch -------------------------------------------------
        if not person_boxes:
            if self.no_target_start is None:
                self.no_target_start = now
            absent = (now - self.no_target_start) > NO_TARGET_TIME_THRESH
            # Brief gaps shouldn't destroy tracks; TTL handles eviction.
            self._evict_stale(now)
            return absent, False

        # At least one standing person → disarm ABSENT clock
        self.no_target_start = None

        # --- Identity match: greedy foot-distance --------------------------
        current = [(self._foot(b), self._height(b)) for b in person_boxes]
        unmatched_current = set(range(len(current)))

        # Most-recently-seen tracks get first pick (biases toward stable IDs).
        track_order = sorted(self.tracks.keys(),
                             key=lambda k: -self.tracks[k]['last_seen'])
        for tid in track_order:
            track = self.tracks[tid]
            if not track['positions']:
                continue
            _, lx, ly = track['positions'][-1]
            best_i, best_d = None, float('inf')
            for i in unmatched_current:
                (fx, fy), h = current[i]
                d = ((fx - lx) ** 2 + (fy - ly) ** 2) ** 0.5
                avg_h = (track['last_h'] + h) / 2.0
                if d < avg_h * TRACK_MATCH_DIST_RATIO and d < best_d:
                    best_i, best_d = i, d
            if best_i is not None:
                unmatched_current.discard(best_i)
                (fx, fy), h = current[best_i]
                track['positions'].append((now, fx, fy))
                track['last_seen'] = now
                track['last_h'] = h
                while track['positions'] and now - track['positions'][0][0] > POSITION_WINDOW_SEC:
                    track['positions'].popleft()

        # Unmatched detections → new tracks
        for i in unmatched_current:
            (fx, fy), h = current[i]
            tid = self._next_id
            self._next_id += 1
            self.tracks[tid] = {
                'positions':    deque([(now, fx, fy)]),
                'static_start': None,
                'last_seen':    now,
                'last_h':       h,
            }

        self._evict_stale(now)

        # --- STATIC branch (per-track) -------------------------------------
        static_violation = False
        for track in self.tracks.values():
            positions = track['positions']
            # Need enough wall-clock history before judging stillness.
            if len(positions) < 5 or (now - positions[0][0]) < STILLNESS_WARMUP_SEC:
                track['static_start'] = None
                continue
            xs = [p[1] for p in positions]
            ys = [p[2] for p in positions]
            mx = sorted(xs)[len(xs) // 2]
            my = sorted(ys)[len(ys) // 2]
            max_dev = max(((x - mx) ** 2 + (y - my) ** 2) ** 0.5
                          for x, y in zip(xs, ys))
            thresh = max(STATIC_THRESH_FLOOR, track['last_h'] * STATIC_THRESH_RATIO)
            if max_dev < thresh:
                if track['static_start'] is None:
                    track['static_start'] = now
                if (now - track['static_start']) > STATIC_TIME_THRESH:
                    static_violation = True
            else:
                track['static_start'] = None

        return False, static_violation

# ================= STATE ===================
trackers = {}
_state_lock = threading.Lock()

# =====================================================
# CORE DETECTION LOGIC
# =====================================================
def detect_invigilator_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="invigilator"):
    """Standalone detection for a single frame."""
    model = get_yolo_model()
    results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    # Only standing persons count as invigilator candidates (per mentor rule).
    # Standing := height >= MIN_HEIGHT AND height/width >= STANDING_ASPECT_RATIO.
    # The aspect-ratio gate prevents upright-seated persons (tall but wide box) from leaking in as "standing".
    person_boxes = []
    person_confs = []
    for box in results.boxes:
        if int(box.cls[0]) != 0 or float(box.conf[0]) < CONF_THRESHOLD:
            continue
        coords = box.xyxy[0].cpu().numpy()
        h = coords[3] - coords[1]
        w = max(coords[2] - coords[0], 1.0)
        if h >= MIN_HEIGHT and (h / w) >= STANDING_ASPECT_RATIO:
            person_boxes.append(coords)
            person_confs.append(float(box.conf[0]))

    key = f"{device_id}_{camera_no}"
    with _state_lock:
        if key not in trackers:
            trackers[key] = PersonTracker()
        tracker = trackers[key]

    absent, static_violation = tracker.update(person_boxes)
    violation_detected = absent or static_violation
    status = "ABSENT" if absent else ("STATIC" if static_violation else "Active")

    # Box colour: red = ABSENT, orange = STATIC, green = Active.
    # When ABSENT fires there are no person_boxes (loop iterates zero times — no box drawn).
    if absent:
        box_color = (0, 0, 255)         # red
    elif static_violation:
        box_color = (0, 165, 255)       # orange
    else:
        box_color = (0, 255, 0)         # green

    for box, conf in zip(person_boxes, person_confs):
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
        cv2.putText(frame, f"Invig {conf:.2f}", (x1, max(y1 - 8, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 1)

    # Status overlay
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, 10), (450, 110), (0, 0, 0), -1)
    cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
    status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
    cv2.putText(frame, f"Invigilator: {status}", (20, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, status_color, 2)
    cv2.putText(frame, f"Standing persons: {len(person_boxes)}", (20, 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"{device_id} - Cam {camera_no}", (20, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    if violation_detected:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        import uuid
        uid = str(uuid.uuid4())
        fname = f"{script_name}_{device_id}_{camera_no}_gpu{_DET_GPU_ID}_{ts}_{uid}.jpg"
        filename = os.path.join(SAVE_FOLDER, fname)
        cv2.imwrite(filename, frame)
        logger.warning(f"[{device_id}-{camera_no}] 🚨 Invigilator {status}: {filename}")

    return frame, violation_detected, 1 if violation_detected else 0

def detect_invigilator_batch(items, results=None):
    """Run true batch inference."""
    if results is None:
        model = get_yolo_model()
        frames = [item['frame'].copy() for item in items]
        results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        # Only standing persons count as invigilator candidates (per mentor rule).
        # Standing := height >= MIN_HEIGHT AND height/width >= STANDING_ASPECT_RATIO.
        person_boxes = []
        person_confs = []
        for box in result.boxes:
            if int(box.cls[0]) != 0 or float(box.conf[0]) < CONF_THRESHOLD:
                continue
            coords = box.xyxy[0].cpu().numpy()
            h = coords[3] - coords[1]
            w = max(coords[2] - coords[0], 1.0)
            if h >= MIN_HEIGHT and (h / w) >= STANDING_ASPECT_RATIO:
                person_boxes.append(coords)
                person_confs.append(float(box.conf[0]))

        device_id = item.get('device_id', 'unknown')
        camera_no = item.get('ch_no', 'unknown')
        key = f"{device_id}_{camera_no}"

        with _state_lock:
            if key not in trackers:
                trackers[key] = PersonTracker()
            tracker = trackers[key]

        absent, static_violation = tracker.update(person_boxes)
        violation_detected = absent or static_violation
        status = "ABSENT" if absent else ("STATIC" if static_violation else "Active")

        # Box colour: red = ABSENT, orange = STATIC, green = Active.
        if absent:
            box_color = (0, 0, 255)         # red
        elif static_violation:
            box_color = (0, 165, 255)       # orange
        else:
            box_color = (0, 255, 0)         # green

        for box, conf in zip(person_boxes, person_confs):
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
            cv2.putText(frame, f"Invig {conf:.2f}", (x1, max(y1 - 8, 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 1)

        # Status overlay
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (450, 110), (0, 0, 0), -1)
        cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
        status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
        cv2.putText(frame, f"Invigilator: {status}", (20, 38),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, status_color, 2)
        cv2.putText(frame, f"Standing persons: {len(person_boxes)}", (20, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.putText(frame, f"CH: {camera_no}", (20, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

        outputs.append((frame, violation_detected, 1 if violation_detected else 0))

    return outputs
