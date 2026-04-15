# # import cv2
# # import time
# # import os
# # import logging
# # import sys

# # from datetime import datetime
# # from ultralytics import YOLO

# # # ================= LOGGING =================
# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s - %(levelname)s - %(message)s"
# # )

# # # ================= CONFIG ==================
# # PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# # # DAV_VIDEO_PATH = os.path.join(
# # #     PROJECT_ROOT,
# # #     "NVR_ch19_main_20231206120001_20231206130000.dav"
# # # )







# # if len(sys.argv) < 2:
# #     print("❌ Usage: python3 script.py <video_file>")
# #     sys.exit(1)

# # DAV_VIDEO_PATH = sys.argv[1]







# # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_results")

# # MIN_PERSONS = 12
# # CONF_THRESHOLD = 0.45
# # COOLDOWN_TIME = 240  # seconds

# # DEVICE_ID = "DAV_NVR"
# # CAMERA_NO = "CH19"

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO LOAD ===============
# # _yolo_model = None

# # def get_yolo_model():
# #     global _yolo_model
# #     if _yolo_model is None:
# #         print("Loading YOLO model...")
# #         _yolo_model = YOLO(MODEL_PATH)
# #     return _yolo_model

# # # For backward compatibility
# # yolo_model = get_yolo_model()

# # # ================= GLOBAL STATE ============
# # last_save_times = {}
# # person_counts = {}

# # # =====================================================
# # # SAME FUNCTION LOGIC (UNCHANGED)
# # # =====================================================
# # def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="crowd", camera_id_pk=""):
# #     model = get_yolo_model()
# #     results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     person_detections = [
# #         box for box in results.boxes
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# #     ]

# #     person_count = len(person_detections)
# #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# #     # Draw bounding boxes
# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         label = f"Person {conf:.2f}"
# #         cv2.putText(
# #             frame, label, (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
# #         )

# #     # Overlay info
# #     cv2.putText(
# #         frame, f"Persons: {person_count}",
# #         (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
# #         (0, 255, 0), 2
# #     )
# #     cv2.putText(
# #         frame, f"Device: {device_id}, Cam: {camera_no}",
# #         (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
# #         (0, 255, 0), 2
# #     )

# #     # Use DB primary key if available
# #     key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# #     now = time.time()
# #     time_elapsed = now - last_save_times.get(key, 0)

# #     crowd_detected = person_count >= MIN_PERSONS

# #     if crowd_detected and time_elapsed >= COOLDOWN_TIME:
# #         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         # Format: {script_name}_{device_id}_{camera_no}_{timestamp}.jpg
# #         # device_id and camera_no used for lookup in backend
# #         fname = f"{script_name}_{device_id}_{camera_no}_{timestamp}.jpg"
            
# #         filename = f"{SAVE_FOLDER}/{fname}"
# #         cv2.imwrite(filename, frame)
# #         last_save_times[key] = now
# #         logging.info(
# #             f"[pk={camera_id_pk} {device_id} - {camera_no}] 💾 Crowd detected & saved: {filename}"
# #         )
# #     elif crowd_detected:
# #         remaining = int(COOLDOWN_TIME - time_elapsed)
# #         logging.info(
# #             f"[{device_id} - {camera_no}] ⏳ Crowd detected "
# #             f"(cooldown {remaining}s left)"
# #         )

# #     person_counts[key] = person_counts.get(key, 0) + person_count
# #     return frame, crowd_detected, person_count


# # # =====================================================
# # # DAV VIDEO PROCESSOR
# # # =====================================================
# # def process_dav_video(video_path, device_id, camera_no):
# #     logging.info(f"[{device_id} - {camera_no}] Opening DAV file")
# #     logging.info(video_path)

# #     cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)

# #     if not cap.isOpened():
# #         logging.error("❌ DAV video open nahi ho raha")
# #         return False

# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0

# #     frame_count = 0
# #     start_time = time.time()

# #     logging.info("Starting crowd detection on DAV video")
# #     logging.info("Press 'q' to quit early")

# #     while True:
# #         ret, frame = cap.read()
# #         if not ret:
# #             logging.info("✅ DAV video finished")
# #             break

# #         frame_count += 1

# #         if frame_count % 5 == 0:
# #             processed_frame, crowd_detected, person_count = detect_persons_in_frame(
# #                 frame, device_id, camera_no
# #             )

# #             if frame_count % 50 == 0:
# #                 if crowd_detected:
# #                     logging.info(
# #                         f"[{device_id} - {camera_no}] 👥 Crowd detected! "
# #                         f"Count: {person_count}"
# #                     )
# #                 else:
# #                     logging.info(
# #                         f"[{device_id} - {camera_no}] Monitoring... No crowd"
# #                     )

