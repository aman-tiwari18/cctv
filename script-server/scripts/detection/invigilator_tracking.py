# import os
# import time
# import cv2
# import json
# import random
# import numpy as np
# from collections import deque, OrderedDict
# from ultralytics import YOLO
# from datetime import datetime
# import logging
# import sys


# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# # DAV_VIDEO_PATH = os.path.join(
# #     PROJECT_ROOT,
# #     "NVR_ch19_main_20231206120001_20231206130000.dav"
# # )






# if len(sys.argv) < 2:
#     print("❌ Usage: python3 script.py <video_file>")
#     sys.exit(1)

# DAV_VIDEO_PATH = sys.argv[1]








# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# BASE_DIR = os.path.join(PROJECT_ROOT, "results/invigilator_tracking")

# CAM_NAME = "CH19"
# STREAM_ID = "DAV_STREAM"

# os.makedirs(BASE_DIR, exist_ok=True)

# # ================= TRACKING CLASSES (UNCHANGED LOGIC) =================
# class Track:
#     def __init__(self, track_id, bbox):
#         self.track_id = track_id
#         self.bbox = bbox

#     def update_bbox(self, bbox):
#         self.bbox = bbox


# class Tracker:
#     def __init__(self):
#         self.tracks = []
#         self.track_id_count = 0

#     def update(self, detections, min_height):
#         filtered = [d for d in detections if d[5] >= min_height]

#         if not self.tracks:
#             for d in filtered:
#                 self._add_new_track(d[:4])
#         else:
#             self._update_tracks(filtered)

#     def _add_new_track(self, bbox):
#         self.tracks.append(Track(self.track_id_count, bbox))
#         self.track_id_count += 1

#     def _update_tracks(self, detections):
#         if not detections:
#             self.tracks = []
#             return

#         iou_matrix = np.zeros((len(self.tracks), len(detections)))

#         for i, t in enumerate(self.tracks):
#             for j, d in enumerate(detections):
#                 iou_matrix[i, j] = self._iou(t.bbox, d[:4])

#         matched_tracks = set()
#         matched_dets = set()

#         while True:
#             if np.max(iou_matrix) < 0.3:
#                 break
#             i, j = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
#             matched_tracks.add(i)
#             matched_dets.add(j)
#             self.tracks[i].update_bbox(detections[j][:4])
#             iou_matrix[i, :] = 0
#             iou_matrix[:, j] = 0

#         for j in range(len(detections)):
#             if j not in matched_dets:
#                 self._add_new_track(detections[j][:4])

#         self.tracks = [t for i, t in enumerate(self.tracks) if i in matched_tracks]

#     def _iou(self, b1, b2):
#         x1 = max(b1[0], b2[0])
#         y1 = max(b1[1], b2[1])
#         x2 = min(b1[2], b2[2])
#         y2 = min(b1[3], b2[3])

#         if x2 < x1 or y2 < y1:
#             return 0.0

#         inter = (x2 - x1) * (y2 - y1)
#         a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
#         a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
#         return inter / (a1 + a2 - inter)


# class SimplifiedTracker(Tracker):
#     def __init__(self, cam_name, base_dir):
#         super().__init__()
#         self.cam_name = cam_name
#         self.base_dir = os.path.join(base_dir, cam_name)
#         self.static_dir = os.path.join(self.base_dir, "static_person")
#         self.no_target_dir = os.path.join(self.base_dir, "no_targets")
#         self.annotated_dir = os.path.join(self.base_dir, "annotated")

#         for d in [self.static_dir, self.no_target_dir, self.annotated_dir]:
#             os.makedirs(d, exist_ok=True)

#         self.position_history = {}
#         self.static_status = {}
#         self.static_start = {}
#         self.history_len = 10
#         self.static_thresh = 35
#         self.static_time_thresh = 600
#         self.no_target_time_thresh = 20
#         self.last_no_target = 0
#         self.no_target_start = None
#         self.visibility = {}

#     def update_status(self, track_id, bbox):
#         center = ((bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2)
#         self.position_history.setdefault(track_id, deque(maxlen=self.history_len)).append(center)

#         if len(self.position_history[track_id]) == self.history_len:
#             moves = [
#                 np.linalg.norm(np.subtract(a, b))
#                 for a, b in zip(self.position_history[track_id], list(self.position_history[track_id])[1:])
#             ]
#             static = max(moves) < self.static_thresh
#             prev = self.static_status.get(track_id, False)

