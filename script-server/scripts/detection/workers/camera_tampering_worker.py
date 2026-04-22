# # # # workers/camera_tampering_worker.py
# # # """
# # # Camera Tampering Worker — HLS only (pure OpenCV, CPU-based).

# # # Detects camera tampering via frame analysis:
# # #   - Brightness check  → "Camera Blocked"
# # #   - Blur score (Laplacian variance) → "Camera Blurred"
# # #   - Edge density → "Camera Covered"

# # # No GPU or ML model required — runs entirely on CPU.
# # # Based on: tcs_camera_tampering_detection.py
# # # """

# # # import os
# # # import sys
# # # import time
# # # import cv2
# # # import logging
# # # import threading
# # # import signal
# # # import numpy as np
# # # from datetime import datetime

# # # # ================= GRACEFUL STOP FLAG =================
# # # _STOP_EVENT = threading.Event()

# # # def _handle_stop(sig, frame):
# # #     _STOP_EVENT.set()

# # # if threading.current_thread() is threading.main_thread():
# # #     signal.signal(signal.SIGINT,  _handle_stop)
# # #     signal.signal(signal.SIGTERM, _handle_stop)

# # # # ================= LOGGING =================
# # # logging.basicConfig(
# # #     level=logging.INFO,
# # #     format="%(asctime)s - %(levelname)s - %(message)s"
# # # )
# # # logger = logging.getLogger(__name__)

# # # # ================= PATH SETUP =================
# # # _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # # if _DETECTION_ROOT not in sys.path:
# # #     sys.path.insert(0, _DETECTION_ROOT)

# # # _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# # # if _PROJECT_ROOT not in sys.path:
# # #     sys.path.insert(0, _PROJECT_ROOT)

# # # # ================= CONFIG ==================
# # # HLS_SAVE_FOLDER = os.path.join(
# # #     _DETECTION_ROOT, "results/tcs_detections/camera_tampering_detection"
# # # )
# # # os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

# # # THREAD_DELAY  = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
# # # COOLDOWN_TIME = int(os.environ.get("TAMPER_COOLDOWN_SEC", "45"))
# # # SAMPLE_EVERY  = int(os.environ.get("TAMPER_SAMPLE_EVERY", "5"))

# # # # ================= IMPORTS =================
# # # from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# # # from tcs_scheduler import frame_should_process

# # # # ================= SHARED STATE ============
# # # _last_save_time = {}
# # # _state_lock = threading.Lock()


# # # # =====================================================
# # # # 🔍 TAMPERING DETECTION (pure OpenCV, CPU-only)
# # # # =====================================================
# # # def _detect_camera_tampering(frame):
# # #     """
# # #     Detect tampering via brightness / blur / edge density.
# # #     Returns (status, brightness, blur_score, edge_density).
# # #     status ∈ {"Normal", "Camera Blocked", "Camera Blurred", "Camera Covered"}
# # #     """
# # #     resized    = cv2.resize(frame, (320, 240))
# # #     brightness = np.mean(resized)
# # #     gray       = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
# # #     blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
# # #     edges      = cv2.Canny(gray, 50, 150)
# # #     edge_density = np.sum(edges > 0) / (320 * 240)

# # #     if brightness < 60:
# # #         return "Camera Blocked", brightness, blur_score, edge_density
# # #     if blur_score < 300:
# # #         return "Camera Blurred", brightness, blur_score, edge_density
# # #     if edge_density < 0.03:
# # #         return "Camera Covered", brightness, blur_score, edge_density
# # #     return "Normal", brightness, blur_score, edge_density


# # # # =====================================================
# # # # 📡 CAMERA THREAD
# # # # =====================================================
# # # def _hls_camera_thread(cfg, stop_event):
# # #     """Per-camera HLS reader — detects tampering directly on CPU."""
# # #     camera_id   = cfg['camera_id']
# # #     ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
# # #     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

# # #     hls = extract_hls_streaming_url(initial_url)
# # #     if not hls or not test_hls_stream(hls):
# # #         logger.error(f"[TamperingWorker] ❌ Stream failed for {camera_id}")
# # #         return

# # #     cap = open_hls_stream(hls)
# # #     if cap is None:
# # #         logger.error(f"[TamperingWorker] ❌ Could not open stream for {camera_id}")
# # #         return

# # #     logger.info(f"[TamperingWorker] 🟢 Camera thread started → {camera_id}")

# # #     frame_count = 0
# # #     while not stop_event.is_set():
# # #         ret, frame = cap.read()
# # #         if not ret:
# # #             break

# # #         frame_count += 1
# # #         if not frame_should_process(frame_count, SAMPLE_EVERY):
# # #             continue

# # #         try:
# # #             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)

# # #             if status != "Normal":
# # #                 now = time.time()
# # #                 with _state_lock:
# # #                     if now - _last_save_time.get(camera_id, 0) < COOLDOWN_TIME:
# # #                         continue
# # #                     _last_save_time[camera_id] = now

# # #                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# # #                 # HLS: tampering_ch[ch_no]_[timestamp].jpg
# # #                 filename = os.path.join(HLS_SAVE_FOLDER, f"tampering_ch{ch_no}_{ts}.jpg")
# # #                 cv2.imwrite(filename, frame)
# # #                 logger.warning(
# # #                     f"[TamperingWorker] ⚠️ {status} | {camera_id} "
# # #                     f"bright={brightness:.1f} blur={blur_score:.1f} "
# # #                     f"edge={edge_density:.3f} → {filename}"
# # #                 )
# # #         except Exception as e:
# # #             logger.error(f"[TamperingWorker] {camera_id} → {e}")
# # #         finally:
# # #             del frame

# # #     cap.release()
# # #     logger.info(f"[TamperingWorker] 🔴 Camera thread stopped → {camera_id}")


# # # # =====================================================
# # # # 📡 RTSP WORKER (queue-based, receives frames from producer)
# # # # =====================================================
# # # RTSP_SAVE_FOLDER = os.path.join(
# # #     _DETECTION_ROOT, "results/camera_tampering_detection"
# # # )
# # # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)


# # # def camera_tampering_worker(frame_queue):
# # #     """
# # #     RTSP Worker — Asynchronous CPU architecture.
# # #     Uses a ThreadPoolExecutor to handle OpenCV-based tampering detection
# # #     without blocking the main frame queue.
# # #     """
# # #     logger.info("🟢 [TamperingWorker] RTSP batch-worker started")
# # #     from concurrent.futures import ThreadPoolExecutor
    
# # #     def process_frame(packet):
# # #         if isinstance(packet, dict):
# # #             frame = packet.get("frame")
# # #             device_id = str(packet.get("device_id", "unknown"))
# # #             camera_no = str(packet.get("camera_no") or packet.get("ch_no") or "0")
# # #             camera_id_pk = str(packet.get("camera_id_pk", ""))
# # #         elif len(packet) == 4:
# # #             frame, device_id, camera_no, camera_id_pk = packet
# # #         else:
# # #             frame, device_id, camera_no = packet
# # #             camera_id_pk = ""

# # #         if frame is None:
# # #             return

# # #         try:
# # #             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)
# # #             if status != "Normal":
# # #                 key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# # #                 log_key = f"{device_id}_{camera_no}"
# # #                 now = time.time()
# # #                 with _state_lock:
# # #                     if now - _last_save_time.get(key, 0) < COOLDOWN_TIME:
# # #                         return
# # #                     _last_save_time[key] = now

# # #                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# # #                 # RTSP: tampering_[device_id]_[camera_no]_[timestamp].jpg
# # #                 dev_id = camera_id_pk or device_id
# # #                 fname = f"tampering_{dev_id}_{camera_no}_{ts}.jpg"
# # #                 filename = os.path.join(RTSP_SAVE_FOLDER, fname)
# # #                 cv2.imwrite(filename, frame)
# # #                 logger.warning(
# # #                     f"[TamperingWorker] ⚠️ {status} | pk={camera_id_pk} {log_key} "
# # #                     f"bright={brightness:.1f} blur={blur_score:.1f} "
# # #                     f"edge={edge_density:.3f} → {filename}"
# # #                 )
# # #         except Exception as e:
# # #             logger.error(f"[TamperingWorker] Processing error: {e}")
# # #         finally:
# # #             del frame