# #             cv2.imshow("DAV Crowd Detection", processed_frame)

# #         if cv2.waitKey(1) & 0xFF == ord('q'):
# #             break

# #         time.sleep(1)

# #     cap.release()
# #     cv2.destroyAllWindows()

# #     total_time = time.time() - start_time
# #     logging.info(
# #         f"[{device_id} - {camera_no}] Finished in {total_time:.2f}s"
# #     )
# #     return True


# # # ===================== MAIN ===========================
# # def main():
# #     logging.info("=== DAV Crowd Detection Started ===")

# #     success = process_dav_video(
# #         DAV_VIDEO_PATH,
# #         DEVICE_ID,
# #         CAMERA_NO
# #     )

# #     if success:
# #         logging.info("✅ Crowd detection completed successfully")
# #     else:
# #         logging.error("❌ Crowd detection failed")


# # if __name__ == "__main__":
# #     main()

# # # ================= BATCH DETECTION =================
# # def detect_persons_batch(items, min_persons=None):
# #     """
# #     Truly batched person detection for crowd detection.
# #     Integrated for high-performance GPU batching.
# #     """
# #     if min_persons is None:
# #         min_persons = MIN_PERSONS

# #     frames = [item['frame'] for item in items]
# #     model = get_yolo_model()
# #     results = model(frames, conf=CONF_THRESHOLD, verbose=False)
    
# #     outputs = []
# #     for item, result in zip(items, results):
# #         frame = item['frame'].copy()
        
# #         # Filter for person class (0)
# #         person_detections = [
# #             box for box in result.boxes 
# #             if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
# #         ]
        
# #         person_count = len(person_detections)
        
# #         # Draw bounding boxes
# #         for box in person_detections:
# #             x1, y1, x2, y2 = map(int, box.xyxy[0])
# #             cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
# #         detected = person_count >= min_persons
# #         outputs.append((frame, detected, person_count))
        
# #     return outputs



# import cv2
# import time
# import os
# import logging
# import sys

# from datetime import datetime
# import pymysql
# import re
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# # DAV_VIDEO_PATH = os.path.join(
# #     PROJECT_ROOT,
# #     "NVR_ch19_main_20231206120001_20231206130000.dav"
# # )







# # DAV_VIDEO_PATH will be set in main() if run as a script
# DAV_VIDEO_PATH = None







# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/crowd_detection")

# MIN_PERSONS = 12
# CONF_THRESHOLD = 0.45
# COOLDOWN_TIME = 240  # seconds

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO LOAD ===============
# _yolo_model = None

# def get_yolo_model():
#     global _yolo_model
#     if _yolo_model is None:
#         print("Loading YOLO model...")
#         _yolo_model = YOLO(MODEL_PATH)
#     return _yolo_model

# # For backward compatibility
# yolo_model = get_yolo_model()

# # ================= GLOBAL STATE ============
# last_save_times = {}
# person_counts = {}

# # =====================================================
# # SAME FUNCTION LOGIC (UNCHANGED)
# # =====================================================
# def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="crowd", camera_id_pk=""):
#     model = get_yolo_model()
#     results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

#     # Draw bounding boxes
#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         label = f"Person {conf:.2f}"
#         cv2.putText(
#             frame, label, (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
#         )

#     # Overlay info
#     cv2.putText(
#         frame, f"Persons: {person_count}",
#         (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
#         (0, 255, 0), 2
#     )
#     cv2.putText(
#         frame, f"Device: {device_id}, Cam: {camera_no}",
#         (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
#         (0, 255, 0), 2
#     )

#     # Use DB primary key if available
#     key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
#     now = time.time()
#     time_elapsed = now - last_save_times.get(key, 0)

#     crowd_detected = person_count >= MIN_PERSONS

#     if crowd_detected and time_elapsed >= COOLDOWN_TIME:
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         # Format: {script_name}_{device_id}_{camera_no}_{timestamp}.jpg
#         # device_id and camera_no used for lookup in backend
#         fname = f"{script_name}_{device_id}_{camera_no}_{timestamp}.jpg"
            
#         filename = f"{SAVE_FOLDER}/{fname}"
#         cv2.imwrite(filename, frame)
#         last_save_times[key] = now
#         logging.info(
#             f"[pk={camera_id_pk} {device_id} - {camera_no}] 💾 Crowd detected & saved: {filename}"
#         )
#     elif crowd_detected:
#         remaining = int(COOLDOWN_TIME - time_elapsed)
#         logging.info(
#             f"[{device_id} - {camera_no}] ⏳ Crowd detected "
#             f"(cooldown {remaining}s left)"
#         )