#             if static and not prev:
#                 self.static_start[track_id] = time.time()
#             if not static and prev:
#                 self.static_start.pop(track_id, None)

#             self.static_status[track_id] = static

#     def save_frame(self, frame, folder, prefix, source_type="HLS", device_id=None, camera_no=None):
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        
#         # ── Source-Aware Naming Format ──────────────
#         if source_type == "HLS":
#             # [detection]_ch[ch_no]_[timestamp].jpg
#             # Note: prefix (static/no_targets) is included for context
#             ch_no = camera_no or self.cam_name
#             fname = f"invigilator_{prefix}_ch{ch_no}_{ts}.jpg"
#         else:
#             # RTSP: [detection]_[device_id]_[camera_no]_[timestamp].jpg
#             dev_id = device_id or self.cam_name
#             cam_no = camera_no or "0"
#             fname = f"invigilator_{prefix}_{dev_id}_{cam_no}_{ts}.jpg"
            
#         path = os.path.join(folder, fname)
#         cv2.imwrite(path, frame)
#         return path

# # ================= MAIN DAV LOOP =================
# def main():
#     logging.info("Loading YOLO model...")
#     model = YOLO(MODEL_PATH)

#     tracker = SimplifiedTracker(CAM_NAME, BASE_DIR)

#     cap = cv2.VideoCapture(DAV_VIDEO_PATH, cv2.CAP_FFMPEG)
#     if not cap.isOpened():
#         logging.error("❌ DAV video open nahi ho raha")
#         return

#     logging.info("Starting Invigilator Tracking on DAV video")

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             break

#         frame = cv2.resize(frame, (640, 360))
#         display = frame.copy()

#         results = model(frame, verbose=False)[0]
#         detections = []

#         for b in results.boxes.data.tolist():
#             x1, y1, x2, y2, score, cls = b
#             if int(cls) == 0 and score > 0.5:
#                 h = y2 - y1
#                 detections.append([x1, y1, x2, y2, score, h])

#         tracker.update(detections, min_height=250)

#         visible_ids = set()
#         for t in tracker.tracks:
#             visible_ids.add(t.track_id)
#             tracker.update_status(t.track_id, t.bbox)

#             x1, y1, x2, y2 = map(int, t.bbox)
#             color = (0,0,255) if tracker.static_status.get(t.track_id) else (0,255,0)
#             cv2.rectangle(display, (x1,y1), (x2,y2), color, 2)

#             if tracker.static_status.get(t.track_id):
#                 if time.time() - tracker.static_start[t.track_id] > tracker.static_time_thresh:
#                     tracker.save_frame(frame, tracker.static_dir, f"static_{t.track_id}")
#                     tracker.static_start[t.track_id] = time.time()

#         if not visible_ids:
#             if tracker.no_target_start is None:
#                 tracker.no_target_start = time.time()
#             elif time.time() - tracker.no_target_start > tracker.no_target_time_thresh:
#                 tracker.save_frame(frame, tracker.no_target_dir, "no_targets")
#                 tracker.no_target_start = time.time()
#         else:
#             tracker.no_target_start = None

#         cv2.imshow("Invigilator Tracking DAV", display)
#         if cv2.waitKey(1) & 0xFF == ord("q"):
#             break

#     cap.release()
#     cv2.destroyAllWindows()
#     logging.info("Invigilator tracking completed")


# # ================= GPU BATCH INFERENCE =================
# def detect_invigilators_batch(items, model=None, conf_threshold=0.5, min_height=250):
#     """
#     True GPU Batch Inference for Invigilator Tracking.
    
#     Args:
#         items: List of dicts, each containing:
#             'frame': The image to process
#             'camera_id': Identifier for the camera
#             'result_cb': Callback function to handle detections: cb(detections, frame)
#         model: Pre-loaded YOLO model (optional)
#         conf_threshold: Confidence threshold for person detection
#         min_height: Minimum height for a person to be tracked
#     """
#     if not items:
#         return

#     if model is None:
#         # Lazy load if not provided
#         from ultralytics import YOLO
#         model = YOLO(MODEL_PATH)

#     frames = [item['frame'] for item in items]
    
#     try:
#         # Single forward pass for the entire batch
#         results = model(frames, conf=conf_threshold, verbose=False)
#     except Exception as e:
#         print(f"[GPU ERROR][Invigilator] {e}")
#         return