# # #     # Use a thread pool to handle CPU detections asynchronously
# # #     with ThreadPoolExecutor(max_workers=8) as executor:
# # #         while True:
# # #             packet = frame_queue.get()
# # #             if packet is None:
# # #                 logger.info("🔴 [TamperingWorker] RTSP batch-worker stopping")
# # #                 break
            
# # #             # Submit task to executor
# # #             executor.submit(process_frame, packet)

# # #     logger.info("🔴 [TamperingWorker] worker shut down")


# # # # =====================================================
# # # # 📡 HLS WORKER ENTRY POINT
# # # # =====================================================
# # # def camera_tampering_worker_hls(camera_configs, stop_event=None):
# # #     """
# # #     HLS worker entry point for camera tampering detection.
# # #     Pure OpenCV — no GPU or ML model needed.
# # #     Accepts a LIST of camera configs or a single dict.
# # #     """
# # #     if isinstance(camera_configs, dict):
# # #         camera_configs = [camera_configs]

# # #     persistent_mode = stop_event is None
# # #     if stop_event is None:
# # #         stop_event = _STOP_EVENT

# # #     # Require at least a valid stream URL
# # #     filtered_configs = [
# # #         cfg for cfg in camera_configs
# # #         if cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
# # #     ]

# # #     if not filtered_configs:
# # #         logger.warning("[TamperingWorker][HLS] No cameras with valid URLs. Skipping.")
# # #         return

# # #     camera_configs = filtered_configs

# # #     # Start per-camera threads using ThreadPoolExecutor for scaling
# # #     from concurrent.futures import ThreadPoolExecutor
# # #     cv2.setNumThreads(0) # Prevent thread explosion
# # #     with ThreadPoolExecutor(max_workers=64) as executor:
# # #         for cfg in camera_configs:
# # #             executor.submit(_hls_camera_thread, cfg, stop_event)
# # #             time.sleep(THREAD_DELAY)

# # #     logger.info(f"[TamperingWorker][HLS] Started {total} camera threads (pure CPU)")

# # #     try:
# # #         stop_event.wait()
# # #     except KeyboardInterrupt:
# # #         stop_event.set()

# # #     if persistent_mode:
# # #         logger.info("[TamperingWorker][HLS] ✅ Camera threads completed")
# # #         return

# # #     stop_event.set()
# # #     logger.info("[TamperingWorker][HLS] ✅ All cameras completed")




# # # workers/camera_tampering_worker.py
# # """
# # Camera Tampering Worker — HLS only (pure OpenCV, CPU-based).

# # Detects camera tampering via frame analysis:
# #   - Brightness check  → "Camera Blocked"
# #   - Blur score (Laplacian variance) → "Camera Blurred"
# #   - Edge density → "Camera Covered"

# # No GPU or ML model required — runs entirely on CPU.
# # Based on: tcs_camera_tampering_detection.py
# # """

# # import os
# # import sys
# # import time
# # import cv2
# # import logging
# # import threading
# # import signal
# # import numpy as np
# # import pymysql
# # import re
# # from datetime import datetime

# # # ================= GRACEFUL STOP FLAG =================
# # _STOP_EVENT = threading.Event()

# # def _handle_stop(sig, frame):
# #     _STOP_EVENT.set()

# # if threading.current_thread() is threading.main_thread():
# #     signal.signal(signal.SIGINT,  _handle_stop)
# #     signal.signal(signal.SIGTERM, _handle_stop)

# # # ================= LOGGING =================
# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s - %(levelname)s - %(message)s"
# # )
# # logger = logging.getLogger(__name__)

# # # ================= PATH SETUP =================
# # _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # if _DETECTION_ROOT not in sys.path:
# #     sys.path.insert(0, _DETECTION_ROOT)

# # _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# # if _PROJECT_ROOT not in sys.path:
# #     sys.path.insert(0, _PROJECT_ROOT)

# # # ================= CONFIG ==================
# # HLS_SAVE_FOLDER = os.path.join(
# #     _DETECTION_ROOT, "results/tcs_detections/camera_tampering_detection"
# # )
# # os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

# # THREAD_DELAY  = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
# # COOLDOWN_TIME = int(os.environ.get("TAMPER_COOLDOWN_SEC", "45"))
# # SAMPLE_EVERY  = int(os.environ.get("TAMPER_SAMPLE_EVERY", "5"))

# # # ================= IMPORTS =================
# # from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# # from tcs_scheduler import frame_should_process

# # # ================= SHARED STATE ============
# # _last_save_time = {}
# # _state_lock = threading.Lock()

# # # ================= DB CONFIG =================
# # DB_CONFIG = {
# #     "host": "localhost",
# #     "user": "root",
# #     "password": "rootpassword123",
# #     "database": "cctv_monitoring",
# #     "cursorclass": pymysql.cursors.DictCursor
# # }

# # def report_to_db_hls(ch_code, image_name, folder="camera_tampering_detection"):
# #     """
# #     Look up camera info by ch_code and report detection to camera_report_hls.
# #     Specifically for HLS detections.
# #     """
# #     try:
# #         # 0. Get the project root based on this script's location
# #         script_dir = os.path.dirname(os.path.abspath(__file__))
# #         log_file = os.path.join(script_dir, "../../db_reports.log")
        
# #         with open(log_file, "a") as f:
# #             f.write(f"\n--- New Tampering Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
# #             f.write(f"Image: {image_name} | Passed ch_code: {ch_code}\n")

# #         # 0.1 Try to extract a numeric ch_code from the image_name if the passed one is generic
# #         if not str(ch_code).isdigit():
# #             match = re.search(r'_ch(\d+)_', image_name)
# #             if match:
# #                 ch_code = match.group(1)
# #                 with open(log_file, "a") as f: f.write(f"Extracted ch_code from filename: {ch_code}\n")

# #         # 1. Get metadata from Env
# #         exam_id = os.environ.get("EXAM_ID")
# #         shift_id = os.environ.get("SHIFT_ID")
        
# #         if not exam_id:
# #             msg = "[DB-REPORT] ❌ ERROR: EXAM_ID not found in environment. Detection NOT saved to DB.\n"
# #             logging.error(msg)
# #             with open(log_file, "a") as f: f.write(msg)
# #             return False

# #         # 2. Extract timestamp from filename
# #         ts_match = re.search(r'(\d{8}_\d{6})', image_name)
# #         if ts_match:
# #             raw_ts = ts_match.group(1)
# #             dt_obj = datetime.strptime(raw_ts, "%Y%m%d_%H%M%S")
# #             date_time = dt_obj.strftime("%d/%m/%Y %H:%M:%S")
# #         else:
# #             date_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

# #         # 3. Connection and Lookup
# #         connection = pymysql.connect(**DB_CONFIG)
# #         try:
# #             with connection.cursor() as cursor:
# #                 # Search camera_links_hls
# #                 query = """
# #                     SELECT * FROM camera_links_hls 
# #                     WHERE ch_code = %s AND exam_id = %s
# #                     AND (shift_id = %s OR shift_id IS NULL)
# #                     LIMIT 1
# #                 """
# #                 cursor.execute(query, (ch_code, exam_id, shift_id))
# #                 cam = cursor.fetchone()

# #                 if not cam:
# #                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (tampering) for ch_code={ch_code}, exam_id={exam_id}, shift_id={shift_id}\n"
# #                     logging.error(msg)
# #                     with open(log_file, "a") as f: f.write(msg)
# #                     return False

# #                 # 4. Prepare Report Data
# #                 camera_name = cam.get('camera_name', '')
# #                 parts = camera_name.split('/')
# #                 report_camera_id = f"{parts[0]}_{parts[2]}" if len(parts) >= 3 else camera_name
# #                 status_raw = str(cam.get('status', '')).lower()
# #                 camera_status = "Online" if status_raw == 'accessible' else "Offline"
# #                 image_url = f"http://www.examscctvmonitoring.com/cctv_dev/serve-detection-images/{folder}/{image_name}"

