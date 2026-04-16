# # import queue
# # import time
# # import os
# # import logging
# # import threading
# # import signal
# # from datetime import datetime

# # # ================= PATH SETUP =================
# # import sys
# # # Ensure detection root is on path for imports
# # _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # if _DETECTION_ROOT not in sys.path:
# #     sys.path.insert(0, _DETECTION_ROOT)

# # _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# # if _PROJECT_ROOT not in sys.path:
# #     sys.path.insert(0, _PROJECT_ROOT)

# # # Import core detection module + utilities
# # from scripts.detection import phone_det_complete as phone_core
# # from tcs_scheduler import frame_should_process
# # from detection_rate_limiter import get_rate_limiter

# # import cv2
# # from ultralytics import YOLO

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

# # # ================= CONFIG ==================
# # PROJECT_ROOT = _DETECTION_ROOT
# # MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection")
# # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/phone_detection")

# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # CONF_THRESHOLD = 0.25
# # COOLDOWN_TIME  = 60    # Updated to 60s per user's tcs script
# # PHONE_SAMPLE_EVERY = 5 # Adjusted for better throughput
# # GPU_BATCH_SIZE      = 64
# # GPU_QUEUE_SIZE      = 128
# # BATCH_WAIT_TIMEOUT  = 0.2
# # THREAD_DELAY        = 0.1


# # # ================= SHARED STATE ============
# # last_save_times = {}
# # phone_counts    = {}
# # _state_lock     = threading.Lock()
# # _gpu_queue      = queue.Queue(maxsize=GPU_QUEUE_SIZE)

# # # ================= YOLO ====================
# # print("🔄 [PhoneWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)
# # logger.info("✅ [PhoneWorker] YOLO model loaded")


# # # =====================================================
# # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # =====================================================
# # def detect_phone(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "phone", camera_id_pk: str = ""):
# #     results   = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
# #     names     = results.names

# #     phone_boxes = [
# #         box for box in results.boxes
# #         if names.get(int(box.cls[0]), "") == "cell phone"
# #     ]

# #     phone_count = len(phone_boxes)

# #     for box in phone_boxes:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(frame, f"Phone {conf:.2f}", (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

# #     cv2.putText(frame, f"Phones: {phone_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# #     now = time.time()

# #     with _state_lock:
# #         elapsed = now - last_save_times.get(key, 0)
# #         if phone_boxes and elapsed >= COOLDOWN_TIME:
# #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #             if camera_id_pk:
# #                 fname = f"{script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg"
# #             elif camera_no:
# #                 fname = f"{script_name}_{camera_no}_{ts}.jpg"
# #             else:
# #                 fname = f"{script_name}_{device_id}_{ts}.jpg"
            
# #             path = os.path.join(save_folder, fname)
# #             cv2.imwrite(path, frame)
# #             last_save_times[key] = now
# #             logger.warning(f"[PhoneWorker] 📱 Phone detected! pk={camera_id_pk} Device={device_id} Cam={camera_no} Count={phone_count} 💾 Saved \u2192 {path}")

# #     return phone_count


# # # =====================================================
# # # 📡  RTSP PATH
# # # =====================================================
# # def phone_worker(frame_queue):
# #     import torch
# #     logger.info("\ud83d\udfe2 [PhoneWorker] RTSP batch-worker started")
# #     stop_event = threading.Event()

# #     gpu_t = threading.Thread(target=_hls_gpu_worker, args=(stop_event, RTSP_SAVE_FOLDER), daemon=True)
# #     gpu_t.start()

# #     try:
# #         while True:
# #             data = frame_queue.get()
# #             if data is None: break

# #             if isinstance(data, dict):
# #                 frame        = data.get("frame")
# #                 device_id    = str(data.get("device_id", "unknown"))
# #                 camera_no    = str(data.get("camera_no") or data.get("ch_no") or "0")
# #                 camera_id_pk = str(data.get("camera_id_pk", ""))
# #             elif len(data) == 4:
# #                 frame, device_id, camera_no, camera_id_pk = data
# #             else:
# #                 frame, device_id, camera_no = data
# #                 camera_id_pk = ""