#     person_counts[key] = person_counts.get(key, 0) + person_count
#     return frame, crowd_detected, person_count


# # =====================================================
# # DAV VIDEO PROCESSOR
# # =====================================================
# def process_dav_video(video_path, device_id, camera_no):
#     logging.info(f"[{device_id} - {camera_no}] Opening DAV file")
#     logging.info(video_path)

#     cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG)

#     if not cap.isOpened():
#         logging.error("❌ DAV video open nahi ho raha")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     frame_count = 0
#     start_time = time.time()

#     logging.info("Starting crowd detection on DAV video")
#     logging.info("Press 'q' to quit early")

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             logging.info("✅ DAV video finished")
#             break

#         frame_count += 1

#         if frame_count % 5 == 0:
#             processed_frame, crowd_detected, person_count = detect_persons_in_frame(
#                 frame, device_id, camera_no
#             )

#             if frame_count % 50 == 0:
#                 if crowd_detected:
#                     logging.info(
#                         f"[{device_id} - {camera_no}] 👥 Crowd detected! "
#                         f"Count: {person_count}"
#                     )
#                 else:
#                     logging.info(
#                         f"[{device_id} - {camera_no}] Monitoring... No crowd"
#                     )

#             cv2.imshow("DAV Crowd Detection", processed_frame)

#         if cv2.waitKey(1) & 0xFF == ord('q'):
#             break

#         time.sleep(1)

#     cap.release()
#     cv2.destroyAllWindows()

#     total_time = time.time() - start_time
#     logging.info(
#         f"[{device_id} - {camera_no}] Finished in {total_time:.2f}s"
#     )
#     return True


# # ===================== MAIN ===========================
# def main():
#     global DAV_VIDEO_PATH
#     if len(sys.argv) < 2:
#         print("❌ Usage: python3 script.py <video_file>")
#         sys.exit(1)
    
#     DAV_VIDEO_PATH = sys.argv[1]
    
#     logging.info("=== DAV Crowd Detection Started ===")

#     success = process_dav_video(
#         DAV_VIDEO_PATH,
#         DEVICE_ID,
#         CAMERA_NO
#     )

#     if success:
#         logging.info("✅ Crowd detection completed successfully")
#     else:
#         logging.error("❌ Crowd detection failed")


# if __name__ == "__main__":
#     main()


# # ================= DB CONFIG =================
# DB_CONFIG = {
#     "host": "localhost",
#     "user": "root",
#     "password": "rootpassword123",
#     "database": "cctv_monitoring",
#     "cursorclass": pymysql.cursors.DictCursor
# }

# def report_to_db_hls(ch_code, image_name, folder="crowd_detection"):
#     """
#     Look up camera info by ch_code and report detection to camera_report_hls.
#     Specifically for HLS detections.
#     """
#     try:
#         # 0. Get the project root based on this script's location
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         log_file = os.path.join(script_dir, "../../db_reports.log")
        
#         with open(log_file, "a") as f:
#             f.write(f"\n--- New Crowd Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
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
#                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (crowd) for ch_code={ch_code}, exam_id={exam_id}, shift_id={shift_id}\n"
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
#                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted crowd report for ch_code {ch_code} (Camera: {report_camera_id})\n"
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

# # ================= BATCH DETECTION =================
# def detect_persons_batch(items, min_persons=None):
#     """
#     Truly batched person detection for crowd detection.
#     Integrated for high-performance GPU batching.
#     """
#     if min_persons is None:
#         min_persons = MIN_PERSONS

#     frames = [item['frame'] for item in items]
#     model = get_yolo_model()
#     results = model(frames, conf=CONF_THRESHOLD, verbose=False)
    
#     outputs = []
#     for item, result in zip(items, results):
#         frame = item['frame'].copy()
        
#         # Filter for person class (0)
#         person_detections = [
#             box for box in result.boxes 
#             if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
#         ]
        
#         person_count = len(person_detections)
        
#         # Draw bounding boxes
#         for box in person_detections:
#             x1, y1, x2, y2 = map(int, box.xyxy[0])
#             cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
#         detected = person_count >= min_persons
#         outputs.append((frame, detected, person_count))
        
#     return outputs


# changes on 15-04-2026

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







# DAV_VIDEO_PATH will be set in main() if run as a script
DAV_VIDEO_PATH = None







MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/crowd_detection")

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
    global DAV_VIDEO_PATH
    if len(sys.argv) < 2:
        print("❌ Usage: python3 script.py <video_file>")
        sys.exit(1)
    
    DAV_VIDEO_PATH = sys.argv[1]
    
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


# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402


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