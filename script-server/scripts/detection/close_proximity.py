import cv2
import time
import os
import logging
import sys
import threading
import torch
import math
from datetime import datetime
from ultralytics import YOLO

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "yolov10m.pt")
SAVE_FOLDER = os.path.join(BASE_DIR, "results/proximity_detection")

# CAMERA CLASSIFICATION: Inside Lab
# This detection runs on cameras classified as:
# - Computer Lab / Inside Lab / Exam Lab / Inside Classroom

COOLDOWN_TIME = 60        # Seconds between saves (matches worker)
PROXIMITY_THRESHOLD = 100 # Pixels
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

# ================= UTILS ===================
def get_box_bottom_center(box):
    return ((box[0] + box[2]) / 2, box[3])

def calculate_bottom_distance(box1, box2):
    x1, y1 = get_box_bottom_center(box1)
    x2, y2 = get_box_bottom_center(box2)
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

def _annotate_violations(frame, person_boxes, violations):
    """Draw bounding boxes around violating persons, lines between them, and distance labels."""
    violating_indices = {idx for i, j, _ in violations for idx in (i, j)}

    for idx in violating_indices:
        box = person_boxes[idx]
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame, f"P{idx + 1}", (x1, max(y1 - 8, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

    for i, j, d in violations:
        c1 = get_box_bottom_center(person_boxes[i])
        c2 = get_box_bottom_center(person_boxes[j])
        cv2.line(frame,
                 (int(c1[0]), int(c1[1])),
                 (int(c2[0]), int(c2[1])),
                 (0, 0, 255), 2)
        mid_x = int((c1[0] + c2[0]) / 2)
        mid_y = int((c1[1] + c2[1]) / 2)
        cv2.putText(frame, f"{d:.1f}px", (mid_x, mid_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

# ================= STATE ===================
last_save_times = {}
_state_lock = threading.Lock()

# =====================================================
# CORE DETECTION LOGIC
# =====================================================
def detect_proximity_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="proximity"):
    """Standalone detection for a single frame."""
    model = get_yolo_model()
    results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_boxes = []
    for box in results.boxes:
        if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD:
            person_boxes.append(box.xyxy[0].cpu().numpy())

    violations = []
    for i in range(len(person_boxes)):
        for j in range(i + 1, len(person_boxes)):
            d = calculate_bottom_distance(person_boxes[i], person_boxes[j])
            if d < PROXIMITY_THRESHOLD:
                violations.append((i, j, d))

    violation_detected = len(violations) > 0
    _annotate_violations(frame, person_boxes, violations)

    # Status overlay
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, 10), (420, 100), (0, 0, 0), -1)
    cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
    status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
    status_text = "PROXIMITY VIOLATION!" if violation_detected else "All Clear"
    cv2.putText(frame, status_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
    cv2.putText(frame, f"Persons: {len(person_boxes)}  Violations: {len(violations)}", (20, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"{device_id} - Cam {camera_no}", (20, 85),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    key = f"{device_id}_{camera_no}"
    now = time.time()

    with _state_lock:
        time_elapsed = now - last_save_times.get(key, 0)
        if violation_detected and time_elapsed >= COOLDOWN_TIME:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            import uuid
            uid = str(uuid.uuid4())
            fname = f"{script_name}_{device_id}_{camera_no}_{ts}_{uid}.jpg"
            filename = os.path.join(SAVE_FOLDER, fname)
            cv2.imwrite(filename, frame)
            try:
                from utils.db_client import report_to_db_rtsp
                report_to_db_rtsp(
                    device_id=str(device_id),
                    camera_no=str(camera_no),
                    image_name=fname,
                    folder="proximity_detection",
                )
            except Exception as e:
                logger.error(f"[{device_id}-{camera_no}] Proximity DB reporting error: {e}")
            last_save_times[key] = now
            logger.warning(f"[{device_id}-{camera_no}] 🚨 Proximity violation detected: {filename}")

    return frame, violation_detected, len(violations)

def detect_proximity_batch(items):
    """Run true batch inference."""
    model = get_yolo_model()
    frames = [item['frame'].copy() for item in items]
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        person_boxes = []
        for box in result.boxes:
            if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD:
                person_boxes.append(box.xyxy[0].cpu().numpy())

        violations = []
        for i in range(len(person_boxes)):
            for j in range(i + 1, len(person_boxes)):
                d = calculate_bottom_distance(person_boxes[i], person_boxes[j])
                if d < PROXIMITY_THRESHOLD:
                    violations.append((i, j, d))

        violation_detected = len(violations) > 0
        _annotate_violations(frame, person_boxes, violations)

        ch_no = item.get('ch_no', item.get('camera_id', 'unknown'))

        # Status overlay
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (420, 100), (0, 0, 0), -1)
        cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
        status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
        status_text = "PROXIMITY VIOLATION!" if violation_detected else "All Clear"
        cv2.putText(frame, status_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
        cv2.putText(frame, f"Persons: {len(person_boxes)}  Violations: {len(violations)}", (20, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.putText(frame, f"CH: {ch_no}", (20, 85),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

        outputs.append((frame, violation_detected, len(violations)))

    return outputs