# #             if frame is None: continue

# #             try:
# #                 _gpu_queue.put({
# #                     "frame":        frame.copy(),
# #                     "device_id":    str(device_id),
# #                     "camera_no":    str(camera_no),
# #                     "ch_no":        str(camera_no),
# #                     "camera_id_pk": str(camera_id_pk),
# #                     "script_name":  "phone",
# #                     "source_type":  "RTSP",
# #                     "state":        {},
# #                 }, timeout=0.1)
# #             except queue.Full: pass
# #             del frame
# #     finally:
# #         stop_event.set()
# #         gpu_t.join(timeout=5)
# #         if torch.cuda.is_available(): torch.cuda.empty_cache()
# #         logger.info("\ud83d\udd34 [PhoneWorker] GPU worker shut down")


# # # =====================================================
# # # 📡  HLS PATH
# # # =====================================================
# # def _hls_gpu_worker(stop_event, save_folder, cooldown_time=480):
# #     import torch
# #     logger.info("\ud83d\ude80 [PhoneWorker][HLS] GPU worker started (true batch mode)")
# #     phone_core.get_yolo_model()
# #     rate_limiter = get_rate_limiter('phone', max_per_minute=25)
# #     cam_state    = {}
# #     log_counter  = 0

# #     while not stop_event.is_set():
# #         batch = []
# #         try:
# #             batch.append(_gpu_queue.get(timeout=0.1))
# #         except queue.Empty: continue

# #         deadline = time.time() + BATCH_WAIT_TIMEOUT
# #         while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
# #             try: batch.append(_gpu_queue.get_nowait())
# #             except queue.Empty: time.sleep(0.002)

# #         inference_items = [{'frame': item['frame'], 'camera_id': item.get('device_id') or item.get('camera_id'), 'ch_no': item['ch_no']} for item in batch]

# #         try: batch_results = phone_core.detect_phones_batch(inference_items)
# #         except Exception as e:
# #             logger.error(f"[PhoneWorker][HLS] Batch error: {e}")
# #             for item in batch:
# #                 if 'frame' in item: del item['frame']
# #             continue

# #         log_counter += 1
# #         if torch.cuda.is_available() and log_counter % 50 == 0:
# #             mem = torch.cuda.memory_allocated() / 1e9
# #             logger.info(f"[PhoneWorker][GPU] batch={len(batch)} | mem={mem:.2f}GB")

# #         for item, (annotated_frame, detected, phone_count) in zip(batch, batch_results):
# #             if not detected: continue
# #             camera_id   = item['camera_id']
# #             ch_no       = item['ch_no']
# #             script_name = item.get('script_name', 'phone')

# #             now = time.time()
# #             if now - cam_state.get(camera_id, 0) < cooldown_time: continue

# #             should_save, _, _ = rate_limiter.should_save_detection(camera_id)
# #             if not should_save: continue

# #             cam_state[camera_id] = now
# #             timestamp = time.strftime("%Y%m%d_%H%M%S")
            
# #             if item.get("source_type") == "HLS":
# #                 filename = os.path.join(save_folder, f"{script_name}_ch{ch_no}_{timestamp}.jpg")
# #             else:
# #                 device_id = item.get("device_id") or camera_id
# #                 filename = os.path.join(save_folder, f"{script_name}_{device_id}_{ch_no}_{timestamp}.jpg")
            
# #             cv2.imwrite(filename, annotated_frame)
# #             logger.warning(f"[PhoneWorker][HLS] \ud83d\udcf1 SAVED phones={phone_count} \u2192 {filename}")
# #             del annotated_frame
# #             if 'frame' in item: del item['frame']
# #         del batch

