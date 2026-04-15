# # import cv2
# # import time
# # import numpy as np
# # from ultralytics import YOLO
# # import math
# # from collections import defaultdict
# # import os
# # import logging
# # import sys
# # import threading

# # # ================= LOGGING =================
# # logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # # ================= CONFIG ==================
# # DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
# # PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

# # MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10x.pt")
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/proximity_detection_results")

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # DEFAULT_PROXIMITY_THRESHOLD = 100
# # DEFAULT_CONFIDENCE_THRESHOLD = 0.45

# # # ================= CORE DETECTOR =================
# # class ProximityDetector:
# #     def __init__(self, model_path=None, proximity_threshold=100, confidence_threshold=0.45):
# #         m_path = model_path or MODEL_PATH
# #         if not os.path.exists(m_path):
# #             logging.error(f"Proximity model not found at {m_path}")
# #             self.model = None
# #         else:
# #             logging.info(f"Loading Proximity model: {m_path}")
# #             self.model = YOLO(m_path)
            
# #         self.proximity_threshold = proximity_threshold
# #         self.confidence_threshold = confidence_threshold
# #         self.alert_cooldown = defaultdict(float)
# #         self.frame_count = 0

# #     def get_box_bottom_center(self, box):
# #         # box: [x1, y1, x2, y2]
# #         return ((box[0] + box[2]) / 2, box[3])

# #     def calculate_bottom_distance(self, box1, box2):
# #         x1, y1 = self.get_box_bottom_center(box1)
# #         x2, y2 = self.get_box_bottom_center(box2)
# #         return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

# #     def detect(self, frame):
# #         if self.model is None: return [], []
        
# #         results = self.model(frame, conf=self.confidence_threshold, verbose=False)[0]
# #         person_boxes = []

# #         for box in results.boxes:
# #             if int(box.cls[0]) == 0:
# #                 x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
# #                 conf = box.conf[0].cpu().numpy()
# #                 person_boxes.append([x1, y1, x2, y2, conf])

# #         violations = []
# #         for i in range(len(person_boxes)):
# #             for j in range(i + 1, len(person_boxes)):
# #                 d = self.calculate_bottom_distance(
# #                     person_boxes[i][:4], person_boxes[j][:4]
# #                 )
# #                 if d < self.proximity_threshold:
# #                     violations.append({
# #                         'person1': i,
# #                         'person2': j,
# #                         'distance': d,
# #                         'boxes': (person_boxes[i][:4], person_boxes[j][:4])
# #                     })

# #         return person_boxes, violations

# # # ================= SHARED INSTANCE =================
# # _detector = None
# # _detector_lock = threading.Lock()

# # def get_proximity_detector():
# #     global _detector
# #     if _detector is None:
# #         with _detector_lock:
# #             if _detector is None:
# #                 _detector = ProximityDetector()
# #     return _detector

# # # For backward compatibility
# # detector = get_proximity_detector()
# # proximity_detector = detector

# # # ================= BATCH DETECTION =================
# # def detect_proximity_batch(items):
# #     """
# #     Truly batched proximity detection.
# #     Used by the unified GPU batch worker.
# #     """
# #     det_obj = get_proximity_detector()
# #     if det_obj.model is None:
# #         return [(item['frame'], False, 0, [], []) for item in items]
        
# #     frames = [item['frame'] for item in items]
# #     results = det_obj.model(frames, conf=det_obj.confidence_threshold, verbose=False)
    
# #     outputs = []
# #     for item, result in zip(items, results):
# #         frame = item['frame'].copy()
        
# #         person_boxes = []
# #         if result.boxes is not None:
# #             for box in result.boxes:
# #                 if int(box.cls[0]) == 0:  # person class
# #                     x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
# #                     conf_score      = box.conf[0].cpu().numpy()
# #                     person_boxes.append([x1, y1, x2, y2, conf_score])

# #         violations = []
# #         for i in range(len(person_boxes)):
# #             for j in range(i + 1, len(person_boxes)):
# #                 d = det_obj.calculate_bottom_distance(person_boxes[i][:4], person_boxes[j][:4])
# #                 if d < det_obj.proximity_threshold:
# #                     violations.append({
# #                         'person1': i,
# #                         'person2': j,
# #                         'distance': d,
# #                         'boxes': (person_boxes[i][:4], person_boxes[j][:4])
# #                     })

# #         violation_detected = len(violations) > 0
# #         outputs.append((frame, violation_detected, len(violations), person_boxes, violations))
        
# #     return outputs




