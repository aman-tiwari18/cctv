# # # # import time
# # # # import os
# # # # import logging
# # # # from datetime import datetime
# # # # import cv2
# # # # from ultralytics import YOLO

# # # # # ================= LOGGING =================
# # # # logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # # # # ================= CONFIG ==================
# # # # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# # # # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # # # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")

# # # # MIN_PERSONS = 2
# # # # CONF_THRESHOLD = 0.45
# # # # COOLDOWN_TIME = 180  # seconds

# # # # DEVICE_ID = "DAV_NVR"
# # # # CAMERA_NO = "CH19"

# # # # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # # # ================= YOLO ====================
# # # # print("🔄 [EntryExitWorker] Loading YOLO model...")
# # # # yolo_model = YOLO(MODEL_PATH)

# # # # last_save_times = {}

# # # # # =====================================================
# # # # # SAME LOGIC (frame → entry/exit detection)
# # # # # =====================================================
# # # # def detect_entry_exit(frame, device_id, camera_no):
# # # #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# # # #     person_detections = [
# # # #         box for box in results.boxes
# # # #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# # # #     ]

# # # #     person_count = len(person_detections)
# # # #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# # # #     for box in person_detections:
# # # #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# # # #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

# # # #     key = f"{device_id}_{camera_no}"
# # # #     now = time.time()
# # # #     elapsed = now - last_save_times.get(key, 0)

# # # #     entry_exit_detected = person_count >= MIN_PERSONS

# # # #     if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# # # #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# # # #         path = (
# # # #             f"{SAVE_FOLDER}/{key}_{ts}"
# # # #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# # # #         )
# # # #         cv2.imwrite(path, frame)
# # # #         last_save_times[key] = now
# # # #         logging.info(
# # # #             f"[EntryExitWorker] 🚪 Entry/Exit detected! Count={person_count}, saved={path}"
# # # #         )

# # # #     return entry_exit_detected, person_count

# # # # # =====================================================
# # # # # WORKER LOOP
# # # # # =====================================================
# # # # def entry_exit_worker(frame_queue):
# # # #     logging.info("🟢 Entry/Exit Worker started")

# # # #     while True:
# # # #         frame = frame_queue.get()

# # # #         if frame is None:
# # # #             logging.info("🔴 Entry/Exit Worker stopping")
# # # #             break

# # # #         # IMPORTANT: work on a copy
# # # #         frame = frame.copy()

# # # #         detect_entry_exit(frame, DEVICE_ID, CAMERA_NO)






















# # # #working before hls
# # # #entry_exit_worker.py
# # # # import time
# # # # import os
# # # # import logging
# # # # from datetime import datetime
# # # # import cv2
# # # # from ultralytics import YOLO

# # # # # ================= LOGGING =================
# # # # logging.basicConfig(
# # # #     level=logging.INFO,
# # # #     format="%(asctime)s - %(levelname)s - %(message)s"
# # # # )

# # # # # ================= CONFIG ==================
# # # # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# # # # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # # # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")

# # # # MIN_PERSONS = 2
# # # # CONF_THRESHOLD = 0.45
# # # # COOLDOWN_TIME = 180  # seconds

# # # # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # # # ================= YOLO ====================
# # # # print("🔄 [EntryExitWorker] Loading YOLO model...")
# # # # yolo_model = YOLO(MODEL_PATH)

# # # # last_save_times = {}

# # # # # =====================================================
# # # # # ENTRY EXIT DETECTION
# # # # # =====================================================
# # # # def detect_entry_exit(frame, device_id, camera_no):
# # # #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# # # #     person_detections = [
# # # #         box for box in results.boxes
# # # #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# # # #     ]

# # # #     person_count = len(person_detections)
# # # #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# # # #     # draw boxes
# # # #     for box in person_detections:
# # # #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# # # #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

# # # #     key = f"{device_id}_{camera_no}"
# # # #     now = time.time()
# # # #     elapsed = now - last_save_times.get(key, 0)

# # # #     entry_exit_detected = person_count >= MIN_PERSONS

# # # #     if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# # # #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# # # #         path = (
# # # #             f"{SAVE_FOLDER}/{key}_{ts}"
# # # #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# # # #         )
# # # #         cv2.imwrite(path, frame)
# # # #         last_save_times[key] = now

# # # #         logging.info(
# # # #             f"[EntryExitWorker] 🚪 Entry/Exit detected! "
# # # #             f"Device={device_id} Cam={camera_no} "
# # # #             f"Count={person_count}, saved={path}"
# # # #         )

# # # #     return entry_exit_detected, person_count

# # # # # =====================================================
# # # # # WORKER LOOP (UPDATED)
# # # # # =====================================================
# # # # def entry_exit_worker(frame_queue):
# # # #     logging.info("🟢 Entry/Exit Worker started")

# # # #     while True:
# # # #         data = frame_queue.get()

# # # #         # 🔴 stop signal
# # # #         if data is None:
# # # #             logging.info("🔴 Entry/Exit Worker stopping")
# # # #             break

# # # #         # ✅ NEW FORMAT
# # # #         frame, device_id, camera_no = data

# # # #         frame = frame.copy()

# # # #         detect_entry_exit(frame, device_id, camera_no)






















# # # #test
# # # # workers/entry_exit_worker.py
# # # """
# # # Entry/Exit Worker — supports both RTSP (via master_pipeline producer)
# # # and HLS (via its own internal OpenCV reader).

# # # Merged from:
# # #   - Entry_exit_det.py      (RTSP / DSS flow)
# # #   - entry_exit_det_tcs.py  (HLS / TCS flow)
# # # """

# # # import time
# # # import os
# # # import logging
# # # import threading
# # # import signal
# # # from datetime import datetime

# # # import cv2
# # # from ultralytics import YOLO

# # # # ================= GRACEFUL STOP FLAG =================
# # # _STOP_EVENT = threading.Event()

# # # def _handle_stop(sig, frame):
# # #     _STOP_EVENT.set()

# # # signal.signal(signal.SIGINT,  _handle_stop)
# # # signal.signal(signal.SIGTERM, _handle_stop)

# # # # ================= LOGGING =================
# # # logging.basicConfig(
# # #     level=logging.INFO,
# # #     format="%(asctime)s - %(levelname)s - %(message)s"
# # # )
# # # logger = logging.getLogger(__name__)

# # # # ================= CONFIG ==================
# # # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # # MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")
# # # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")

# # # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # # MIN_PERSONS      = 2      # alert if persons >= this
# # # CONF_THRESHOLD   = 0.45
# # # COOLDOWN_TIME    = 180    # seconds between saves per camera

# # # HLS_SAMPLE_EVERY = 5      # process every Nth frame
# # # HLS_FAIL_LIMIT   = 3      # consecutive failures before giving up

# # # # ================= SHARED STATE ============
# # # last_save_times = {}       # key → last save epoch
# # # person_counts   = {}       # key → cumulative person count
# # # _state_lock     = threading.Lock()

# # # # ================= YOLO ====================
# # # logger.info("🔄 [EntryExitWorker] Loading YOLO model...")
# # # yolo_model = YOLO(MODEL_PATH)
# # # logger.info("✅ [EntryExitWorker] YOLO model loaded")


# # # # =====================================================
# # # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # # =====================================================
# # # def detect_entry_exit(frame, device_id: str, camera_no: str, save_folder: str):
# # #     """
# # #     Run YOLO, draw boxes, save if entry/exit threshold met.

# # #     Returns:
# # #         (entry_exit_detected: bool, person_count: int)
# # #     """
# # #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# # #     person_detections = [
# # #         box for box in results.boxes
# # #         if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
# # #     ]

# # #     person_count = len(person_detections)
# # #     max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

# # #     # ── Draw bounding boxes ──────────────────────────────────
# # #     for box in person_detections:
# # #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# # #         conf = float(box.conf[0])
# # #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
# # #         cv2.putText(
# # #             frame, f"Person {conf:.2f}",
# # #             (x1, y1 - 10),
# # #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
# # #         )

# # #     # ── Overlay info ─────────────────────────────────────────
# # #     cv2.putText(frame, f"Persons: {person_count}",
# # #                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# # #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
# # #                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# # #     # ── Save logic ───────────────────────────────────────────
# # #     key = f"{device_id}_{camera_no}"
# # #     now = time.time()

# # #     with _state_lock:
# # #         elapsed             = now - last_save_times.get(key, 0)
# # #         entry_exit_detected = person_count >= MIN_PERSONS

# # #         if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# # #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# # #             path = os.path.join(
# # #                 save_folder,
# # #                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
# # #             )
# # #             cv2.imwrite(path, frame)
# # #             last_save_times[key] = now
# # #             logger.info(
# # #                 f"[EntryExitWorker] 🚪 Entry/Exit! "
# # #                 f"Device={device_id} Cam={camera_no} "
# # #                 f"Count={person_count} "
# # #                 f"💾 Saved → {path}"
# # #             )
# # #         elif entry_exit_detected:
# # #             remaining = int(COOLDOWN_TIME - elapsed)
# # #             logger.debug(
# # #                 f"[EntryExitWorker] ⏳ Detected but cooldown active "
# # #                 f"({remaining}s left) → {key}"
# # #             )

# # #         person_counts[key] = person_counts.get(key, 0) + person_count

# # #     return entry_exit_detected, person_count


# # # # =====================================================
# # # # 📡  RTSP PATH  — called by master_pipeline producer
# # # # =====================================================
# # # def entry_exit_worker(frame_queue):
# # #     """
# # #     Queue-based worker — receives (frame, device_id, camera_no)
# # #     packets from the RTSP producer.
# # #     """
# # #     logger.info("🟢 [EntryExitWorker] RTSP worker started")

# # #     while True:
# # #         data = frame_queue.get()
# # #         if data is None:
# # #             logger.info("🔴 [EntryExitWorker] RTSP worker stopping")
# # #             break

