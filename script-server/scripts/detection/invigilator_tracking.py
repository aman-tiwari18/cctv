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

COOLDOWN_TIME = 180            # Seconds between saves
CONF_THRESHOLD = 0.40          # Lowered: 0.50 missed partial / side-on invigilators
STATIC_THRESH = 35             # Pixels movement threshold
STATIC_TIME_THRESH = 600       # Seconds to be considered static (10 min)
NO_TARGET_TIME_THRESH = 20     # Seconds with no person at all → ABSENT
MIN_HEIGHT = 150               # Minimum bbox height (px) for a person to be classified "standing"
SITTING_MIN_HEIGHT = 80        # Minimum bbox height to be considered a seated person at all
STANDING_ASPECT_RATIO = 1.8    # height/width >= 1.8 AND height >= MIN_HEIGHT → "standing"

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
    def __init__(self):
        self.tracks = {}
        self.track_id_count = 0
        self.position_history = {}
        self.static_start = {}
        self.no_target_start = None
        self.last_save = 0

    def update(self, standing_boxes, any_person):
        """
        standing_boxes : list of [x1,y1,x2,y2] for boxes classified as standing
        any_person     : True if ANY person (standing OR sitting) was detected this frame
        Returns (absent_violation, static_violation).
        """
        now = time.time()

        # ABSENCE: only when no person at all (standing or sitting)
        if not any_person:
            if self.no_target_start is None:
                self.no_target_start = now
            return now - self.no_target_start > NO_TARGET_TIME_THRESH, False

        self.no_target_start = None

        # STATIC: track only the tallest standing person — avoids deque contamination
        if not standing_boxes:
            # Seated person(s) present — counted as present, but cannot be static-checked.
            self.static_start.pop("invigilator", None)
            return False, False

        tallest = max(standing_boxes, key=lambda b: b[3] - b[1])
        center = ((tallest[0] + tallest[2]) / 2, (tallest[1] + tallest[3]) / 2)
        hist = self.position_history.setdefault("invigilator", deque(maxlen=10))
        hist.append(center)

        if len(hist) == 10:
            moves = [np.linalg.norm(np.subtract(a, b))
                     for a, b in zip(list(hist), list(hist)[1:])]
            static = max(moves) < STATIC_THRESH
            if static:
                if "invigilator" not in self.static_start:
                    self.static_start["invigilator"] = now
                return False, now - self.static_start["invigilator"] > STATIC_TIME_THRESH
            else:
                self.static_start.pop("invigilator", None)

        return False, False

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

    # Classify every detected person into standing vs sitting via aspect ratio + height
    standing_boxes, standing_confs = [], []
    sitting_boxes,  sitting_confs  = [], []
    for box in results.boxes:
        if int(box.cls[0]) != 0 or float(box.conf[0]) < CONF_THRESHOLD:
            continue
        coords = box.xyxy[0].cpu().numpy()
        h = coords[3] - coords[1]
        w = max(coords[2] - coords[0], 1.0)
        if h < SITTING_MIN_HEIGHT:
            continue  # too small — far background / partial occlusion
        if h >= MIN_HEIGHT and (h / w) >= STANDING_ASPECT_RATIO:
            standing_boxes.append(coords)
            standing_confs.append(float(box.conf[0]))
        else:
            sitting_boxes.append(coords)
            sitting_confs.append(float(box.conf[0]))

    any_person = bool(standing_boxes or sitting_boxes)

    key = f"{device_id}_{camera_no}"
    with _state_lock:
        if key not in trackers:
            trackers[key] = SimplifiedTracker()
        tracker = trackers[key]

    absent, static_violation = tracker.update(standing_boxes, any_person)
    violation_detected = absent or static_violation
    status = "ABSENT" if absent else ("STATIC" if static_violation else "Active")

    # Standing box colour follows status (red=absent, orange=static, green=active)
    if absent:
        stand_color = (0, 0, 255)
    elif static_violation:
        stand_color = (0, 165, 255)
    else:
        stand_color = (0, 255, 0)
    SIT_COLOR = (255, 200, 0)  # cyan

    for box, conf in zip(standing_boxes, standing_confs):
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), stand_color, 2)
        cv2.putText(frame, f"Invig {conf:.2f}", (x1, max(y1 - 8, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, stand_color, 1)

    for box, conf in zip(sitting_boxes, sitting_confs):
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), SIT_COLOR, 2)
        cv2.putText(frame, f"Seated {conf:.2f}", (x1, max(y1 - 8, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, SIT_COLOR, 1)

    # Status overlay
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, 10), (450, 110), (0, 0, 0), -1)
    cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
    status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
    cv2.putText(frame, f"Invigilator: {status}", (20, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, status_color, 2)
    cv2.putText(frame, f"Standing: {len(standing_boxes)} | Sitting: {len(sitting_boxes)}", (20, 65),
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
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        # Classify every detected person into standing vs sitting via aspect ratio + height
        standing_boxes, standing_confs = [], []
        sitting_boxes,  sitting_confs  = [], []
        for box in result.boxes:
            if int(box.cls[0]) != 0 or float(box.conf[0]) < CONF_THRESHOLD:
                continue
            coords = box.xyxy[0].cpu().numpy()
            h = coords[3] - coords[1]
            w = max(coords[2] - coords[0], 1.0)
            if h < SITTING_MIN_HEIGHT:
                continue
            if h >= MIN_HEIGHT and (h / w) >= STANDING_ASPECT_RATIO:
                standing_boxes.append(coords)
                standing_confs.append(float(box.conf[0]))
            else:
                sitting_boxes.append(coords)
                sitting_confs.append(float(box.conf[0]))

        any_person = bool(standing_boxes or sitting_boxes)

        device_id = item.get('device_id', 'unknown')
        camera_no = item.get('ch_no', 'unknown')
        key = f"{device_id}_{camera_no}"

        with _state_lock:
            if key not in trackers:
                trackers[key] = SimplifiedTracker()
            tracker = trackers[key]

        absent, static_violation = tracker.update(standing_boxes, any_person)
        violation_detected = absent or static_violation
        status = "ABSENT" if absent else ("STATIC" if static_violation else "Active")

        if absent:
            stand_color = (0, 0, 255)
        elif static_violation:
            stand_color = (0, 165, 255)
        else:
            stand_color = (0, 255, 0)
        SIT_COLOR = (255, 200, 0)  # cyan

        for box, conf in zip(standing_boxes, standing_confs):
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            cv2.rectangle(frame, (x1, y1), (x2, y2), stand_color, 2)
            cv2.putText(frame, f"Invig {conf:.2f}", (x1, max(y1 - 8, 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, stand_color, 1)

        for box, conf in zip(sitting_boxes, sitting_confs):
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            cv2.rectangle(frame, (x1, y1), (x2, y2), SIT_COLOR, 2)
            cv2.putText(frame, f"Seated {conf:.2f}", (x1, max(y1 - 8, 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, SIT_COLOR, 1)

        # Status overlay
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (450, 110), (0, 0, 0), -1)
        cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
        status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
        cv2.putText(frame, f"Invigilator: {status}", (20, 38),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, status_color, 2)
        cv2.putText(frame, f"Standing: {len(standing_boxes)} | Sitting: {len(sitting_boxes)}", (20, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.putText(frame, f"CH: {camera_no}", (20, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

        outputs.append((frame, violation_detected, 1 if violation_detected else 0))

    return outputs