# import cv2
# import time
# import numpy as np
# from ultralytics import YOLO
# import math
# from collections import defaultdict
# import os
# import logging
# import sys
# import threading
# import pymysql
# import re
# from datetime import datetime

# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # ================= CONFIG ==================
# DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

# MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10x.pt")
# SAVE_FOLDER = os.path.join(DETECTION_ROOT, "results/tcs_detections/proximity_detection")

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# DEFAULT_PROXIMITY_THRESHOLD = 100
# DEFAULT_CONFIDENCE_THRESHOLD = 0.45

# # ================= CORE DETECTOR =================
# class ProximityDetector:
#     def __init__(self, model_path=None, proximity_threshold=100, confidence_threshold=0.45):
#         m_path = model_path or MODEL_PATH
#         if not os.path.exists(m_path):
#             logging.error(f"Proximity model not found at {m_path}")
#             self.model = None
#         else:
#             logging.info(f"Loading Proximity model: {m_path}")
#             self.model = YOLO(m_path)
            
#         self.proximity_threshold = proximity_threshold
#         self.confidence_threshold = confidence_threshold
#         self.alert_cooldown = defaultdict(float)
#         self.frame_count = 0

#     def get_box_bottom_center(self, box):
#         # box: [x1, y1, x2, y2]
#         return ((box[0] + box[2]) / 2, box[3])

#     def calculate_bottom_distance(self, box1, box2):
#         x1, y1 = self.get_box_bottom_center(box1)
#         x2, y2 = self.get_box_bottom_center(box2)
#         return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

#     def detect(self, frame):
#         if self.model is None: return [], []
        
#         results = self.model(frame, conf=self.confidence_threshold, verbose=False)[0]
#         person_boxes = []

#         for box in results.boxes:
#             if int(box.cls[0]) == 0:
#                 x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
#                 conf = box.conf[0].cpu().numpy()
#                 person_boxes.append([x1, y1, x2, y2, conf])

#         violations = []
#         for i in range(len(person_boxes)):
#             for j in range(i + 1, len(person_boxes)):
#                 d = self.calculate_bottom_distance(
#                     person_boxes[i][:4], person_boxes[j][:4]
#                 )
#                 if d < self.proximity_threshold:
#                     violations.append({
#                         'person1': i,
#                         'person2': j,
#                         'distance': d,
#                         'boxes': (person_boxes[i][:4], person_boxes[j][:4])
#                     })

#         return person_boxes, violations

# # ================= SHARED INSTANCE =================
# _detector = None
# _detector_lock = threading.Lock()

# def get_proximity_detector():
#     global _detector
#     if _detector is None:
#         with _detector_lock:
#             if _detector is None:
#                 _detector = ProximityDetector()
#     return _detector

# # For backward compatibility
# detector = get_proximity_detector()
# proximity_detector = detector

# # ================= BATCH DETECTION =================
# def detect_proximity_batch(items):
#     """
#     Truly batched proximity detection.
#     Used by the unified GPU batch worker.
#     """
#     det_obj = get_proximity_detector()
#     if det_obj.model is None:
#         return [(item['frame'], False, 0, [], []) for item in items]
        
#     frames = [item['frame'] for item in items]
#     results = det_obj.model(frames, conf=det_obj.confidence_threshold, verbose=False)
    
#     outputs = []
#     for item, result in zip(items, results):
#         frame = item['frame'].copy()
        
#         person_boxes = []
#         if result.boxes is not None:
#             for box in result.boxes:
#                 if int(box.cls[0]) == 0:  # person class
#                     x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
#                     conf_score      = box.conf[0].cpu().numpy()
#                     person_boxes.append([x1, y1, x2, y2, conf_score])

#         violations = []
#         for i in range(len(person_boxes)):
#             for j in range(i + 1, len(person_boxes)):
#                 d = det_obj.calculate_bottom_distance(person_boxes[i][:4], person_boxes[j][:4])
#                 if d < det_obj.proximity_threshold:
#                     violations.append({
#                         'person1': i,
#                         'person2': j,
#                         'distance': d,
#                         'boxes': (person_boxes[i][:4], person_boxes[j][:4])
#                     })

#         violation_detected = len(violations) > 0
#         outputs.append((frame, violation_detected, len(violations), person_boxes, violations))
        
#     return outputs


# # ================= DB CONFIG =================
# DB_CONFIG = {
#     "host": "localhost",
#     "user": "root",
#     "password": "rootpassword123",
#     "database": "cctv_monitoring",
#     "cursorclass": pymysql.cursors.DictCursor
# }