#     for item, result in zip(items, results):
#         detections = []
#         if result.boxes:
#             boxes = result.boxes.data.tolist()
#             for r in boxes:
#                 x1, y1, x2, y2, score, class_id = r
#                 if score >= conf_threshold and int(class_id) == 0:
#                     h = int(y2 - y1)
#                     if h >= min_height:
#                         detections.append([int(x1), int(y1), int(x2), int(y2), score, h])
        
#         # Trigger the callback for this specific camera/frame
#         try:
#             # Pass the detections, the frame, AND the entire item (for source_type/device_id)
#             item['result_cb'](detections, item['frame'], item)
#         except Exception as e:
#             print(f"[CALLBACK ERROR][Invigilator] {item.get('camera_id')}: {e}")

# if __name__ == "__main__":
#     main()




import os
import time
import cv2
import json
import random
import numpy as np
from collections import deque, OrderedDict
from ultralytics import YOLO
from datetime import datetime
import logging
import sys
import pymysql
import re


# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# ================= CONFIG ==================
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# DAV_VIDEO_PATH = os.path.join(
#     PROJECT_ROOT,
#     "NVR_ch19_main_20231206120001_20231206130000.dav"
# )






# Moved to a main() block replacement later








MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
BASE_DIR = os.path.join(PROJECT_ROOT, "results/tcs_detections/invigilator_detection")

# ================= DB CONFIG =================
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "rootpassword123",
    "database": "cctv_monitoring",
    "cursorclass": pymysql.cursors.DictCursor
}