# #                 # 5. Insert into camera_report_hls
# #                 insert_query = """
# #                     INSERT INTO camera_report_hls (
# #                         exam_id, shift_id, city, center_name, camera_id, 
# #                         camera_name, camera_category, tc_code, ch_code, 
# #                         state, camera_status, events, date_time, 
# #                         imageurl, detection_type
# #                     ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
# #                 """
# #                 cursor.execute(insert_query, (
# #                     cam.get('exam_id'), cam.get('shift_id'), cam.get('city'),
# #                     cam.get('centre_name'), report_camera_id, camera_name,
# #                     cam.get('camera_category'), cam.get('tc_code'), ch_code,
# #                     cam.get('state'), camera_status, 1, date_time, image_url, folder
# #                 ))
# #                 connection.commit()
# #                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted tampering report for ch_code {ch_code} (Camera: {report_camera_id})\n"
# #                 logging.info(msg)
# #                 with open(log_file, "a") as f: f.write(msg)
# #                 return True
# #         finally:
# #             connection.close()
# #     except Exception as e:
# #         msg = f"[DB-REPORT] ❌ FATAL ERROR: {e}\n"
# #         logging.error(msg)
# #         with open(log_file, "a") as f: f.write(msg)
# #         return False


# # # =====================================================
# # # 🔍 TAMPERING DETECTION (pure OpenCV, CPU-only)
# # # =====================================================
# # def _detect_camera_tampering(frame):
# #     """
# #     Detect tampering via brightness / blur / edge density.
# #     Returns (status, brightness, blur_score, edge_density).
# #     status ∈ {"Normal", "Camera Blocked", "Camera Blurred", "Camera Covered"}
# #     """
# #     resized    = cv2.resize(frame, (320, 240))
# #     brightness = np.mean(resized)
# #     gray       = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
# #     blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
# #     edges      = cv2.Canny(gray, 50, 150)
# #     edge_density = np.sum(edges > 0) / (320 * 240)

# #     if brightness < 60:
# #         return "Camera Blocked", brightness, blur_score, edge_density
# #     if blur_score < 300:
# #         return "Camera Blurred", brightness, blur_score, edge_density
# #     if edge_density < 0.03:
# #         return "Camera Covered", brightness, blur_score, edge_density
# #     return "Normal", brightness, blur_score, edge_density


# # # =====================================================
# # # 📡 CAMERA THREAD
# # # =====================================================
# # def _hls_camera_thread(cfg, stop_event):
# #     """Per-camera HLS reader — detects tampering directly on CPU."""
# #     camera_id   = cfg['camera_id']
# #     ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
# #     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

# #     hls = extract_hls_streaming_url(initial_url)
# #     if not hls or not test_hls_stream(hls):
# #         logger.error(f"[TamperingWorker] ❌ Stream failed for {camera_id}")
# #         return

# #     cap = open_hls_stream(hls)
# #     if cap is None:
# #         logger.error(f"[TamperingWorker] ❌ Could not open stream for {camera_id}")
# #         return

# #     logger.info(f"[TamperingWorker] 🟢 Camera thread started → {camera_id}")

# #     frame_count = 0
# #     while not stop_event.is_set():
# #         ret, frame = cap.read()
# #         if not ret:
# #             break

# #         frame_count += 1
# #         if not frame_should_process(frame_count, SAMPLE_EVERY):
# #             continue

# #         try:
# #             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)

# #             if status != "Normal":
# #                 now = time.time()
# #                 with _state_lock:
# #                     if now - _last_save_time.get(camera_id, 0) < COOLDOWN_TIME:
# #                         continue
# #                     _last_save_time[camera_id] = now

# #                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #                 # HLS: tampering_ch[ch_no]_[timestamp].jpg
# #                 filename = os.path.join(HLS_SAVE_FOLDER, f"tampering_ch{ch_no}_{ts}.jpg")
# #                 cv2.imwrite(filename, frame)
# #                 logger.warning(
# #                     f"[TamperingWorker] ⚠️ {status} | {camera_id} "
# #                     f"bright={brightness:.1f} blur={blur_score:.1f} "
# #                     f"edge={edge_density:.3f} → {filename}"
# #                 )

# #                 # --- Report to DB ---
# #                 try:
# #                     report_to_db_hls(
# #                         ch_code=str(ch_no), 
# #                         image_name=os.path.basename(filename),
# #                         folder="camera_tampering_detection"
# #                     )
# #                 except Exception as e:
# #                     logger.error(f"[TamperingWorker] DB Reporting Error: {e}")
# #         except Exception as e:
# #             logger.error(f"[TamperingWorker] {camera_id} → {e}")
# #         finally:
# #             del frame

# #     cap.release()
# #     logger.info(f"[TamperingWorker] 🔴 Camera thread stopped → {camera_id}")


# # # =====================================================
# # # 📡 RTSP WORKER (queue-based, receives frames from producer)
# # # =====================================================
# # RTSP_SAVE_FOLDER = os.path.join(
# #     _DETECTION_ROOT, "results/camera_tampering_detection"
# # )
# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)


# # def camera_tampering_worker(frame_queue):
# #     """
# #     RTSP Worker — Asynchronous CPU architecture.
# #     Uses a ThreadPoolExecutor to handle OpenCV-based tampering detection
# #     without blocking the main frame queue.
# #     """
# #     logger.info("🟢 [TamperingWorker] RTSP batch-worker started")
# #     from concurrent.futures import ThreadPoolExecutor
    
# #     def process_frame(packet):
# #         if isinstance(packet, dict):
# #             frame = packet.get("frame")
# #             device_id = str(packet.get("device_id", "unknown"))
# #             camera_no = str(packet.get("camera_no") or packet.get("ch_no") or "0")
# #             camera_id_pk = str(packet.get("camera_id_pk", ""))
# #         elif len(packet) == 4:
# #             frame, device_id, camera_no, camera_id_pk = packet
# #         else:
# #             frame, device_id, camera_no = packet
# #             camera_id_pk = ""

# #         if frame is None:
# #             return

# #         try:
# #             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)
# #             if status != "Normal":
# #                 key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# #                 log_key = f"{device_id}_{camera_no}"
# #                 now = time.time()
# #                 with _state_lock:
# #                     if now - _last_save_time.get(key, 0) < COOLDOWN_TIME:
# #                         return
# #                     _last_save_time[key] = now

# #                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #                 # RTSP: tampering_[device_id]_[camera_no]_[timestamp].jpg
# #                 dev_id = camera_id_pk or device_id
# #                 fname = f"tampering_{dev_id}_{camera_no}_{ts}.jpg"
# #                 filename = os.path.join(RTSP_SAVE_FOLDER, fname)
# #                 cv2.imwrite(filename, frame)
# #                 logger.warning(
# #                     f"[TamperingWorker] ⚠️ {status} | pk={camera_id_pk} {log_key} "
# #                     f"bright={brightness:.1f} blur={blur_score:.1f} "
# #                     f"edge={edge_density:.3f} → {filename}"
# #                 )
# #         except Exception as e:
# #             logger.error(f"[TamperingWorker] Processing error: {e}")
# #         finally:
# #             del frame

# #     # Use a thread pool to handle CPU detections asynchronously
# #     with ThreadPoolExecutor(max_workers=8) as executor:
# #         while True:
# #             packet = frame_queue.get()
# #             if packet is None:
# #                 logger.info("🔴 [TamperingWorker] RTSP batch-worker stopping")
# #                 break
            
# #             # Submit task to executor
# #             executor.submit(process_frame, packet)

# #     logger.info("🔴 [TamperingWorker] worker shut down")


# # # =====================================================
# # # 📡 HLS WORKER ENTRY POINT
# # # =====================================================
# # def camera_tampering_worker_hls(camera_configs, stop_event=None):
# #     """
# #     HLS worker entry point for camera tampering detection.
# #     Pure OpenCV — no GPU or ML model needed.
# #     Accepts a LIST of camera configs or a single dict.
# #     """
# #     if isinstance(camera_configs, dict):
# #         camera_configs = [camera_configs]

