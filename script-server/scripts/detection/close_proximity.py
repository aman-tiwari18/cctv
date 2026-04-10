import cv2
import time
import numpy as np
from ultralytics import YOLO
import math
from collections import defaultdict
import os
import logging
import sys
import threading

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ================= CONFIG ==================
DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10x.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/proximity_detection_results")

os.makedirs(SAVE_FOLDER, exist_ok=True)

DEFAULT_PROXIMITY_THRESHOLD = 100
DEFAULT_CONFIDENCE_THRESHOLD = 0.45

# ================= CORE DETECTOR =================
class ProximityDetector:
    def __init__(self, model_path=None, proximity_threshold=100, confidence_threshold=0.45):
        m_path = model_path or MODEL_PATH
        if not os.path.exists(m_path):
            logging.error(f"Proximity model not found at {m_path}")
            self.model = None
        else:
            logging.info(f"Loading Proximity model: {m_path}")
            self.model = YOLO(m_path)
            
        self.proximity_threshold = proximity_threshold
        self.confidence_threshold = confidence_threshold
        self.alert_cooldown = defaultdict(float)
        self.frame_count = 0

    def get_box_bottom_center(self, box):
        # box: [x1, y1, x2, y2]
        return ((box[0] + box[2]) / 2, box[3])

    def calculate_bottom_distance(self, box1, box2):
        x1, y1 = self.get_box_bottom_center(box1)
        x2, y2 = self.get_box_bottom_center(box2)
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    def detect(self, frame):
        if self.model is None: return [], []
        
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
                    violations.append({
                        'person1': i,
                        'person2': j,
                        'distance': d,
                        'boxes': (person_boxes[i][:4], person_boxes[j][:4])
                    })

        return person_boxes, violations

# ================= SHARED INSTANCE =================
_detector = None
_detector_lock = threading.Lock()

def get_proximity_detector():
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = ProximityDetector()
    return _detector

# For backward compatibility
detector = get_proximity_detector()
proximity_detector = detector

# ================= BATCH DETECTION =================
def detect_proximity_batch(items):
    """
    Truly batched proximity detection.
    Used by the unified GPU batch worker.
    """
    det_obj = get_proximity_detector()
    if det_obj.model is None:
        return [(item['frame'], False, 0, [], []) for item in items]
        
    frames = [item['frame'] for item in items]
    results = det_obj.model(frames, conf=det_obj.confidence_threshold, verbose=False)
    
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

        violations = []
        for i in range(len(person_boxes)):
            for j in range(i + 1, len(person_boxes)):
                d = det_obj.calculate_bottom_distance(person_boxes[i][:4], person_boxes[j][:4])
                if d < det_obj.proximity_threshold:
                    violations.append({
                        'person1': i,
                        'person2': j,
                        'distance': d,
                        'boxes': (person_boxes[i][:4], person_boxes[j][:4])
                    })

        violation_detected = len(violations) > 0
        outputs.append((frame, violation_detected, len(violations), person_boxes, violations))
        
    return outputs