# #     logger.info("\ud83d\udd34 [PhoneWorker][HLS] GPU worker stopped")


# # def _hls_camera_thread(cfg, stop_event):
# #     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# #     camera_id   = cfg['camera_id']
# #     script_name = cfg.get('script_code', 'phone')
# #     ch_no       = cfg.get('camera_id', 'unknown')
# #     initial_url = cfg.get('cctv_url') or cfg.get('stream_url', '')

# #     hls = extract_hls_streaming_url(initial_url)
# #     if not hls or not test_hls_stream(hls):
# #         logger.error(f"[PhoneWorker][HLS] \u274c Stream failed for {camera_id}")
# #         return

# #     cap = open_hls_stream(hls)
# #     if cap is None:
# #         logger.error(f"[PhoneWorker][HLS] \u274c Could not open stream for {camera_id}")
# #         return

# #     logger.info(f"[PhoneWorker][HLS] \ud83d\udfe2 Camera thread started \u2192 {camera_id}")
# #     frame_count = 0
# #     while not stop_event.is_set():
# #         ret, frame = cap.read()
# #         if not ret: break
# #         frame_count += 1
# #         if not frame_should_process(frame_count, PHONE_SAMPLE_EVERY): continue
# #         try:
# #             _gpu_queue.put_nowait({"frame": frame, "camera_id": camera_id, "ch_no": ch_no, "script_name": script_name, "source_type": "HLS"})
# #         except queue.Full:
# #             del frame
# #             continue
# #         del frame
# #     cap.release()
# #     logger.info(f"[PhoneWorker][HLS] \ud83d\udd34 Camera thread stopped \u2192 {camera_id}")


# # def phone_worker_hls(camera_configs, stop_event=None):
# #     if isinstance(camera_configs, dict):
# #         camera_configs = [camera_configs]
# #     if stop_event is None:
# #         stop_event = _STOP_EVENT

# #     import torch
# #     cv2.setNumThreads(0)

# #     # Filter
# #     valid_configs = []
# #     for cfg in camera_configs:
# #         cls_val = str(cfg.get('classification', '')).lower()
# #         if 'server room' in cls_val or 'computer lab' in cls_val:
# #             valid_configs.append(cfg)
# #         else:
# #             logger.info(f"[PhoneWorker] \ud83d\udeab Skipping {cfg.get('camera_id', 'unknown')} (Scene: {cls_val})")
            
# #     if not valid_configs:
# #         logger.warning("[PhoneWorker][HLS] \u274c No valid cameras found after Scene Classification filter. Exiting.")
# #         return
        
# #     camera_configs = valid_configs
# #     phone_core.SAVE_FOLDER = HLS_SAVE_FOLDER

# #     gpu_t = threading.Thread(target=_hls_gpu_worker, args=(stop_event, HLS_SAVE_FOLDER), daemon=True)
# #     gpu_t.start()

# #     from concurrent.futures import ThreadPoolExecutor
# #     with ThreadPoolExecutor(max_workers=64) as executor:
# #         for cfg in camera_configs:
# #             executor.submit(_hls_camera_thread, cfg, stop_event)
# #             time.sleep(THREAD_DELAY)

# #     logger.info(f"[PhoneWorker][HLS] Started {len(camera_configs)} camera threads + 1 GPU worker")
# #     stop_event.wait()
# #     stop_event.set()
# #     if torch.cuda.is_available(): torch.cuda.empty_cache()
# #     logger.info("[PhoneWorker][HLS] \u2705 All HLS cameras completed")



# import queue
# import time
# import os
# import logging
# import threading
# import signal
# from datetime import datetime

# # ================= PATH SETUP =================
# import sys
# # Ensure detection root is on path for imports
# _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# if _DETECTION_ROOT not in sys.path:
#     sys.path.insert(0, _DETECTION_ROOT)

# _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# if _PROJECT_ROOT not in sys.path:
#     sys.path.insert(0, _PROJECT_ROOT)