def report_to_db_hls(ch_code, image_name, folder="invigilator_detection"):
    """
    Look up camera info by ch_code and report detection to camera_report_hls.
    """
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        log_file = os.path.join(script_dir, "../db_reports.log")
        
        with open(log_file, "a") as f:
            f.write(f"\n--- New Invigilator Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
            f.write(f"Image: {image_name} | Passed ch_code: {ch_code}\n")

        if not str(ch_code).isdigit():
            match = re.search(r'_ch(\d+)_', image_name)
            if match:
                ch_code = match.group(1)
                with open(log_file, "a") as f: f.write(f"Extracted ch_code from filename: {ch_code}\n")

        exam_id = os.environ.get("EXAM_ID")
        shift_id = os.environ.get("SHIFT_ID")
        
        if not exam_id:
            msg = "[DB-REPORT] ❌ ERROR: EXAM_ID not found in environment.\n"
            logging.error(msg)
            with open(log_file, "a") as f: f.write(msg)
            return False

        ts_match = re.search(r'(\d{8}_\d{6})', image_name)
        if ts_match:
            raw_ts = ts_match.group(1)
            dt_obj = datetime.strptime(raw_ts, "%Y%m%d_%H%M%S")
            date_time = dt_obj.strftime("%d/%m/%Y %H:%M:%S")
        else:
            date_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

        connection = pymysql.connect(**DB_CONFIG)
        try:
            with connection.cursor() as cursor:
                query = """
                    SELECT * FROM camera_links_hls 
                    WHERE ch_code = %s AND exam_id = %s
                    AND (shift_id = %s OR shift_id IS NULL)
                    LIMIT 1
                """
                cursor.execute(query, (ch_code, exam_id, shift_id))
                cam = cursor.fetchone()

                if not cam:
                    msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (invigilator) for ch_code={ch_code}, exam_id={exam_id}\n"
                    logging.error(msg)
                    with open(log_file, "a") as f: f.write(msg)
                    return False

                camera_name = cam.get('camera_name', '')
                parts = camera_name.split('/')
                report_camera_id = f"{parts[0]}_{parts[2]}" if len(parts) >= 3 else camera_name
                status_raw = str(cam.get('status', '')).lower()
                camera_status = "Online" if status_raw == 'accessible' else "Offline"
                image_url = f"http://www.examscctvmonitoring.com/cctv_dev/serve-detection-images/{folder}/{image_name}"

                insert_query = """
                    INSERT INTO camera_report_hls (
                        exam_id, shift_id, city, center_name, camera_id, 
                        camera_name, camera_category, tc_code, ch_code, 
                        state, camera_status, events, date_time, 
                        imageurl, detection_type
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(insert_query, (
                    cam.get('exam_id'), cam.get('shift_id'), cam.get('city'),
                    cam.get('centre_name'), report_camera_id, camera_name,
                    cam.get('camera_category'), cam.get('tc_code'), ch_code,
                    cam.get('state'), camera_status, 1, date_time, image_url, folder
                ))
                connection.commit()
                msg = f"[DB-REPORT] ✅ SUCCESS: Inserted invigilator report for ch_code {ch_code}\n"
                logging.info(msg)
                with open(log_file, "a") as f: f.write(msg)
                return True
        finally:
            connection.close()
    except Exception as e:
        msg = f"[DB-REPORT] ❌ FATAL ERROR: {e}\n"
        logging.error(msg)
        with open(log_file, "a") as f: f.write(msg)
        return False

CAM_NAME = "CH19"
STREAM_ID = "DAV_STREAM"

os.makedirs(BASE_DIR, exist_ok=True)

# ================= TRACKING CLASSES (UNCHANGED LOGIC) =================
class Track:
    def __init__(self, track_id, bbox):
        self.track_id = track_id
        self.bbox = bbox

    def update_bbox(self, bbox):
        self.bbox = bbox


class Tracker:
    def __init__(self):
        self.tracks = []
        self.track_id_count = 0

    def update(self, detections, min_height):
        filtered = [d for d in detections if d[5] >= min_height]

        if not self.tracks:
            for d in filtered:
                self._add_new_track(d[:4])
        else:
            self._update_tracks(filtered)

    def _add_new_track(self, bbox):
        self.tracks.append(Track(self.track_id_count, bbox))
        self.track_id_count += 1

    def _update_tracks(self, detections):
        if not detections:
            self.tracks = []
            return

        iou_matrix = np.zeros((len(self.tracks), len(detections)))

        for i, t in enumerate(self.tracks):
            for j, d in enumerate(detections):
                iou_matrix[i, j] = self._iou(t.bbox, d[:4])

        matched_tracks = set()
        matched_dets = set()

        while True:
            if np.max(iou_matrix) < 0.3:
                break
            i, j = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
            matched_tracks.add(i)
            matched_dets.add(j)
            self.tracks[i].update_bbox(detections[j][:4])
            iou_matrix[i, :] = 0
            iou_matrix[:, j] = 0

        for j in range(len(detections)):
            if j not in matched_dets:
                self._add_new_track(detections[j][:4])

        self.tracks = [t for i, t in enumerate(self.tracks) if i in matched_tracks]

    def _iou(self, b1, b2):
        x1 = max(b1[0], b2[0])
        y1 = max(b1[1], b2[1])
        x2 = min(b1[2], b2[2])
        y2 = min(b1[3], b2[3])

        if x2 < x1 or y2 < y1:
            return 0.0

        inter = (x2 - x1) * (y2 - y1)
        a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
        a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
        return inter / (a1 + a2 - inter)


class SimplifiedTracker(Tracker):
    def __init__(self, cam_name, base_dir):
        super().__init__()
        self.cam_name = cam_name
        self.base_dir = os.path.join(base_dir, cam_name)
        self.static_dir = os.path.join(self.base_dir, "static_person")
        self.no_target_dir = os.path.join(self.base_dir, "no_targets")
        self.annotated_dir = os.path.join(self.base_dir, "annotated")

        for d in [self.static_dir, self.no_target_dir, self.annotated_dir]:
            os.makedirs(d, exist_ok=True)

        self.position_history = {}
        self.static_status = {}
        self.static_start = {}
        self.history_len = 10
        self.static_thresh = 35
        self.static_time_thresh = 600
        self.no_target_time_thresh = 20
        self.last_no_target = 0
        self.no_target_start = None
        self.visibility = {}

    def update_status(self, track_id, bbox):
        center = ((bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2)
        self.position_history.setdefault(track_id, deque(maxlen=self.history_len)).append(center)

        if len(self.position_history[track_id]) == self.history_len:
            moves = [
                np.linalg.norm(np.subtract(a, b))
                for a, b in zip(self.position_history[track_id], list(self.position_history[track_id])[1:])
            ]
            static = max(moves) < self.static_thresh
            prev = self.static_status.get(track_id, False)

            if static and not prev:
                self.static_start[track_id] = time.time()
            if not static and prev:
                self.static_start.pop(track_id, None)

            self.static_status[track_id] = static

    def save_frame(self, frame, folder, prefix, source_type="HLS", device_id=None, camera_no=None):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # ── Source-Aware Naming Format ──────────────
        if source_type == "HLS":
            # [detection]_ch[ch_no]_[timestamp].jpg
            # Note: prefix (static/no_targets) is included for context
            ch_no = camera_no or self.cam_name
            fname = f"invigilator_{prefix}_ch{ch_no}_{ts}.jpg"
        else:
            # RTSP: [detection]_[device_id]_[camera_no]_[timestamp].jpg
            dev_id = device_id or self.cam_name
            cam_no = camera_no or "0"
            fname = f"invigilator_{prefix}_{dev_id}_{cam_no}_{ts}.jpg"
            
        path = os.path.join(folder, fname)
        cv2.imwrite(path, frame)
        return path

# ================= MAIN DAV LOOP =================
def main():
    if len(sys.argv) < 2:
        print("❌ Usage: python3 script.py <video_file>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    logging.info("Loading YOLO model...")
    model = YOLO(MODEL_PATH)

    tracker = SimplifiedTracker(CAM_NAME, BASE_DIR)

    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        logging.error(f"❌ DAV video open nahi ho raha: {video_path}")
        return

    logging.info("Starting Invigilator Tracking on DAV video")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.resize(frame, (640, 360))
        display = frame.copy()

        results = model(frame, verbose=False)[0]
        detections = []

        for b in results.boxes.data.tolist():
            x1, y1, x2, y2, score, cls = b
            if int(cls) == 0 and score > 0.5:
                h = y2 - y1
                detections.append([x1, y1, x2, y2, score, h])

        tracker.update(detections, min_height=250)

        visible_ids = set()
        for t in tracker.tracks:
            visible_ids.add(t.track_id)
            tracker.update_status(t.track_id, t.bbox)

            x1, y1, x2, y2 = map(int, t.bbox)
            color = (0,0,255) if tracker.static_status.get(t.track_id) else (0,255,0)
            cv2.rectangle(display, (x1,y1), (x2,y2), color, 2)

            if tracker.static_status.get(t.track_id):
                if time.time() - tracker.static_start[t.track_id] > tracker.static_time_thresh:
                    tracker.save_frame(frame, tracker.static_dir, f"static_{t.track_id}")
                    tracker.static_start[t.track_id] = time.time()

        if not visible_ids:
            if tracker.no_target_start is None:
                tracker.no_target_start = time.time()
            elif time.time() - tracker.no_target_start > tracker.no_target_time_thresh:
                tracker.save_frame(frame, tracker.no_target_dir, "no_targets")
                tracker.no_target_start = time.time()
        else:
            tracker.no_target_start = None

        cv2.imshow("Invigilator Tracking DAV", display)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    logging.info("Invigilator tracking completed")


# ================= GPU BATCH INFERENCE =================
def detect_invigilators_batch(items, model=None, conf_threshold=0.5, min_height=250):
    """
    True GPU Batch Inference for Invigilator Tracking.
    
    Args:
        items: List of dicts, each containing:
            'frame': The image to process
            'camera_id': Identifier for the camera
            'result_cb': Callback function to handle detections: cb(detections, frame)
        model: Pre-loaded YOLO model (optional)
        conf_threshold: Confidence threshold for person detection
        min_height: Minimum height for a person to be tracked
    """
    if not items:
        return

    if model is None:
        # Lazy load if not provided
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH)

    frames = [item['frame'] for item in items]
    
    try:
        # Single forward pass for the entire batch
        results = model(frames, conf=conf_threshold, verbose=False)
    except Exception as e:
        print(f"[GPU ERROR][Invigilator] {e}")
        return

    for item, result in zip(items, results):
        detections = []
        if result.boxes:
            boxes = result.boxes.data.tolist()
            for r in boxes:
                x1, y1, x2, y2, score, class_id = r
                if score >= conf_threshold and int(class_id) == 0:
                    h = int(y2 - y1)
                    if h >= min_height:
                        detections.append([int(x1), int(y1), int(x2), int(y2), score, h])
        
        # Trigger the callback for this specific camera/frame
        try:
            # Pass the detections, the frame, AND the entire item (for source_type/device_id)
            item['result_cb'](detections, item['frame'], item)
        except Exception as e:
            print(f"[CALLBACK ERROR][Invigilator] {item.get('camera_id')}: {e}")

if __name__ == "__main__":
    main()