# # #         frame, device_id, camera_no = data
# # #         detect_entry_exit(
# # #             frame.copy(),
# # #             str(device_id),
# # #             str(camera_no),
# # #             save_folder=RTSP_SAVE_FOLDER
# # #         )


# # # # =====================================================
# # # # 📡  HLS PATH  — standalone, reads its own stream
# # # # =====================================================
# # # def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
# # #     """Open HLS stream and run entry/exit detection until stopped."""
# # #     from tcs_hls_utils import open_hls_stream

# # #     cap = open_hls_stream(hls_url)
# # #     if cap is None or not cap.isOpened():
# # #         logger.error(f"[EntryExitWorker][HLS] ❌ Could not open stream for {camera_id}")
# # #         return False

# # #     fps = cap.get(cv2.CAP_PROP_FPS)
# # #     if fps <= 0 or fps > 60:
# # #         fps = 25.0

# # #     logger.info(f"[EntryExitWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

# # #     frame_count = 0
# # #     fail_count  = 0
# # #     start_time  = time.time()

# # #     label = camera_name if camera_name else camera_id

# # #     try:
# # #         while not _STOP_EVENT.is_set():
# # #             # Non-blocking read with 5s timeout
# # #             read_result = [None, None]
# # #             def _read():
# # #                 read_result[0], read_result[1] = cap.read()
# # #             t = threading.Thread(target=_read, daemon=True)
# # #             t.start()
# # #             t.join(timeout=5)

# # #             if _STOP_EVENT.is_set():
# # #                 break

# # #             ret, frame = read_result
# # #             if not ret or frame is None:
# # #                 fail_count += 1
# # #                 logger.warning(f"[EntryExitWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
# # #                 if fail_count >= HLS_FAIL_LIMIT:
# # #                     logger.error(f"[EntryExitWorker][HLS] ❌ Max failures → {camera_id}")
# # #                     break
# # #                 time.sleep(3)
# # #                 continue

# # #             fail_count   = 0
# # #             frame_count += 1

# # #             if frame_count % HLS_SAMPLE_EVERY == 0:
# # #                 detected, person_count = detect_entry_exit(
# # #                     frame.copy(),
# # #                     device_id=label,
# # #                     camera_no="",
# # #                     save_folder=HLS_SAVE_FOLDER
# # #                 )

# # #                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
# # #                     if detected:
# # #                         logger.info(
# # #                             f"[EntryExitWorker][HLS] 🚪 Entry/Exit: {person_count} person(s) → {camera_id}"
# # #                         )
# # #                     else:
# # #                         logger.info(
# # #                             f"[EntryExitWorker][HLS] ✅ Monitoring OK → {camera_id}"
# # #                         )

# # #             if max_frames and frame_count >= max_frames:
# # #                 break

# # #     except KeyboardInterrupt:
# # #         _STOP_EVENT.set()
# # #         logger.info(f"[EntryExitWorker][HLS] Interrupted → {camera_id}")
# # #     except Exception as e:
# # #         logger.error(f"[EntryExitWorker][HLS] Error → {camera_id}: {e}")
# # #     finally:
# # #         cap.release()
# # #         elapsed    = time.time() - start_time
# # #         actual_fps = frame_count / elapsed if elapsed > 0 else 0
# # #         logger.info(
# # #             f"[EntryExitWorker][HLS] 🔴 Stopped → {camera_id} | "
# # #             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
# # #         )

# # #     return True


# # # def entry_exit_worker_hls(camera_config: dict, max_frames=None):
# # #     """
# # #     HLS worker entry point — used by master_pipeline for HLS cameras.

# # #     camera_config = {
# # #         'camera_id':   str,
# # #         'stream_url':  str,
# # #         'camera_name': str,   # e.g. "11365_ENTRY_S39"
# # #     }
# # #     """
# # #     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

# # #     camera_id   = camera_config.get("camera_id", "unknown")
# # #     initial_url = camera_config.get("stream_url", "")
# # #     camera_name = camera_config.get("camera_name", "")

# # #     hls_url = extract_hls_streaming_url(initial_url)
# # #     if not hls_url:
# # #         logger.error(f"[EntryExitWorker][HLS] ❌ Could not resolve URL for {camera_id}")
# # #         return

# # #     if not test_hls_stream(hls_url):
# # #         logger.error(f"[EntryExitWorker][HLS] ❌ Stream test failed for {camera_id}")
# # #         return

# # #     logger.info(f"[EntryExitWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
# # #     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)



# # # added by samarth


# # #test
# # # workers/entry_exit_worker.py
# # """
# # Entry/Exit Worker — supports both RTSP (via master_pipeline producer)
# # and HLS (via its own internal OpenCV reader).

# # Merged from:
# #   - Entry_exit_det.py      (RTSP / DSS flow)
# #   - entry_exit_det_tcs.py  (HLS / TCS flow)
# # """

# # import queue
# # import time
# # import os
# # import logging
# # import threading
# # import signal
# # from datetime import datetime

# # import cv2
# # from ultralytics import YOLO

# # # ================= GRACEFUL STOP FLAG =================
# # _STOP_EVENT = threading.Event()

# # def _handle_stop(sig, frame):
# #     _STOP_EVENT.set()

# # import threading
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
# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")
# # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")

# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # MIN_PERSONS      = 2      # alert if persons >= this
# # CONF_THRESHOLD   = 0.45
# # COOLDOWN_TIME    = 180    # seconds between saves per camera

# # HLS_SAMPLE_EVERY = 5      # process every Nth frame
# # HLS_FAIL_LIMIT   = 3      # consecutive failures before giving up

# # # ================= SHARED STATE ============
# # last_save_times = {}       # key → last save epoch
# # person_counts   = {}       # key → cumulative person count
# # _state_lock     = threading.Lock()

# # # ================= YOLO ====================
# # logger.info("🔄 [EntryExitWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)
# # logger.info("✅ [EntryExitWorker] YOLO model loaded")


# # # =====================================================
# # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # =====================================================
# # def detect_entry_exit(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "entry_exit", camera_id_pk: str = ""):
# #     """
# #     Run YOLO, draw boxes, save if entry/exit threshold met.
# #     camera_id_pk is the DB primary key, used for unique file naming.