# # Import core detection module + utilities
# from scripts.detection import phone_det_complete as phone_core
# from tcs_scheduler import frame_should_process
# from detection_rate_limiter import get_rate_limiter

# import cv2
# from ultralytics import YOLO

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

# # ================= CONFIG ==================
# PROJECT_ROOT = _DETECTION_ROOT
# MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/phone_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# CONF_THRESHOLD = 0.25
# COOLDOWN_TIME  = 60    # Updated to 60s per user's tcs script
# PHONE_SAMPLE_EVERY = 5 # Adjusted for better throughput
# GPU_BATCH_SIZE      = 64
# GPU_QUEUE_SIZE      = 128
# BATCH_WAIT_TIMEOUT  = 0.2
# THREAD_DELAY        = 0.1


# # ================= SHARED STATE ============
# last_save_times = {}
# phone_counts    = {}
# _state_lock     = threading.Lock()
# _gpu_queue      = queue.Queue(maxsize=GPU_QUEUE_SIZE)

# # ================= YOLO ====================
# print("🔄 [PhoneWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [PhoneWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_phone(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "phone", camera_id_pk: str = ""):
#     results   = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
#     names     = results.names

#     phone_boxes = [
#         box for box in results.boxes
#         if names.get(int(box.cls[0]), "") == "cell phone"
#     ]

#     phone_count = len(phone_boxes)

#     for box in phone_boxes:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(frame, f"Phone {conf:.2f}", (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

#     cv2.putText(frame, f"Phones: {phone_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
#     now = time.time()

#     with _state_lock:
#         elapsed = now - last_save_times.get(key, 0)
#         if phone_boxes and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             if camera_id_pk:
#                 fname = f"{script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg"
#             elif camera_no:
#                 fname = f"{script_name}_{camera_no}_{ts}.jpg"
#             else:
#                 fname = f"{script_name}_{device_id}_{ts}.jpg"
            
#             path = os.path.join(save_folder, fname)
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(f"[PhoneWorker] 📱 Phone detected! pk={camera_id_pk} Device={device_id} Cam={camera_no} Count={phone_count} 💾 Saved \u2192 {path}")

#     return phone_count


# # =====================================================
# # 📡  RTSP PATH
# # =====================================================
# def phone_worker(frame_queue):
#     import torch
#     logger.info("\ud83d\udfe2 [PhoneWorker] RTSP batch-worker started")
#     stop_event = threading.Event()

#     gpu_t = threading.Thread(target=_hls_gpu_worker, args=(stop_event, RTSP_SAVE_FOLDER), daemon=True)
#     gpu_t.start()

#     try:
#         while True:
#             data = frame_queue.get()
#             if data is None: break

#             if isinstance(data, dict):
#                 frame        = data.get("frame")
#                 device_id    = str(data.get("device_id", "unknown"))
#                 camera_no    = str(data.get("camera_no") or data.get("ch_no") or "0")
#                 camera_id_pk = str(data.get("camera_id_pk", ""))
#             elif len(data) == 4:
#                 frame, device_id, camera_no, camera_id_pk = data
#             else:
#                 frame, device_id, camera_no = data
#                 camera_id_pk = ""

#             if frame is None: continue

#             try:
#                 _gpu_queue.put({
#                     "frame":        frame.copy(),
#                     "device_id":    str(device_id),
#                     "camera_no":    str(camera_no),
#                     "ch_no":        str(camera_no),
#                     "camera_id_pk": str(camera_id_pk),
#                     "script_name":  "phone",
#                     "source_type":  "RTSP",
#                     "state":        {},
#                 }, timeout=0.1)
#             except queue.Full: pass
#             del frame
#     finally:
#         stop_event.set()
#         gpu_t.join(timeout=5)
#         if torch.cuda.is_available(): torch.cuda.empty_cache()
#         logger.info("\ud83d\udd34 [PhoneWorker] GPU worker shut down")