# #     persistent_mode = stop_event is None
# #     if stop_event is None:
# #         stop_event = _STOP_EVENT

# #     # Require at least a valid stream URL
# #     filtered_configs = [
# #         cfg for cfg in camera_configs
# #         if cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
# #     ]

# #     if not filtered_configs:
# #         logger.warning("[TamperingWorker][HLS] No cameras with valid URLs. Skipping.")
# #         return

# #     camera_configs = filtered_configs

# #     # Start per-camera threads using ThreadPoolExecutor for scaling
# #     from concurrent.futures import ThreadPoolExecutor
# #     cv2.setNumThreads(0) # Prevent thread explosion
# #     with ThreadPoolExecutor(max_workers=64) as executor:
# #         for cfg in camera_configs:
# #             executor.submit(_hls_camera_thread, cfg, stop_event)
# #             time.sleep(THREAD_DELAY)

# #     logger.info(f"[TamperingWorker][HLS] Started {total} camera threads (pure CPU)")

# #     try:
# #         stop_event.wait()
# #     except KeyboardInterrupt:
# #         stop_event.set()

# #     if persistent_mode:
# #         logger.info("[TamperingWorker][HLS] ✅ Camera threads completed")
# #         return

# #     stop_event.set()
# #     logger.info("[TamperingWorker][HLS] ✅ All cameras completed")



# # changes on 15-04-2026

# # workers/camera_tampering_worker.py
# """
# Camera Tampering Worker — HLS only (pure OpenCV, CPU-based).

# Detects camera tampering via frame analysis:
#   - Brightness check  → "Camera Blocked"
#   - Blur score (Laplacian variance) → "Camera Blurred"
#   - Edge density → "Camera Covered"

# No GPU or ML model required — runs entirely on CPU.
# Based on: tcs_camera_tampering_detection.py
# """

# import os
# import sys
# import time
# import cv2
# import logging
# import threading
# import signal
# import numpy as np
# import pymysql
# import re
# import uuid
# from datetime import datetime

# # ================= GRACEFUL STOP FLAG =================
# _STOP_EVENT = threading.Event()

# def _handle_stop(sig, frame):
#     _STOP_EVENT.set()

# if threading.current_thread() is threading.main_thread():
#     signal.signal(signal.SIGINT,  _handle_stop)
#     signal.signal(signal.SIGTERM, _handle_stop)

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # ================= PATH SETUP =================
# _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# if _DETECTION_ROOT not in sys.path:
#     sys.path.insert(0, _DETECTION_ROOT)

# _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# if _PROJECT_ROOT not in sys.path:
#     sys.path.insert(0, _PROJECT_ROOT)

# # ================= CONFIG ==================
# HLS_SAVE_FOLDER = os.path.join(
#     _DETECTION_ROOT, "results/tcs_detections/camera_tampering_detection"
# )
# os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

# THREAD_DELAY  = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
# COOLDOWN_TIME = int(os.environ.get("TAMPER_COOLDOWN_SEC", "45"))
# SAMPLE_EVERY  = int(os.environ.get("TAMPER_SAMPLE_EVERY", "5"))

# # ── Exam ID (injected into HLS filename) ─────────────────────
# _EXAM_ID = str(os.environ.get("EXAM_ID", "0")).strip()

# # ================= IMPORTS =================
# from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# from tcs_scheduler import frame_should_process

# # ================= SHARED STATE ============
# _last_save_time = {}
# _state_lock = threading.Lock()

# # ================= DB REPORTING =================
# import sys as _sys
# _utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'utils')
# if _utils_path not in _sys.path:
#     _sys.path.insert(0, _utils_path)
# from db_client import report_to_db_hls  # noqa: E402


# # =====================================================
# # 🔍 TAMPERING DETECTION (pure OpenCV, CPU-only)
# # =====================================================
# def _detect_camera_tampering(frame):
#     """
#     Detect tampering via brightness / blur / edge density.
#     Returns (status, brightness, blur_score, edge_density).
#     status ∈ {"Normal", "Camera Blocked", "Camera Blurred", "Camera Covered"}
#     """
#     resized    = cv2.resize(frame, (320, 240))
#     brightness = np.mean(resized)
#     gray       = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
#     blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
#     edges      = cv2.Canny(gray, 50, 150)
#     edge_density = np.sum(edges > 0) / (320 * 240)

#     if brightness < 60:
#         return "Camera Blocked", brightness, blur_score, edge_density
#     if blur_score < 300:
#         return "Camera Blurred", brightness, blur_score, edge_density
#     if edge_density < 0.03:
#         return "Camera Covered", brightness, blur_score, edge_density
#     return "Normal", brightness, blur_score, edge_density


# # =====================================================
# # 📡 CAMERA THREAD
# # =====================================================
# def _hls_camera_thread(cfg, stop_event):
#     """Per-camera HLS reader — detects tampering directly on CPU."""
#     camera_id   = cfg['camera_id']
#     ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
#     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

#     hls = extract_hls_streaming_url(initial_url)
#     if not hls or not test_hls_stream(hls):
#         logger.error(f"[TamperingWorker] ❌ Stream failed for {camera_id}")
#         return

#     cap = open_hls_stream(hls)
#     if cap is None:
#         logger.error(f"[TamperingWorker] ❌ Could not open stream for {camera_id}")
#         return

#     logger.info(f"[TamperingWorker] 🟢 Camera thread started → {camera_id}")

#     frame_count = 0
#     while not stop_event.is_set():
#         ret, frame = cap.read()
#         if not ret:
#             break

#         frame_count += 1
#         if not frame_should_process(frame_count, SAMPLE_EVERY):
#             continue

#         try:
#             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)

#             if status != "Normal":
#                 now = time.time()
#                 with _state_lock:
#                     if now - _last_save_time.get(camera_id, 0) < COOLDOWN_TIME:
#                         continue
#                     _last_save_time[camera_id] = now

#                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#                 _uid = str(uuid.uuid4())
#                 # HLS: tampering_ch[ch_no]_exam[exam_id]_[timestamp]_[uuid].jpg
#                 filename = os.path.join(HLS_SAVE_FOLDER, f"tampering_ch{ch_no}_exam{_EXAM_ID}_{ts}_{_uid}.jpg")
#                 cv2.imwrite(filename, frame)
#                 logger.warning(
#                     f"[TamperingWorker] ⚠️ {status} | {camera_id} "
#                     f"bright={brightness:.1f} blur={blur_score:.1f} "
#                     f"edge={edge_density:.3f} → {filename}"
#                 )

#                 # --- Report to DB ---
#                 try:
#                     report_to_db_hls(
#                         ch_code=str(ch_no), 
#                         image_name=os.path.basename(filename),
#                         folder="camera_tampering_detection"
#                     )
#                 except Exception as e:
#                     logger.error(f"[TamperingWorker] DB Reporting Error: {e}")
#         except Exception as e:
#             logger.error(f"[TamperingWorker] {camera_id} → {e}")
#         finally:
#             del frame

#     cap.release()
#     logger.info(f"[TamperingWorker] 🔴 Camera thread stopped → {camera_id}")


# # =====================================================
# # 📡 RTSP WORKER (queue-based, receives frames from producer)
# # =====================================================
# RTSP_SAVE_FOLDER = os.path.join(
#     _DETECTION_ROOT, "results/camera_tampering_detection"
# )
# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)


# def camera_tampering_worker(frame_queue):
#     """
#     RTSP Worker — Asynchronous CPU architecture.
#     Uses a ThreadPoolExecutor to handle OpenCV-based tampering detection
#     without blocking the main frame queue.
#     """
#     logger.info("🟢 [TamperingWorker] RTSP batch-worker started")
#     from concurrent.futures import ThreadPoolExecutor
    
