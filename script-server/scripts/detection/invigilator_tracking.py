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

COOLDOWN_TIME = 180       # Seconds between saves
CONF_THRESHOLD = 0.50     # Raised: standing persons are high-confidence detections
STATIC_THRESH = 35        # Pixels movement threshold
STATIC_TIME_THRESH = 600  # Seconds to be considered static (10 min)
NO_TARGET_TIME_THRESH = 20 # Seconds to be considered absent
MIN_HEIGHT = 200         # Minimum bounding box height (px) — filters out seated candidates (~150–180px),
                          # only standing persons (invigilator) reach this height in typical lab cameras

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

    def update(self, person_boxes):
        now = time.time()
        
        if not person_boxes:
            if self.no_target_start is None:
                self.no_target_start = now
            return True, now - self.no_target_start > NO_TARGET_TIME_THRESH
        
        self.no_target_start = None
        
        # Very simple centroid tracker for static detection
        for box in person_boxes:
            center = ((box[0]+box[2])/2, (box[1]+box[3])/2)
            # In true worker, we handle multiple cameras. This tracker is per-camera.
            # For simplicity, we assume one invigilator target area.
            self.position_history.setdefault("invigilator", deque(maxlen=10)).append(center)
            
            if len(self.position_history["invigilator"]) == 10:
                moves = [np.linalg.norm(np.subtract(a, b)) 
                         for a, b in zip(list(self.position_history["invigilator"]), 
                                       list(self.position_history["invigilator"])[1:])]
                static = max(moves) < STATIC_THRESH
                
                if static:
                    if "invigilator" not in self.static_start:
                        self.static_start["invigilator"] = now
                    return True, now - self.static_start["invigilator"] > STATIC_TIME_THRESH
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

    # Only track standing persons (height >= MIN_HEIGHT) — filters out seated candidates
    person_boxes = []
    person_confs = []
    for box in results.boxes:
        if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD:
            coords = box.xyxy[0].cpu().numpy()
            if (coords[3] - coords[1]) >= MIN_HEIGHT:
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

    # Color: red=violation, orange=static, green=active
    if absent:
        box_color = (0, 0, 255)
    elif static_violation:
        box_color = (0, 165, 255)
    else:
        box_color = (0, 255, 0)

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
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        # Only track standing persons (height >= MIN_HEIGHT) — filters out seated candidates
        person_boxes = []
        person_confs = []
        for box in result.boxes:
            if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD:
                coords = box.xyxy[0].cpu().numpy()
                if (coords[3] - coords[1]) >= MIN_HEIGHT:
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

        if absent:
            box_color = (0, 0, 255)
        elif static_violation:
            box_color = (0, 165, 255)
        else:
            box_color = (0, 255, 0)

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
