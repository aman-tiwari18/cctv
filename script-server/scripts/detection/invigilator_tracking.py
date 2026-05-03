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
CONF_THRESHOLD = 0.45     # Confidence for person detection
STATIC_THRESH = 35        # Pixels movement threshold
STATIC_TIME_THRESH = 600  # Seconds to be considered static
NO_TARGET_TIME_THRESH = 20 # Seconds to be considered absent

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

    person_boxes = [box.xyxy[0].cpu().numpy() for box in results.boxes 
                    if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD]

    key = f"{device_id}_{camera_no}"
    with _state_lock:
        if key not in trackers:
            trackers[key] = SimplifiedTracker()
        tracker = trackers[key]
        
    absent, static_violation = tracker.update(person_boxes)
    violation_detected = absent or static_violation

    # Draw
    for box in person_boxes:
        cv2.rectangle(frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0, 255, 0), 2)

    status = "Absent" if absent else ("Static" if static_violation else "Active")
    cv2.putText(frame, f"Invigilator: {status}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255) if violation_detected else (0, 255, 0), 2)

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
    frames = [item['frame'] for item in items]
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        person_boxes = [box.xyxy[0].cpu().numpy() for box in result.boxes 
                        if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD]

        device_id = item.get('device_id', 'unknown')
        camera_no = item.get('ch_no', 'unknown')
        key = f"{device_id}_{camera_no}"
        
        with _state_lock:
            if key not in trackers:
                trackers[key] = SimplifiedTracker()
            tracker = trackers[key]
            
        absent, static_violation = tracker.update(person_boxes)
        violation_detected = absent or static_violation

        for box in person_boxes:
            cv2.rectangle(frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0, 255, 0), 2)

        status = "Absent" if absent else ("Static" if static_violation else "Active")
        cv2.putText(frame, f"Invigilator: {status}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255) if violation_detected else (0, 255, 0), 2)

        outputs.append((frame, violation_detected, 1 if violation_detected else 0))

    return outputs