#     def process_frame(packet):
#         if isinstance(packet, dict):
#             frame = packet.get("frame")
#             device_id = str(packet.get("device_id", "unknown"))
#             camera_no = str(packet.get("camera_no") or packet.get("ch_no") or "0")
#             camera_id_pk = str(packet.get("camera_id_pk", ""))
#         elif len(packet) == 4:
#             frame, device_id, camera_no, camera_id_pk = packet
#         else:
#             frame, device_id, camera_no = packet
#             camera_id_pk = ""

#         if frame is None:
#             return

#         try:
#             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)
#             if status != "Normal":
#                 key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
#                 log_key = f"{device_id}_{camera_no}"
#                 now = time.time()
#                 with _state_lock:
#                     if now - _last_save_time.get(key, 0) < COOLDOWN_TIME:
#                         return
#                     _last_save_time[key] = now

#                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#                 # RTSP: tampering_[device_id]_[camera_no]_[timestamp].jpg
#                 dev_id = camera_id_pk or device_id
#                 fname = f"tampering_{dev_id}_{camera_no}_{ts}.jpg"
#                 filename = os.path.join(RTSP_SAVE_FOLDER, fname)
#                 cv2.imwrite(filename, frame)
#                 logger.warning(
#                     f"[TamperingWorker] ⚠️ {status} | pk={camera_id_pk} {log_key} "
#                     f"bright={brightness:.1f} blur={blur_score:.1f} "
#                     f"edge={edge_density:.3f} → {filename}"
#                 )
#         except Exception as e:
#             logger.error(f"[TamperingWorker] Processing error: {e}")
#         finally:
#             del frame

#     # Use a thread pool to handle CPU detections asynchronously
#     with ThreadPoolExecutor(max_workers=8) as executor:
#         while True:
#             packet = frame_queue.get()
#             if packet is None:
#                 logger.info("🔴 [TamperingWorker] RTSP batch-worker stopping")
#                 break
            
#             # Submit task to executor
#             executor.submit(process_frame, packet)

#     logger.info("🔴 [TamperingWorker] worker shut down")


# # =====================================================
# # 📡 HLS WORKER ENTRY POINT
# # =====================================================
# def camera_tampering_worker_hls(camera_configs, stop_event=None):
#     """
#     HLS worker entry point for camera tampering detection.
#     Pure OpenCV — no GPU or ML model needed.
#     Accepts a LIST of camera configs or a single dict.
#     """
#     if isinstance(camera_configs, dict):
#         camera_configs = [camera_configs]

#     persistent_mode = stop_event is None
#     if stop_event is None:
#         stop_event = _STOP_EVENT

#     # Require at least a valid stream URL
#     filtered_configs = [
#         cfg for cfg in camera_configs
#         if cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
#     ]

#     if not filtered_configs:
#         logger.warning("[TamperingWorker][HLS] No cameras with valid URLs. Skipping.")
#         return

#     camera_configs = filtered_configs

#     # Start per-camera threads using ThreadPoolExecutor for scaling
#     from concurrent.futures import ThreadPoolExecutor
#     cv2.setNumThreads(0) # Prevent thread explosion
#     with ThreadPoolExecutor(max_workers=64) as executor:
#         for cfg in camera_configs:
#             executor.submit(_hls_camera_thread, cfg, stop_event)
#             time.sleep(THREAD_DELAY)

#     logger.info(f"[TamperingWorker][HLS] Started {total} camera threads (pure CPU)")

#     try:
#         stop_event.wait()
#     except KeyboardInterrupt:
#         stop_event.set()

#     if persistent_mode:
#         logger.info("[TamperingWorker][HLS] ✅ Camera threads completed")
#         return

#     stop_event.set()
#     logger.info("[TamperingWorker][HLS] ✅ All cameras completed")



# # # workers/camera_tampering_worker.py
# # """
# # Camera Tampering Worker — HLS only (pure OpenCV, CPU-based).

# # Detects camera tampering via frame analysis:
# #   - Brightness check  → "Camera Blocked"
# #   - Blur score (Laplacian variance) → "Camera Blurred"
# #   - Edge density → "Camera Covered"

# # No GPU or ML model required — runs entirely on CPU.
# # Based on: tcs_camera_tampering_detection.py
# # """

# # import os
# # import sys
# # import time
# # import cv2
# # import logging
# # import threading
# # import signal
# # import numpy as np
# # from datetime import datetime

# # # ================= GRACEFUL STOP FLAG =================
# # _STOP_EVENT = threading.Event()

# # def _handle_stop(sig, frame):
# #     _STOP_EVENT.set()

# # if threading.current_thread() is threading.main_thread():
# #     signal.signal(signal.SIGINT,  _handle_stop)
# #     signal.signal(signal.SIGTERM, _handle_stop)

# # # ================= LOGGING =================
# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s - %(levelname)s - %(message)s"
# # )
# # logger = logging.getLogger(__name__)

# # # ================= PATH SETUP =================
# # _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # if _DETECTION_ROOT not in sys.path:
# #     sys.path.insert(0, _DETECTION_ROOT)

# # _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# # if _PROJECT_ROOT not in sys.path:
# #     sys.path.insert(0, _PROJECT_ROOT)

# # # ================= CONFIG ==================
# # HLS_SAVE_FOLDER = os.path.join(
# #     _DETECTION_ROOT, "results/tcs_detections/camera_tampering_detection"
# # )
# # os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

# # THREAD_DELAY  = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
# # COOLDOWN_TIME = int(os.environ.get("TAMPER_COOLDOWN_SEC", "45"))
# # SAMPLE_EVERY  = int(os.environ.get("TAMPER_SAMPLE_EVERY", "5"))

# # # ================= IMPORTS =================
# # from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# # from tcs_scheduler import frame_should_process

# # # ================= SHARED STATE ============
# # _last_save_time = {}
# # _state_lock = threading.Lock()


# # # =====================================================
# # # 🔍 TAMPERING DETECTION (pure OpenCV, CPU-only)
# # # =====================================================
# # def _detect_camera_tampering(frame):
# #     """
# #     Detect tampering via brightness / blur / edge density.
# #     Returns (status, brightness, blur_score, edge_density).
# #     status ∈ {"Normal", "Camera Blocked", "Camera Blurred", "Camera Covered"}
# #     """
# #     resized    = cv2.resize(frame, (320, 240))
# #     brightness = np.mean(resized)
# #     gray       = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
# #     blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
# #     edges      = cv2.Canny(gray, 50, 150)
# #     edge_density = np.sum(edges > 0) / (320 * 240)

# #     if brightness < 60:
# #         return "Camera Blocked", brightness, blur_score, edge_density
# #     if blur_score < 300:
# #         return "Camera Blurred", brightness, blur_score, edge_density
# #     if edge_density < 0.03:
# #         return "Camera Covered", brightness, blur_score, edge_density
# #     return "Normal", brightness, blur_score, edge_density


# # # =====================================================
# # # 📡 CAMERA THREAD
# # # =====================================================
# # def _hls_camera_thread(cfg, stop_event):
# #     """Per-camera HLS reader — detects tampering directly on CPU."""
# #     camera_id   = cfg['camera_id']
# #     ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
# #     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

# #     hls = extract_hls_streaming_url(initial_url)
# #     if not hls or not test_hls_stream(hls):
# #         logger.error(f"[TamperingWorker] ❌ Stream failed for {camera_id}")
# #         return

# #     cap = open_hls_stream(hls)
# #     if cap is None:
# #         logger.error(f"[TamperingWorker] ❌ Could not open stream for {camera_id}")
# #         return

# #     logger.info(f"[TamperingWorker] 🟢 Camera thread started → {camera_id}")

# #     frame_count = 0
# #     while not stop_event.is_set():
# #         ret, frame = cap.read()
# #         if not ret:
# #             break

# #         frame_count += 1
# #         if not frame_should_process(frame_count, SAMPLE_EVERY):
# #             continue

# #         try:
# #             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)

# #             if status != "Normal":
# #                 now = time.time()
# #                 with _state_lock:
# #                     if now - _last_save_time.get(camera_id, 0) < COOLDOWN_TIME:
# #                         continue
# #                     _last_save_time[camera_id] = now