# def report_to_db_hls(ch_code, image_name, folder="proximity_detection"):
#     """
#     Look up camera info by ch_code and report detection to camera_report_hls.
#     Specifically for HLS detections.
#     """
#     try:
#         # 0. Get the project root based on this script's location
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         log_file = os.path.join(script_dir, "../../db_reports.log")
        
#         with open(log_file, "a") as f:
#             f.write(f"\n--- New Proximity Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
#             f.write(f"Image: {image_name} | Passed ch_code: {ch_code}\n")

#         # 0.1 Try to extract a numeric ch_code from the image_name if the passed one is generic
#         if not str(ch_code).isdigit():
#             match = re.search(r'_ch(\d+)_', image_name)
#             if match:
#                 ch_code = match.group(1)
#                 with open(log_file, "a") as f: f.write(f"Extracted ch_code from filename: {ch_code}\n")

#         # 1. Get metadata from Env
#         exam_id = os.environ.get("EXAM_ID")
#         shift_id = os.environ.get("SHIFT_ID")
        
#         if not exam_id:
#             msg = "[DB-REPORT] ❌ ERROR: EXAM_ID not found in environment. Detection NOT saved to DB.\n"
#             logging.error(msg)
#             with open(log_file, "a") as f: f.write(msg)
#             return False

#         # 2. Extract timestamp from filename
#         ts_match = re.search(r'(\d{8}_\d{6})', image_name)
#         if ts_match:
#             raw_ts = ts_match.group(1)
#             dt_obj = datetime.strptime(raw_ts, "%Y%m%d_%H%M%S")
#             date_time = dt_obj.strftime("%d/%m/%Y %H:%M:%S")
#         else:
#             date_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

#         # 3. Connection and Lookup
#         connection = pymysql.connect(**DB_CONFIG)
#         try:
#             with connection.cursor() as cursor:
#                 # Search camera_links_hls
#                 query = """
#                     SELECT * FROM camera_links_hls 
#                     WHERE ch_code = %s AND exam_id = %s
#                     AND (shift_id = %s OR shift_id IS NULL)
#                     LIMIT 1
#                 """
#                 cursor.execute(query, (ch_code, exam_id, shift_id))
#                 cam = cursor.fetchone()

#                 if not cam:
#                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (proximity) for ch_code={ch_code}, exam_id={exam_id}, shift_id={shift_id}\n"
#                     logging.error(msg)
#                     with open(log_file, "a") as f: f.write(msg)
#                     return False

#                 # 4. Prepare Report Data
#                 camera_name = cam.get('camera_name', '')
#                 parts = camera_name.split('/')
#                 report_camera_id = f"{parts[0]}_{parts[2]}" if len(parts) >= 3 else camera_name
#                 status_raw = str(cam.get('status', '')).lower()
#                 camera_status = "Online" if status_raw == 'accessible' else "Offline"
#                 image_url = f"http://www.examscctvmonitoring.com/cctv_dev/serve-detection-images/{folder}/{image_name}"

#                 # 5. Insert into camera_report_hls
#                 insert_query = """
#                     INSERT INTO camera_report_hls (
#                         exam_id, shift_id, city, center_name, camera_id, 
#                         camera_name, camera_category, tc_code, ch_code, 
#                         state, camera_status, events, date_time, 
#                         imageurl, detection_type
#                     ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
#                 """
#                 cursor.execute(insert_query, (
#                     cam.get('exam_id'), cam.get('shift_id'), cam.get('city'),
#                     cam.get('centre_name'), report_camera_id, camera_name,
#                     cam.get('camera_category'), cam.get('tc_code'), ch_code,
#                     cam.get('state'), camera_status, 1, date_time, image_url, folder
#                 ))
#                 connection.commit()
#                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted proximity report for ch_code {ch_code} (Camera: {report_camera_id})\n"
#                 logging.info(msg)
#                 with open(log_file, "a") as f: f.write(msg)
#                 return True
#         finally:
#             connection.close()
#     except Exception as e:
#         msg = f"[DB-REPORT] ❌ FATAL ERROR: {e}\n"
#         logging.error(msg)
#         with open(log_file, "a") as f: f.write(msg)
#         return False




# changes on 15-04-2026

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
import pymysql
import re
from datetime import datetime

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ================= CONFIG ==================
DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10x.pt")
SAVE_FOLDER = os.path.join(DETECTION_ROOT, "results/tcs_detections/proximity_detection")

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


# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402

