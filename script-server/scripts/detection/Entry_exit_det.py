import cv2
import time
import os
import logging
import sys
import threading
import torch
from datetime import datetime
from ultralytics import YOLO

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "yolov10m.pt")
SAVE_FOLDER = os.path.join(BASE_DIR, "results/entry_exit_detection")

# CAMERA CLASSIFICATION: Entry/Exit, Outside
# This detection runs on cameras classified as:
# - Entry / Entry-Exit / Entry Gate / Exit Gate
# - Outdoor Scene / Outside Area / Crowd at Entry/Exit Gate

COOLDOWN_TIME = 180       # Seconds between saves
MIN_PERSONS = 2           # Threshold for violation
CONF_THRESHOLD = 0.45     # Confidence for person detection

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

# ================= STATE ===================
last_save_times = {}
_state_lock = threading.Lock()

# =====================================================
# CORE DETECTION LOGIC
# =====================================================
def detect_entry_exit_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="entry_exit"):
    """Standalone detection for a single frame."""
    model = get_yolo_model()
    with torch.inference_mode():
        results = model(frame, conf=CONF_THRESHOLD, verbose=False, half=True)[0]
        if model.predictor is not None:
            model.predictor.results = None

    person_detections = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
    ]

    person_count = len(person_detections)

    # Draw detections
    for box in person_detections:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

    cv2.putText(frame, f"Persons: {person_count}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"{device_id} - {camera_no}", (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    key = f"{device_id}_{camera_no}"
    now = time.time()
    
    violation_detected = person_count >= MIN_PERSONS

    with _state_lock:
        time_elapsed = now - last_save_times.get(key, 0)
        if violation_detected and time_elapsed >= COOLDOWN_TIME:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            import uuid
            uid = str(uuid.uuid4())
            fname = f"{script_name}_{device_id}_{camera_no}_{ts}_{uid}.jpg"
            filename = os.path.join(SAVE_FOLDER, fname)
            cv2.imwrite(filename, frame)
            last_save_times[key] = now
            logger.warning(f"[{device_id}-{camera_no}] 🚨 Entry/Exit violation detected: {filename}")

    return frame, violation_detected, person_count

def detect_entry_exit_batch(items):
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
        person_boxes = [
            box for box in result.boxes
            if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
        ]
        person_count = len(person_boxes)
        violation_detected = person_count >= MIN_PERSONS

        for box in person_boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

        ch_no = item.get('ch_no', item.get('camera_id', 'unknown'))
        cv2.putText(frame, f"Persons: {person_count}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"CH: {ch_no}", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        outputs.append((frame, violation_detected, person_count))

    return outputs