# #                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #                 # HLS: tampering_ch[ch_no]_[timestamp].jpg
# #                 filename = os.path.join(HLS_SAVE_FOLDER, f"tampering_ch{ch_no}_{ts}.jpg")
# #                 cv2.imwrite(filename, frame)
# #                 logger.warning(
# #                     f"[TamperingWorker] ⚠️ {status} | {camera_id} "
# #                     f"bright={brightness:.1f} blur={blur_score:.1f} "
# #                     f"edge={edge_density:.3f} → {filename}"
# #                 )
# #         except Exception as e:
# #             logger.error(f"[TamperingWorker] {camera_id} → {e}")
# #         finally:
# #             del frame

# #     cap.release()
# #     logger.info(f"[TamperingWorker] 🔴 Camera thread stopped → {camera_id}")


# # # =====================================================
# # # 📡 RTSP WORKER (queue-based, receives frames from producer)
# # # =====================================================
# # RTSP_SAVE_FOLDER = os.path.join(
# #     _DETECTION_ROOT, "results/camera_tampering_detection"
# # )
# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)


# # def camera_tampering_worker(frame_queue):
# #     """
# #     RTSP Worker — Asynchronous CPU architecture.
# #     Uses a ThreadPoolExecutor to handle OpenCV-based tampering detection
# #     without blocking the main frame queue.
# #     """
# #     logger.info("🟢 [TamperingWorker] RTSP batch-worker started")
# #     from concurrent.futures import ThreadPoolExecutor
    
# #     def process_frame(packet):
# #         if isinstance(packet, dict):
# #             frame = packet.get("frame")
# #             device_id = str(packet.get("device_id", "unknown"))
# #             camera_no = str(packet.get("camera_no") or packet.get("ch_no") or "0")
# #             camera_id_pk = str(packet.get("camera_id_pk", ""))
# #         elif len(packet) == 4:
# #             frame, device_id, camera_no, camera_id_pk = packet
# #         else:
# #             frame, device_id, camera_no = packet
# #             camera_id_pk = ""

# #         if frame is None:
# #             return

# #         try:
# #             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)
# #             if status != "Normal":
# #                 key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# #                 log_key = f"{device_id}_{camera_no}"
# #                 now = time.time()
# #                 with _state_lock:
# #                     if now - _last_save_time.get(key, 0) < COOLDOWN_TIME:
# #                         return
# #                     _last_save_time[key] = now

# #                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #                 # RTSP: tampering_[device_id]_[camera_no]_[timestamp].jpg
# #                 dev_id = camera_id_pk or device_id
# #                 fname = f"tampering_{dev_id}_{camera_no}_{ts}.jpg"
# #                 filename = os.path.join(RTSP_SAVE_FOLDER, fname)
# #                 cv2.imwrite(filename, frame)
# #                 logger.warning(
# #                     f"[TamperingWorker] ⚠️ {status} | pk={camera_id_pk} {log_key} "
# #                     f"bright={brightness:.1f} blur={blur_score:.1f} "
# #                     f"edge={edge_density:.3f} → {filename}"
# #                 )
# #         except Exception as e:
# #             logger.error(f"[TamperingWorker] Processing error: {e}")
# #         finally:
# #             del frame

# #     # Use a thread pool to handle CPU detections asynchronously
# #     with ThreadPoolExecutor(max_workers=8) as executor:
# #         while True:
# #             packet = frame_queue.get()
# #             if packet is None:
# #                 logger.info("🔴 [TamperingWorker] RTSP batch-worker stopping")
# #                 break
            
# #             # Submit task to executor
# #             executor.submit(process_frame, packet)

# #     logger.info("🔴 [TamperingWorker] worker shut down")


# # # =====================================================
# # # 📡 HLS WORKER ENTRY POINT
# # # =====================================================
# # def camera_tampering_worker_hls(camera_configs, stop_event=None):
# #     """
# #     HLS worker entry point for camera tampering detection.
# #     Pure OpenCV — no GPU or ML model needed.
# #     Accepts a LIST of camera configs or a single dict.
# #     """
# #     if isinstance(camera_configs, dict):
# #         camera_configs = [camera_configs]

# #     persistent_mode = stop_event is None
# #     if stop_event is None:
# #         stop_event = _STOP_EVENT

# #     # Require at least a valid stream URL
# #     filtered_configs = [
# #         cfg for cfg in camera_configs
# #         if cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
# #     ]

# #     if not filtered_configs:
# #         logger.warning("[TamperingWorker][HLS] No cameras with valid URLs. Skipping.")
# #         return

# #     camera_configs = filtered_configs

# #     # Start per-camera threads using ThreadPoolExecutor for scaling
# #     from concurrent.futures import ThreadPoolExecutor
# #     cv2.setNumThreads(0) # Prevent thread explosion
# #     with ThreadPoolExecutor(max_workers=64) as executor:
# #         for cfg in camera_configs:
# #             executor.submit(_hls_camera_thread, cfg, stop_event)
# #             time.sleep(THREAD_DELAY)

# #     logger.info(f"[TamperingWorker][HLS] Started {total} camera threads (pure CPU)")

# #     try:
# #         stop_event.wait()
# #     except KeyboardInterrupt:
# #         stop_event.set()

# #     if persistent_mode:
# #         logger.info("[TamperingWorker][HLS] ✅ Camera threads completed")
# #         return

# #     stop_event.set()
# #     logger.info("[TamperingWorker][HLS] ✅ All cameras completed")




# # workers/camera_tampering_worker.py
# """
# Camera Tampering Worker — HLS only (pure OpenCV, CPU-based).

# Detects camera tampering via frame analysis:
#   - Brightness check  → "Camera Blocked"
#   - Blur score (Laplacian variance) → "Camera Blurred"
#   - Edge density → "Camera Covered"

# No GPU or ML model required — runs entirely on CPU.
# Based on: tcs_camera_tampering_detection.py
# """

# import os
# import sys
# import time
# import cv2
# import logging
# import threading
# import signal
# import numpy as np
# import pymysql
# import re
# from datetime import datetime

# # ================= GRACEFUL STOP FLAG =================
# _STOP_EVENT = threading.Event()

# def _handle_stop(sig, frame):
#     _STOP_EVENT.set()

# if threading.current_thread() is threading.main_thread():
#     signal.signal(signal.SIGINT,  _handle_stop)
#     signal.signal(signal.SIGTERM, _handle_stop)

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # ================= PATH SETUP =================
# _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# if _DETECTION_ROOT not in sys.path:
#     sys.path.insert(0, _DETECTION_ROOT)

# _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# if _PROJECT_ROOT not in sys.path:
#     sys.path.insert(0, _PROJECT_ROOT)

# # ================= CONFIG ==================
# HLS_SAVE_FOLDER = os.path.join(
#     _DETECTION_ROOT, "results/tcs_detections/camera_tampering_detection"
# )
# os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

# THREAD_DELAY  = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
# COOLDOWN_TIME = int(os.environ.get("TAMPER_COOLDOWN_SEC", "45"))
# SAMPLE_EVERY  = int(os.environ.get("TAMPER_SAMPLE_EVERY", "5"))

# # ================= IMPORTS =================
# from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# from tcs_scheduler import frame_should_process

# # ================= SHARED STATE ============
# _last_save_time = {}
# _state_lock = threading.Lock()

# # ================= DB CONFIG =================
# DB_CONFIG = {
#     "host": "localhost",
#     "user": "root",
#     "password": "rootpassword123",
#     "database": "cctv_monitoring",
#     "cursorclass": pymysql.cursors.DictCursor
# }

# def report_to_db_hls(ch_code, image_name, folder="camera_tampering_detection"):
#     """
#     Look up camera info by ch_code and report detection to camera_report_hls.
#     Specifically for HLS detections.
#     """
#     try:
#         # 0. Get the project root based on this script's location
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         log_file = os.path.join(script_dir, "../../db_reports.log")
        
#         with open(log_file, "a") as f:
#             f.write(f"\n--- New Tampering Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
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
#                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (tampering) for ch_code={ch_code}, exam_id={exam_id}, shift_id={shift_id}\n"
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
#                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted tampering report for ch_code {ch_code} (Camera: {report_camera_id})\n"
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


