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
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")

# # MIN_PERSONS = 0              # SAME as original intruder logic
# # CONF_THRESHOLD = 0.30
# # COOLDOWN_TIME = 0            # immediate alert

# # DEVICE_ID = "DAV_NVR"
# # CAMERA_NO = "CH19"

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("🔄 [IntruderWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_times = {}

# # # =====================================================
# # # SAME LOGIC (frame → intruder detection)
# # # =====================================================
# # def detect_intruder(frame, device_id, camera_no):
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     person_detections = [
# #         box for box in results.boxes
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# #     ]

# #     person_count = len(person_detections)
# #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     elapsed = now - last_save_times.get(key, 0)

# #     intruder_detected = person_count > MIN_PERSONS

# #     if intruder_detected and elapsed >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         path = (
# #             f"{SAVE_FOLDER}/{key}_{ts}"
# #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# #         )
# #         cv2.imwrite(path, frame)
# #         last_save_times[key] = now
# #         logging.warning(
# #             f"[IntruderWorker] 🚨 Intruder detected! Count={person_count}, saved={path}"
# #         )

# #     return intruder_detected, person_count

# # # =====================================================
# # # WORKER LOOP
# # # =====================================================
# # def intruder_worker(frame_queue):
# #     logging.info("🟢 Intruder Worker started")

# #     while True:
# #         frame = frame_queue.get()

# #         if frame is None:
# #             logging.info("🔴 Intruder Worker stopping")
# #             break

# #         # IMPORTANT: work on a copy
# #         frame = frame.copy()

# #         detect_intruder(frame, DEVICE_ID, CAMERA_NO)



















# #working_before_hls
# #intruder_worker.py

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
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")

# # MIN_PERSONS = 0
# # CONF_THRESHOLD = 0.30
# # COOLDOWN_TIME = 0  # immediate alert

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("🔄 [IntruderWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_times = {}

# # # =====================================================
# # # DETECTION
# # # =====================================================
# # def detect_intruder(frame, device_id, camera_no):
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
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     elapsed = now - last_save_times.get(key, 0)

# #     intruder_detected = person_count > MIN_PERSONS

# #     if intruder_detected and elapsed >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# #         path = (
# #             f"{SAVE_FOLDER}/{key}_{ts}"
# #             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
# #         )

# #         cv2.imwrite(path, frame)
# #         last_save_times[key] = now

# #         logging.warning(
# #             f"[IntruderWorker] 🚨 Intruder detected! "
# #             f"Device={device_id}, Cam={camera_no}, Count={person_count}"
# #         )

# #     return intruder_detected, person_count

# # # =====================================================
# # # WORKER LOOP
# # # =====================================================
# # def intruder_worker(frame_queue):
# #     logging.info("🟢 Intruder Worker started")

# #     while True:
# #         data = frame_queue.get()

# #         if data is None:
# #             logging.info("🔴 Intruder Worker stopping")
# #             break

# #         # 🔥 unpack metadata
# #         frame, device_id, camera_no = data

# #         # IMPORTANT: work on copy
# #         frame = frame.copy()

# #         detect_intruder(frame, device_id, camera_no)











# #test
# # workers/intruder_worker.py
# #working but cltr+c to stop is not working, need to kill the process from terminal
# """
# Intruder Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - intruder_det.py      (RTSP / DSS flow)
#   - intruder_det_tcs.py  (HLS / TCS flow)
# """

# # import time
# # import os
# # import logging
# # import threading
# # from datetime import datetime

# # import cv2
# # from ultralytics import YOLO

# # # ================= LOGGING =================
# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s - %(levelname)s - %(message)s"
# # )
# # logger = logging.getLogger(__name__)

# # # ================= CONFIG ==================
# # PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # # Separate save folders for RTSP and HLS results
# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # MIN_PERSONS      = 0      # alert if persons > this
# # CONF_THRESHOLD   = 0.30
# # COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # # HLS-specific tuning
# # HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# # HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # # ================= SHARED STATE ============
# # last_save_times = {}   # key → last save epoch
# # person_counts   = {}   # key → cumulative person count (for reporting)
# # _state_lock     = threading.Lock()

# # # ================= YOLO ====================
# # logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)
# # logger.info("✅ [IntruderWorker] YOLO model loaded")


# # # =====================================================
# # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # =====================================================
# # def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
# #     """
# #     Run YOLO on *frame*, draw boxes, save if intruder found.

# #     Returns:
# #         (intruder_detected: bool, person_count: int)
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
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(
# #             frame, f"Person {conf:.2f}",
# #             (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
# #         )

# #     # ── Overlay info ─────────────────────────────────────────
# #     cv2.putText(frame, f"Persons: {person_count}",
# #                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
# #                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     # ── Save logic ───────────────────────────────────────────
# #     key     = f"{device_id}_{camera_no}"
# #     now     = time.time()

# #     with _state_lock:
# #         elapsed          = now - last_save_times.get(key, 0)
# #         intruder_detected = person_count > MIN_PERSONS

# #         if intruder_detected and elapsed >= COOLDOWN_TIME:
# #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #             path = os.path.join(
# #                 save_folder,
# #                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
# #             )
# #             cv2.imwrite(path, frame)
# #             last_save_times[key] = now
# #             logger.warning(
# #                 f"[IntruderWorker] 🚨 Intruder! "
# #                 f"Device={device_id} Cam={camera_no} "
# #                 f"Count={person_count} Conf={max_conf:.2f}"
# #             )
# #         elif intruder_detected:
# #             remaining = int(COOLDOWN_TIME - elapsed)
# #             logger.debug(
# #                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
# #                 f"active ({remaining}s left) → {key}"
# #             )

# #         # Update cumulative counter
# #         person_counts[key] = person_counts.get(key, 0) + person_count

# #     return intruder_detected, person_count


# # # =====================================================
# # # 📡  RTSP PATH  — called by master_pipeline producer
# # # =====================================================
# # def intruder_worker(frame_queue):
# #     """
# #     Standard worker loop — receives (frame, device_id, camera_no)
# #     packets from the RTSP producer queue.

# #     This is the entry point used by master_pipeline.py.
# #     """
# #     logger.info("🟢 [IntruderWorker] RTSP worker started")

# #     while True:
# #         data = frame_queue.get()
# #         if data is None:
# #             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
# #             break

# #         frame, device_id, camera_no = data
# #         detect_intruder(
# #             frame.copy(),
# #             str(device_id),
# #             str(camera_no),
# #             save_folder=RTSP_SAVE_FOLDER
# #         )


# # # =====================================================
# # # 📡  HLS PATH  — standalone, reads its own stream
# # # =====================================================
# # def _run_hls_camera(camera_id: str, hls_url: str, max_frames: int | None = None):
# #     """
# #     Internal function: open HLS stream and run intruder detection.
# #     Uses tcs_hls_utils.open_hls_stream directly.
# #     """
# #     from tcs_hls_utils import open_hls_stream

# #     cap = open_hls_stream(hls_url)
# #     if cap is None or not cap.isOpened():
# #         logger.error(f"[IntruderWorker][HLS] ❌ Could not open stream for {camera_id}")
# #         return False

# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0

# #     logger.info(f"[IntruderWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

# #     frame_count  = 0
# #     fail_count   = 0
# #     start_time   = time.time()

# #     try:
# #         while True:
# #             ret, frame = cap.read()

# #             if not ret or frame is None:
# #                 fail_count += 1
# #                 logger.warning(
# #                     f"[IntruderWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}"
# #                 )
# #                 if fail_count >= HLS_FAIL_LIMIT:
# #                     logger.error(
# #                         f"[IntruderWorker][HLS] ❌ Max failures reached → {camera_id}"
# #                     )
# #                     break
# #                 time.sleep(3)
# #                 continue

# #             fail_count   = 0
# #             frame_count += 1

# #             # Sample every Nth frame to reduce CPU load
# #             if frame_count % HLS_SAMPLE_EVERY == 0:
# #                 intruder_detected, person_count = detect_intruder(
# #                     frame.copy(),
# #                     device_id=camera_id,
# #                     camera_no=camera_id,
# #                     save_folder=HLS_SAVE_FOLDER
# #                 )

# #                 # Periodic status log every ~90 processed frames
# #                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
# #                     if intruder_detected:
# #                         logger.critical(
# #                             f"[IntruderWorker][HLS] 🚨 INTRUDER: {person_count} person(s) → {camera_id}"
# #                         )
# #                     else:
# #                         logger.info(
# #                             f"[IntruderWorker][HLS] ✅ Monitoring OK → {camera_id}"
# #                         )

# #             if max_frames and frame_count >= max_frames:
# #                 logger.info(
# #                     f"[IntruderWorker][HLS] Max frames ({max_frames}) reached → {camera_id}"
# #                 )
# #                 break

# #     except KeyboardInterrupt:
# #         logger.info(f"[IntruderWorker][HLS] Interrupted → {camera_id}")
# #     except Exception as e:
# #         logger.error(f"[IntruderWorker][HLS] Error → {camera_id}: {e}")
# #     finally:
# #         cap.release()
# #         elapsed     = time.time() - start_time
# #         actual_fps  = frame_count / elapsed if elapsed > 0 else 0
# #         logger.info(
# #             f"[IntruderWorker][HLS] 🔴 Stopped → {camera_id} | "
# #             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
# #         )

# #     return True


# # def intruder_worker_hls(camera_config: dict, max_frames: int | None = None):
# #     """
# #     HLS worker entry point — used when master_pipeline detects an HLS camera.

# #     camera_config = {
# #         'camera_id':   str,   # unique label
# #         'stream_url':  str,   # raw URL from Excel (may be page URL or direct m3u8)
# #     }
# #     """
# #     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

# #     camera_id   = camera_config.get("camera_id", "unknown")
# #     initial_url = camera_config.get("stream_url", "")

# #     # Resolve to actual m3u8 if it's a TCS page URL
# #     hls_url = extract_hls_streaming_url(initial_url)
# #     if not hls_url:
# #         logger.error(f"[IntruderWorker][HLS] ❌ Could not resolve HLS URL for {camera_id}")
# #         return

# #     # Quick health check before starting the read loop
# #     if not test_hls_stream(hls_url):
# #         logger.error(f"[IntruderWorker][HLS] ❌ Stream test failed for {camera_id}: {hls_url}")
# #         return

# #     logger.info(f"[IntruderWorker][HLS] ▶ Starting → {camera_id}  URL: {hls_url}")
# #     _run_hls_camera(camera_id, hls_url, max_frames=max_frames)




















# # workers/intruder_worker.py
# # workers/intruder_worker.py
# #working but images name sahi formate me save nhi ho rha
# """
# Intruder Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - intruder_det.py      (RTSP / DSS flow)
#   - intruder_det_tcs.py  (HLS / TCS flow)
# """

# # import time
# # import os
# # import logging
# # import threading
# # import signal
# # from datetime import datetime

# # import cv2
# # from ultralytics import YOLO

# # # ================= GRACEFUL STOP FLAG =================
# # # threading.Event is thread-safe — all HLS threads share this one object
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
# # PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # # Separate save folders for RTSP and HLS results
# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # MIN_PERSONS      = 0      # alert if persons > this
# # CONF_THRESHOLD   = 0.30
# # COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # # HLS-specific tuning
# # HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# # HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # # ================= SHARED STATE ============
# # last_save_times = {}   # key → last save epoch
# # person_counts   = {}   # key → cumulative person count (for reporting)
# # _state_lock     = threading.Lock()

# # # ================= YOLO ====================
# # logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)
# # logger.info("✅ [IntruderWorker] YOLO model loaded")


# # # =====================================================
# # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # =====================================================
# # def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
# #     """
# #     Run YOLO on *frame*, draw boxes, save if intruder found.

# #     Returns:
# #         (intruder_detected: bool, person_count: int)
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
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(
# #             frame, f"Person {conf:.2f}",
# #             (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
# #         )

# #     # ── Overlay info ─────────────────────────────────────────
# #     cv2.putText(frame, f"Persons: {person_count}",
# #                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
# #                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     # ── Save logic ───────────────────────────────────────────
# #     key     = f"{device_id}_{camera_no}"
# #     now     = time.time()

# #     with _state_lock:
# #         elapsed          = now - last_save_times.get(key, 0)
# #         intruder_detected = person_count > MIN_PERSONS

# #         if intruder_detected and elapsed >= COOLDOWN_TIME:
# #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #             path = os.path.join(
# #                 save_folder,
# #                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
# #             )
# #             cv2.imwrite(path, frame)
# #             last_save_times[key] = now
# #             logger.warning(
# #                 f"[IntruderWorker] 🚨 Intruder! "
# #                 f"Device={device_id} Cam={camera_no} "
# #                 f"Count={person_count} Conf={max_conf:.2f}"
# #             )
# #         elif intruder_detected:
# #             remaining = int(COOLDOWN_TIME - elapsed)
# #             logger.debug(
# #                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
# #                 f"active ({remaining}s left) → {key}"
# #             )

# #         # Update cumulative counter
# #         person_counts[key] = person_counts.get(key, 0) + person_count

# #     return intruder_detected, person_count


# # # =====================================================
# # # 📡  RTSP PATH  — called by master_pipeline producer
# # # =====================================================
# # def intruder_worker(frame_queue):
# #     """
# #     Standard worker loop — receives (frame, device_id, camera_no)
# #     packets from the RTSP producer queue.

# #     This is the entry point used by master_pipeline.py.
# #     """
# #     logger.info("🟢 [IntruderWorker] RTSP worker started")

# #     while True:
# #         data = frame_queue.get()
# #         if data is None:
# #             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
# #             break

# #         frame, device_id, camera_no = data
# #         detect_intruder(
# #             frame.copy(),
# #             str(device_id),
# #             str(camera_no),
# #             save_folder=RTSP_SAVE_FOLDER
# #         )


# # # =====================================================
# # # 📡  HLS PATH  — standalone, reads its own stream
# # # =====================================================
# # def _run_hls_camera(camera_id: str, hls_url: str, max_frames: int | None = None):
# #     """
# #     Internal function: open HLS stream and run intruder detection.
# #     Uses tcs_hls_utils.open_hls_stream directly.
# #     """
# #     from tcs_hls_utils import open_hls_stream

# #     cap = open_hls_stream(hls_url)
# #     if cap is None or not cap.isOpened():
# #         logger.error(f"[IntruderWorker][HLS] ❌ Could not open stream for {camera_id}")
# #         return False

# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0

# #     logger.info(f"[IntruderWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

# #     frame_count  = 0
# #     fail_count   = 0
# #     start_time   = time.time()

# #     try:
# #         while not _STOP_EVENT.is_set():
# #             ret, frame = cap.read()

# #             if not ret or frame is None:
# #                 fail_count += 1
# #                 logger.warning(
# #                     f"[IntruderWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}"
# #                 )
# #                 if fail_count >= HLS_FAIL_LIMIT:
# #                     logger.error(
# #                         f"[IntruderWorker][HLS] ❌ Max failures reached → {camera_id}"
# #                     )
# #                     break
# #                 time.sleep(3)
# #                 continue

# #             fail_count   = 0
# #             frame_count += 1

# #             # Sample every Nth frame to reduce CPU load
# #             if frame_count % HLS_SAMPLE_EVERY == 0:
# #                 intruder_detected, person_count = detect_intruder(
# #                     frame.copy(),
# #                     device_id=camera_id,
# #                     camera_no=camera_id,
# #                     save_folder=HLS_SAVE_FOLDER
# #                 )

# #                 # Periodic status log every ~90 processed frames
# #                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
# #                     if intruder_detected:
# #                         logger.critical(
# #                             f"[IntruderWorker][HLS] 🚨 INTRUDER: {person_count} person(s) → {camera_id}"
# #                         )
# #                     else:
# #                         logger.info(
# #                             f"[IntruderWorker][HLS] ✅ Monitoring OK → {camera_id}"
# #                         )

# #             if max_frames and frame_count >= max_frames:
# #                 logger.info(
# #                     f"[IntruderWorker][HLS] Max frames ({max_frames}) reached → {camera_id}"
# #                 )
# #                 break

# #     except KeyboardInterrupt:
# #         _STOP_EVENT.set()
# #         logger.info(f"[IntruderWorker][HLS] Interrupted → {camera_id}")
# #     except Exception as e:
# #         logger.error(f"[IntruderWorker][HLS] Error → {camera_id}: {e}")
# #     finally:
# #         cap.release()
# #         elapsed     = time.time() - start_time
# #         actual_fps  = frame_count / elapsed if elapsed > 0 else 0
# #         logger.info(
# #             f"[IntruderWorker][HLS] 🔴 Stopped → {camera_id} | "
# #             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
# #         )

# #     return True


# # def intruder_worker_hls(camera_config: dict, max_frames: int | None = None):
# #     """
# #     HLS worker entry point — used when master_pipeline detects an HLS camera.

# #     camera_config = {
# #         'camera_id':   str,   # unique label
# #         'stream_url':  str,   # raw URL from Excel (may be page URL or direct m3u8)
# #     }
# #     """
# #     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

# #     camera_id   = camera_config.get("camera_id", "unknown")
# #     initial_url = camera_config.get("stream_url", "")

# #     # Resolve to actual m3u8 if it's a TCS page URL
# #     hls_url = extract_hls_streaming_url(initial_url)
# #     if not hls_url:
# #         logger.error(f"[IntruderWorker][HLS] ❌ Could not resolve HLS URL for {camera_id}")
# #         return

# #     # Quick health check before starting the read loop
# #     if not test_hls_stream(hls_url):
# #         logger.error(f"[IntruderWorker][HLS] ❌ Stream test failed for {camera_id}: {hls_url}")
# #         return

# #     logger.info(f"[IntruderWorker][HLS] ▶ Starting → {camera_id}  URL: {hls_url}")
# #     _run_hls_camera(camera_id, hls_url, max_frames=max_frames)














# #working properly bss cltr+c se stop nhi ho rha, need to kill the process from terminal
# # workers/intruder_worker.py
# # workers/intruder_worker.py
# # workers/intruder_worker.py
# # """
# # Intruder Worker — supports both RTSP (via master_pipeline producer)
# # and HLS (via its own internal OpenCV reader).

# # Merged from:
# #   - intruder_det.py      (RTSP / DSS flow)
# #   - intruder_det_tcs.py  (HLS / TCS flow)
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
# # # threading.Event is thread-safe — all HLS threads share this one object
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
# # PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # # Separate save folders for RTSP and HLS results
# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # MIN_PERSONS      = 0      # alert if persons > this
# # CONF_THRESHOLD   = 0.30
# # COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # # HLS-specific tuning
# # HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# # HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # # ================= SHARED STATE ============
# # last_save_times = {}   # key → last save epoch
# # person_counts   = {}   # key → cumulative person count (for reporting)
# # _state_lock     = threading.Lock()

# # # ================= YOLO ====================
# # logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)
# # logger.info("✅ [IntruderWorker] YOLO model loaded")


# # # =====================================================
# # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # =====================================================
# # def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
# #     """
# #     Run YOLO on *frame*, draw boxes, save if intruder found.

# #     Returns:
# #         (intruder_detected: bool, person_count: int)
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
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(
# #             frame, f"Person {conf:.2f}",
# #             (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
# #         )

# #     # ── Overlay info ─────────────────────────────────────────
# #     cv2.putText(frame, f"Persons: {person_count}",
# #                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
# #                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     # ── Save logic ───────────────────────────────────────────
# #     key     = f"{device_id}_{camera_no}"
# #     now     = time.time()

# #     with _state_lock:
# #         elapsed          = now - last_save_times.get(key, 0)
# #         intruder_detected = person_count > MIN_PERSONS

# #         if intruder_detected and elapsed >= COOLDOWN_TIME:
# #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #             path = os.path.join(
# #                 save_folder,
# #                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
# #             )
# #             cv2.imwrite(path, frame)
# #             last_save_times[key] = now
# #             logger.warning(
# #                 f"[IntruderWorker] 🚨 Intruder! "
# #                 f"Device={device_id} Cam={camera_no} "
# #                 f"Count={person_count} Conf={max_conf:.2f} "
# #                 f"💾 Saved → {path}"
# #             )
# #         elif intruder_detected:
# #             remaining = int(COOLDOWN_TIME - elapsed)
# #             logger.debug(
# #                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
# #                 f"active ({remaining}s left) → {key}"
# #             )

# #         # Update cumulative counter
# #         person_counts[key] = person_counts.get(key, 0) + person_count

# #     return intruder_detected, person_count


# # # =====================================================
# # # 📡  RTSP PATH  — called by master_pipeline producer
# # # =====================================================
# # def intruder_worker(frame_queue):
# #     """
# #     Standard worker loop — receives (frame, device_id, camera_no)
# #     packets from the RTSP producer queue.

# #     This is the entry point used by master_pipeline.py.
# #     """
# #     logger.info("🟢 [IntruderWorker] RTSP worker started")

# #     while True:
# #         data = frame_queue.get()
# #         if data is None:
# #             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
# #             break

# #         frame, device_id, camera_no = data
# #         detect_intruder(
# #             frame.copy(),
# #             str(device_id),
# #             str(camera_no),
# #             save_folder=RTSP_SAVE_FOLDER
# #         )


# # # =====================================================
# # # 📡  HLS PATH  — standalone, reads its own stream
# # # =====================================================
# # def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames: int | None = None):
# #     """
# #     Internal function: open HLS stream and run intruder detection.
# #     Uses tcs_hls_utils.open_hls_stream directly.
# #     """
# #     from tcs_hls_utils import open_hls_stream

# #     cap = open_hls_stream(hls_url)
# #     if cap is None or not cap.isOpened():
# #         logger.error(f"[IntruderWorker][HLS] ❌ Could not open stream for {camera_id}")
# #         return False

# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0

# #     logger.info(f"[IntruderWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

# #     frame_count  = 0
# #     fail_count   = 0
# #     start_time   = time.time()

# #     try:
# #         while not _STOP_EVENT.is_set():
# #             ret, frame = cap.read()

# #             if not ret or frame is None:
# #                 fail_count += 1
# #                 logger.warning(
# #                     f"[IntruderWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}"
# #                 )
# #                 if fail_count >= HLS_FAIL_LIMIT:
# #                     logger.error(
# #                         f"[IntruderWorker][HLS] ❌ Max failures reached → {camera_id}"
# #                     )
# #                     break
# #                 time.sleep(3)
# #                 continue

# #             fail_count   = 0
# #             frame_count += 1

# #             # Sample every Nth frame to reduce CPU load
# #             if frame_count % HLS_SAMPLE_EVERY == 0:
# #                 # Use camera_name in filename if available, else fall back to camera_id
# #                 label = camera_name if camera_name else camera_id
# #                 intruder_detected, person_count = detect_intruder(
# #                     frame.copy(),
# #                     device_id=label,
# #                     camera_no="",
# #                     save_folder=HLS_SAVE_FOLDER
# #                 )

# #                 # Periodic status log every ~90 processed frames
# #                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
# #                     if intruder_detected:
# #                         logger.critical(
# #                             f"[IntruderWorker][HLS] 🚨 INTRUDER: {person_count} person(s) → {camera_id}"
# #                         )
# #                     else:
# #                         logger.info(
# #                             f"[IntruderWorker][HLS] ✅ Monitoring OK → {camera_id}"
# #                         )

# #             if max_frames and frame_count >= max_frames:
# #                 logger.info(
# #                     f"[IntruderWorker][HLS] Max frames ({max_frames}) reached → {camera_id}"
# #                 )
# #                 break

# #     except KeyboardInterrupt:
# #         _STOP_EVENT.set()
# #         logger.info(f"[IntruderWorker][HLS] Interrupted → {camera_id}")
# #     except Exception as e:
# #         logger.error(f"[IntruderWorker][HLS] Error → {camera_id}: {e}")
# #     finally:
# #         cap.release()
# #         elapsed     = time.time() - start_time
# #         actual_fps  = frame_count / elapsed if elapsed > 0 else 0
# #         logger.info(
# #             f"[IntruderWorker][HLS] 🔴 Stopped → {camera_id} | "
# #             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
# #         )

# #     return True


# # def intruder_worker_hls(camera_config: dict, max_frames: int | None = None):
# #     """
# #     HLS worker entry point — used when master_pipeline detects an HLS camera.

# #     camera_config = {
# #         'camera_id':   str,   # unique label
# #         'stream_url':  str,   # raw URL from Excel (may be page URL or direct m3u8)
# #     }
# #     """
# #     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

# #     camera_id   = camera_config.get("camera_id", "unknown")
# #     initial_url = camera_config.get("stream_url", "")

# #     # Resolve to actual m3u8 if it's a TCS page URL
# #     hls_url = extract_hls_streaming_url(initial_url)
# #     if not hls_url:
# #         logger.error(f"[IntruderWorker][HLS] ❌ Could not resolve HLS URL for {camera_id}")
# #         return

# #     # Quick health check before starting the read loop
# #     if not test_hls_stream(hls_url):
# #         logger.error(f"[IntruderWorker][HLS] ❌ Stream test failed for {camera_id}: {hls_url}")
# #         return

# #     camera_name = camera_config.get("camera_name", "")
# #     logger.info(f"[IntruderWorker][HLS] ▶ Starting → {camera_id}  ({camera_name})  URL: {hls_url}")
# #     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)



































# #working for rtsp+hls ,but hls flow is not correct

# # workers/intruder_worker.py
# """
# Intruder Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - intruder_det.py      (RTSP / DSS flow)
#   - intruder_det_tcs.py  (HLS / TCS flow)
# """

# import time
# import os
# import logging
# import threading
# import signal
# import queue
# from datetime import datetime

# import cv2
# from ultralytics import YOLO

# # ================= GRACEFUL STOP FLAG =================
# # threading.Event is thread-safe — all HLS threads share this one object
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
# PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # Separate save folders for RTSP and HLS results
# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_detection")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# MIN_PERSONS      = 0      # alert if persons > this
# CONF_THRESHOLD   = 0.30
# COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # HLS-specific tuning
# HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # ── GPU Queue Config ─────────────────────────────────
# GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
# GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "128"))
# THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0

# _gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)

# # ================= SHARED STATE ============
# last_save_times = {}   # key → last save epoch
# person_counts   = {}   # key → cumulative person count (for reporting)
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [IntruderWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = "", source_type: str = "RTSP"):
#     """
#     Run YOLO on *frame*, draw boxes, save if intruder found.
#     camera_id_pk is the DB primary key, used for unique file naming.

#     Returns:
#         (intruder_detected: bool, person_count: int)
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
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame, f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────────
#     cv2.putText(frame, f"Persons: {person_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────────
#     # Use DB primary key if available
#     key     = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
#     now     = time.time()

#     with _state_lock:
#         elapsed          = now - last_save_times.get(key, 0)
#         intruder_detected = person_count > MIN_PERSONS

#         if intruder_detected and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            
#             # ── Source-Aware Naming Format ──────────────
#             if source_type == "HLS":
#                 # intruder_ch[ch_no]_[timestamp].jpg
#                 fname = f"intruder_ch{camera_no}_{ts}.jpg"
#             else:
#                 # RTSP: intruder_[device_id]_[camera_no]_[timestamp].jpg
#                 dev_id = camera_id_pk or device_id
#                 fname = f"intruder_{dev_id}_{camera_no}_{ts}.jpg"
            
#             path = os.path.join(save_folder, fname)
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(
#                 f"[IntruderWorker] 🚨 Intruder! "
#                 f"pk={camera_id_pk} Device={device_id} Cam={camera_no} "
#                 f"Count={person_count} Conf={max_conf:.2f} "
#                 f"💾 Saved → {path}"
#             )
#         elif intruder_detected:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
#                 f"active ({remaining}s left) → {key}"
#             )

#         # Update cumulative counter
#         person_counts[key] = person_counts.get(key, 0) + person_count

#     return intruder_detected, person_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def intruder_worker(frame_queue):
#     """
#     RTSP Worker — GPU Batch Queue Architecture.
#     Receives packets from the RTSP producer and pushes them into
#     the shared _gpu_queue for batch inference.
#     """
#     import torch
#     logger.info("🟢 [IntruderWorker] RTSP batch-worker started")
#     stop_event = threading.Event()

#     # Start the SAME GPU batch worker that HLS uses
#     gpu_t = threading.Thread(
#         target=_hls_gpu_batch_worker,
#         args=(stop_event,),
#         daemon=True
#     )
#     gpu_t.start()

#     try:
#         while True:
#             data = frame_queue.get()
#             if data is None:
#                 logger.info("🔴 [IntruderWorker] RTSP batch-worker stopping")
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
#                     "camera_id_pk": str(camera_id_pk),
#                     "source_type":  "RTSP",
#                     "save_folder":  RTSP_SAVE_FOLDER,
#                 }, timeout=0.1)
#             except queue.Full:
#                 pass
#             del frame

#     finally:
#         stop_event.set()
#         gpu_t.join(timeout=5)
#         if torch.cuda.is_available():
#             torch.cuda.empty_cache()
#         logger.info("🔴 [IntruderWorker] GPU worker shut down")


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
#     return True


# def _hls_gpu_batch_worker(stop_event):
#     """
#     GPU batch worker — pulls frames from _gpu_queue and runs batched YOLO.
#     """
#     logger.info(f"🚀 [IntruderWorker][HLS] GPU worker started (batch={GPU_BATCH_SIZE})")

#     while not stop_event.is_set():
#         batch = []
#         try:
#             batch.append(_gpu_queue.get(timeout=0.1))
#         except queue.Empty:
#             continue

#         deadline = time.time() + 0.2
#         while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
#             try:
#                 batch.append(_gpu_queue.get_nowait())
#             except queue.Empty:
#                 time.sleep(0.002)

#         if not batch: continue

#         try:
#             frames = [item['frame'] for item in batch]
#             # TRUE GPU BATCHING
#             results = yolo_model(frames, conf=CONF_THRESHOLD, verbose=False)

#             for item, result in zip(batch, results):
#                 camera_id = item['camera_id']
#                 camera_name = item['camera_name']
#                 frame = item['frame']
                
#                 person_detections = [
#                     box for box in result.boxes
#                     if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
#                 ]

#                 person_count = len(person_detections)
#                 if person_count > MIN_PERSONS:
#                     src_type = item.get("source_type", "HLS")
#                     c_no = item.get("ch_no") or item.get("camera_no") or ""
#                     detect_intruder(frame, camera_id, c_no, HLS_SAVE_FOLDER, source_type=src_type)

#                 # Cleanup
#                 if 'frame' in item: del item['frame']

#             del batch
#             if 'results' in locals(): del results

#         except Exception as e:
#             logger.error(f"[BATCH ERROR][Intruder] {e}")
#             for item in batch:
#                 if 'frame' in item: del item['frame']
#             del batch

#     logger.info("🔴 [IntruderWorker][HLS] GPU worker stopped")


# def _hls_camera_thread(cfg, stop_event):
#     """
#     Refactored camera thread: reads HLS and pushes to _gpu_queue.
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
#     from tcs_scheduler import frame_should_process

#     camera_id = cfg.get('camera_id', 'unknown')
#     initial_url = cfg.get('cctv_url', '')
#     camera_name = cfg.get('camera_name', '')

#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url or not test_hls_stream(hls_url):
#         return

#     cap = open_hls_stream(hls_url)
#     if not cap or not cap.isOpened():
#         return

#     logger.info(f"[IntruderWorker][HLS] 🟢 Started camera thread → {camera_id}")
#     frame_count = 0

#     while not stop_event.is_set():
#         ret, frame = cap.read()
#         if not ret: break

#         frame_count += 1
#         if not frame_should_process(frame_count, HLS_SAMPLE_EVERY):
#             continue

#         try:
#             _gpu_queue.put({
#                 "frame": frame.copy(),
#                 "camera_id": camera_id,
#                 "camera_name": camera_name,
#                 "ch_no": cfg.get("ch_no") or cfg.get("camera_no") or "unknown",
#                 "source_type": "HLS"
#             }, timeout=0.1)
#         except queue.Full:
#             del frame
#             continue
        
#         # Cleanup
#         del frame

#     cap.release()
#     logger.info(f"[IntruderWorker][HLS] 🔴 Stopped camera thread → {camera_id}")


# def intruder_worker_hls(camera_configs, stop_event=None):
#     """
#     HLS worker entry point — GPU batch queue architecture.
#     """
#     import torch
#     cv2.setNumThreads(0) # Prevent thread explosion

#     if isinstance(camera_configs, dict):
#         camera_configs = [camera_configs]

#     if stop_event is None:
#         stop_event = _STOP_EVENT
    
#     # 🔥 SCENE FILTER (case-insensitive) - Intruders are outdoor threats
#     valid_scenes = ['outdoor', 'outside', 'exterior', 'intruder']
#     filtered_configs = []
#     for cfg in camera_configs:
#         if not cfg.get('cctv_url'): continue
#         cls_val = str(cfg.get('classification', '')).lower()
#         if any(scene in cls_val for scene in valid_scenes):
#             filtered_configs.append(cfg)
    
#     if not filtered_configs:
#         logger.warning(f"[IntruderWorker][HLS] No cameras matched Intruder (outdoor) scenes. Skipping.")
#         return
    
#     camera_configs = filtered_configs
#     logger.info(f"[IntruderWorker][HLS] Processing {len(camera_configs)} outdoor cameras")

#     # Start GPU Worker
#     gpu_t = threading.Thread(
#         target=_hls_gpu_batch_worker,
#         args=(stop_event,),
#         daemon=True
#     )
#     gpu_t.start()

#     # Start camera threads using ThreadPoolExecutor
#     from concurrent.futures import ThreadPoolExecutor
#     with ThreadPoolExecutor(max_workers=64) as executor:
#         for cfg in camera_configs:
#             executor.submit(_hls_camera_thread, cfg, stop_event)
#             time.sleep(THREAD_START_DELAY)

#     try:
#         stop_event.wait()
#     except KeyboardInterrupt:
#         stop_event.set()
#     finally:
#         if torch.cuda.is_available():
#             torch.cuda.empty_cache()
#         logger.info("[IntruderWorker][HLS] ✅ Intruder detection completed")




























# #test
# # workers/intruder_worker.py
# """
# Intruder Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - intruder_det.py      (RTSP / DSS flow)
#   - intruder_det_tcs.py  (HLS / TCS flow)
# """

# # import time
# # import os
# # import logging
# # import threading
# # from datetime import datetime

# # import cv2
# # from ultralytics import YOLO


# # # ================= LOGGING =================
# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s - %(levelname)s - %(message)s"
# # )
# # logger = logging.getLogger(__name__)

# # # ================= CONFIG ==================
# # PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # # Separate save folders for RTSP and HLS results
# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# # HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# # os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# # MIN_PERSONS      = 0      # alert if persons > this
# # CONF_THRESHOLD   = 0.30
# # COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # # HLS-specific tuning
# # HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# # HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # # ================= SHARED STATE ============
# # last_save_times = {}   # key → last save epoch
# # person_counts   = {}   # key → cumulative person count (for reporting)
# # _state_lock     = threading.Lock()

# # # ================= YOLO ====================
# # logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)
# # logger.info("✅ [IntruderWorker] YOLO model loaded")


# # # =====================================================
# # # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # # =====================================================
# # def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
# #     """
# #     Run YOLO on *frame*, draw boxes, save if intruder found.

# #     Returns:
# #         (intruder_detected: bool, person_count: int)
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
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(
# #             frame, f"Person {conf:.2f}",
# #             (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
# #         )

# #     # ── Overlay info ─────────────────────────────────────────
# #     cv2.putText(frame, f"Persons: {person_count}",
# #                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
# #                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     # ── Save logic ───────────────────────────────────────────
# #     key     = f"{device_id}_{camera_no}"
# #     now     = time.time()

# #     with _state_lock:
# #         elapsed          = now - last_save_times.get(key, 0)
# #         intruder_detected = person_count > MIN_PERSONS

# #         if intruder_detected and elapsed >= COOLDOWN_TIME:
# #             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #             path = os.path.join(
# #                 save_folder,
# #                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
# #             )
# #             cv2.imwrite(path, frame)
# #             last_save_times[key] = now
# #             logger.warning(
# #                 f"[IntruderWorker] 🚨 Intruder! "
# #                 f"Device={device_id} Cam={camera_no} "
# #                 f"Count={person_count} Conf={max_conf:.2f} "
# #                 f"💾 Saved → {path}"
# #             )
# #         elif intruder_detected:
# #             remaining = int(COOLDOWN_TIME - elapsed)
# #             logger.debug(
# #                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
# #                 f"active ({remaining}s left) → {key}"
# #             )

# #         # Update cumulative counter
# #         person_counts[key] = person_counts.get(key, 0) + person_count

# #     return intruder_detected, person_count


# # # =====================================================
# # # 📡  RTSP PATH  — called by master_pipeline producer
# # # =====================================================
# # def intruder_worker(frame_queue):
# #     """
# #     Standard worker loop — receives (frame, device_id, camera_no)
# #     packets from the RTSP producer queue.

# #     This is the entry point used by master_pipeline.py.
# #     """
# #     logger.info("🟢 [IntruderWorker] RTSP worker started")

# #     while True:
# #         data = frame_queue.get()
# #         if data is None:
# #             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
# #             break

# #         frame, device_id, camera_no = data
# #         detect_intruder(
# #             frame.copy(),
# #             str(device_id),
# #             str(camera_no),
# #             save_folder=RTSP_SAVE_FOLDER
# #         )





# import time
# import os
# import logging
# from datetime import datetime
# import cv2
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")

# MIN_PERSONS = 0              # SAME as original intruder logic
# CONF_THRESHOLD = 0.30
# COOLDOWN_TIME = 0            # immediate alert

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [IntruderWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# last_save_times = {}

# # =====================================================
# # SAME LOGIC (frame → intruder detection)
# # =====================================================
# def detect_intruder(frame, device_id, camera_no):
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     elapsed = now - last_save_times.get(key, 0)

#     intruder_detected = person_count > MIN_PERSONS

#     if intruder_detected and elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = (
#             f"{SAVE_FOLDER}/{key}_{ts}"
#             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )
#         cv2.imwrite(path, frame)
#         last_save_times[key] = now
#         logging.warning(
#             f"[IntruderWorker] 🚨 Intruder detected! Count={person_count}, saved={path}"
#         )

#     return intruder_detected, person_count

# # =====================================================
# # WORKER LOOP
# # =====================================================
# def intruder_worker(frame_queue):
#     logging.info("🟢 Intruder Worker started")

#     while True:
#         frame = frame_queue.get()

#         if frame is None:
#             logging.info("🔴 Intruder Worker stopping")
#             break

#         # IMPORTANT: work on a copy
#         frame = frame.copy()

#         detect_intruder(frame, DEVICE_ID, CAMERA_NO)



















#working_before_hls
#intruder_worker.py

# import time
# import os
# import logging
# from datetime import datetime
# import cv2
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")

# MIN_PERSONS = 0
# CONF_THRESHOLD = 0.30
# COOLDOWN_TIME = 0  # immediate alert

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [IntruderWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# last_save_times = {}

# # =====================================================
# # DETECTION
# # =====================================================
# def detect_intruder(frame, device_id, camera_no):
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

#     # draw boxes
#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     elapsed = now - last_save_times.get(key, 0)

#     intruder_detected = person_count > MIN_PERSONS

#     if intruder_detected and elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")

#         path = (
#             f"{SAVE_FOLDER}/{key}_{ts}"
#             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )

#         cv2.imwrite(path, frame)
#         last_save_times[key] = now

#         logging.warning(
#             f"[IntruderWorker] 🚨 Intruder detected! "
#             f"Device={device_id}, Cam={camera_no}, Count={person_count}"
#         )

#     return intruder_detected, person_count

# # =====================================================
# # WORKER LOOP
# # =====================================================
# def intruder_worker(frame_queue):
#     logging.info("🟢 Intruder Worker started")

#     while True:
#         data = frame_queue.get()

#         if data is None:
#             logging.info("🔴 Intruder Worker stopping")
#             break

#         # 🔥 unpack metadata
#         frame, device_id, camera_no = data

#         # IMPORTANT: work on copy
#         frame = frame.copy()

#         detect_intruder(frame, device_id, camera_no)











#test
# workers/intruder_worker.py
#working but cltr+c to stop is not working, need to kill the process from terminal
"""
Intruder Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - intruder_det.py      (RTSP / DSS flow)
  - intruder_det_tcs.py  (HLS / TCS flow)
"""

# import time
# import os
# import logging
# import threading
# from datetime import datetime

# import cv2
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # ================= CONFIG ==================
# PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # Separate save folders for RTSP and HLS results
# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# MIN_PERSONS      = 0      # alert if persons > this
# CONF_THRESHOLD   = 0.30
# COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # HLS-specific tuning
# HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # ================= SHARED STATE ============
# last_save_times = {}   # key → last save epoch
# person_counts   = {}   # key → cumulative person count (for reporting)
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [IntruderWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
#     """
#     Run YOLO on *frame*, draw boxes, save if intruder found.

#     Returns:
#         (intruder_detected: bool, person_count: int)
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
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame, f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────────
#     cv2.putText(frame, f"Persons: {person_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────────
#     key     = f"{device_id}_{camera_no}"
#     now     = time.time()

#     with _state_lock:
#         elapsed          = now - last_save_times.get(key, 0)
#         intruder_detected = person_count > MIN_PERSONS

#         if intruder_detected and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = os.path.join(
#                 save_folder,
#                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#             )
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(
#                 f"[IntruderWorker] 🚨 Intruder! "
#                 f"Device={device_id} Cam={camera_no} "
#                 f"Count={person_count} Conf={max_conf:.2f}"
#             )
#         elif intruder_detected:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
#                 f"active ({remaining}s left) → {key}"
#             )

#         # Update cumulative counter
#         person_counts[key] = person_counts.get(key, 0) + person_count

#     return intruder_detected, person_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def intruder_worker(frame_queue):
#     """
#     Standard worker loop — receives (frame, device_id, camera_no)
#     packets from the RTSP producer queue.

#     This is the entry point used by master_pipeline.py.
#     """
#     logger.info("🟢 [IntruderWorker] RTSP worker started")

#     while True:
#         data = frame_queue.get()
#         if data is None:
#             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
#             break

#         frame, device_id, camera_no = data
#         detect_intruder(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             save_folder=RTSP_SAVE_FOLDER
#         )


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
# def _run_hls_camera(camera_id: str, hls_url: str, max_frames: int | None = None):
#     """
#     Internal function: open HLS stream and run intruder detection.
#     Uses tcs_hls_utils.open_hls_stream directly.
#     """
#     from tcs_hls_utils import open_hls_stream

#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[IntruderWorker][HLS] ❌ Could not open stream for {camera_id}")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[IntruderWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

#     frame_count  = 0
#     fail_count   = 0
#     start_time   = time.time()

#     try:
#         while True:
#             ret, frame = cap.read()

#             if not ret or frame is None:
#                 fail_count += 1
#                 logger.warning(
#                     f"[IntruderWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}"
#                 )
#                 if fail_count >= HLS_FAIL_LIMIT:
#                     logger.error(
#                         f"[IntruderWorker][HLS] ❌ Max failures reached → {camera_id}"
#                     )
#                     break
#                 time.sleep(3)
#                 continue

#             fail_count   = 0
#             frame_count += 1

#             # Sample every Nth frame to reduce CPU load
#             if frame_count % HLS_SAMPLE_EVERY == 0:
#                 intruder_detected, person_count = detect_intruder(
#                     frame.copy(),
#                     device_id=camera_id,
#                     camera_no=camera_id,
#                     save_folder=HLS_SAVE_FOLDER
#                 )

#                 # Periodic status log every ~90 processed frames
#                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
#                     if intruder_detected:
#                         logger.critical(
#                             f"[IntruderWorker][HLS] 🚨 INTRUDER: {person_count} person(s) → {camera_id}"
#                         )
#                     else:
#                         logger.info(
#                             f"[IntruderWorker][HLS] ✅ Monitoring OK → {camera_id}"
#                         )

#             if max_frames and frame_count >= max_frames:
#                 logger.info(
#                     f"[IntruderWorker][HLS] Max frames ({max_frames}) reached → {camera_id}"
#                 )
#                 break

#     except KeyboardInterrupt:
#         logger.info(f"[IntruderWorker][HLS] Interrupted → {camera_id}")
#     except Exception as e:
#         logger.error(f"[IntruderWorker][HLS] Error → {camera_id}: {e}")
#     finally:
#         cap.release()
#         elapsed     = time.time() - start_time
#         actual_fps  = frame_count / elapsed if elapsed > 0 else 0
#         logger.info(
#             f"[IntruderWorker][HLS] 🔴 Stopped → {camera_id} | "
#             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
#         )

#     return True


# def intruder_worker_hls(camera_config: dict, max_frames: int | None = None):
#     """
#     HLS worker entry point — used when master_pipeline detects an HLS camera.

#     camera_config = {
#         'camera_id':   str,   # unique label
#         'stream_url':  str,   # raw URL from Excel (may be page URL or direct m3u8)
#     }
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

#     camera_id   = camera_config.get("camera_id", "unknown")
#     initial_url = camera_config.get("stream_url", "")

#     # Resolve to actual m3u8 if it's a TCS page URL
#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url:
#         logger.error(f"[IntruderWorker][HLS] ❌ Could not resolve HLS URL for {camera_id}")
#         return

#     # Quick health check before starting the read loop
#     if not test_hls_stream(hls_url):
#         logger.error(f"[IntruderWorker][HLS] ❌ Stream test failed for {camera_id}: {hls_url}")
#         return

#     logger.info(f"[IntruderWorker][HLS] ▶ Starting → {camera_id}  URL: {hls_url}")
#     _run_hls_camera(camera_id, hls_url, max_frames=max_frames)




















# workers/intruder_worker.py
# workers/intruder_worker.py
#working but images name sahi formate me save nhi ho rha
"""
Intruder Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - intruder_det.py      (RTSP / DSS flow)
  - intruder_det_tcs.py  (HLS / TCS flow)
"""

# import time
# import os
# import logging
# import threading
# import signal
# from datetime import datetime

# import cv2
# from ultralytics import YOLO

# # ================= GRACEFUL STOP FLAG =================
# # threading.Event is thread-safe — all HLS threads share this one object
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
# PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # Separate save folders for RTSP and HLS results
# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# MIN_PERSONS      = 0      # alert if persons > this
# CONF_THRESHOLD   = 0.30
# COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # HLS-specific tuning
# HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # ================= SHARED STATE ============
# last_save_times = {}   # key → last save epoch
# person_counts   = {}   # key → cumulative person count (for reporting)
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [IntruderWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
#     """
#     Run YOLO on *frame*, draw boxes, save if intruder found.

#     Returns:
#         (intruder_detected: bool, person_count: int)
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
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame, f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────────
#     cv2.putText(frame, f"Persons: {person_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────────
#     key     = f"{device_id}_{camera_no}"
#     now     = time.time()

#     with _state_lock:
#         elapsed          = now - last_save_times.get(key, 0)
#         intruder_detected = person_count > MIN_PERSONS

#         if intruder_detected and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = os.path.join(
#                 save_folder,
#                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#             )
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(
#                 f"[IntruderWorker] 🚨 Intruder! "
#                 f"Device={device_id} Cam={camera_no} "
#                 f"Count={person_count} Conf={max_conf:.2f}"
#             )
#         elif intruder_detected:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
#                 f"active ({remaining}s left) → {key}"
#             )

#         # Update cumulative counter
#         person_counts[key] = person_counts.get(key, 0) + person_count

#     return intruder_detected, person_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def intruder_worker(frame_queue):
#     """
#     Standard worker loop — receives (frame, device_id, camera_no)
#     packets from the RTSP producer queue.

#     This is the entry point used by master_pipeline.py.
#     """
#     logger.info("🟢 [IntruderWorker] RTSP worker started")

#     while True:
#         data = frame_queue.get()
#         if data is None:
#             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
#             break

#         frame, device_id, camera_no = data
#         detect_intruder(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             save_folder=RTSP_SAVE_FOLDER
#         )


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
# def _run_hls_camera(camera_id: str, hls_url: str, max_frames: int | None = None):
#     """
#     Internal function: open HLS stream and run intruder detection.
#     Uses tcs_hls_utils.open_hls_stream directly.
#     """
#     from tcs_hls_utils import open_hls_stream

#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[IntruderWorker][HLS] ❌ Could not open stream for {camera_id}")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[IntruderWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

#     frame_count  = 0
#     fail_count   = 0
#     start_time   = time.time()

#     try:
#         while not _STOP_EVENT.is_set():
#             ret, frame = cap.read()

#             if not ret or frame is None:
#                 fail_count += 1
#                 logger.warning(
#                     f"[IntruderWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}"
#                 )
#                 if fail_count >= HLS_FAIL_LIMIT:
#                     logger.error(
#                         f"[IntruderWorker][HLS] ❌ Max failures reached → {camera_id}"
#                     )
#                     break
#                 time.sleep(3)
#                 continue

#             fail_count   = 0
#             frame_count += 1

#             # Sample every Nth frame to reduce CPU load
#             if frame_count % HLS_SAMPLE_EVERY == 0:
#                 intruder_detected, person_count = detect_intruder(
#                     frame.copy(),
#                     device_id=camera_id,
#                     camera_no=camera_id,
#                     save_folder=HLS_SAVE_FOLDER
#                 )

#                 # Periodic status log every ~90 processed frames
#                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
#                     if intruder_detected:
#                         logger.critical(
#                             f"[IntruderWorker][HLS] 🚨 INTRUDER: {person_count} person(s) → {camera_id}"
#                         )
#                     else:
#                         logger.info(
#                             f"[IntruderWorker][HLS] ✅ Monitoring OK → {camera_id}"
#                         )

#             if max_frames and frame_count >= max_frames:
#                 logger.info(
#                     f"[IntruderWorker][HLS] Max frames ({max_frames}) reached → {camera_id}"
#                 )
#                 break

#     except KeyboardInterrupt:
#         _STOP_EVENT.set()
#         logger.info(f"[IntruderWorker][HLS] Interrupted → {camera_id}")
#     except Exception as e:
#         logger.error(f"[IntruderWorker][HLS] Error → {camera_id}: {e}")
#     finally:
#         cap.release()
#         elapsed     = time.time() - start_time
#         actual_fps  = frame_count / elapsed if elapsed > 0 else 0
#         logger.info(
#             f"[IntruderWorker][HLS] 🔴 Stopped → {camera_id} | "
#             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
#         )

#     return True


# def intruder_worker_hls(camera_config: dict, max_frames: int | None = None):
#     """
#     HLS worker entry point — used when master_pipeline detects an HLS camera.

#     camera_config = {
#         'camera_id':   str,   # unique label
#         'stream_url':  str,   # raw URL from Excel (may be page URL or direct m3u8)
#     }
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

#     camera_id   = camera_config.get("camera_id", "unknown")
#     initial_url = camera_config.get("stream_url", "")

#     # Resolve to actual m3u8 if it's a TCS page URL
#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url:
#         logger.error(f"[IntruderWorker][HLS] ❌ Could not resolve HLS URL for {camera_id}")
#         return

#     # Quick health check before starting the read loop
#     if not test_hls_stream(hls_url):
#         logger.error(f"[IntruderWorker][HLS] ❌ Stream test failed for {camera_id}: {hls_url}")
#         return

#     logger.info(f"[IntruderWorker][HLS] ▶ Starting → {camera_id}  URL: {hls_url}")
#     _run_hls_camera(camera_id, hls_url, max_frames=max_frames)














#working properly bss cltr+c se stop nhi ho rha, need to kill the process from terminal
# workers/intruder_worker.py
# workers/intruder_worker.py
# workers/intruder_worker.py
# """
# Intruder Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - intruder_det.py      (RTSP / DSS flow)
#   - intruder_det_tcs.py  (HLS / TCS flow)
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
# # threading.Event is thread-safe — all HLS threads share this one object
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
# PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # Separate save folders for RTSP and HLS results
# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# MIN_PERSONS      = 0      # alert if persons > this
# CONF_THRESHOLD   = 0.30
# COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # HLS-specific tuning
# HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # ================= SHARED STATE ============
# last_save_times = {}   # key → last save epoch
# person_counts   = {}   # key → cumulative person count (for reporting)
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [IntruderWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
#     """
#     Run YOLO on *frame*, draw boxes, save if intruder found.

#     Returns:
#         (intruder_detected: bool, person_count: int)
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
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame, f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────────
#     cv2.putText(frame, f"Persons: {person_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────────
#     key     = f"{device_id}_{camera_no}"
#     now     = time.time()

#     with _state_lock:
#         elapsed          = now - last_save_times.get(key, 0)
#         intruder_detected = person_count > MIN_PERSONS

#         if intruder_detected and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = os.path.join(
#                 save_folder,
#                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#             )
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(
#                 f"[IntruderWorker] 🚨 Intruder! "
#                 f"Device={device_id} Cam={camera_no} "
#                 f"Count={person_count} Conf={max_conf:.2f} "
#                 f"💾 Saved → {path}"
#             )
#         elif intruder_detected:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
#                 f"active ({remaining}s left) → {key}"
#             )

#         # Update cumulative counter
#         person_counts[key] = person_counts.get(key, 0) + person_count

#     return intruder_detected, person_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def intruder_worker(frame_queue):
#     """
#     Standard worker loop — receives (frame, device_id, camera_no)
#     packets from the RTSP producer queue.

#     This is the entry point used by master_pipeline.py.
#     """
#     logger.info("🟢 [IntruderWorker] RTSP worker started")

#     while True:
#         data = frame_queue.get()
#         if data is None:
#             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
#             break

#         frame, device_id, camera_no = data
#         detect_intruder(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             save_folder=RTSP_SAVE_FOLDER
#         )


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
# def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames: int | None = None):
#     """
#     Internal function: open HLS stream and run intruder detection.
#     Uses tcs_hls_utils.open_hls_stream directly.
#     """
#     from tcs_hls_utils import open_hls_stream

#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[IntruderWorker][HLS] ❌ Could not open stream for {camera_id}")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[IntruderWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

#     frame_count  = 0
#     fail_count   = 0
#     start_time   = time.time()

#     try:
#         while not _STOP_EVENT.is_set():
#             ret, frame = cap.read()

#             if not ret or frame is None:
#                 fail_count += 1
#                 logger.warning(
#                     f"[IntruderWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}"
#                 )
#                 if fail_count >= HLS_FAIL_LIMIT:
#                     logger.error(
#                         f"[IntruderWorker][HLS] ❌ Max failures reached → {camera_id}"
#                     )
#                     break
#                 time.sleep(3)
#                 continue

#             fail_count   = 0
#             frame_count += 1

#             # Sample every Nth frame to reduce CPU load
#             if frame_count % HLS_SAMPLE_EVERY == 0:
#                 # Use camera_name in filename if available, else fall back to camera_id
#                 label = camera_name if camera_name else camera_id
#                 intruder_detected, person_count = detect_intruder(
#                     frame.copy(),
#                     device_id=label,
#                     camera_no="",
#                     save_folder=HLS_SAVE_FOLDER
#                 )

#                 # Periodic status log every ~90 processed frames
#                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
#                     if intruder_detected:
#                         logger.critical(
#                             f"[IntruderWorker][HLS] 🚨 INTRUDER: {person_count} person(s) → {camera_id}"
#                         )
#                     else:
#                         logger.info(
#                             f"[IntruderWorker][HLS] ✅ Monitoring OK → {camera_id}"
#                         )

#             if max_frames and frame_count >= max_frames:
#                 logger.info(
#                     f"[IntruderWorker][HLS] Max frames ({max_frames}) reached → {camera_id}"
#                 )
#                 break

#     except KeyboardInterrupt:
#         _STOP_EVENT.set()
#         logger.info(f"[IntruderWorker][HLS] Interrupted → {camera_id}")
#     except Exception as e:
#         logger.error(f"[IntruderWorker][HLS] Error → {camera_id}: {e}")
#     finally:
#         cap.release()
#         elapsed     = time.time() - start_time
#         actual_fps  = frame_count / elapsed if elapsed > 0 else 0
#         logger.info(
#             f"[IntruderWorker][HLS] 🔴 Stopped → {camera_id} | "
#             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
#         )

#     return True


# def intruder_worker_hls(camera_config: dict, max_frames: int | None = None):
#     """
#     HLS worker entry point — used when master_pipeline detects an HLS camera.

#     camera_config = {
#         'camera_id':   str,   # unique label
#         'stream_url':  str,   # raw URL from Excel (may be page URL or direct m3u8)
#     }
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

#     camera_id   = camera_config.get("camera_id", "unknown")
#     initial_url = camera_config.get("stream_url", "")

#     # Resolve to actual m3u8 if it's a TCS page URL
#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url:
#         logger.error(f"[IntruderWorker][HLS] ❌ Could not resolve HLS URL for {camera_id}")
#         return

#     # Quick health check before starting the read loop
#     if not test_hls_stream(hls_url):
#         logger.error(f"[IntruderWorker][HLS] ❌ Stream test failed for {camera_id}: {hls_url}")
#         return

#     camera_name = camera_config.get("camera_name", "")
#     logger.info(f"[IntruderWorker][HLS] ▶ Starting → {camera_id}  ({camera_name})  URL: {hls_url}")
#     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)



































#working for rtsp+hls ,but hls flow is not correct

# workers/intruder_worker.py
"""
Intruder Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - intruder_det.py      (RTSP / DSS flow)
  - intruder_det_tcs.py  (HLS / TCS flow)
"""

import time
import os
import logging
import threading
import signal
import queue
from datetime import datetime

import cv2
from ultralytics import YOLO

# ================= GRACEFUL STOP FLAG =================
# threading.Event is thread-safe — all HLS threads share this one object
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

signal.signal(signal.SIGINT,  _handle_stop)
signal.signal(signal.SIGTERM, _handle_stop)

# ================= PATH SETUP =================
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

import Intruder_det as intruder_core

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# Separate save folders for RTSP and HLS results
RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_detection")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

MIN_PERSONS      = 0      # alert if persons > this
CONF_THRESHOLD   = 0.30
COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# HLS-specific tuning
HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# ── GPU Queue Config ─────────────────────────────────
GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "128"))
THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0

_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)

# ================= SHARED STATE ============
last_save_times = {}   # key → last save epoch
person_counts   = {}   # key → cumulative person count (for reporting)
_state_lock     = threading.Lock()

# ================= YOLO ====================
logger.info("🔄 [IntruderWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [IntruderWorker] YOLO model loaded")


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = "", source_type: str = "RTSP"):
    """
    Run YOLO on *frame*, draw boxes, save if intruder found.
    camera_id_pk is the DB primary key, used for unique file naming.

    Returns:
        (intruder_detected: bool, person_count: int)
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
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame, f"Person {conf:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
        )

    # ── Overlay info ─────────────────────────────────────────
    cv2.putText(frame, f"Persons: {person_count}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # ── Save logic ───────────────────────────────────────────
    # Use DB primary key if available
    key     = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
    now     = time.time()

    with _state_lock:
        elapsed          = now - last_save_times.get(key, 0)
        intruder_detected = person_count > MIN_PERSONS

        if intruder_detected and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            # ── Source-Aware Naming Format ──────────────
            if source_type == "HLS":
                # intruder_ch[ch_no]_[timestamp].jpg
                fname = f"intruder_ch{camera_no}_{ts}.jpg"
            else:
                # RTSP: intruder_[device_id]_[camera_no]_[timestamp].jpg
                dev_id = camera_id_pk or device_id
                fname = f"intruder_{dev_id}_{camera_no}_{ts}.jpg"
            
            path = os.path.join(save_folder, fname)
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.warning(
                f"[IntruderWorker] 🚨 Intruder! "
                f"pk={camera_id_pk} Device={device_id} Cam={camera_no} "
                f"Count={person_count} Conf={max_conf:.2f} "
                f"💾 Saved → {path}"
            )

            # --- Report to DB (HLS only) ---
            if source_type == "HLS":
                try:
                    intruder_core.report_to_db_hls(
                        ch_code=str(camera_no), 
                        image_name=os.path.basename(path),
                        folder="intruder_detection"
                    )
                except Exception as e:
                    logger.error(f"[IntruderWorker] DB Reporting Error: {e}")
        elif intruder_detected:
            remaining = int(COOLDOWN_TIME - elapsed)
            logger.debug(
                f"[IntruderWorker] ⏳ Intruder detected but cooldown "
                f"active ({remaining}s left) → {key}"
            )

        # Update cumulative counter
        person_counts[key] = person_counts.get(key, 0) + person_count

    return intruder_detected, person_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def intruder_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives packets from the RTSP producer and pushes them into
    the shared _gpu_queue for batch inference.
    """
    import torch
    logger.info("🟢 [IntruderWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the SAME GPU batch worker that HLS uses
    gpu_t = threading.Thread(
        target=_hls_gpu_batch_worker,
        args=(stop_event,),
        daemon=True
    )
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None:
                logger.info("🔴 [IntruderWorker] RTSP batch-worker stopping")
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
                    "camera_id_pk": str(camera_id_pk),
                    "source_type":  "RTSP",
                    "save_folder":  RTSP_SAVE_FOLDER,
                }, timeout=0.1)
            except queue.Full:
                pass
            del frame

    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("🔴 [IntruderWorker] GPU worker shut down")


# =====================================================
# 📡  HLS PATH  — standalone, reads its own stream
# =====================================================
    return True


def _hls_gpu_batch_worker(stop_event):
    """
    GPU batch worker — pulls frames from _gpu_queue and runs batched YOLO.
    """
    logger.info(f"🚀 [IntruderWorker][HLS] GPU worker started (batch={GPU_BATCH_SIZE})")

    while not stop_event.is_set():
        batch = []
        try:
            batch.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + 0.2
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(_gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        if not batch: continue

        try:
            frames = [item['frame'] for item in batch]
            # TRUE GPU BATCHING
            results = yolo_model(frames, conf=CONF_THRESHOLD, verbose=False)

            for item, result in zip(batch, results):
                camera_id = item['camera_id']
                camera_name = item['camera_name']
                frame = item['frame']
                
                person_detections = [
                    box for box in result.boxes
                    if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
                ]

                person_count = len(person_detections)
                if person_count > MIN_PERSONS:
                    src_type = item.get("source_type", "HLS")
                    c_no = item.get("ch_no") or item.get("camera_no") or ""
                    detect_intruder(frame, camera_id, c_no, HLS_SAVE_FOLDER, source_type=src_type)

                # Cleanup
                if 'frame' in item: del item['frame']

            del batch
            if 'results' in locals(): del results

        except Exception as e:
            logger.error(f"[BATCH ERROR][Intruder] {e}")
            for item in batch:
                if 'frame' in item: del item['frame']
            del batch

    logger.info("🔴 [IntruderWorker][HLS] GPU worker stopped")


def _hls_camera_thread(cfg, stop_event):
    """
    Refactored camera thread: reads HLS and pushes to _gpu_queue.
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
    from tcs_scheduler import frame_should_process

    camera_id = cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url', '')
    camera_name = cfg.get('camera_name', '')

    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url or not test_hls_stream(hls_url):
        return

    cap = open_hls_stream(hls_url)
    if not cap or not cap.isOpened():
        return

    logger.info(f"[IntruderWorker][HLS] 🟢 Started camera thread → {camera_id}")
    frame_count = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret: break

        frame_count += 1
        if not frame_should_process(frame_count, HLS_SAMPLE_EVERY):
            continue

        try:
            _gpu_queue.put({
                "frame": frame.copy(),
                "camera_id": camera_id,
                "camera_name": camera_name,
                "ch_no": cfg.get("ch_no") or cfg.get("camera_no") or "unknown",
                "source_type": "HLS"
            }, timeout=0.1)
        except queue.Full:
            del frame
            continue
        
        # Cleanup
        del frame

    cap.release()
    logger.info(f"[IntruderWorker][HLS] 🔴 Stopped camera thread → {camera_id}")


def intruder_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point — GPU batch queue architecture.
    """
    import torch
    cv2.setNumThreads(0) # Prevent thread explosion

    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT
    
    # 🔥 SCENE FILTER (case-insensitive) - Intruders are outdoor threats
    valid_scenes = ['outdoor', 'outside', 'exterior', 'intruder']
    filtered_configs = []
    for cfg in camera_configs:
        if not cfg.get('cctv_url'): continue
        cls_val = str(cfg.get('classification', '')).lower()
        if any(scene in cls_val for scene in valid_scenes):
            filtered_configs.append(cfg)
    
    if not filtered_configs:
        logger.warning(f"[IntruderWorker][HLS] No cameras matched Intruder (outdoor) scenes. Skipping.")
        return
    
    camera_configs = filtered_configs
    logger.info(f"[IntruderWorker][HLS] Processing {len(camera_configs)} outdoor cameras")

    # Start GPU Worker
    gpu_t = threading.Thread(
        target=_hls_gpu_batch_worker,
        args=(stop_event,),
        daemon=True
    )
    gpu_t.start()

    # Start camera threads using ThreadPoolExecutor
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in camera_configs:
            executor.submit(_hls_camera_thread, cfg, stop_event)
            time.sleep(THREAD_START_DELAY)

    try:
        stop_event.wait()
    except KeyboardInterrupt:
        stop_event.set()
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("[IntruderWorker][HLS] ✅ Intruder detection completed")




























#test
# workers/intruder_worker.py
"""
Intruder Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - intruder_det.py      (RTSP / DSS flow)
  - intruder_det_tcs.py  (HLS / TCS flow)
"""

# import time
# import os
# import logging
# import threading
# from datetime import datetime

# import cv2
# from ultralytics import YOLO


# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # ================= CONFIG ==================
# PROJECT_ROOT    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# MODEL_PATH      = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # Separate save folders for RTSP and HLS results
# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# MIN_PERSONS      = 0      # alert if persons > this
# CONF_THRESHOLD   = 0.30
# COOLDOWN_TIME    = 0      # seconds between saves per camera (0 = every frame)

# # HLS-specific tuning
# HLS_SAMPLE_EVERY     = 3   # process every Nth frame (reduce CPU load)
# HLS_FAIL_LIMIT       = 3   # consecutive read failures before giving up

# # ================= SHARED STATE ============
# last_save_times = {}   # key → last save epoch
# person_counts   = {}   # key → cumulative person count (for reporting)
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [IntruderWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [IntruderWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_intruder(frame, device_id: str, camera_no: str, save_folder: str):
#     """
#     Run YOLO on *frame*, draw boxes, save if intruder found.

#     Returns:
#         (intruder_detected: bool, person_count: int)
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
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame, f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────────
#     cv2.putText(frame, f"Persons: {person_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────────
#     key     = f"{device_id}_{camera_no}"
#     now     = time.time()

#     with _state_lock:
#         elapsed          = now - last_save_times.get(key, 0)
#         intruder_detected = person_count > MIN_PERSONS

#         if intruder_detected and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = os.path.join(
#                 save_folder,
#                 f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#             )
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(
#                 f"[IntruderWorker] 🚨 Intruder! "
#                 f"Device={device_id} Cam={camera_no} "
#                 f"Count={person_count} Conf={max_conf:.2f} "
#                 f"💾 Saved → {path}"
#             )
#         elif intruder_detected:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[IntruderWorker] ⏳ Intruder detected but cooldown "
#                 f"active ({remaining}s left) → {key}"
#             )

#         # Update cumulative counter
#         person_counts[key] = person_counts.get(key, 0) + person_count

#     return intruder_detected, person_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def intruder_worker(frame_queue):
#     """
#     Standard worker loop — receives (frame, device_id, camera_no)
#     packets from the RTSP producer queue.

#     This is the entry point used by master_pipeline.py.
#     """
#     logger.info("🟢 [IntruderWorker] RTSP worker started")

#     while True:
#         data = frame_queue.get()
#         if data is None:
#             logger.info("🔴 [IntruderWorker] RTSP worker stopping")
#             break

#         frame, device_id, camera_no = data
#         detect_intruder(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             save_folder=RTSP_SAVE_FOLDER
#         )