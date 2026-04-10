import cv2
import time
import os
import logging
import sys

from datetime import datetime
from ultralytics import YOLO

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ================= CONFIG ==================
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# DAV_VIDEO_PATH = os.path.join(
#     PROJECT_ROOT,
#     "NVR_ch19_main_20231206120001_20231206130000.dav"
# )







if len(sys.argv) < 2:
    print("❌ Usage: python3 script.py <video_file>")
    sys.exit(1)

DAV_VIDEO_PATH = sys.argv[1]







MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_results")

MIN_PERSONS = 12
CONF_THRESHOLD = 0.45
COOLDOWN_TIME = 240  # seconds

DEVICE_ID = "DAV_NVR"
CAMERA_NO = "CH19"

os.makedirs(SAVE_FOLDER, exist_ok=True)

# ================= YOLO LOAD ===============
_yolo_model = None

def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        print("Loading YOLO model...")
        _yolo_model = YOLO(MODEL_PATH)
    return _yolo_model

# For backward compatibility
yolo_model = get_yolo_model()

# ================= GLOBAL STATE ============
last_save_times = {}
person_counts = {}

# =====================================================
# SAME FUNCTION LOGIC (UNCHANGED)
# =====================================================
def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="crowd", camera_id_pk=""):
    model = get_yolo_model()
    results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_detections = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
    ]

    person_count = len(person_detections)
    max_conf = float(max([box.conf[0] for box in person_detections], default=0))

    # Draw bounding boxes
    for box in person_detections:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        label = f"Person {conf:.2f}"
        cv2.putText(
            frame, label, (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
        )

    # Overlay info
    cv2.putText(
        frame, f"Persons: {person_count}",
        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
        (0, 255, 0), 2
    )
    cv2.putText(
        frame, f"Device: {device_id}, Cam: {camera_no}",
        (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
        (0, 255, 0), 2
    )

    # Use DB primary key if available
    key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
    now = time.time()
    time_elapsed = now - last_save_times.get(key, 0)

    crowd_detected = person_count >= MIN_PERSONS

    if crowd_detected and time_elapsed >= COOLDOWN_TIME:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Format: {script_name}_{device_id}_{camera_no}_{timestamp}.jpg
        # device_id and camera_no used for lookup in backend
        fname = f"{script_name}_{device_id}_{camera_no}_{timestamp}.jpg"
            
        filename = f"{SAVE_FOLDER}/{fname}"
        cv2.imwrite(filename, frame)
        last_save_times[key] = now
        logging.info(
            f"[pk={camera_id_pk} {device_id} - {camera_no}] 💾 Crowd detected & saved: {filename}"
        )
    elif crowd_detected:
        remaining = int(COOLDOWN_TIME - time_elapsed)
        logging.info(
            f"[{device_id} - {camera_no}] ⏳ Crowd detected "
            f"(cooldown {remaining}s left)"
        )

    person_counts[key] = person_counts.get(key, 0) + person_count
    return frame, crowd_detected, person_count


# =====================================================
# DAV VIDEO PROCESSOR
# =====================================================
def process_dav_video(video_path, device_id, camera_no):
    logging.info(f"[{device_id} - {camera_no}] Opening DAV file")
    logging.info(video_path)

    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        logging.error("❌ DAV video open nahi ho raha")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0

    frame_count = 0
    start_time = time.time()

    logging.info("Starting crowd detection on DAV video")
    logging.info("Press 'q' to quit early")

    while True:
        ret, frame = cap.read()
        if not ret:
            logging.info("✅ DAV video finished")
            break

        frame_count += 1

        if frame_count % 5 == 0:
            processed_frame, crowd_detected, person_count = detect_persons_in_frame(
                frame, device_id, camera_no
            )

            if frame_count % 50 == 0:
                if crowd_detected:
                    logging.info(
                        f"[{device_id} - {camera_no}] 👥 Crowd detected! "
                        f"Count: {person_count}"
                    )
                else:
                    logging.info(
                        f"[{device_id} - {camera_no}] Monitoring... No crowd"
                    )

            cv2.imshow("DAV Crowd Detection", processed_frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

        time.sleep(1)

    cap.release()
    cv2.destroyAllWindows()

    total_time = time.time() - start_time
    logging.info(
        f"[{device_id} - {camera_no}] Finished in {total_time:.2f}s"
    )
    return True


# ===================== MAIN ===========================
def main():
    logging.info("=== DAV Crowd Detection Started ===")

    success = process_dav_video(
        DAV_VIDEO_PATH,
        DEVICE_ID,
        CAMERA_NO
    )

    if success:
        logging.info("✅ Crowd detection completed successfully")
    else:
        logging.error("❌ Crowd detection failed")


if __name__ == "__main__":
    main()

# ================= BATCH DETECTION =================
def detect_persons_batch(items, min_persons=None):
    """
    Truly batched person detection for crowd detection.
    Integrated for high-performance GPU batching.
    """
    if min_persons is None:
        min_persons = MIN_PERSONS

    frames = [item['frame'] for item in items]
    model = get_yolo_model()
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)
    
    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        
        # Filter for person class (0)
        person_detections = [
            box for box in result.boxes 
            if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
        ]
        
        person_count = len(person_detections)
        
        # Draw bounding boxes
        for box in person_detections:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
        detected = person_count >= min_persons
        outputs.append((frame, detected, person_count))
        
    return outputs