# # =====================================================
# # 🔍 TAMPERING DETECTION (pure OpenCV, CPU-only)
# # =====================================================
# def _detect_camera_tampering(frame):
#     """
#     Detect tampering via brightness / blur / edge density.
#     Returns (status, brightness, blur_score, edge_density).
#     status ∈ {"Normal", "Camera Blocked", "Camera Blurred", "Camera Covered"}
#     """
#     resized    = cv2.resize(frame, (320, 240))
#     brightness = np.mean(resized)
#     gray       = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
#     blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
#     edges      = cv2.Canny(gray, 50, 150)
#     edge_density = np.sum(edges > 0) / (320 * 240)

#     if brightness < 60:
#         return "Camera Blocked", brightness, blur_score, edge_density
#     if blur_score < 300:
#         return "Camera Blurred", brightness, blur_score, edge_density
#     if edge_density < 0.03:
#         return "Camera Covered", brightness, blur_score, edge_density
#     return "Normal", brightness, blur_score, edge_density


# # =====================================================
# # 📡 CAMERA THREAD
# # =====================================================
# def _hls_camera_thread(cfg, stop_event):
#     """Per-camera HLS reader — detects tampering directly on CPU."""
#     camera_id   = cfg['camera_id']
#     ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
#     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

#     hls = extract_hls_streaming_url(initial_url)
#     if not hls or not test_hls_stream(hls):
#         logger.error(f"[TamperingWorker] ❌ Stream failed for {camera_id}")
#         return

#     cap = open_hls_stream(hls)
#     if cap is None:
#         logger.error(f"[TamperingWorker] ❌ Could not open stream for {camera_id}")
#         return

#     logger.info(f"[TamperingWorker] 🟢 Camera thread started → {camera_id}")

#     frame_count = 0
#     while not stop_event.is_set():
#         ret, frame = cap.read()
#         if not ret:
#             break

#         frame_count += 1
#         if not frame_should_process(frame_count, SAMPLE_EVERY):
#             continue

#         try:
#             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)

#             if status != "Normal":
#                 now = time.time()
#                 with _state_lock:
#                     if now - _last_save_time.get(camera_id, 0) < COOLDOWN_TIME:
#                         continue
#                     _last_save_time[camera_id] = now

#                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#                 # HLS: tampering_ch[ch_no]_[timestamp].jpg
#                 filename = os.path.join(HLS_SAVE_FOLDER, f"tampering_ch{ch_no}_{ts}.jpg")
#                 cv2.imwrite(filename, frame)
#                 logger.warning(
#                     f"[TamperingWorker] ⚠️ {status} | {camera_id} "
#                     f"bright={brightness:.1f} blur={blur_score:.1f} "
#                     f"edge={edge_density:.3f} → {filename}"
#                 )

#                 # --- Report to DB ---
#                 try:
#                     report_to_db_hls(
#                         ch_code=str(ch_no), 
#                         image_name=os.path.basename(filename),
#                         folder="camera_tampering_detection"
#                     )
#                 except Exception as e:
#                     logger.error(f"[TamperingWorker] DB Reporting Error: {e}")
#         except Exception as e:
#             logger.error(f"[TamperingWorker] {camera_id} → {e}")
#         finally:
#             del frame

#     cap.release()
#     logger.info(f"[TamperingWorker] 🔴 Camera thread stopped → {camera_id}")


# # =====================================================
# # 📡 RTSP WORKER (queue-based, receives frames from producer)
# # =====================================================
# RTSP_SAVE_FOLDER = os.path.join(
#     _DETECTION_ROOT, "results/camera_tampering_detection"
# )
# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)


# def camera_tampering_worker(frame_queue):
#     """
#     RTSP Worker — Asynchronous CPU architecture.
#     Uses a ThreadPoolExecutor to handle OpenCV-based tampering detection
#     without blocking the main frame queue.
#     """
#     logger.info("🟢 [TamperingWorker] RTSP batch-worker started")
#     from concurrent.futures import ThreadPoolExecutor
    
#     def process_frame(packet):
#         if isinstance(packet, dict):
#             frame = packet.get("frame")
#             device_id = str(packet.get("device_id", "unknown"))
#             camera_no = str(packet.get("camera_no") or packet.get("ch_no") or "0")
#             camera_id_pk = str(packet.get("camera_id_pk", ""))
#         elif len(packet) == 4:
#             frame, device_id, camera_no, camera_id_pk = packet
#         else:
#             frame, device_id, camera_no = packet
#             camera_id_pk = ""

#         if frame is None:
#             return

#         try:
#             status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)
#             if status != "Normal":
#                 key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
#                 log_key = f"{device_id}_{camera_no}"
#                 now = time.time()
#                 with _state_lock:
#                     if now - _last_save_time.get(key, 0) < COOLDOWN_TIME:
#                         return
#                     _last_save_time[key] = now

#                 ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#                 # RTSP: tampering_[device_id]_[camera_no]_[timestamp].jpg
#                 dev_id = camera_id_pk or device_id
#                 fname = f"tampering_{dev_id}_{camera_no}_{ts}.jpg"
#                 filename = os.path.join(RTSP_SAVE_FOLDER, fname)
#                 cv2.imwrite(filename, frame)
#                 logger.warning(
#                     f"[TamperingWorker] ⚠️ {status} | pk={camera_id_pk} {log_key} "
#                     f"bright={brightness:.1f} blur={blur_score:.1f} "
#                     f"edge={edge_density:.3f} → {filename}"
#                 )
#         except Exception as e:
#             logger.error(f"[TamperingWorker] Processing error: {e}")
#         finally:
#             del frame

#     # Use a thread pool to handle CPU detections asynchronously
#     with ThreadPoolExecutor(max_workers=8) as executor:
#         while True:
#             packet = frame_queue.get()
#             if packet is None:
#                 logger.info("🔴 [TamperingWorker] RTSP batch-worker stopping")
#                 break
            
#             # Submit task to executor
#             executor.submit(process_frame, packet)

#     logger.info("🔴 [TamperingWorker] worker shut down")


# # =====================================================
# # 📡 HLS WORKER ENTRY POINT
# # =====================================================
# def camera_tampering_worker_hls(camera_configs, stop_event=None):
#     """
#     HLS worker entry point for camera tampering detection.
#     Pure OpenCV — no GPU or ML model needed.
#     Accepts a LIST of camera configs or a single dict.
#     """
#     if isinstance(camera_configs, dict):
#         camera_configs = [camera_configs]

#     persistent_mode = stop_event is None
#     if stop_event is None:
#         stop_event = _STOP_EVENT

#     # Require at least a valid stream URL
#     filtered_configs = [
#         cfg for cfg in camera_configs
#         if cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
#     ]

#     if not filtered_configs:
#         logger.warning("[TamperingWorker][HLS] No cameras with valid URLs. Skipping.")
#         return

#     camera_configs = filtered_configs

#     # Start per-camera threads using ThreadPoolExecutor for scaling
#     from concurrent.futures import ThreadPoolExecutor
#     cv2.setNumThreads(0) # Prevent thread explosion
#     with ThreadPoolExecutor(max_workers=64) as executor:
#         for cfg in camera_configs:
#             executor.submit(_hls_camera_thread, cfg, stop_event)
#             time.sleep(THREAD_DELAY)

#     logger.info(f"[TamperingWorker][HLS] Started {total} camera threads (pure CPU)")

#     try:
#         stop_event.wait()
#     except KeyboardInterrupt:
#         stop_event.set()

#     if persistent_mode:
#         logger.info("[TamperingWorker][HLS] ✅ Camera threads completed")
#         return

#     stop_event.set()
#     logger.info("[TamperingWorker][HLS] ✅ All cameras completed")



# changes on 15-04-2026

# workers/camera_tampering_worker.py
"""
Camera Tampering Worker — HLS only (pure OpenCV, CPU-based).

Detects camera tampering via frame analysis:
  - Brightness check  → "Camera Blocked"
  - Blur score (Laplacian variance) → "Camera Blurred"
  - Edge density → "Camera Covered"

No GPU or ML model required — runs entirely on CPU.
Based on: tcs_camera_tampering_detection.py
"""