# # =====================================================
# # 📡  HLS PATH
# # =====================================================
# def _hls_gpu_worker(stop_event, save_folder, cooldown_time=480):
#     import torch
#     logger.info("\ud83d\ude80 [PhoneWorker][HLS] GPU worker started (true batch mode)")
#     phone_core.get_yolo_model()
#     rate_limiter = get_rate_limiter('phone', max_per_minute=25)
#     cam_state    = {}
#     log_counter  = 0

#     while not stop_event.is_set():
#         batch = []
#         try:
#             batch.append(_gpu_queue.get(timeout=0.1))
#         except queue.Empty: continue

#         deadline = time.time() + BATCH_WAIT_TIMEOUT
#         while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
#             try: batch.append(_gpu_queue.get_nowait())
#             except queue.Empty: time.sleep(0.002)

#         inference_items = [{'frame': item['frame'], 'camera_id': item.get('device_id') or item.get('camera_id'), 'ch_no': item['ch_no']} for item in batch]

#         try: batch_results = phone_core.detect_phones_batch(inference_items)
#         except Exception as e:
#             logger.error(f"[PhoneWorker][HLS] Batch error: {e}")
#             for item in batch:
#                 if 'frame' in item: del item['frame']
#             continue

#         log_counter += 1
#         if torch.cuda.is_available() and log_counter % 50 == 0:
#             mem = torch.cuda.memory_allocated() / 1e9
#             logger.info(f"[PhoneWorker][GPU] batch={len(batch)} | mem={mem:.2f}GB")

#         for item, (annotated_frame, detected, phone_count) in zip(batch, batch_results):
#             if not detected: continue
#             camera_id   = item['camera_id']
#             ch_no       = item['ch_no']
#             script_name = item.get('script_name', 'phone')

#             now = time.time()
#             if now - cam_state.get(camera_id, 0) < cooldown_time: continue

#             should_save, _, _ = rate_limiter.should_save_detection(camera_id)
#             if not should_save: continue

#             cam_state[camera_id] = now
#             timestamp = time.strftime("%Y%m%d_%H%M%S")
            
#             if item.get("source_type") == "HLS":
#                 filename = os.path.join(save_folder, f"{script_name}_ch{ch_no}_{timestamp}.jpg")
#             else:
#                 device_id = item.get("device_id") or camera_id
#                 filename = os.path.join(save_folder, f"{script_name}_{device_id}_{ch_no}_{timestamp}.jpg")
            
#             cv2.imwrite(filename, annotated_frame)
#             logger.warning(f"[PhoneWorker][HLS] 📱 SAVED phones={phone_count} → {filename}")
            
#             # --- Report to DB (HLS only) ---
#             if item.get("source_type") == "HLS":
#                 try:
#                     phone_core.report_to_db_hls(
#                         ch_code=str(ch_no), 
#                         image_name=os.path.basename(filename),
#                         folder="phone_detection"
#                     )
#                 except Exception as e:
#                     logger.error(f"[PhoneWorker] DB Reporting Error: {e}")

#             del annotated_frame
#             if 'frame' in item: del item['frame']
#         del batch

#     logger.info("\ud83d\udd34 [PhoneWorker][HLS] GPU worker stopped")


# def _hls_camera_thread(cfg, stop_event):
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
#     camera_id   = cfg['camera_id']
#     script_name = cfg.get('script_code', 'phone')
#     ch_no       = cfg.get('camera_id', 'unknown')
#     initial_url = cfg.get('cctv_url') or cfg.get('stream_url', '')

#     hls = extract_hls_streaming_url(initial_url)
#     if not hls or not test_hls_stream(hls):
#         logger.error(f"[PhoneWorker][HLS] \u274c Stream failed for {camera_id}")
#         return

#     cap = open_hls_stream(hls)
#     if cap is None:
#         logger.error(f"[PhoneWorker][HLS] \u274c Could not open stream for {camera_id}")
#         return

