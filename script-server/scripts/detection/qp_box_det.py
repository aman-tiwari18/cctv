import cv2
import time
import os
import logging
import sys
import threading
import torch
import uuid
from datetime import datetime
from ultralytics import YOLO

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "yolov10m.pt")
SAVE_FOLDER = os.path.join(BASE_DIR, "results/qp_box_missing")
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

COOLDOWN_TIME = 240       # Seconds between saves
CONF_THRESHOLD = 0.45     # Confidence for detection
MIN_BOX_AREA = 5000       # Pixels
MAX_BOX_AREA = 200000     # Pixels

# Potential box-like objects (backpack, suitcase, handbag, umbrella, book)
BOX_CLASS_IDS = [24, 25, 26, 28, 73, 84]

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
def detect_qp_box_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="qp_box"):
    """Standalone detection for a single frame."""
    model = get_yolo_model()
    results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    qp_box_found = False
    box_count = 0

    for box in results.boxes:
        class_id = int(box.cls[0])
        conf = float(box.conf[0])
        
        if class_id in BOX_CLASS_IDS and conf >= CONF_THRESHOLD:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            area = (x2 - x1) * (y2 - y1)
            
            if MIN_BOX_AREA <= area <= MAX_BOX_AREA:
                qp_box_found = True
                box_count += 1
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, f"QP Box {conf:.2f}", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    status_text = "QP BOX PRESENT" if qp_box_found else "QP BOX MISSING!"
    status_color = (0, 255, 0) if qp_box_found else (0, 0, 255)
    cv2.putText(frame, status_text, (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
    cv2.putText(frame, f"{device_id} - {camera_no}", (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    key = f"{device_id}_{camera_no}"
    now = time.time()
    
    violation_detected = not qp_box_found

    with _state_lock:
        time_elapsed = now - last_save_times.get(key, 0)
        if violation_detected and time_elapsed >= COOLDOWN_TIME:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
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
                    folder="qp_box_missing",
                )
            except Exception as e:
                logger.error(f"[{device_id}-{camera_no}] QP box DB reporting error: {e}")
            last_save_times[key] = now
            logger.warning(f"[{device_id}-{camera_no}] 🚨 QP BOX MISSING: {filename}")

    return frame, violation_detected, box_count

def detect_qp_box_batch(items):
    """Run true batch inference."""
    model = get_yolo_model()
    frames = [item['frame'].copy() for item in items]
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        qp_box_found = False
        box_count = 0

        for box in result.boxes:
            class_id = int(box.cls[0])
            conf = float(box.conf[0])
            if class_id in BOX_CLASS_IDS and conf >= CONF_THRESHOLD:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                area = (x2 - x1) * (y2 - y1)
                if MIN_BOX_AREA <= area <= MAX_BOX_AREA:
                    qp_box_found = True
                    box_count += 1
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

        violation_detected = not qp_box_found
        status_text = "QP BOX PRESENT" if qp_box_found else "QP BOX MISSING!"
        status_color = (0, 255, 0) if qp_box_found else (0, 0, 255)
        
        ch_no = item.get('ch_no', item.get('camera_id', 'unknown'))
        cv2.putText(frame, status_text, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
        cv2.putText(frame, f"CH: {ch_no}", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        outputs.append((frame, violation_detected, box_count))

    return outputs