import os
import sys
import time
import cv2
import logging
import threading
import signal
import numpy as np
import pymysql
import re
import uuid
from datetime import datetime

# ================= GRACEFUL STOP FLAG =================
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT,  _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ================= PATH SETUP =================
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# ================= CONFIG ==================
HLS_SAVE_FOLDER = os.path.join(
    _DETECTION_ROOT, "results/tcs_detections/camera_tampering_detection"
)
os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

THREAD_DELAY  = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0
COOLDOWN_TIME = int(os.environ.get("TAMPER_COOLDOWN_SEC", "45"))
SAMPLE_EVERY  = int(os.environ.get("TAMPER_SAMPLE_EVERY", "5"))

# ── Exam ID (injected into HLS filename) ─────────────────────
_EXAM_ID = str(os.environ.get("EXAM_ID", "0")).strip()

# ================= IMPORTS =================
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process

# ================= SHARED STATE ============
_last_save_time = {}
_state_lock = threading.Lock()

# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls, report_to_db_rtsp  # noqa: E402


# =====================================================
# 🔍 TAMPERING DETECTION (pure OpenCV, CPU-only)
# =====================================================
def _detect_camera_tampering(frame):
    """
    Detect tampering via brightness / blur / edge density.
    Returns (status, brightness, blur_score, edge_density).
    status ∈ {"Normal", "Camera Blocked", "Camera Blurred", "Camera Covered"}
    """
    resized    = cv2.resize(frame, (320, 240))
    brightness = np.mean(resized)
    gray       = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    edges      = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / (320 * 240)

    if brightness < 60:
        return "Camera Blocked", brightness, blur_score, edge_density
    if blur_score < 300:
        return "Camera Blurred", brightness, blur_score, edge_density
    if edge_density < 0.03:
        return "Camera Covered", brightness, blur_score, edge_density
    return "Normal", brightness, blur_score, edge_density


# =====================================================
# 📡 CAMERA THREAD
# =====================================================
def _hls_camera_thread(cfg, stop_event):
    """Per-camera HLS reader — detects tampering directly on CPU."""
    camera_id   = cfg['camera_id']
    ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        logger.error(f"[TamperingWorker] ❌ Stream failed for {camera_id}")
        return

    cap = open_hls_stream(hls)
    if cap is None:
        logger.error(f"[TamperingWorker] ❌ Could not open stream for {camera_id}")
        return

    logger.info(f"[TamperingWorker] 🟢 Camera thread started → {camera_id}")

    frame_count = 0
    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)

            if status != "Normal":
                now = time.time()
                with _state_lock:
                    if now - _last_save_time.get(camera_id, 0) < COOLDOWN_TIME:
                        continue
                    _last_save_time[camera_id] = now

                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                _uid = str(uuid.uuid4())
                # HLS: tampering_ch[ch_no]_exam[exam_id]_[timestamp]_[uuid].jpg
                filename = os.path.join(HLS_SAVE_FOLDER, f"tampering_ch{ch_no}_exam{_EXAM_ID}_{ts}_{_uid}.jpg")
                cv2.imwrite(filename, frame)
                logger.warning(
                    f"[TamperingWorker] ⚠️ {status} | {camera_id} "
                    f"bright={brightness:.1f} blur={blur_score:.1f} "
                    f"edge={edge_density:.3f} → {filename}"
                )

                # --- Report to DB ---
                try:
                    report_to_db_hls(
                        ch_code=str(ch_no), 
                        image_name=os.path.basename(filename),
                        folder="camera_tampering_detection"
                    )
                except Exception as e:
                    logger.error(f"[TamperingWorker] DB Reporting Error: {e}")
        except Exception as e:
            logger.error(f"[TamperingWorker] {camera_id} → {e}")
        finally:
            del frame

    cap.release()
    logger.info(f"[TamperingWorker] 🔴 Camera thread stopped → {camera_id}")


# =====================================================
# 📡 RTSP WORKER (queue-based, receives frames from producer)
# =====================================================
RTSP_SAVE_FOLDER = os.path.join(
    _DETECTION_ROOT, "results/camera_tampering_detection"
)
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)


def camera_tampering_worker(frame_queue):
    """
    RTSP Worker — Asynchronous CPU architecture.
    Uses a ThreadPoolExecutor to handle OpenCV-based tampering detection
    without blocking the main frame queue.
    """
    logger.info("🟢 [TamperingWorker] RTSP batch-worker started")
    from concurrent.futures import ThreadPoolExecutor
    
    def process_frame(packet):
        if isinstance(packet, dict):
            frame = packet.get("frame")
            device_id = str(packet.get("device_id", "unknown"))
            camera_no = str(packet.get("camera_no") or packet.get("ch_no") or "0")
            camera_id_pk = str(packet.get("camera_id_pk", ""))
        elif len(packet) == 4:
            frame, device_id, camera_no, camera_id_pk = packet
        else:
            frame, device_id, camera_no = packet
            camera_id_pk = ""

        if frame is None:
            return

        try:
            status, brightness, blur_score, edge_density = _detect_camera_tampering(frame)
            if status != "Normal":
                key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
                log_key = f"{device_id}_{camera_no}"
                now = time.time()
                with _state_lock:
                    if now - _last_save_time.get(key, 0) < COOLDOWN_TIME:
                        return
                    _last_save_time[key] = now

                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                _uid = str(uuid.uuid4())
                # RTSP: tampering_[device_id]_[camera_no]_exam[exam_id]_[timestamp]_[uuid].jpg
                dev_id = camera_id_pk or device_id
                fname = f"tampering_{dev_id}_{camera_no}_exam{_EXAM_ID}_{ts}_{_uid}.jpg"
                filename = os.path.join(RTSP_SAVE_FOLDER, fname)
                cv2.imwrite(filename, frame)
                logger.warning(
                    f"[TamperingWorker] ⚠️ {status} | pk={camera_id_pk} {log_key} "
                    f"bright={brightness:.1f} blur={blur_score:.1f} "
                    f"edge={edge_density:.3f} → {filename}"
                )
                
                # --- Report to DB ---
                try:
                    report_to_db_rtsp(
                        device_id=str(dev_id),
                        camera_no=str(camera_no),
                        image_name=fname,
                        folder="camera_tampering_detection"
                    )
                except Exception as e:
                    logger.error(f"[TamperingWorker] RTSP DB Reporting Error: {e}")
        except Exception as e:
            logger.error(f"[TamperingWorker] Processing error: {e}")
        finally:
            del frame

    # Use a thread pool to handle CPU detections asynchronously
    with ThreadPoolExecutor(max_workers=8) as executor:
        while True:
            packet = frame_queue.get()
            if packet is None:
                logger.info("🔴 [TamperingWorker] RTSP batch-worker stopping")
                break
            
            # Submit task to executor
            executor.submit(process_frame, packet)

    logger.info("🔴 [TamperingWorker] worker shut down")


# =====================================================
# 📡 HLS WORKER ENTRY POINT
# =====================================================
def camera_tampering_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point for camera tampering detection.
    Pure OpenCV — no GPU or ML model needed.
    Accepts a LIST of camera configs or a single dict.
    """
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    # Require at least a valid stream URL
    filtered_configs = [
        cfg for cfg in camera_configs
        if cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
    ]

    if not filtered_configs:
        logger.warning("[TamperingWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    camera_configs = filtered_configs

    # Start per-camera threads using ThreadPoolExecutor for scaling
    from concurrent.futures import ThreadPoolExecutor
    cv2.setNumThreads(0) # Prevent thread explosion
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in camera_configs:
            executor.submit(_hls_camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    logger.info(f"[TamperingWorker][HLS] Started {total} camera threads (pure CPU)")

    try:
        stop_event.wait()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[TamperingWorker][HLS] ✅ Camera threads completed")
        return

    stop_event.set()
    logger.info("[TamperingWorker][HLS] ✅ All cameras completed")