#     logger.info(f"[PhoneWorker][HLS] \ud83d\udfe2 Camera thread started \u2192 {camera_id}")
#     frame_count = 0
#     while not stop_event.is_set():
#         ret, frame = cap.read()
#         if not ret: break
#         frame_count += 1
#         if not frame_should_process(frame_count, PHONE_SAMPLE_EVERY): continue
#         try:
#             _gpu_queue.put_nowait({"frame": frame, "camera_id": camera_id, "ch_no": ch_no, "script_name": script_name, "source_type": "HLS"})
#         except queue.Full:
#             del frame
#             continue
#         del frame
#     cap.release()
#     logger.info(f"[PhoneWorker][HLS] \ud83d\udd34 Camera thread stopped \u2192 {camera_id}")


# def phone_worker_hls(camera_configs, stop_event=None):
#     if isinstance(camera_configs, dict):
#         camera_configs = [camera_configs]
#     if stop_event is None:
#         stop_event = _STOP_EVENT

#     import torch
#     cv2.setNumThreads(0)

#     # Filter
#     valid_configs = []
#     for cfg in camera_configs:
#         cls_val = str(cfg.get('classification', '')).lower()
#         if 'server room' in cls_val or 'computer lab' in cls_val:
#             valid_configs.append(cfg)
#         else:
#             logger.info(f"[PhoneWorker] \ud83d\udeab Skipping {cfg.get('camera_id', 'unknown')} (Scene: {cls_val})")
            
#     if not valid_configs:
#         logger.warning("[PhoneWorker][HLS] \u274c No valid cameras found after Scene Classification filter. Exiting.")
#         return
        
#     camera_configs = valid_configs
#     phone_core.SAVE_FOLDER = HLS_SAVE_FOLDER

#     gpu_t = threading.Thread(target=_hls_gpu_worker, args=(stop_event, HLS_SAVE_FOLDER), daemon=True)
#     gpu_t.start()

#     from concurrent.futures import ThreadPoolExecutor
#     with ThreadPoolExecutor(max_workers=64) as executor:
#         for cfg in camera_configs:
#             executor.submit(_hls_camera_thread, cfg, stop_event)
#             time.sleep(THREAD_DELAY)

#     logger.info(f"[PhoneWorker][HLS] Started {len(camera_configs)} camera threads + 1 GPU worker")
#     stop_event.wait()
#     stop_event.set()
#     if torch.cuda.is_available(): torch.cuda.empty_cache()
#     logger.info("[PhoneWorker][HLS] \u2705 All HLS cameras completed")


# changes on 15-04-2026
import queue
import time
import os
import logging
import threading
import signal
import uuid
from datetime import datetime

# ================= PATH SETUP =================
import sys
# Ensure detection root is on path for imports
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Import core detection module + utilities
from scripts.detection import phone_det_complete as phone_core
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter

import cv2
from ultralytics import YOLO
# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402


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

# ================= CONFIG ==================
PROJECT_ROOT = _DETECTION_ROOT
MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/phone_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

CONF_THRESHOLD = 0.25
COOLDOWN_TIME  = 60    # Updated to 60s per user's tcs script
PHONE_SAMPLE_EVERY = 5 # Adjusted for better throughput
GPU_BATCH_SIZE      = 64
GPU_QUEUE_SIZE      = 128
BATCH_WAIT_TIMEOUT  = 0.2
THREAD_DELAY        = 0.1


# ================= SHARED STATE ============
last_save_times = {}
phone_counts    = {}
_state_lock     = threading.Lock()
_gpu_queue      = queue.Queue(maxsize=GPU_QUEUE_SIZE)

