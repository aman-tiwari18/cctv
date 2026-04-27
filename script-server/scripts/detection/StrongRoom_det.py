import cv2
import time
import os
import logging
import sys
from datetime import datetime
import pymysql
import re
from ultralytics import YOLO

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ================= CONFIG ==================
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# DAV_VIDEO_PATH will be set when running as a script
DAV_VIDEO_PATH = None

MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/strongroom_detection")

MIN_PERSONS = 0  # Detect any movement/person
CONF_THRESHOLD = 0.3
COOLDOWN_TIME = 0

DEVICE_ID = "DAV_NVR"
CAMERA_NO = "CH_STRONGROOM"

os.makedirs(SAVE_FOLDER, exist_ok=True)

# ================= YOLO ====================
print("Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)

# ================= STATE ===================
last_save_times = {}
person_counts = {}

# =====================================================
# DETECTION FUNCTION
# =====================================================
def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
    results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_detections = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
    ]

    person_count = len(person_detections)
    max_conf = float(max([box.conf[0] for box in person_detections], default=0))

    for box in person_detections:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(
            frame,
            f"Person {conf:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2
        )

    cv2.putText(
        frame,
        f"Persons: {person_count}",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2
    )
    cv2.putText(
        frame,
        f"Device: {device_id}, Cam: {camera_no}",
        (10, 60),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2
    )

    key = f"{device_id}_{camera_no}"
    now = time.time()
    time_elapsed = now - last_save_times.get(key, 0)

    movement_detected = person_count > MIN_PERSONS

    if movement_detected and time_elapsed >= COOLDOWN_TIME:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Format: strongroom_{device_id}_{camera_no}_{ts}.jpg
        filename = f"{SAVE_FOLDER}/strongroom_{device_id}_{camera_no}_{ts}.jpg"
        cv2.imwrite(filename, frame)
        last_save_times[key] = now
        logging.info(f"[{device_id}-{camera_no}] 🚨 Movement detected & saved: {filename}")

    person_counts[key] = person_counts.get(key, 0) + person_count
    return frame, movement_detected, person_count


# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402


# =====================================================
# DAV PROCESSOR
# =====================================================
def process_dav_video():
    global DAV_VIDEO_PATH
    if not DAV_VIDEO_PATH:
        if len(sys.argv) < 2:
            print("❌ Usage: python3 script.py <video_file>")
            sys.exit(1)
        DAV_VIDEO_PATH = sys.argv[1]

    cap = cv2.VideoCapture(DAV_VIDEO_PATH, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        logging.error("❌ DAV video could not be opened")
        return

    frame_count = 0
    logging.info("Starting Strong Room Movement detection on DAV video")

    while True:
        ret, frame = cap.read()
        if not ret:
            logging.info("✅ Video finished")
            break

        frame_count += 1

        # performance optimization
        if frame_count % 5 != 0:
            continue

        frame = cv2.resize(frame, (640, 360))

        processed_frame, detected, count = detect_persons_in_frame(
            frame,
            DEVICE_ID,
            CAMERA_NO
        )

        if frame_count % 50 == 0:
            if detected:
                logging.warning(
                    f"[{DEVICE_ID}-{CAMERA_NO}] 🚨 Movement detected! Count={count}"
                )
            else:
                logging.info(
                    f"[{DEVICE_ID}-{CAMERA_NO}] Monitoring... No movement"
                )

        cv2.imshow("Strong Room Movement Detection", processed_frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    logging.info("Strong Room Movement detection completed")

# ================= MAIN ====================
if __name__ == "__main__":
    process_dav_video()
