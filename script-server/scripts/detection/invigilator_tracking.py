import cv2
import time
import os
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

COOLDOWN_TIME = 180            # Seconds between saves (worker-level cooldown is 900s, separate)

# --- Standing-person classification (used by both ABSENT and STATIC) ---
CONF_THRESHOLD = 0.30          # Catches partial / side-on / distant standing invigilators
MIN_HEIGHT = 100               # Minimum bbox height (px) to be considered standing
STANDING_ASPECT_RATIO = 1.5    # h/w >= 1.5 → "standing" pose. Below this → sitting / wide-box / not invigilator.

# --- ABSENT violation (no invigilator in the room) ---
NO_TARGET_TIME_THRESH = 45     # Seconds of zero-standing-person before ABSENT fires

# --- STATIC violation (invigilator stuck in one place, not actively monitoring) ---
STATIC_THRESH = 35             # Pixels — movement below this is "still"
STATIC_TIME_THRESH = 600       # Seconds — 10 min of stillness before STATIC fires

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
class SimplifiedTracker:
    """
    Per-camera tracker for BOTH violation types:

      ABSENT  → fires when zero standing persons are detected for NO_TARGET_TIME_THRESH
                continuous seconds.
      STATIC  → fires when the tallest detected standing person stays within a
                STATIC_THRESH-pixel circle for STATIC_TIME_THRESH continuous seconds.

    The two are independent — a single frame's outcome can yield one, the other,
    both, or neither. They are returned as a tuple (absent, static_violation)
    so the caller (and downstream dashboard) can label them distinctly.

    Static-tracking uses ONLY the tallest standing person per frame, so the
    10-slot position-history deque is not contaminated by multiple persons in
    busy frames (this was a pre-session bug; preserved fix).
    """
    def __init__(self):
        self.no_target_start = None              # ABSENT timer start
        self.position_history = {}               # deque of tallest-standing centroids
        self.static_start = {}                   # STATIC timer start
        self.last_save = 0

    def update(self, person_boxes):
        """
        person_boxes : list of [x1,y1,x2,y2] for boxes classified as STANDING.
        Returns (absent_violation: bool, static_violation: bool).
        """
        now = time.time()

        # --- ABSENT branch -------------------------------------------------
        if not person_boxes:
            if self.no_target_start is None:
                self.no_target_start = now
            absent = now - self.no_target_start > NO_TARGET_TIME_THRESH
            # No standing person → static check is moot; clear its state
            self.static_start.pop("invigilator", None)
            self.position_history.pop("invigilator", None)
            return absent, False

        # At least one standing person → disarm absence clock
        self.no_target_start = None

        # --- STATIC branch -------------------------------------------------
        # Track only the TALLEST standing person — avoids deque contamination
        # in multi-person frames (which made the old static check unreliable).
        tallest = max(person_boxes, key=lambda b: b[3] - b[1])
        center = ((tallest[0] + tallest[2]) / 2.0, (tallest[1] + tallest[3]) / 2.0)
        hist = self.position_history.setdefault("invigilator", deque(maxlen=10))
        hist.append(center)

        static_violation = False
        if len(hist) == 10:
            moves = [np.linalg.norm(np.subtract(a, b))
                     for a, b in zip(list(hist), list(hist)[1:])]
            is_still = max(moves) < STATIC_THRESH
            if is_still:
                if "invigilator" not in self.static_start:
                    self.static_start["invigilator"] = now
                static_violation = (now - self.static_start["invigilator"]) > STATIC_TIME_THRESH
            else:
                # Moved enough — reset the stillness timer
                self.static_start.pop("invigilator", None)

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
    with torch.inference_mode():
        results = model(frame, conf=CONF_THRESHOLD, verbose=False, half=True)[0]
        if model.predictor is not None:
            model.predictor.results = None

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
            trackers[key] = SimplifiedTracker()
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

    now = time.time()
    with _state_lock:
        if violation_detected and now - tracker.last_save >= COOLDOWN_TIME:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            import uuid
            uid = str(uuid.uuid4())
            fname = f"{script_name}_{device_id}_{camera_no}_{ts}_{uid}.jpg"
            filename = os.path.join(SAVE_FOLDER, fname)
            cv2.imwrite(filename, frame)
            tracker.last_save = now
            logger.warning(f"[{device_id}-{camera_no}] 🚨 Invigilator {status}: {filename}")

    return frame, violation_detected, 1 if violation_detected else 0

def detect_invigilator_batch(items):
    """Run true batch inference."""
    model = get_yolo_model()
    frames = [item['frame'].copy() for item in items]
    with torch.inference_mode():
        results = model(frames, conf=CONF_THRESHOLD, verbose=False, half=True)
        if model.predictor is not None:
            model.predictor.results = None

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
                trackers[key] = SimplifiedTracker()
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
