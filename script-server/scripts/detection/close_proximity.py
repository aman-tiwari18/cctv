import cv2
import time
import numpy as np
from ultralytics import YOLO
import math
from collections import defaultdict
import os
import logging
import sys


# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

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










MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10x.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/proximity_detection_results")

COOLDOWN_TIME = 90
DEVICE_ID = "DAV_NVR"
CAMERA_NO = "CH19"

os.makedirs(SAVE_FOLDER, exist_ok=True)

# =====================================================
# PROXIMITY DETECTOR (UNCHANGED LOGIC)
# =====================================================
class ProximityDetector:
    def __init__(self, model_path, proximity_threshold=100, confidence_threshold=0.45):
        self.model = YOLO(model_path)
        self.proximity_threshold = proximity_threshold
        self.confidence_threshold = confidence_threshold
        self.alert_cooldown = defaultdict(float)
        self.frame_count = 0

    def get_box_bottom_center(self, box):
        return ((box[0] + box[2]) / 2, box[3])

    def calculate_bottom_distance(self, box1, box2):
        x1, y1 = self.get_box_bottom_center(box1)
        x2, y2 = self.get_box_bottom_center(box2)
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    def detect(self, frame):
        results = self.model(frame, conf=self.confidence_threshold, verbose=False)[0]
        person_boxes = []

        for box in results.boxes:
            if int(box.cls[0]) == 0:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = box.conf[0].cpu().numpy()
                person_boxes.append([x1, y1, x2, y2, conf])

        violations = []
        for i in range(len(person_boxes)):
            for j in range(i + 1, len(person_boxes)):
                d = self.calculate_bottom_distance(
                    person_boxes[i][:4], person_boxes[j][:4]
                )
                if d < self.proximity_threshold:
                    violations.append((i, j, d))

        return person_boxes, violations

# ================= INIT ====================
print("Initializing Proximity Detector...")
detector = ProximityDetector(MODEL_PATH)
proximity_detector = detector  # Alias for worker compatibility

last_save_time = 0

# =====================================================
# DAV PROCESSOR
# =====================================================
def process_dav_video():
    global last_save_time

    cap = cv2.VideoCapture(DAV_VIDEO_PATH, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        logging.error("❌ DAV video open nahi ho raha")
        return

    frame_count = 0
    logging.info("Starting proximity detection on DAV video")

    while True:
        ret, frame = cap.read()
        if not ret:
            logging.info("✅ Video finished")
            break

        frame_count += 1

        # frame skip for performance
        if frame_count % 5 != 0:
            continue

        # resize = speed boost
        frame = cv2.resize(frame, (640, 360))

        boxes, violations = detector.detect(frame)

        # draw boxes
        for i, box in enumerate(boxes):
            x1, y1, x2, y2, conf = box
            color = (0, 0, 255) if any(i in v[:2] for v in violations) else (0, 255, 0)
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)

        # draw violation lines
        for v in violations:
            b1 = boxes[v[0]][:4]
            b2 = boxes[v[1]][:4]
            c1 = detector.get_box_bottom_center(b1)
            c2 = detector.get_box_bottom_center(b2)
            cv2.line(frame, (int(c1[0]), int(c1[1])), (int(c2[0]), int(c2[1])), (0, 0, 255), 2)

        now = time.time()
        if violations and (now - last_save_time) >= COOLDOWN_TIME:
            ts = time.strftime("%Y%m%d_%H%M%S")
            # Standard format: violation_{device_id}_{camera_no}_{ts}.jpg
            filename = f"{SAVE_FOLDER}/violation_{device_id}_{camera_no}_{ts}.jpg"
            cv2.imwrite(filename, frame)
            last_save_time = now
            logging.info(f"💾 Proximity violation saved: {filename}")

        cv2.putText(
            frame,
            f"Persons: {len(boxes)} | Violations: {len(violations)}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2
        )

        cv2.imshow("DAV Proximity Detection", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    logging.info("Proximity detection completed")

# ================= MAIN ====================
if __name__ == "__main__":
    process_dav_video()

# ================= BATCH DETECTION =================
def _detect_violations(person_boxes, proximity_threshold):
    """
    Surgically mirrored logic for batch violation detection.
    Compatible with the unified GPU batching architecture.
    """
    import math
    violations = []
    for i in range(len(person_boxes)):
        for j in range(i + 1, len(person_boxes)):
            box1, box2 = person_boxes[i][:4], person_boxes[j][:4]
            # Use bottom-center of each bounding box
            x1, y1 = (box1[0] + box1[2]) / 2, box1[3]
            x2, y2 = (box2[0] + box2[2]) / 2, box2[3]
            distance = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if distance < proximity_threshold:
                violations.append({
                    'person1': i,
                    'person2': j,
                    'distance': distance,
                    'boxes': (box1, box2),
                })
    return violations

def detect_proximity_batch(items):
    """
    Truly batched proximity detection.
    Called by the unified GPU batch worker.
    """
    model     = detector.model
    conf      = detector.confidence_threshold
    threshold = detector.proximity_threshold
    
    frames = [item['frame'] for item in items]
    results = model(frames, conf=conf, verbose=False)
    
    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        
        person_boxes = []
        if result.boxes is not None:
            for box in result.boxes:
                if int(box.cls[0]) == 0:  # person class
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    conf_score      = box.conf[0].cpu().numpy()
                    person_boxes.append([x1, y1, x2, y2, conf_score])

        violations = _detect_violations(person_boxes, threshold)
        violation_detected = len(violations) > 0
        
        # Consistent output: (processed_frame, detected_flag, count/violations)
        outputs.append((frame, violation_detected, len(violations), person_boxes, violations))
        
    return outputs