# #     Returns:
# #         (entry_exit_detected: bool, person_count: int)
# #     """
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     person_detections = [
# #         box for box in results.boxes
# #         if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
# #     ]

# #     person_count = len(person_detections)
# #     max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

# #     # ── Draw bounding boxes ──────────────────────────────────
# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
# #         cv2.putText(
# #             frame, f"Person {conf:.2f}",
# #             (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
# #         )

# #     # ── Overlay info ─────────────────────────────────────────
# #     cv2.putText(frame, f"Persons: {person_count}",
# #                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
# #                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     # ── Save logic ───────────────────────────────────────────
# #     # Use DB primary key if available for uniqueness
# #     key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# #     now = time.time()

# #     with _state_lock:
# #         elapsed             = now - last_save_times.get(key, 0)
# #         entry_exit_detected = person_count >= MIN_PERSONS

# #         if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #             # Format: {script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg
# #             if camera_id_pk:
# #                 fname = f"{script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg"
# #             elif camera_no:
# #                 fname = f"{script_name}_{camera_no}_{ts}.jpg"
# #             else:
# #                 fname = f"{script_name}_{device_id}_{ts}.jpg"
            
# #             path = os.path.join(save_folder, fname)
# #             cv2.imwrite(path, frame)
# #             last_save_times[key] = now
# #             logger.info(
# #                 f"[EntryExitWorker] 🚪 Entry/Exit! "
# #                 f"pk={camera_id_pk} Device={device_id} Cam={camera_no} "
# #                 f"Count={person_count} "
# #                 f"💾 Saved → {path}"
# #             )
# #         elif entry_exit_detected:
# #             remaining = int(COOLDOWN_TIME - elapsed)
# #             logger.debug(
# #                 f"[EntryExitWorker] ⏳ Detected but cooldown active "
# #                 f"({remaining}s left) → {key}"
# #             )

# #         person_counts[key] = person_counts.get(key, 0) + person_count

# #     return entry_exit_detected, person_count


# # # =====================================================
# # # 📡  RTSP PATH  — called by master_pipeline producer
# # # =====================================================
# # def entry_exit_worker(frame_queue):
# #     """
# #     RTSP Worker — GPU Batch Queue Architecture.
# #     Receives packets from the RTSP producer and pushes them into
# #     the shared _gpu_queue for batch inference.
# #     """
# #     import torch
# #     logger.info("🟢 [EntryExitWorker] RTSP batch-worker started")
# #     stop_event = threading.Event()

# #     # Start the SAME GPU batch worker that HLS uses
# #     gpu_t = threading.Thread(
# #         target=_hls_gpu_batch_worker,
# #         args=(stop_event, RTSP_SAVE_FOLDER),
# #         daemon=True
# #     )
# #     gpu_t.start()

# #     try:
# #         while True:
# #             data = frame_queue.get()
# #             if data is None:
# #                 logger.info("🔴 [EntryExitWorker] RTSP batch-worker stopping")
# #                 break

# #             # Unpack — supports dict, 4-tuple, 3-tuple
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

# #             if frame is None:
# #                 continue

# #             try:
# #                 _gpu_queue.put({
# #                     "frame":        frame.copy(),
# #                     "device_id":    str(device_id),
# #                     "camera_no":    str(camera_no),
# #                     "ch_no":        str(camera_no), # for compatibility
# #                     "camera_id_pk": str(camera_id_pk),
# #                     "script_name":  "EntryExit",
# #                     "source_type":  "RTSP",
# #                     "state":        {},
# #                 }, timeout=0.1)
# #             except queue.Full:
# #                 pass
# #             del frame

# #     finally:
# #         stop_event.set()
# #         gpu_t.join(timeout=5)
# #         if torch.cuda.is_available():
# #             torch.cuda.empty_cache()
# #         logger.info("🔴 [EntryExitWorker] GPU worker shut down")


# # # =====================================================
# # # 📡  HLS PATH  — GPU Batch Queue Architecture
# # # =====================================================
# # #
# # # Architecture (from entry_exit_det_tcs.py):
# # #   - Camera threads read HLS streams → push frames to gpu_queue
# # #   - Single gpu_worker thread pulls batches → runs detection
# # #   - Uses entry_core (Entry_exit_det.py) for actual detection
# # #   - tcs_scheduler for frame sampling
# # #   - External cooldown + rate limiter for save control
# # # =====================================================

# # import sys

# # # Ensure detection root is on path for imports
# # _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # if _DETECTION_ROOT not in sys.path:
# #     sys.path.insert(0, _DETECTION_ROOT)

# # _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# # if _PROJECT_ROOT not in sys.path:
# #     sys.path.insert(0, _PROJECT_ROOT)

# # # Import core detection module + utilities
# # from scripts.detection import Entry_exit_det as entry_core
# # from tcs_scheduler import frame_should_process
# # from detection_rate_limiter import get_rate_limiter

# # # ── GPU Queue Config ─────────────────────────────────
# # GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
# # GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "256"))
# # THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0
# # ENTRY_SAMPLE_EVERY = 20  # 🔥 1/20 sampling as per user snippet

# # _gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)
# # _last_save_time = {}
# # _HLS_GPU_WORKER = None
# # _HLS_GPU_LOCK = threading.Lock()


# # def _ensure_shared_hls_gpu_worker(save_folder):
# #     """Start one shared HLS GPU worker per process (if not already running)."""
# #     global _HLS_GPU_WORKER
# #     with _HLS_GPU_LOCK:
# #         if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
# #             _HLS_GPU_WORKER = threading.Thread(
# #                 target=_hls_gpu_batch_worker,
# #                 args=(_STOP_EVENT, save_folder),
# #                 daemon=True,
# #                 name="entry_exit_hls_gpu_worker",
# #             )
# #             _HLS_GPU_WORKER.start()



# # def _hls_gpu_batch_worker(stop_event, save_folder, cooldown_time=30):
# #     """
# #     GPU batch worker — pulls frames from _gpu_queue in batches,
# #     runs entry_core.detect_persons_batch() for high performance.
# #     """
# #     logger.info("🚀 [EntryExitWorker][HLS] GPU batch worker started (TRUE BATCH)")
# #     entry_core.get_yolo_model()

# #     while not stop_event.is_set():
# #         batch_items = []

# #         # Pull first item (blocking with timeout)
# #         try:
# #             batch_items.append(_gpu_queue.get(timeout=0.1))
# #         except queue.Empty:
# #             continue

# #         # Fill batch until limit or timeout
# #         deadline = time.time() + 0.2
# #         while len(batch_items) < GPU_BATCH_SIZE and time.time() < deadline:
# #             try:
# #                 batch_items.append(_gpu_queue.get_nowait())
# #             except queue.Empty:
# #                 time.sleep(0.002)

# #         if not batch_items:
# #             continue

# #         logger.debug(f"[BATCH] Processing batch of {len(batch_items)} frames")

# #         try:
# #             # 🔥 TRUE GPU BATCHING
# #             batch_results = entry_core.detect_persons_batch(batch_items)
            
# #             for item, (processed_frame, detected, person_count) in zip(batch_items, batch_results):
# #                 camera_id = item.get('device_id') or item.get('camera_id')
# #                 ch_no     = item['ch_no']
# #                 script_name = item.get('script_name', 'EntryExit')

# #                 if not detected:
# #                     if 'frame' in item: del item['frame']
# #                     continue

# #                 now = time.time()
# #                 last_time = _last_save_time.get(camera_id, 0)

# #                 if now - last_time < cooldown_time:
# #                     if 'frame' in item: del item['frame']
# #                     continue

# #                 _last_save_time[camera_id] = now
# #                 timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                
# #                 # ── Source-Aware Naming Format ──────────────
# #                 if item.get("source_type") == "HLS":
# #                     filename = os.path.join(
# #                         save_folder,
# #                         f"{script_name}_ch{ch_no}_{timestamp}.jpg"
# #                     )
# #                 else:
# #                     # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
# #                     dev_id = item.get("device_id") or camera_id
# #                     filename = os.path.join(
# #                         save_folder,
# #                         f"{script_name}_{dev_id}_{ch_no}_{timestamp}.jpg"
# #                     )

# #                 cv2.imwrite(filename, processed_frame)
# #                 logger.info(f"[SAVE] 🚪 {filename} (Persons: {person_count})")
                
# #                 # Cleanup
# #                 if 'frame' in item: del item['frame']
# #                 del processed_frame

# #             del batch_items
# #             if 'batch_results' in locals(): del batch_results

# #         except Exception as e:
# #             logger.error(f"[BATCH ERROR][Entry/Exit] {e}")
# #             for item in batch_items:
# #                 if 'frame' in item: del item['frame']
# #             del batch_items

# #     logger.info("🔴 [EntryExitWorker][HLS] GPU batch worker stopped")



# # def _hls_camera_thread(cfg, stop_event):
# #     """
# #     Camera reader thread — opens HLS stream, reads frames,
# #     applies motion filtering + sampling, pushes to gpu_queue.
# #     """
# #     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# #     from motion_detector import get_motion_detector

# #     camera_id   = cfg['camera_id']
# #     ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
# #     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

# #     hls = extract_hls_streaming_url(initial_url)
# #     if not hls or not test_hls_stream(hls):
# #         logger.error(f"[{camera_id}] Stream failed or invalid URL")
# #         return

# #     cap = open_hls_stream(hls)
# #     if not cap or not cap.isOpened():
# #         logger.error(f"[{camera_id}] Could not open stream")
# #         return

# #     motion_detector = get_motion_detector(camera_id, motion_threshold=800)
# #     frame_count = 0

# #     while not stop_event.is_set():
# #         ret, frame = cap.read()
# #         if not ret:
# #             logger.warning(f"[EntryExitWorker][HLS] ⚠️ Stream ended → {camera_id}")
# #             break

# #         frame_count += 1
        
# #         # 🔥 1/20 sampling
# #         if not frame_should_process(frame_count, ENTRY_SAMPLE_EVERY):
# #             continue

# #         # 🔥 CPU Motion Detection Pre-filtering
# #         if not motion_detector.has_motion(frame):
# #             continue

# #         try:
# #             _gpu_queue.put({
# #                 "frame": frame.copy(),
# #                 "camera_id": camera_id,
# #                 "ch_no": ch_no,
# #                 "script_name": "EntryExit",
# #                 "source_type": "HLS",
# #             }, timeout=0.1)
# #         except queue.Full:
# #             del frame
# #             continue
        
# #         # Cleanup
# #         del frame

# #     cap.release()
# #     logger.info(f"[EntryExitWorker][HLS] 🔴 Camera thread stopped → {camera_id}")


# # def entry_exit_worker_hls(camera_configs, stop_event=None):
# #     """
# #     HLS worker entry point — GPU batch queue architecture.

# #     Accepts a LIST of camera configs (from camera_loader) and runs
# #     all cameras with a shared GPU worker thread.

# #     Can also accept a single dict for backward compatibility.
# #     """
# #     import torch
# #     cv2.setNumThreads(0) # Prevent thread explosion

# #     # Handle single config (backward compat)
# #     if isinstance(camera_configs, dict):
# #         camera_configs = [camera_configs]

# #     # In master_pipeline HLS flow this function is called per camera.
# #     # Keep one shared GPU worker alive across calls (server-like behavior).
# #     persistent_mode = stop_event is None
# #     if stop_event is None:
# #         stop_event = _STOP_EVENT

# #     # Override save folder on entry_core
# #     entry_core.SAVE_FOLDER = HLS_SAVE_FOLDER

# #     # 🔥 SCENE FILTER (case-insensitive)
# #     valid_scenes = ['entry', 'outside', 'exit', 'outdoor', 'outside area', 'outside scene']
# #     filtered_configs = []
# #     for cfg in camera_configs:
# #         stream_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
# #         if not stream_url:
# #             continue
# #         cls_raw = (
# #             cfg.get('classification')
# #             or cfg.get('scene_classification')
# #             or cfg.get('Scene Classification')
# #             or ''
# #         )
# #         cls_val = str(cls_raw).strip().lower()

# #         # If classification is missing/unknown, allow instead of dropping all cameras.
# #         if cls_val in ('', 'nan', 'none', 'null'):
# #             filtered_configs.append(cfg)
# #             continue

# #         if any(scene in cls_val for scene in valid_scenes):
# #             filtered_configs.append(cfg)

# #     if not filtered_configs:
# #         logger.warning(f"[EntryExitWorker][HLS] No cameras matched Entry/Exit scenes. Skipping.")
# #         return


# #     # Start GPU worker thread
# #     if persistent_mode:
# #         _ensure_shared_hls_gpu_worker(HLS_SAVE_FOLDER)
# #     else:
# #         gpu_t = threading.Thread(
# #             target=_hls_gpu_batch_worker,
# #             args=(stop_event, HLS_SAVE_FOLDER),
# #             daemon=True
# #         )
# #         gpu_t.start()

# #     # Start Camera Threads with ThreadPoolExecutor
# #     from concurrent.futures import ThreadPoolExecutor
# #     with ThreadPoolExecutor(max_workers=64) as executor:
# #         for cfg in filtered_configs:
# #             executor.submit(_hls_camera_thread, cfg, stop_event)
# #             time.sleep(THREAD_START_DELAY)

# #     stop_event.wait()

# #     if persistent_mode:
# #         logger.info("[EntryExitWorker][HLS] ✅ Camera threads completed (shared GPU worker still running)")
# #         return

# #     # Signal dedicated GPU worker to stop (non-persistent mode only)
# #     stop_event.set()

# #     if torch.cuda.is_available():
# #         torch.cuda.empty_cache()

# #     logger.info("[EntryExitWorker][HLS] ✅ All HLS cameras completed")




# # # import time
# # # import os
# # # import logging
# # # from datetime import datetime
# # # import cv2
# # # from ultralytics import YOLO

# # # # ================= LOGGING =================
# # # logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # # # ================= CONFIG ==================
# # # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# # # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")

# # # MIN_PERSONS = 2
# # # CONF_THRESHOLD = 0.45
# # # COOLDOWN_TIME = 180  # seconds

# # # DEVICE_ID = "DAV_NVR"
# # # CAMERA_NO = "CH19"

# # # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # # ================= YOLO ====================
# # # print("🔄 [EntryExitWorker] Loading YOLO model...")
# # # yolo_model = YOLO(MODEL_PATH)

# # # last_save_times = {}

# # # # =====================================================
# # # # SAME LOGIC (frame → entry/exit detection)
# # # # =====================================================
# # # def detect_entry_exit(frame, device_id, camera_no):
# # #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# # #     person_detections = [
# # #         box for box in results.boxes
# # #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# # #     ]

# # #     person_count = len(person_detections)
# # #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# # #     for box in person_detections:
# # #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# # #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

# # #     key = f"{device_id}_{camera_no}"
# # #     now = time.time()
# # #     elapsed = now - last_save_times.get(key, 0)

# # #     entry_exit_detected = person_count >= MIN_PERSONS

# # #     if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# # #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# # #         path = (
# # #             f"{SAVE_FOLDER}/{key}_{ts}"
# # #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# # #         )
# # #         cv2.imwrite(path, frame)
# # #         last_save_times[key] = now
# # #         logging.info(
# # #             f"[EntryExitWorker] 🚪 Entry/Exit detected! Count={person_count}, saved={path}"
# # #         )

# # #     return entry_exit_detected, person_count

# # # # =====================================================
# # # # WORKER LOOP
# # # # =====================================================
# # # def entry_exit_worker(frame_queue):
# # #     logging.info("🟢 Entry/Exit Worker started")

# # #     while True:
# # #         frame = frame_queue.get()

# # #         if frame is None:
# # #             logging.info("🔴 Entry/Exit Worker stopping")
# # #             break

# # #         # IMPORTANT: work on a copy
# # #         frame = frame.copy()

# # #         detect_entry_exit(frame, DEVICE_ID, CAMERA_NO)






















# # #working before hls
# # #entry_exit_worker.py
# # # import time
# # # import os
# # # import logging
# # # from datetime import datetime
# # # import cv2
# # # from ultralytics import YOLO

# # # # ================= LOGGING =================
# # # logging.basicConfig(
# # #     level=logging.INFO,
# # #     format="%(asctime)s - %(levelname)s - %(message)s"
# # # )

# # # # ================= CONFIG ==================
# # # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# # # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")

# # # MIN_PERSONS = 2
# # # CONF_THRESHOLD = 0.45
# # # COOLDOWN_TIME = 180  # seconds

# # # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # # ================= YOLO ====================
# # # print("🔄 [EntryExitWorker] Loading YOLO model...")
# # # yolo_model = YOLO(MODEL_PATH)

# # # last_save_times = {}

# # # # =====================================================
# # # # ENTRY EXIT DETECTION
# # # # =====================================================
# # # def detect_entry_exit(frame, device_id, camera_no):
# # #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# # #     person_detections = [
# # #         box for box in results.boxes
# # #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# # #     ]

# # #     person_count = len(person_detections)
# # #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# # #     # draw boxes
# # #     for box in person_detections:
# # #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# # #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

# # #     key = f"{device_id}_{camera_no}"
# # #     now = time.time()
# # #     elapsed = now - last_save_times.get(key, 0)

# # #     entry_exit_detected = person_count >= MIN_PERSONS

# # #     if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# # #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# # #         path = (
# # #             f"{SAVE_FOLDER}/{key}_{ts}"
# # #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# # #         )
# # #         cv2.imwrite(path, frame)
# # #         last_save_times[key] = now

# # #         logging.info(
# # #             f"[EntryExitWorker] 🚪 Entry/Exit detected! "
# # #             f"Device={device_id} Cam={camera_no} "
# # #             f"Count={person_count}, saved={path}"
# # #         )

# # #     return entry_exit_detected, person_count

# # # # =====================================================
# # # # WORKER LOOP (UPDATED)
# # # # =====================================================
# # # def entry_exit_worker(frame_queue):
# # #     logging.info("🟢 Entry/Exit Worker started")

# # #     while True:
# # #         data = frame_queue.get()

# # #         # 🔴 stop signal
# # #         if data is None:
# # #             logging.info("🔴 Entry/Exit Worker stopping")
# # #             break

# # #         # ✅ NEW FORMAT
# # #         frame, device_id, camera_no = data

# # #         frame = frame.copy()

# # #         detect_entry_exit(frame, device_id, camera_no)






















# # #test
# # # workers/entry_exit_worker.py
# # """
# # Entry/Exit Worker — supports both RTSP (via master_pipeline producer)
# # and HLS (via its own internal OpenCV reader).

# # Merged from:
# #   - Entry_exit_det.py      (RTSP / DSS flow)
# #   - entry_exit_det_tcs.py  (HLS / TCS flow)
# # """

# # import time
# # import os
# # import logging
# # import threading
# # import signal
# # from datetime import datetime

# # import cv2
# # from ultralytics import YOLO

# # # ================= GRACEFUL STOP FLAG =================
# # _STOP_EVENT = threading.Event()

# # def _handle_stop(sig, frame):
# #     _STOP_EVENT.set()

# # signal.signal(signal.SIGINT,  _handle_stop)
# # signal.signal(signal.SIGTERM, _handle_stop)

# # # ================= LOGGING =================
# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s - %(levelname)s - %(message)s"
# # )
# # logger = logging.getLogger(__name__)

# # # ================= CONFIG ==================
# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")
# # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")

# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # MIN_PERSONS      = 2      # alert if persons >= this
# # CONF_THRESHOLD   = 0.45
# # COOLDOWN_TIME    = 180    # seconds between saves per camera

# # HLS_SAMPLE_EVERY = 5      # process every Nth frame
# # HLS_FAIL_LIMIT   = 3      # consecutive failures before giving up

# # # ================= SHARED STATE ============
# # last_save_times = {}       # key → last save epoch
# # person_counts   = {}       # key → cumulative person count
# # _state_lock     = threading.Lock()

# # # ================= YOLO ====================
# # logger.info("🔄 [EntryExitWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)
# # logger.info("✅ [EntryExitWorker] YOLO model loaded")


# # # =====================================================
# # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # =====================================================
# # def detect_entry_exit(frame, device_id: str, camera_no: str, save_folder: str):
# #     """
# #     Run YOLO, draw boxes, save if entry/exit threshold met.

# #     Returns:
# #         (entry_exit_detected: bool, person_count: int)
# #     """
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     person_detections = [
# #         box for box in results.boxes
# #         if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
# #     ]

# #     person_count = len(person_detections)
# #     max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

# #     # ── Draw bounding boxes ──────────────────────────────────
# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
# #         cv2.putText(
# #             frame, f"Person {conf:.2f}",
# #             (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
# #         )

# #     # ── Overlay info ─────────────────────────────────────────
# #     cv2.putText(frame, f"Persons: {person_count}",
# #                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
# #                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     # ── Save logic ───────────────────────────────────────────
# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()

# #     with _state_lock:
# #         elapsed             = now - last_save_times.get(key, 0)
# #         entry_exit_detected = person_count >= MIN_PERSONS

# #         if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #             path = os.path.join(
# #                 save_folder,
# #                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
# #             )
# #             cv2.imwrite(path, frame)
# #             last_save_times[key] = now
# #             logger.info(
# #                 f"[EntryExitWorker] 🚪 Entry/Exit! "
# #                 f"Device={device_id} Cam={camera_no} "
# #                 f"Count={person_count} "
# #                 f"💾 Saved → {path}"
# #             )
# #         elif entry_exit_detected:
# #             remaining = int(COOLDOWN_TIME - elapsed)
# #             logger.debug(
# #                 f"[EntryExitWorker] ⏳ Detected but cooldown active "
# #                 f"({remaining}s left) → {key}"
# #             )

# #         person_counts[key] = person_counts.get(key, 0) + person_count

# #     return entry_exit_detected, person_count


# # # =====================================================
# # # 📡  RTSP PATH  — called by master_pipeline producer
# # # =====================================================
# # def entry_exit_worker(frame_queue):
# #     """
# #     Queue-based worker — receives (frame, device_id, camera_no)
# #     packets from the RTSP producer.
# #     """
# #     logger.info("🟢 [EntryExitWorker] RTSP worker started")

# #     while True:
# #         data = frame_queue.get()
# #         if data is None:
# #             logger.info("🔴 [EntryExitWorker] RTSP worker stopping")
# #             break

# #         frame, device_id, camera_no = data
# #         detect_entry_exit(
# #             frame.copy(),
# #             str(device_id),
# #             str(camera_no),
# #             save_folder=RTSP_SAVE_FOLDER
# #         )


# # # =====================================================
# # # 📡  HLS PATH  — standalone, reads its own stream
# # # =====================================================
# # def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
# #     """Open HLS stream and run entry/exit detection until stopped."""
# #     from tcs_hls_utils import open_hls_stream

# #     cap = open_hls_stream(hls_url)
# #     if cap is None or not cap.isOpened():
# #         logger.error(f"[EntryExitWorker][HLS] ❌ Could not open stream for {camera_id}")
# #         return False

# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0

# #     logger.info(f"[EntryExitWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

# #     frame_count = 0
# #     fail_count  = 0
# #     start_time  = time.time()

# #     label = camera_name if camera_name else camera_id

# #     try:
# #         while not _STOP_EVENT.is_set():
# #             # Non-blocking read with 5s timeout
# #             read_result = [None, None]
# #             def _read():
# #                 read_result[0], read_result[1] = cap.read()
# #             t = threading.Thread(target=_read, daemon=True)
# #             t.start()
# #             t.join(timeout=5)

# #             if _STOP_EVENT.is_set():
# #                 break

# #             ret, frame = read_result
# #             if not ret or frame is None:
# #                 fail_count += 1
# #                 logger.warning(f"[EntryExitWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
# #                 if fail_count >= HLS_FAIL_LIMIT:
# #                     logger.error(f"[EntryExitWorker][HLS] ❌ Max failures → {camera_id}")
# #                     break
# #                 time.sleep(3)
# #                 continue

# #             fail_count   = 0
# #             frame_count += 1

# #             if frame_count % HLS_SAMPLE_EVERY == 0:
# #                 detected, person_count = detect_entry_exit(
# #                     frame.copy(),
# #                     device_id=label,
# #                     camera_no="",
# #                     save_folder=HLS_SAVE_FOLDER
# #                 )

# #                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
# #                     if detected:
# #                         logger.info(
# #                             f"[EntryExitWorker][HLS] 🚪 Entry/Exit: {person_count} person(s) → {camera_id}"
# #                         )
# #                     else:
# #                         logger.info(
# #                             f"[EntryExitWorker][HLS] ✅ Monitoring OK → {camera_id}"
# #                         )

# #             if max_frames and frame_count >= max_frames:
# #                 break

# #     except KeyboardInterrupt:
# #         _STOP_EVENT.set()
# #         logger.info(f"[EntryExitWorker][HLS] Interrupted → {camera_id}")
# #     except Exception as e:
# #         logger.error(f"[EntryExitWorker][HLS] Error → {camera_id}: {e}")
# #     finally:
# #         cap.release()
# #         elapsed    = time.time() - start_time
# #         actual_fps = frame_count / elapsed if elapsed > 0 else 0
# #         logger.info(
# #             f"[EntryExitWorker][HLS] 🔴 Stopped → {camera_id} | "
# #             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
# #         )

# #     return True


# # def entry_exit_worker_hls(camera_config: dict, max_frames=None):
# #     """
# #     HLS worker entry point — used by master_pipeline for HLS cameras.

# #     camera_config = {
# #         'camera_id':   str,
# #         'stream_url':  str,
# #         'camera_name': str,   # e.g. "11365_ENTRY_S39"
# #     }
# #     """
# #     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

# #     camera_id   = camera_config.get("camera_id", "unknown")
# #     initial_url = camera_config.get("stream_url", "")
# #     camera_name = camera_config.get("camera_name", "")

# #     hls_url = extract_hls_streaming_url(initial_url)
# #     if not hls_url:
# #         logger.error(f"[EntryExitWorker][HLS] ❌ Could not resolve URL for {camera_id}")
# #         return

# #     if not test_hls_stream(hls_url):
# #         logger.error(f"[EntryExitWorker][HLS] ❌ Stream test failed for {camera_id}")
# #         return

# #     logger.info(f"[EntryExitWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
# #     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)



# # added by samarth


# #test
# # workers/entry_exit_worker.py
# """
# Entry/Exit Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - Entry_exit_det.py      (RTSP / DSS flow)
#   - entry_exit_det_tcs.py  (HLS / TCS flow)
# """

# import queue
# import time
# import os
# import logging
# import threading
# import signal
# from datetime import datetime

# import cv2
# from ultralytics import YOLO

# # ================= GRACEFUL STOP FLAG =================
# _STOP_EVENT = threading.Event()

# def _handle_stop(sig, frame):
#     _STOP_EVENT.set()

# import threading
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
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# MIN_PERSONS      = 2      # alert if persons >= this
# CONF_THRESHOLD   = 0.45
# COOLDOWN_TIME    = 180    # seconds between saves per camera

# HLS_SAMPLE_EVERY = 5      # process every Nth frame
# HLS_FAIL_LIMIT   = 3      # consecutive failures before giving up

# # ================= SHARED STATE ============
# last_save_times = {}       # key → last save epoch
# person_counts   = {}       # key → cumulative person count
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [EntryExitWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [EntryExitWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_entry_exit(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "entry_exit", camera_id_pk: str = ""):
#     """
#     Run YOLO, draw boxes, save if entry/exit threshold met.
#     camera_id_pk is the DB primary key, used for unique file naming.

#     Returns:
#         (entry_exit_detected: bool, person_count: int)
#     """
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

#     # ── Draw bounding boxes ──────────────────────────────────
#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
#         cv2.putText(
#             frame, f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────────
#     cv2.putText(frame, f"Persons: {person_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────────
#     # Use DB primary key if available for uniqueness
#     key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
#     now = time.time()

#     with _state_lock:
#         elapsed             = now - last_save_times.get(key, 0)
#         entry_exit_detected = person_count >= MIN_PERSONS

#         if entry_exit_detected and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             # Format: {script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg
#             if camera_id_pk:
#                 fname = f"{script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg"
#             elif camera_no:
#                 fname = f"{script_name}_{camera_no}_{ts}.jpg"
#             else:
#                 fname = f"{script_name}_{device_id}_{ts}.jpg"
            
#             path = os.path.join(save_folder, fname)
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.info(
#                 f"[EntryExitWorker] 🚪 Entry/Exit! "
#                 f"pk={camera_id_pk} Device={device_id} Cam={camera_no} "
#                 f"Count={person_count} "
#                 f"💾 Saved → {path}"
#             )
#         elif entry_exit_detected:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[EntryExitWorker] ⏳ Detected but cooldown active "
#                 f"({remaining}s left) → {key}"
#             )

#         person_counts[key] = person_counts.get(key, 0) + person_count

#     return entry_exit_detected, person_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def entry_exit_worker(frame_queue):
#     """
#     RTSP Worker — GPU Batch Queue Architecture.
#     Receives packets from the RTSP producer and pushes them into
#     the shared _gpu_queue for batch inference.
#     """
#     import torch
#     logger.info("🟢 [EntryExitWorker] RTSP batch-worker started")
#     stop_event = threading.Event()

#     # Start the SAME GPU batch worker that HLS uses
#     gpu_t = threading.Thread(
#         target=_hls_gpu_batch_worker,
#         args=(stop_event, RTSP_SAVE_FOLDER),
#         daemon=True
#     )
#     gpu_t.start()

#     try:
#         while True:
#             data = frame_queue.get()
#             if data is None:
#                 logger.info("🔴 [EntryExitWorker] RTSP batch-worker stopping")
#                 break

#             # Unpack — supports dict, 4-tuple, 3-tuple
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

#             if frame is None:
#                 continue

#             try:
#                 _gpu_queue.put({
#                     "frame":        frame.copy(),
#                     "device_id":    str(device_id),
#                     "camera_no":    str(camera_no),
#                     "ch_no":        str(camera_no), # for compatibility
#                     "camera_id_pk": str(camera_id_pk),
#                     "script_name":  "EntryExit",
#                     "source_type":  "RTSP",
#                     "state":        {},
#                 }, timeout=0.1)
#             except queue.Full:
#                 pass
#             del frame

#     finally:
#         stop_event.set()
#         gpu_t.join(timeout=5)
#         if torch.cuda.is_available():
#             torch.cuda.empty_cache()
#         logger.info("🔴 [EntryExitWorker] GPU worker shut down")


# # =====================================================
# # 📡  HLS PATH  — GPU Batch Queue Architecture
# # =====================================================
# #
# # Architecture (from entry_exit_det_tcs.py):
# #   - Camera threads read HLS streams → push frames to gpu_queue
# #   - Single gpu_worker thread pulls batches → runs detection
# #   - Uses entry_core (Entry_exit_det.py) for actual detection
# #   - tcs_scheduler for frame sampling
# #   - External cooldown + rate limiter for save control
# # =====================================================

# import sys

# # Ensure detection root is on path for imports
# _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# if _DETECTION_ROOT not in sys.path:
#     sys.path.insert(0, _DETECTION_ROOT)

# _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
# if _PROJECT_ROOT not in sys.path:
#     sys.path.insert(0, _PROJECT_ROOT)

# # Import core detection module + utilities
# from scripts.detection import Entry_exit_det as entry_core
# from tcs_scheduler import frame_should_process
# from detection_rate_limiter import get_rate_limiter

# # ── GPU Queue Config ─────────────────────────────────
# GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
# GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "256"))
# THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0
# ENTRY_SAMPLE_EVERY = 20  # 🔥 1/20 sampling as per user snippet

# _gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)
# _last_save_time = {}
# _HLS_GPU_WORKER = None
# _HLS_GPU_LOCK = threading.Lock()


# def _ensure_shared_hls_gpu_worker(save_folder):
#     """Start one shared HLS GPU worker per process (if not already running)."""
#     global _HLS_GPU_WORKER
#     with _HLS_GPU_LOCK:
#         if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
#             _HLS_GPU_WORKER = threading.Thread(
#                 target=_hls_gpu_batch_worker,
#                 args=(_STOP_EVENT, save_folder),
#                 daemon=True,
#                 name="entry_exit_hls_gpu_worker",
#             )
#             _HLS_GPU_WORKER.start()



# def _hls_gpu_batch_worker(stop_event, save_folder, cooldown_time=30):
#     """
#     GPU batch worker — pulls frames from _gpu_queue in batches,
#     runs entry_core.detect_persons_batch() for high performance.
#     """
#     logger.info("🚀 [EntryExitWorker][HLS] GPU batch worker started (TRUE BATCH)")
#     entry_core.get_yolo_model()

#     while not stop_event.is_set():
#         batch_items = []

#         # Pull first item (blocking with timeout)
#         try:
#             batch_items.append(_gpu_queue.get(timeout=0.1))
#         except queue.Empty:
#             continue

#         # Fill batch until limit or timeout
#         deadline = time.time() + 0.2
#         while len(batch_items) < GPU_BATCH_SIZE and time.time() < deadline:
#             try:
#                 batch_items.append(_gpu_queue.get_nowait())
#             except queue.Empty:
#                 time.sleep(0.002)

#         if not batch_items:
#             continue

#         logger.debug(f"[BATCH] Processing batch of {len(batch_items)} frames")

#         try:
#             # 🔥 TRUE GPU BATCHING
#             batch_results = entry_core.detect_persons_batch(batch_items)
            
#             for item, (processed_frame, detected, person_count) in zip(batch_items, batch_results):
#                 camera_id = item.get('device_id') or item.get('camera_id')
#                 ch_no     = item['ch_no']
#                 script_name = item.get('script_name', 'EntryExit')

#                 if not detected:
#                     if 'frame' in item: del item['frame']
#                     continue

#                 now = time.time()
#                 last_time = _last_save_time.get(camera_id, 0)

#                 if now - last_time < cooldown_time:
#                     if 'frame' in item: del item['frame']
#                     continue

#                 _last_save_time[camera_id] = now
#                 timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                
#                 # ── Source-Aware Naming Format ──────────────
#                 if item.get("source_type") == "HLS":
#                     filename = os.path.join(
#                         save_folder,
#                         f"{script_name}_ch{ch_no}_{timestamp}.jpg"
#                     )
#                 else:
#                     # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
#                     dev_id = item.get("device_id") or camera_id
#                     filename = os.path.join(
#                         save_folder,
#                         f"{script_name}_{dev_id}_{ch_no}_{timestamp}.jpg"
#                     )

#                 cv2.imwrite(filename, processed_frame)
#                 logger.info(f"[SAVE] 🚪 {filename} (Persons: {person_count})")
                
#                 # --- Report to DB (HLS only) ---
#                 if item.get("source_type") == "HLS":
#                     try:
#                         entry_core.report_to_db_hls(
#                             ch_code=str(ch_no), 
#                             image_name=os.path.basename(filename),
#                             folder="entry_exit_detection"
#                         )
#                     except Exception as e:
#                         logger.error(f"[EntryExitWorker] DB Reporting Error: {e}")

#                 # Cleanup
#                 if 'frame' in item: del item['frame']
#                 del processed_frame

#             del batch_items
#             if 'batch_results' in locals(): del batch_results

#         except Exception as e:
#             logger.error(f"[BATCH ERROR][Entry/Exit] {e}")
#             for item in batch_items:
#                 if 'frame' in item: del item['frame']
#             del batch_items

#     logger.info("🔴 [EntryExitWorker][HLS] GPU batch worker stopped")



# def _hls_camera_thread(cfg, stop_event):
#     """
#     Camera reader thread — opens HLS stream, reads frames,
#     applies motion filtering + sampling, pushes to gpu_queue.
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
#     from motion_detector import get_motion_detector

#     camera_id   = cfg['camera_id']
#     ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
#     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

#     hls = extract_hls_streaming_url(initial_url)
#     if not hls or not test_hls_stream(hls):
#         logger.error(f"[{camera_id}] Stream failed or invalid URL")
#         return

#     cap = open_hls_stream(hls)
#     if not cap or not cap.isOpened():
#         logger.error(f"[{camera_id}] Could not open stream")
#         return

#     motion_detector = get_motion_detector(camera_id, motion_threshold=800)
#     frame_count = 0

#     while not stop_event.is_set():
#         ret, frame = cap.read()
#         if not ret:
#             logger.warning(f"[EntryExitWorker][HLS] ⚠️ Stream ended → {camera_id}")
#             break

#         frame_count += 1
        
#         # 🔥 1/20 sampling
#         if not frame_should_process(frame_count, ENTRY_SAMPLE_EVERY):
#             continue

#         # 🔥 CPU Motion Detection Pre-filtering
#         if not motion_detector.has_motion(frame):
#             continue

#         try:
#             _gpu_queue.put({
#                 "frame": frame.copy(),
#                 "camera_id": camera_id,
#                 "ch_no": ch_no,
#                 "script_name": "EntryExit",
#                 "source_type": "HLS",
#             }, timeout=0.1)
#         except queue.Full:
#             del frame
#             continue
        
#         # Cleanup
#         del frame

#     cap.release()
#     logger.info(f"[EntryExitWorker][HLS] 🔴 Camera thread stopped → {camera_id}")


# def entry_exit_worker_hls(camera_configs, stop_event=None):
#     """
#     HLS worker entry point — GPU batch queue architecture.

#     Accepts a LIST of camera configs (from camera_loader) and runs
#     all cameras with a shared GPU worker thread.

#     Can also accept a single dict for backward compatibility.
#     """
#     import torch
#     cv2.setNumThreads(0) # Prevent thread explosion

#     # Handle single config (backward compat)
#     if isinstance(camera_configs, dict):
#         camera_configs = [camera_configs]

#     # In master_pipeline HLS flow this function is called per camera.
#     # Keep one shared GPU worker alive across calls (server-like behavior).
#     persistent_mode = stop_event is None
#     if stop_event is None:
#         stop_event = _STOP_EVENT

#     # Override save folder on entry_core
#     entry_core.SAVE_FOLDER = HLS_SAVE_FOLDER

#     # 🔥 SCENE FILTER (case-insensitive)
#     valid_scenes = ['entry', 'outside', 'exit', 'outdoor', 'outside area', 'outside scene']
#     filtered_configs = []
#     for cfg in camera_configs:
#         stream_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
#         if not stream_url:
#             continue
#         cls_raw = (
#             cfg.get('classification')
#             or cfg.get('scene_classification')
#             or cfg.get('Scene Classification')
#             or ''
#         )
#         cls_val = str(cls_raw).strip().lower()

#         # If classification is missing/unknown, allow instead of dropping all cameras.
#         if cls_val in ('', 'nan', 'none', 'null'):
#             filtered_configs.append(cfg)
#             continue

#         if any(scene in cls_val for scene in valid_scenes):
#             filtered_configs.append(cfg)

#     if not filtered_configs:
#         logger.warning(f"[EntryExitWorker][HLS] No cameras matched Entry/Exit scenes. Skipping.")
#         return


#     # Start GPU worker thread
#     if persistent_mode:
#         _ensure_shared_hls_gpu_worker(HLS_SAVE_FOLDER)
#     else:
#         gpu_t = threading.Thread(
#             target=_hls_gpu_batch_worker,
#             args=(stop_event, HLS_SAVE_FOLDER),
#             daemon=True
#         )
#         gpu_t.start()

#     # Start Camera Threads with ThreadPoolExecutor
#     from concurrent.futures import ThreadPoolExecutor
#     with ThreadPoolExecutor(max_workers=64) as executor:
#         for cfg in filtered_configs:
#             executor.submit(_hls_camera_thread, cfg, stop_event)
#             time.sleep(THREAD_START_DELAY)

#     stop_event.wait()

#     if persistent_mode:
#         logger.info("[EntryExitWorker][HLS] ✅ Camera threads completed (shared GPU worker still running)")
#         return

#     # Signal dedicated GPU worker to stop (non-persistent mode only)
#     stop_event.set()

#     if torch.cuda.is_available():
#         torch.cuda.empty_cache()

#     logger.info("[EntryExitWorker][HLS] ✅ All HLS cameras completed")



# # import time
# # import os
# # import logging
# # from datetime import datetime
# # import cv2
# # from ultralytics import YOLO

# # # ================= LOGGING =================
# # logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # # ================= CONFIG ==================
# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")

# # MIN_PERSONS = 2
# # CONF_THRESHOLD = 0.45
# # COOLDOWN_TIME = 180  # seconds

# # DEVICE_ID = "DAV_NVR"
# # CAMERA_NO = "CH19"

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("🔄 [EntryExitWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_times = {}

# # # =====================================================
# # # SAME LOGIC (frame → entry/exit detection)
# # # =====================================================
# # def detect_entry_exit(frame, device_id, camera_no):
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     person_detections = [
# #         box for box in results.boxes
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# #     ]

# #     person_count = len(person_detections)
# #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     elapsed = now - last_save_times.get(key, 0)

# #     entry_exit_detected = person_count >= MIN_PERSONS

# #     if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         path = (
# #             f"{SAVE_FOLDER}/{key}_{ts}"
# #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# #         )
# #         cv2.imwrite(path, frame)
# #         last_save_times[key] = now
# #         logging.info(
# #             f"[EntryExitWorker] 🚪 Entry/Exit detected! Count={person_count}, saved={path}"
# #         )

# #     return entry_exit_detected, person_count

# # # =====================================================
# # # WORKER LOOP
# # # =====================================================
# # def entry_exit_worker(frame_queue):
# #     logging.info("🟢 Entry/Exit Worker started")

# #     while True:
# #         frame = frame_queue.get()

# #         if frame is None:
# #             logging.info("🔴 Entry/Exit Worker stopping")
# #             break

# #         # IMPORTANT: work on a copy
# #         frame = frame.copy()

# #         detect_entry_exit(frame, DEVICE_ID, CAMERA_NO)



















# changes on 15--04-2026


# #working before hls
# #entry_exit_worker.py
# # import time
# # import os
# # import logging
# # from datetime import datetime
# # import cv2
# # from ultralytics import YOLO

# # # ================= LOGGING =================
# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s - %(levelname)s - %(message)s"
# # )

# # # ================= CONFIG ==================
# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")

# # MIN_PERSONS = 2
# # CONF_THRESHOLD = 0.45
# # COOLDOWN_TIME = 180  # seconds

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("🔄 [EntryExitWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_times = {}

# # # =====================================================
# # # ENTRY EXIT DETECTION
# # # =====================================================
# # def detect_entry_exit(frame, device_id, camera_no):
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     person_detections = [
# #         box for box in results.boxes
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# #     ]

# #     person_count = len(person_detections)
# #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# #     # draw boxes
# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)

# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     elapsed = now - last_save_times.get(key, 0)

# #     entry_exit_detected = person_count >= MIN_PERSONS

# #     if entry_exit_detected and elapsed >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         path = (
# #             f"{SAVE_FOLDER}/{key}_{ts}"
# #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# #         )
# #         cv2.imwrite(path, frame)
# #         last_save_times[key] = now

# #         logging.info(
# #             f"[EntryExitWorker] 🚪 Entry/Exit detected! "
# #             f"Device={device_id} Cam={camera_no} "
# #             f"Count={person_count}, saved={path}"
# #         )

# #     return entry_exit_detected, person_count

# # # =====================================================
# # # WORKER LOOP (UPDATED)
# # # =====================================================
# # def entry_exit_worker(frame_queue):
# #     logging.info("🟢 Entry/Exit Worker started")

# #     while True:
# #         data = frame_queue.get()

# #         # 🔴 stop signal
# #         if data is None:
# #             logging.info("🔴 Entry/Exit Worker stopping")
# #             break

# #         # ✅ NEW FORMAT
# #         frame, device_id, camera_no = data

# #         frame = frame.copy()

# #         detect_entry_exit(frame, device_id, camera_no)






















# #test
# # workers/entry_exit_worker.py
# """
# Entry/Exit Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - Entry_exit_det.py      (RTSP / DSS flow)
#   - entry_exit_det_tcs.py  (HLS / TCS flow)
# """

# import time
# import os
# import logging
# import threading
# import signal
# from datetime import datetime

# import cv2
# from ultralytics import YOLO

# # ================= GRACEFUL STOP FLAG =================
# _STOP_EVENT = threading.Event()

# def _handle_stop(sig, frame):
#     _STOP_EVENT.set()

# signal.signal(signal.SIGINT,  _handle_stop)
# signal.signal(signal.SIGTERM, _handle_stop)

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# MIN_PERSONS      = 2      # alert if persons >= this
# CONF_THRESHOLD   = 0.45
# COOLDOWN_TIME    = 180    # seconds between saves per camera

# HLS_SAMPLE_EVERY = 5      # process every Nth frame
# HLS_FAIL_LIMIT   = 3      # consecutive failures before giving up

# # ================= SHARED STATE ============
# last_save_times = {}       # key → last save epoch
# person_counts   = {}       # key → cumulative person count
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [EntryExitWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [EntryExitWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_entry_exit(frame, device_id: str, camera_no: str, save_folder: str):
#     """
#     Run YOLO, draw boxes, save if entry/exit threshold met.

#     Returns:
#         (entry_exit_detected: bool, person_count: int)
#     """
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

#     # ── Draw bounding boxes ──────────────────────────────────
#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
#         cv2.putText(
#             frame, f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────────
#     cv2.putText(frame, f"Persons: {person_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────────
#     key = f"{device_id}_{camera_no}"
#     now = time.time()

#     with _state_lock:
#         elapsed             = now - last_save_times.get(key, 0)
#         entry_exit_detected = person_count >= MIN_PERSONS

#         if entry_exit_detected and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = os.path.join(
#                 save_folder,
#                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#             )
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.info(
#                 f"[EntryExitWorker] 🚪 Entry/Exit! "
#                 f"Device={device_id} Cam={camera_no} "
#                 f"Count={person_count} "
#                 f"💾 Saved → {path}"
#             )
#         elif entry_exit_detected:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[EntryExitWorker] ⏳ Detected but cooldown active "
#                 f"({remaining}s left) → {key}"
#             )

#         person_counts[key] = person_counts.get(key, 0) + person_count

#     return entry_exit_detected, person_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def entry_exit_worker(frame_queue):
#     """
#     Queue-based worker — receives (frame, device_id, camera_no)
#     packets from the RTSP producer.
#     """
#     logger.info("🟢 [EntryExitWorker] RTSP worker started")

#     while True:
#         data = frame_queue.get()
#         if data is None:
#             logger.info("🔴 [EntryExitWorker] RTSP worker stopping")
#             break

#         frame, device_id, camera_no = data
#         detect_entry_exit(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             save_folder=RTSP_SAVE_FOLDER
#         )


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
# def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
#     """Open HLS stream and run entry/exit detection until stopped."""
#     from tcs_hls_utils import open_hls_stream

#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[EntryExitWorker][HLS] ❌ Could not open stream for {camera_id}")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[EntryExitWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

#     frame_count = 0
#     fail_count  = 0
#     start_time  = time.time()

#     label = camera_name if camera_name else camera_id

#     try:
#         while not _STOP_EVENT.is_set():
#             # Non-blocking read with 5s timeout
#             read_result = [None, None]
#             def _read():
#                 read_result[0], read_result[1] = cap.read()
#             t = threading.Thread(target=_read, daemon=True)
#             t.start()
#             t.join(timeout=5)

#             if _STOP_EVENT.is_set():
#                 break

#             ret, frame = read_result
#             if not ret or frame is None:
#                 fail_count += 1
#                 logger.warning(f"[EntryExitWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
#                 if fail_count >= HLS_FAIL_LIMIT:
#                     logger.error(f"[EntryExitWorker][HLS] ❌ Max failures → {camera_id}")
#                     break
#                 time.sleep(3)
#                 continue

#             fail_count   = 0
#             frame_count += 1

#             if frame_count % HLS_SAMPLE_EVERY == 0:
#                 detected, person_count = detect_entry_exit(
#                     frame.copy(),
#                     device_id=label,
#                     camera_no="",
#                     save_folder=HLS_SAVE_FOLDER
#                 )

#                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
#                     if detected:
#                         logger.info(
#                             f"[EntryExitWorker][HLS] 🚪 Entry/Exit: {person_count} person(s) → {camera_id}"
#                         )
#                     else:
#                         logger.info(
#                             f"[EntryExitWorker][HLS] ✅ Monitoring OK → {camera_id}"
#                         )

#             if max_frames and frame_count >= max_frames:
#                 break

#     except KeyboardInterrupt:
#         _STOP_EVENT.set()
#         logger.info(f"[EntryExitWorker][HLS] Interrupted → {camera_id}")
#     except Exception as e:
#         logger.error(f"[EntryExitWorker][HLS] Error → {camera_id}: {e}")
#     finally:
#         cap.release()
#         elapsed    = time.time() - start_time
#         actual_fps = frame_count / elapsed if elapsed > 0 else 0
#         logger.info(
#             f"[EntryExitWorker][HLS] 🔴 Stopped → {camera_id} | "
#             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
#         )

#     return True


# def entry_exit_worker_hls(camera_config: dict, max_frames=None):
#     """
#     HLS worker entry point — used by master_pipeline for HLS cameras.

#     camera_config = {
#         'camera_id':   str,
#         'stream_url':  str,
#         'camera_name': str,   # e.g. "11365_ENTRY_S39"
#     }
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

#     camera_id   = camera_config.get("camera_id", "unknown")
#     initial_url = camera_config.get("stream_url", "")
#     camera_name = camera_config.get("camera_name", "")

#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url:
#         logger.error(f"[EntryExitWorker][HLS] ❌ Could not resolve URL for {camera_id}")
#         return

#     if not test_hls_stream(hls_url):
#         logger.error(f"[EntryExitWorker][HLS] ❌ Stream test failed for {camera_id}")
#         return

#     logger.info(f"[EntryExitWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
#     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)



# added by samarth


#test
# workers/entry_exit_worker.py
"""
Entry/Exit Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - Entry_exit_det.py      (RTSP / DSS flow)
  - entry_exit_det_tcs.py  (HLS / TCS flow)
"""

import queue
import time
import os
import logging
import threading
import signal
import uuid
from datetime import datetime

import cv2
from ultralytics import YOLO

# ================= GRACEFUL STOP FLAG =================
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

import threading
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
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/entry_exit_results")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

MIN_PERSONS      = 2      # alert if persons >= this
CONF_THRESHOLD   = 0.45
COOLDOWN_TIME    = 180    # seconds between saves per camera

HLS_SAMPLE_EVERY = 5      # process every Nth frame
HLS_FAIL_LIMIT   = 3      # consecutive failures before giving up

# ================= SHARED STATE ============
last_save_times = {}       # key → last save epoch
person_counts   = {}       # key → cumulative person count
_state_lock     = threading.Lock()

# ================= YOLO ====================
logger.info("🔄 [EntryExitWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [EntryExitWorker] YOLO model loaded")


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_entry_exit(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "entry_exit", camera_id_pk: str = ""):
    """
    Run YOLO, draw boxes, save if entry/exit threshold met.
    camera_id_pk is the DB primary key, used for unique file naming.

    Returns:
        (entry_exit_detected: bool, person_count: int)
    """
    results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_detections = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
    ]

    person_count = len(person_detections)
    max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

    # ── Draw bounding boxes ──────────────────────────────────
    for box in person_detections:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
        cv2.putText(
            frame, f"Person {conf:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
        )

    # ── Overlay info ─────────────────────────────────────────
    cv2.putText(frame, f"Persons: {person_count}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # ── Save logic ───────────────────────────────────────────
    # Use DB primary key if available for uniqueness
    key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
    now = time.time()

    with _state_lock:
        elapsed             = now - last_save_times.get(key, 0)
        entry_exit_detected = person_count >= MIN_PERSONS

        if entry_exit_detected and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            # Format: {script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg
            if camera_id_pk:
                fname = f"{script_name}_{camera_id_pk}_{camera_no}_{ts}.jpg"
            elif camera_no:
                fname = f"{script_name}_{camera_no}_{ts}.jpg"
            else:
                fname = f"{script_name}_{device_id}_{ts}.jpg"
            
            path = os.path.join(save_folder, fname)
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.info(
                f"[EntryExitWorker] 🚪 Entry/Exit! "
                f"pk={camera_id_pk} Device={device_id} Cam={camera_no} "
                f"Count={person_count} "
                f"💾 Saved → {path}"
            )
        elif entry_exit_detected:
            remaining = int(COOLDOWN_TIME - elapsed)
            logger.debug(
                f"[EntryExitWorker] ⏳ Detected but cooldown active "
                f"({remaining}s left) → {key}"
            )

        person_counts[key] = person_counts.get(key, 0) + person_count

    return entry_exit_detected, person_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def entry_exit_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives packets from the RTSP producer and pushes them into
    the shared _gpu_queue for batch inference.
    """
    import torch
    logger.info("🟢 [EntryExitWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the SAME GPU batch worker that HLS uses
    gpu_t = threading.Thread(
        target=_hls_gpu_batch_worker,
        args=(stop_event, RTSP_SAVE_FOLDER),
        daemon=True
    )
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None:
                logger.info("🔴 [EntryExitWorker] RTSP batch-worker stopping")
                break

            # Unpack — supports dict, 4-tuple, 3-tuple
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

            if frame is None:
                continue

            try:
                _gpu_queue.put({
                    "frame":        frame.copy(),
                    "device_id":    str(device_id),
                    "camera_no":    str(camera_no),
                    "ch_no":        str(camera_no), # for compatibility
                    "camera_id_pk": str(camera_id_pk),
                    "script_name":  "EntryExit",
                    "source_type":  "RTSP",
                    "state":        {},
                }, timeout=0.1)
            except queue.Full:
                pass
            del frame

    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("🔴 [EntryExitWorker] GPU worker shut down")


# =====================================================
# 📡  HLS PATH  — GPU Batch Queue Architecture
# =====================================================
#
# Architecture (from entry_exit_det_tcs.py):
#   - Camera threads read HLS streams → push frames to gpu_queue
#   - Single gpu_worker thread pulls batches → runs detection
#   - Uses entry_core (Entry_exit_det.py) for actual detection
#   - tcs_scheduler for frame sampling
#   - External cooldown + rate limiter for save control
# =====================================================

import sys

# Ensure detection root is on path for imports
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Import core detection module + utilities
from scripts.detection import Entry_exit_det as entry_core
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter
# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402


# ── GPU Queue Config ─────────────────────────────────
GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "256"))
THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0
ENTRY_SAMPLE_EVERY = 20  # 🔥 1/20 sampling as per user snippet

_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)
_last_save_time = {}
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()


def _ensure_shared_hls_gpu_worker(save_folder):
    """Start one shared HLS GPU worker per process (if not already running)."""
    global _HLS_GPU_WORKER
    with _HLS_GPU_LOCK:
        if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
            _HLS_GPU_WORKER = threading.Thread(
                target=_hls_gpu_batch_worker,
                args=(_STOP_EVENT, save_folder),
                daemon=True,
                name="entry_exit_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()



def _hls_gpu_batch_worker(stop_event, save_folder, cooldown_time=30):
    """
    GPU batch worker — pulls frames from _gpu_queue in batches,
    runs entry_core.detect_persons_batch() for high performance.
    """
    logger.info("🚀 [EntryExitWorker][HLS] GPU batch worker started (TRUE BATCH)")
    entry_core.get_yolo_model()

    while not stop_event.is_set():
        batch_items = []

        # Pull first item (blocking with timeout)
        try:
            batch_items.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        # Fill batch until limit or timeout
        deadline = time.time() + 0.2
        while len(batch_items) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch_items.append(_gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        if not batch_items:
            continue

        logger.debug(f"[BATCH] Processing batch of {len(batch_items)} frames")

        try:
            # 🔥 TRUE GPU BATCHING
            batch_results = entry_core.detect_persons_batch(batch_items)
            
            for item, (processed_frame, detected, person_count) in zip(batch_items, batch_results):
                camera_id = item.get('device_id') or item.get('camera_id')
                ch_no     = item['ch_no']
                script_name = item.get('script_name', 'EntryExit')

                if not detected:
                    if 'frame' in item: del item['frame']
                    continue

                now = time.time()
                last_time = _last_save_time.get(camera_id, 0)

                if now - last_time < cooldown_time:
                    if 'frame' in item: del item['frame']
                    continue

                _last_save_time[camera_id] = now
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                
                # ── Source-Aware Naming Format ──────────────
                if item.get("source_type") == "HLS":
                    _uid = str(uuid.uuid4())
                    _exam_id = str(os.environ.get("EXAM_ID", "0")).strip()
                    filename = os.path.join(
                        save_folder,
                        f"{script_name}_ch{ch_no}_exam{_exam_id}_{timestamp}_{_uid}.jpg"
                    )
                else:
                    # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
                    dev_id = item.get("device_id") or camera_id
                    filename = os.path.join(
                        save_folder,
                        f"{script_name}_{dev_id}_{ch_no}_{timestamp}.jpg"
                    )

                cv2.imwrite(filename, processed_frame)
                logger.info(f"[SAVE] 🚪 {filename} (Persons: {person_count})")
                
                # --- Report to DB (HLS only) ---
                if item.get("source_type") == "HLS":
                    try:
                        entry_core.report_to_db_hls(
                            ch_code=str(ch_no), 
                            image_name=os.path.basename(filename),
                            folder="entry_exit_detection"
                        )
                    except Exception as e:
                        logger.error(f"[EntryExitWorker] DB Reporting Error: {e}")

                # Cleanup
                if 'frame' in item: del item['frame']
                del processed_frame

            del batch_items
            if 'batch_results' in locals(): del batch_results

        except Exception as e:
            logger.error(f"[BATCH ERROR][Entry/Exit] {e}")
            for item in batch_items:
                if 'frame' in item: del item['frame']
            del batch_items

    logger.info("🔴 [EntryExitWorker][HLS] GPU batch worker stopped")



def _hls_camera_thread(cfg, stop_event):
    """
    Camera reader thread — opens HLS stream, reads frames,
    applies motion filtering + sampling, pushes to gpu_queue.
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
    from motion_detector import get_motion_detector

    camera_id   = cfg['camera_id']
    ch_no       = cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        logger.error(f"[{camera_id}] Stream failed or invalid URL")
        return

    cap = open_hls_stream(hls)
    if not cap or not cap.isOpened():
        logger.error(f"[{camera_id}] Could not open stream")
        return

    motion_detector = get_motion_detector(camera_id, motion_threshold=800)
    frame_count = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[EntryExitWorker][HLS] ⚠️ Stream ended → {camera_id}")
            break

        frame_count += 1
        
        # 🔥 1/20 sampling
        if not frame_should_process(frame_count, ENTRY_SAMPLE_EVERY):
            continue

        # 🔥 CPU Motion Detection Pre-filtering
        if not motion_detector.has_motion(frame):
            continue

        try:
            _gpu_queue.put({
                "frame": frame.copy(),
                "camera_id": camera_id,
                "ch_no": ch_no,
                "script_name": "EntryExit",
                "source_type": "HLS",
            }, timeout=0.1)
        except queue.Full:
            del frame
            continue
        
        # Cleanup
        del frame

    cap.release()
    logger.info(f"[EntryExitWorker][HLS] 🔴 Camera thread stopped → {camera_id}")


def entry_exit_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point — GPU batch queue architecture.

    Accepts a LIST of camera configs (from camera_loader) and runs
    all cameras with a shared GPU worker thread.

    Can also accept a single dict for backward compatibility.
    """
    import torch
    cv2.setNumThreads(0) # Prevent thread explosion

    # Handle single config (backward compat)
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    # In master_pipeline HLS flow this function is called per camera.
    # Keep one shared GPU worker alive across calls (server-like behavior).
    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    # Override save folder on entry_core
    entry_core.SAVE_FOLDER = HLS_SAVE_FOLDER

    # 🔥 SCENE FILTER (case-insensitive)
    valid_scenes = ['entry', 'outside', 'exit', 'outdoor', 'outside area', 'outside scene']
    filtered_configs = []
    for cfg in camera_configs:
        stream_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
        if not stream_url:
            continue
        cls_raw = (
            cfg.get('classification')
            or cfg.get('scene_classification')
            or cfg.get('Scene Classification')
            or ''
        )
        cls_val = str(cls_raw).strip().lower()

        # If classification is missing/unknown, allow instead of dropping all cameras.
        if cls_val in ('', 'nan', 'none', 'null'):
            filtered_configs.append(cfg)
            continue

        if any(scene in cls_val for scene in valid_scenes):
            filtered_configs.append(cfg)

    if not filtered_configs:
        logger.warning(f"[EntryExitWorker][HLS] No cameras matched Entry/Exit scenes. Skipping.")
        return


    # Start GPU worker thread
    if persistent_mode:
        _ensure_shared_hls_gpu_worker(HLS_SAVE_FOLDER)
    else:
        gpu_t = threading.Thread(
            target=_hls_gpu_batch_worker,
            args=(stop_event, HLS_SAVE_FOLDER),
            daemon=True
        )
        gpu_t.start()

    # Start Camera Threads with ThreadPoolExecutor
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in filtered_configs:
            executor.submit(_hls_camera_thread, cfg, stop_event)
            time.sleep(THREAD_START_DELAY)

    stop_event.wait()

    if persistent_mode:
        logger.info("[EntryExitWorker][HLS] ✅ Camera threads completed (shared GPU worker still running)")
        return

    # Signal dedicated GPU worker to stop (non-persistent mode only)
    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("[EntryExitWorker][HLS] ✅ All HLS cameras completed")