# added by samarth

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

# ================= CONFIG ==================
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# DAV_VIDEO_PATH = os.path.join(
#     PROJECT_ROOT,
#     "NVR_ch19_main_20231206120001_20231206130000.dav"
# )








DAV_VIDEO_PATH = sys.argv[1] if len(sys.argv) > 1 else None








MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_detection_results")

MIN_PERSONS = 2
CONF_THRESHOLD = 0.45
COOLDOWN_TIME = 180  # seconds

DEVICE_ID = "DAV_NVR"
CAMERA_NO = "CH19"

os.makedirs(SAVE_FOLDER, exist_ok=True)

# ================= YOLO ====================
print("Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
_model_lock = threading.Lock()

# ================= STATE ===================
last_save_times = {}
person_counts = {}

# =====================================================
# SAME LOGIC FUNCTION (UNCHANGED)
# =====================================================
def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown",
                            script_name="entry_exit", save=True):
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
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame,
            f"Person {conf:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 255),
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

    entry_exit_detected = person_count >= MIN_PERSONS

    if entry_exit_detected and time_elapsed >= COOLDOWN_TIME and save:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Standard format: {script_name}_{device_id}_{camera_no}_{ts}.jpg
        filename = f"{SAVE_FOLDER}/{script_name}_{device_id}_{camera_no}_{ts}.jpg"
        cv2.imwrite(filename, frame)
        last_save_times[key] = now
        logging.info(f"[{device_id}-{camera_no}] 💾 Entry/Exit detected & saved: {filename}")

    person_counts[key] = person_counts.get(key, 0) + person_count
    return frame, entry_exit_detected, person_count


def get_yolo_model():
    """Return a shared YOLO model instance for worker batch inference."""
    global yolo_model
    if yolo_model is None:
        with _model_lock:
            if yolo_model is None:
                yolo_model = YOLO(MODEL_PATH)
                if torch.cuda.is_available():
                    yolo_model.to('cuda')
    return yolo_model


def detect_persons_batch(items):
    """
    Run true batch inference for entry/exit detection.
    Returns: List[(annotated_frame, entry_exit_detected, person_count)]
    """
    model = get_yolo_model()
    frames = [item['frame'] for item in items]
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        person_boxes = [
            box for box in result.boxes
            if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
        ]
        person_count = len(person_boxes)
        entry_exit_detected = person_count >= MIN_PERSONS

        for box in person_boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            cv2.putText(
                frame,
                f"Person {conf:.2f}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 255),
                2,
            )

        ch_no = item.get('ch_no', item.get('camera_id', 'unknown'))
        cv2.putText(
            frame,
            f"Persons: {person_count}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
        )
        cv2.putText(
            frame,
            f"CH: {ch_no}",
            (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
        )

        outputs.append((frame, entry_exit_detected, person_count))

    return outputs

# =====================================================
# DAV PROCESSOR
# =====================================================
def process_dav_video():
    cap = cv2.VideoCapture(DAV_VIDEO_PATH, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        logging.error("❌ DAV video open nahi ho raha")
        return

    frame_count = 0
    logging.info("Starting Entry/Exit detection on DAV video")

    while True:
        ret, frame = cap.read()
        if not ret:
            logging.info("✅ Video finished")
            break

        frame_count += 1

        # performance optimisation
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
                logging.info(
                    f"[{DEVICE_ID}-{CAMERA_NO}] 👥 Entry/Exit detected, Count={count}"
                )
            else:
                logging.info(
                    f"[{DEVICE_ID}-{CAMERA_NO}] Monitoring... No Entry/Exit"
                )

        cv2.imshow("DAV Entry/Exit Detection", processed_frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    logging.info("Entry/Exit detection completed")

# ================= MAIN ====================
if __name__ == "__main__":
    if DAV_VIDEO_PATH is None:
        print("❌ Usage: python3 script.py <video_file>")
        sys.exit(1)
    process_dav_video()