# ================= YOLO ====================
print("🔄 [PhoneWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [PhoneWorker] YOLO model loaded")


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_phone(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "phone", camera_id_pk: str = ""):
    results   = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
    names     = results.names

    phone_boxes = [
        box for box in results.boxes
        if names.get(int(box.cls[0]), "") == "cell phone"
    ]

    phone_count = len(phone_boxes)

    for box in phone_boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame, f"Phone {conf:.2f}", (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    cv2.putText(frame, f"Phones: {phone_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
    now = time.time()

    with _state_lock:
        elapsed = now - last_save_times.get(key, 0)
        if phone_boxes and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            if camera_id_pk:
                fname = f"{script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg"
            elif camera_no:
                fname = f"{script_name}_{camera_no}_{ts}.jpg"
            else:
                fname = f"{script_name}_{device_id}_{ts}.jpg"
            
            path = os.path.join(save_folder, fname)
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.warning(f"[PhoneWorker] 📱 Phone detected! pk={camera_id_pk} Device={device_id} Cam={camera_no} Count={phone_count} 💾 Saved \u2192 {path}")

    return phone_count


# =====================================================
# 📡  RTSP PATH
# =====================================================
def phone_worker(frame_queue):
    import torch
    logger.info("\ud83d\udfe2 [PhoneWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    gpu_t = threading.Thread(target=_hls_gpu_worker, args=(stop_event, RTSP_SAVE_FOLDER), daemon=True)
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None: break

            if isinstance(data, dict):
                frame        = data.get("frame")
                device_id    = str(data.get("device_id", "unknown"))
                camera_no    = str(data.get("camera_no") or data.get("ch_no") or "0")
                camera_id_pk = str(data.get("camera_id_pk", ""))
            elif len(data) == 4:
                frame, device_id, camera_no, camera_id_pk = data
            else:
                frame, device_id, camera_no = data
                camera_id_pk = ""

            if frame is None: continue

            try:
                _gpu_queue.put({
                    "frame":        frame.copy(),
                    "device_id":    str(device_id),
                    "camera_no":    str(camera_no),
                    "ch_no":        str(camera_no),
                    "camera_id_pk": str(camera_id_pk),
                    "script_name":  "phone",
                    "source_type":  "RTSP",
                    "state":        {},
                }, timeout=0.1)
            except queue.Full: pass
            del frame
    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        logger.info("\ud83d\udd34 [PhoneWorker] GPU worker shut down")


# =====================================================
# 📡  HLS PATH
# =====================================================
def _hls_gpu_worker(stop_event, save_folder, cooldown_time=480):
    import torch
    logger.info("\ud83d\ude80 [PhoneWorker][HLS] GPU worker started (true batch mode)")
    phone_core.get_yolo_model()
    rate_limiter = get_rate_limiter('phone', max_per_minute=25)
    cam_state    = {}
    log_counter  = 0

    while not stop_event.is_set():
        batch = []
        try:
            batch.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty: continue

        deadline = time.time() + BATCH_WAIT_TIMEOUT
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try: batch.append(_gpu_queue.get_nowait())
            except queue.Empty: time.sleep(0.002)

        inference_items = [{'frame': item['frame'], 'camera_id': item.get('device_id') or item.get('camera_id'), 'ch_no': item['ch_no']} for item in batch]

        try: batch_results = phone_core.detect_phones_batch(inference_items)
        except Exception as e:
            logger.error(f"[PhoneWorker][HLS] Batch error: {e}")
            for item in batch:
                if 'frame' in item: del item['frame']
            continue

        log_counter += 1
        if torch.cuda.is_available() and log_counter % 50 == 0:
            mem = torch.cuda.memory_allocated() / 1e9
            logger.info(f"[PhoneWorker][GPU] batch={len(batch)} | mem={mem:.2f}GB")

        for item, (annotated_frame, detected, phone_count) in zip(batch, batch_results):
            if not detected: continue
            camera_id   = item['camera_id']
            ch_no       = item['ch_no']
            script_name = item.get('script_name', 'phone')

            now = time.time()
            if now - cam_state.get(camera_id, 0) < cooldown_time: continue

            should_save, _, _ = rate_limiter.should_save_detection(camera_id)
            if not should_save: continue

            cam_state[camera_id] = now
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            
            if item.get("source_type") == "HLS":
                _uid = str(uuid.uuid4())
                _exam_id = str(os.environ.get("EXAM_ID", "0")).strip()
                filename = os.path.join(save_folder, f"{script_name}_ch{ch_no}_exam{_exam_id}_{timestamp}_{_uid}.jpg")
            else:
                device_id = item.get("device_id") or camera_id
                filename = os.path.join(save_folder, f"{script_name}_{device_id}_{ch_no}_{timestamp}.jpg")
            
            cv2.imwrite(filename, annotated_frame)
            logger.warning(f"[PhoneWorker][HLS] 📱 SAVED phones={phone_count} → {filename}")
            
            # --- Report to DB (HLS only) ---
            if item.get("source_type") == "HLS":
                try:
                    phone_core.report_to_db_hls(
                        ch_code=str(ch_no), 
                        image_name=os.path.basename(filename),
                        folder="phone_detection"
                    )
                except Exception as e:
                    logger.error(f"[PhoneWorker] DB Reporting Error: {e}")

            del annotated_frame
            if 'frame' in item: del item['frame']
        del batch

    logger.info("\ud83d\udd34 [PhoneWorker][HLS] GPU worker stopped")


def _hls_camera_thread(cfg, stop_event):
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
    camera_id   = cfg['camera_id']
    script_name = cfg.get('script_code', 'phone')
    ch_no       = cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url') or cfg.get('stream_url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        logger.error(f"[PhoneWorker][HLS] \u274c Stream failed for {camera_id}")
        return

    cap = open_hls_stream(hls)
    if cap is None:
        logger.error(f"[PhoneWorker][HLS] \u274c Could not open stream for {camera_id}")
        return

    logger.info(f"[PhoneWorker][HLS] \ud83d\udfe2 Camera thread started \u2192 {camera_id}")
    frame_count = 0
    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret: break
        frame_count += 1
        if not frame_should_process(frame_count, PHONE_SAMPLE_EVERY): continue
        try:
            _gpu_queue.put_nowait({"frame": frame, "camera_id": camera_id, "ch_no": ch_no, "script_name": script_name, "source_type": "HLS"})
        except queue.Full:
            del frame
            continue
        del frame
    cap.release()
    logger.info(f"[PhoneWorker][HLS] \ud83d\udd34 Camera thread stopped \u2192 {camera_id}")


def phone_worker_hls(camera_configs, stop_event=None):
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]
    if stop_event is None:
        stop_event = _STOP_EVENT

    import torch
    cv2.setNumThreads(0)

    # Filter
    valid_configs = []
    for cfg in camera_configs:
        cls_val = str(cfg.get('classification', '')).lower()
        if 'server room' in cls_val or 'computer lab' in cls_val:
            valid_configs.append(cfg)
        else:
            logger.info(f"[PhoneWorker] \ud83d\udeab Skipping {cfg.get('camera_id', 'unknown')} (Scene: {cls_val})")
            
    if not valid_configs:
        logger.warning("[PhoneWorker][HLS] \u274c No valid cameras found after Scene Classification filter. Exiting.")
        return
        
    camera_configs = valid_configs
    phone_core.SAVE_FOLDER = HLS_SAVE_FOLDER

    gpu_t = threading.Thread(target=_hls_gpu_worker, args=(stop_event, HLS_SAVE_FOLDER), daemon=True)
    gpu_t.start()

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in camera_configs:
            executor.submit(_hls_camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    logger.info(f"[PhoneWorker][HLS] Started {len(camera_configs)} camera threads + 1 GPU worker")
    stop_event.wait()
    stop_event.set()
    if torch.cuda.is_available(): torch.cuda.empty_cache()
    logger.info("[PhoneWorker][HLS] \u2705 All HLS cameras completed")