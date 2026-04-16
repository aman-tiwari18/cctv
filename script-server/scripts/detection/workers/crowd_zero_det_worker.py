# # """
# # TCS Zero-Person Detection Script
# # ==================================
# # Detects frames where person count drops to zero/low occupancy
# # in Outdoor / Entry / Parking camera feeds.

# # Architecture: GPU-batched YOLO worker + per-camera feeder threads
# #   - NO motion pre-filter (empty area = no motion = would skip exactly
# #     the frames we want to catch)
# #   - Single GPU worker drains shared queue in true batches
# #   - Rate limiter (25 detections/min globally)

# # Compatible with TCS streaming links (HLS format).
# # """

# # import queue
# # import sys
# # import os
# # sys.path.insert(0, os.path.dirname(__file__))

# # import cv2
# # import time
# # import threading
# # import signal
# # import logging
# # import torch

# # # Fix threading/BLAS errors
# # torch.backends.mkldnn.enabled = False
# # torch.set_num_threads(1)
# # os.environ["OMP_NUM_THREADS"] = "1"
# # os.environ["MKL_NUM_THREADS"] = "1"

# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # sys.path.insert(0, PROJECT_ROOT)

# # from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# # from tcs_scheduler import frame_should_process
# # from detection_rate_limiter import get_rate_limiter
# # from utils.db_client import get_hls_cameras, get_rtsp_cameras

# # try:
# #     from ultralytics import YOLO
# #     YOLO_AVAILABLE = True
# # except ImportError:
# #     YOLO_AVAILABLE = False
# #     logging.warning("YOLO not available — install ultralytics.")

# # logger = logging.getLogger(__name__)

# # _STOP_EVENT = threading.Event()


# # def _handle_stop(sig, frame):
# #     _STOP_EVENT.set()


# # if threading.current_thread() is threading.main_thread():
# #     signal.signal(signal.SIGINT, _handle_stop)
# #     signal.signal(signal.SIGTERM, _handle_stop)

# # # ─────────────────────────── paths ────────────────────────────────────────────
# # TCS_ZERO_SAVE_FOLDER = os.path.join(
# #     PROJECT_ROOT, "results/tcs_detections/zero_person_detection"
# # )

# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_threshold")


# # def ensure_save_paths():
# #     os.makedirs(TCS_ZERO_SAVE_FOLDER, exist_ok=True)
# #     os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# #     logger.info(f"TCS Zero-person detections will be saved to: {TCS_ZERO_SAVE_FOLDER}")

# # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# # # ─────────────────────────── thresholds ───────────────────────────────────────
# # LOW_PERSON_THRESHOLD = 1      # save when person_count < this (zero/low occupancy)
# # COOLDOWN_TIME        = 240    # 4 min between saves per camera (matches original)
# # CONFIDENCE           = 0.45   # YOLO confidence threshold (matches original)

# # # target scenes — same as original crowd_det_zero
# # TARGET_SCENES = [
# #     "Computer Lab"
# # ]

# # # ─────────────────────────── queue / batching ─────────────────────────────────
# # SAMPLE_EVERY   = int(os.environ.get("TCS_CROWD_ZERO_SAMPLE_EVERY",  10))
# # GPU_BATCH_SIZE = int(os.environ.get("TCS_CROWD_ZERO_BATCH_SIZE",    64))
# # GPU_QUEUE_SIZE = int(os.environ.get("TCS_CROWD_ZERO_QUEUE_SIZE",  128))
# # THREAD_DELAY   = float(os.environ.get("TCS_CROWD_ZERO_THREAD_DELAY", 0.1))

# # # ─────────────────────────── globals ──────────────────────────────────────────
# # gpu_queue: queue.Queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
# # rate_limiter = get_rate_limiter("crowd_zero", max_per_minute=25)
# # df_lock      = threading.Lock()

# # # single shared YOLO model
# # _yolo_model = None
# # _HLS_GPU_WORKER = None
# # _HLS_GPU_LOCK = threading.Lock()

# # def get_yolo_model():
# #     global _yolo_model
# #     ensure_save_paths()
# #     if _yolo_model is None and YOLO_AVAILABLE:
# #         logger.info("Loading YOLO model...")
# #         _yolo_model = YOLO(MODEL_PATH)
# #         logger.info("YOLO model loaded successfully")
# #     return _yolo_model

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  RTSP Worker  — standalone process entry point
# # # ══════════════════════════════════════════════════════════════════════════════
# # _rtsp_last_save = {}

# # def detect_zero_crowd(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = ""):
# #     model = get_yolo_model()
# #     if model is None:
# #         return

# #     results = model(frame, conf=CONFIDENCE, verbose=False)[0]
# #     person_boxes = [b for b in results.boxes if int(b.cls[0]) == 0]
# #     person_count = len(person_boxes)

# #     if person_count < LOW_PERSON_THRESHOLD:
# #         key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# #         log_key = f"{device_id}_{camera_no}"
# #         now = time.time()
        
# #         if now - _rtsp_last_save.get(key, 0) >= COOLDOWN_TIME:
# #             _rtsp_last_save[key] = now
# #             ts = time.strftime("%Y%m%d_%H%M%S")
# #             # Standard format: crowd_zero_{device_id}_{camera_no}_{ts}.jpg
# #             fname = f"crowd_zero_{device_id}_{camera_no}_{ts}.jpg"
            
# #             filename = os.path.join(save_folder, fname)
            
# #             # draw boxes
# #             for b in person_boxes:
# #                 x1, y1, x2, y2 = map(int, b.xyxy[0])
# #                 cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
# #             cv2.imwrite(filename, frame)
# #             logger.warning(
# #                 f"[CrowdZeroWorker] ZERO/LOW PERSON: pk={camera_id_pk} {log_key} "
# #                 f"({person_count} persons) saved → {filename}"
# #             )

# # def crowd_zero_worker(frame_queue):
# #     """
# #     RTSP Worker — GPU Batch Queue Architecture.
# #     Receives packets from the RTSP producer and pushes them into
# #     the shared gpu_queue for batch inference.
# #     """
# #     import torch
# #     logger.info("🟢 [CrowdZeroWorker] RTSP batch-worker started")
# #     stop_event = threading.Event()

# #     # Start the SAME GPU batch worker that HLS uses
# #     gpu_t = threading.Thread(
# #         target=gpu_worker,
# #         args=(None, stop_event),
# #         daemon=True,
# #         name="crowd_zero_rtsp_gpu_worker"
# #     )
# #     gpu_t.start()

# #     try:
# #         while True:
# #             data = frame_queue.get()
# #             if data is None:
# #                 logger.info("🔴 [CrowdZeroWorker] RTSP batch-worker stopping")
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
# #                 gpu_queue.put({
# #                     "frame":    frame.copy(),
# #                     "device_id": str(device_id),
# #                     "camera_no": str(camera_no),
# #                     "ch_no":    str(camera_no), # for compatibility
# #                     "source_type": "RTSP",
# #                     "state":    {"last_save": 0},
# #                 }, timeout=0.1)
# #             except queue.Full:
# #                 pass
# #             del frame

# #     finally:
# #         stop_event.set()
# #         gpu_t.join(timeout=5)
# #         if torch.cuda.is_available():
# #             torch.cuda.empty_cache()
# #         logger.info("🔴 [CrowdZeroWorker] GPU worker shut down")


# # # ══════════════════════════════════════════════════════════════════════════════
# # #  Config loader
# # # ══════════════════════════════════════════════════════════════════════════════

# # def load_camera_config():
# #     """Load camera list from DB tables using assignment context env vars."""
# #     exam_id = str(os.environ.get("EXAM_ID", "")).strip()
# #     shift_id = str(os.environ.get("SHIFT_ID", "")).strip()
# #     assignment_date = str(os.environ.get("ASSIGNMENT_DATE", "")).strip() or time.strftime("%Y-%m-%d")
# #     link_type = str(os.environ.get("LINK_TYPE", "HLS")).strip().upper()

# #     if not exam_id:
# #         logger.error("EXAM_ID is required for DB camera loading")
# #         return [], None

# #     try:
# #         exam_id_int = int(exam_id)
# #         if link_type == "RTSP":
# #             rows = get_rtsp_cameras(exam_id_int)
# #         else:
# #             shift_id_int = int(shift_id) if shift_id else -1
# #             rows = get_hls_cameras(exam_id_int, shift_id_int, assignment_date)

# #         logger.info(f"Loaded {len(rows)} cameras from DB (link_type={link_type})")
# #         configs = []
# #         for row in rows:
# #             url = str(row.get("cctv_url") or "").strip()
# #             if not url:
# #                 continue

# #             scene = str(row.get("classification") or "")
# #             if scene and scene not in TARGET_SCENES:
# #                 continue

# #             if link_type == "RTSP":
# #                 camera_id = str(row.get("device_id") or "").strip()
# #                 ch_no = camera_id or "unknown"
# #             else:
# #                 ch_no = str(row.get("ch_code") or "").strip() or "unknown"
# #                 camera_id = ch_no

# #             if not camera_id:
# #                 continue

# #             configs.append({
# #                 "url":       url,
# #                 "camera_id": camera_id,
# #                 "ch_no":     ch_no,
# #                 "classification": scene,
# #             })

# #         logger.info(f"Loaded {len(configs)} camera configs")
# #         return configs, None

# #     except Exception as exc:
# #         logger.error(f"Error loading cameras from DB: {exc}")
# #         return [], None


# # # ══════════════════════════════════════════════════════════════════════════════
# # #  GPU worker  — single thread, true batch YOLO inference
# # # ══════════════════════════════════════════════════════════════════════════════

# # def gpu_worker(df, stop_event: threading.Event):
# #     """
# #     Drain gpu_queue in batches.
# #       1. Collect up to GPU_BATCH_SIZE frames within a 200 ms window.
# #       2. Run a single batched YOLO forward pass (true GPU batching).
# #       3. Save frames where person_count < LOW_PERSON_THRESHOLD.
# #       4. Apply cooldown and rate limiter before saving.
# #     """
# #     logger.info("GPU worker started (zero-person batch mode)")

# #     model = get_yolo_model()
# #     if model is None:
# #         logger.error("YOLO unavailable — GPU worker exiting.")
# #         return

# #     while not stop_event.is_set():

# #         # ── collect a batch ───────────────────────────────────────────────────
# #         batch = []
# #         try:
# #             batch.append(gpu_queue.get(timeout=0.1))
# #         except queue.Empty:
# #             continue

# #         deadline = time.time() + 0.2
# #         while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
# #             try:
# #                 batch.append(gpu_queue.get_nowait())
# #             except queue.Empty:
# #                 time.sleep(0.002)

# #         # ── true batch YOLO inference ─────────────────────────────────────────
# #         frames = [item["frame"] for item in batch]
# #         try:
# #             results = model(frames, conf=CONFIDENCE, verbose=False)
# #         except Exception as exc:
# #             logger.error(f"[GPU] YOLO batch error: {exc}")
# #             for item in batch:
# #                 if 'frame' in item: del item['frame']
# #             del batch
# #             continue

# #         # ── per-frame post-processing ─────────────────────────────────────────
# #         for item, result in zip(batch, results):
# #             person_count  = sum(1 for b in result.boxes if int(b.cls[0]) == 0)
# #             zero_detected = person_count < LOW_PERSON_THRESHOLD

# #             camera_id = item["camera_id"]
# #             ch_no     = item["ch_no"]
# #             state     = item["state"]
# #             frame     = item["frame"]

# #             if not zero_detected:
# #                 continue

# #             now = time.time()

# #             # per-camera cooldown
# #             if now - state["last_save"] < COOLDOWN_TIME:
# #                 continue
# #             # global rate limiter
# #             if now - state.get('last_save', 0) > COOLDOWN_TIME:
# #                 should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
# #                 if should_save:
# #                     state['last_save'] = now
# #                     timestamp = time.strftime("%Y%m%d_%H%M%S")
                    
# #                     # ── Source-Aware Naming Format ──────────────
# #                     if item.get("source_type") == "HLS":
# #                         filename = os.path.join(TCS_ZERO_SAVE_FOLDER, f"crowd_zero_ch{ch_no}_{timestamp}.jpg")
# #                     else:
# #                         # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
# #                         dev_id = item.get("device_id") or camera_id
# #                         filename = os.path.join(TCS_ZERO_SAVE_FOLDER, f"crowd_zero_{dev_id}_{ch_no}_{timestamp}.jpg")
                    
# #                     cv2.imwrite(filename, frame)
# #                     logger.info(f"🚨 ALERT: CROWD ZERO at {camera_id} (count={person_count})")
            
# #             if 'frame' in item: del item['frame']

# #         del batch
# #         if 'results' in locals(): del results
# #         # GPU memory report
# #         if torch.cuda.is_available():
# #             mem = torch.cuda.memory_allocated() / 1e9
# #             logger.debug(f"[GPU] {mem:.2f} GB allocated")


# # def _ensure_shared_hls_gpu_worker():
# #     global _HLS_GPU_WORKER
# #     with _HLS_GPU_LOCK:
# #         if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
# #             _HLS_GPU_WORKER = threading.Thread(
# #                 target=gpu_worker,
# #                 args=(None, _STOP_EVENT),
# #                 daemon=True,
# #                 name="crowd_zero_hls_gpu_worker",
# #             )
# #             _HLS_GPU_WORKER.start()
# #             logger.info("[CrowdZeroWorker] Shared GPU worker started")


# # # ══════════════════════════════════════════════════════════════════════════════
# # #  Camera feeder thread
# # # ══════════════════════════════════════════════════════════════════════════════

# # def camera_thread(cfg: dict, stop_event: threading.Event):
# #     camera_id = cfg.get("camera_id") or "unknown_camera"
# #     ch_no = cfg.get("ch_no") or cfg.get("camera_no") or "unknown"

# #     initial_url = cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url") or ""
# #     hls_url = extract_hls_streaming_url(initial_url)
# #     if not hls_url or not test_hls_stream(hls_url):
# #         logger.error(f"[{camera_id}] Stream failed — skipping.")
# #         return

# #     cap = open_hls_stream(hls_url)
# #     if cap is None or not cap.isOpened():
# #         logger.error(f"[{camera_id}] cap.isOpened() == False — skipping.")
# #         return

# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0
# #     logger.info(f"[{camera_id}] Stream open @ {fps:.1f} FPS")

# #     state = {"last_save": 0}

# #     frame_count        = 0
# #     skipped_queue_full = 0

# #     while not stop_event.is_set():
# #         ret, frame = cap.read()
# #         if not ret:
# #             logger.warning(f"[{camera_id}] Stream ended / read failed.")
# #             break

# #         frame_count += 1
# #         if not frame_should_process(frame_count, SAMPLE_EVERY):
# #             continue

# #         # NOTE: No motion pre-filter — if the area is empty (zero persons)
# #         # there will be no motion. Filtering on motion would skip exactly
# #         # the frames we want to detect.

# #         try:
# #             gpu_queue.put({
# #                 'frame': frame.copy(),
# #                 'camera_id': camera_id,
# #                 'ch_no': ch_no,
# #                 'source_type': 'HLS',
# #                 'state': state
# #             }, timeout=0.1)
# #         except queue.Full:
# #             skipped_queue_full += 1
# #             del frame
# #             continue
        
# #         # Cleanup
# #         del frame

# #     cap.release()
# #     logger.info(
# #         f"[{camera_id}] Done. frames={frame_count} "
# #         f"queue-full-dropped={skipped_queue_full}"
# #     )


# # def crowd_zero_det_worker_hls(camera_configs, stop_event=None):
# #     """
# #     HLS worker entry point used by master_pipeline.
# #     Accepts one camera config dict or a list of configs.
# #     """
# #     if isinstance(camera_configs, dict):
# #         camera_configs = [camera_configs]

# #     persistent_mode = stop_event is None
# #     if stop_event is None:
# #         stop_event = _STOP_EVENT

# #     filtered_configs = []
# #     for cfg in camera_configs:
# #         stream_url = cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url")
# #         if stream_url:
# #             filtered_configs.append(cfg)

# #     if not filtered_configs:
# #         logger.warning("[CrowdZeroWorker][HLS] No cameras with valid URLs. Skipping.")
# #         return

# #     camera_configs = filtered_configs

# #     cv2.setNumThreads(0) # Prevent thread explosion
# #     if persistent_mode:
# #         _ensure_shared_hls_gpu_worker()
# #     else:
# #         gpu_t = threading.Thread(
# #             target=gpu_worker,
# #             args=(None, stop_event),
# #             daemon=True,
# #             name="crowd_zero_gpu_worker",
# #         )
# #         gpu_t.start()

# #     threads = []
# #     for cfg in camera_configs:
# #         t = threading.Thread(
# #             target=camera_thread,
# #             args=(cfg, stop_event),
# #             daemon=True,
# #             name=f"crowd_zero_{cfg.get('camera_id', 'cam')}",
# #         )
# #         t.start()
# #         threads.append(t)
# #         time.sleep(THREAD_DELAY)

# #     logger.info(f"[CrowdZeroWorker][HLS] Started {len(threads)} camera threads")

# #     try:
# #         for t in threads:
# #             t.join()
# #     except KeyboardInterrupt:
# #         stop_event.set()

# #     if persistent_mode:
# #         logger.info("[CrowdZeroWorker][HLS] Camera threads completed (shared GPU worker still running)")
# #         return

# #     stop_event.set()
# #     logger.info("[CrowdZeroWorker][HLS] All cameras completed")


# # # ══════════════════════════════════════════════════════════════════════════════
# # #  Main
# # # ══════════════════════════════════════════════════════════════════════════════

# # def main():
# #     logger.info("=== TCS Zero-Person Detection — Outdoor/Entry Cameras (batch-GPU architecture) ===")

# #     if not YOLO_AVAILABLE:
# #         logger.error("YOLO is not available. Install with: pip install ultralytics")
# #         return

# #     camera_configs, _ = load_camera_config()
# #     if not camera_configs:
# #         logger.warning("No cameras found — exiting.")
# #         return

# #     cv2.setNumThreads(0)
# #     stop_event = threading.Event()

# #     # single GPU worker
# #     gpu_t = threading.Thread(
# #         target=gpu_worker, args=(None, stop_event), daemon=True, name="gpu_worker"
# #     )
# #     gpu_t.start()

# #     # per-camera feeder threads
# #     # Start camera threads using ThreadPoolExecutor
# #     from concurrent.futures import ThreadPoolExecutor
# #     with ThreadPoolExecutor(max_workers=64) as executor:
# #         for cfg in camera_configs:
# #             executor.submit(camera_thread, cfg, stop_event)
# #             time.sleep(THREAD_DELAY)

# #     try:
# #         stop_event.wait()
# #     except KeyboardInterrupt:
# #         logger.info("Interrupted — stopping...")
# #         stop_event.set()

# #     stop_event.set()

# #     if torch.cuda.is_available():
# #         torch.cuda.empty_cache()
# #     logger.info("✅ All crowd_zero HLS cameras completed")


# # if __name__ == "__main__":
# #     main()



# import requests
# import json
# import hashlib
# import cv2
# import time
# import torch
# from ultralytics import YOLO
# from datetime import datetime
# import os
# import threading
# import pandas as pd
# import logging
# import pymysql
# import re

# # === Logging Setup ===
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # === Configuration ===
# # Get current directory (scripts/detection/)
# DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
# SAVE_FOLDER = os.path.join(DETECTION_ROOT, "results/tcs_detection/zero_person_detection")
# os.makedirs(SAVE_FOLDER, exist_ok=True)
# COOLDOWN_TIME = 240  # 4 minutes between saves - optimized for 25 alerts/min
# EXCEL_FILE = os.path.join(PROJECT_ROOT, "data/sheets/new_sheet1.xlsx")
# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# MIN_PERSONS = 5  # Minimum persons for crowd detection - increased to reduce false positives
# LOW_PERSON_THRESHOLD = 1 # Detect when persons < 5 (0–4 persons)
# CONF_THRESHOLD = 0.45  # Confidence threshold for person detection - increased for accuracy

# # ================= DB CONFIG =================
# DB_CONFIG = {
#     "host": "localhost",
#     "user": "root",
#     "password": "rootpassword123",
#     "database": "cctv_monitoring",
#     "cursorclass": pymysql.cursors.DictCursor
# }

# def report_to_db_hls(ch_code, image_name, folder="zero_person_detection"):
#     """
#     Look up camera info by ch_code and report detection to camera_report_hls.
#     """
#     try:
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         log_file = os.path.join(script_dir, "../db_reports.log")
        
#         with open(log_file, "a") as f:
#             f.write(f"\n--- New Crowd Zero Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
#             f.write(f"Image: {image_name} | Passed ch_code: {ch_code}\n")

#         if not str(ch_code).isdigit():
#             match = re.search(r'_ch(\d+)_', image_name)
#             if match:
#                 ch_code = match.group(1)
#                 with open(log_file, "a") as f: f.write(f"Extracted ch_code from filename: {ch_code}\n")

#         exam_id = os.environ.get("EXAM_ID")
#         shift_id = os.environ.get("SHIFT_ID")
        
#         if not exam_id:
#             msg = "[DB-REPORT] ❌ ERROR: EXAM_ID not found in environment.\n"
#             logging.error(msg)
#             with open(log_file, "a") as f: f.write(msg)
#             return False

#         ts_match = re.search(r'(\d{8}_\d{6})', image_name)
#         if ts_match:
#             raw_ts = ts_match.group(1)
#             dt_obj = datetime.strptime(raw_ts, "%Y%m%d_%H%M%S")
#             date_time = dt_obj.strftime("%d/%m/%Y %H:%M:%S")
#         else:
#             date_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

#         connection = pymysql.connect(**DB_CONFIG)
#         try:
#             with connection.cursor() as cursor:
#                 query = """
#                     SELECT * FROM camera_links_hls 
#                     WHERE ch_code = %s AND exam_id = %s
#                     AND (shift_id = %s OR shift_id IS NULL)
#                     LIMIT 1
#                 """
#                 cursor.execute(query, (ch_code, exam_id, shift_id))
#                 cam = cursor.fetchone()

#                 if not cam:
#                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (zero_person) for ch_code={ch_code}, exam_id={exam_id}\n"
#                     logging.error(msg)
#                     with open(log_file, "a") as f: f.write(msg)
#                     return False

#                 camera_name = cam.get('camera_name', '')
#                 parts = camera_name.split('/')
#                 report_camera_id = f"{parts[0]}_{parts[2]}" if len(parts) >= 3 else camera_name
#                 status_raw = str(cam.get('status', '')).lower()
#                 camera_status = "Online" if status_raw == 'accessible' else "Offline"
#                 image_url = f"http://www.examscctvmonitoring.com/cctv_dev/serve-detection-images/{folder}/{image_name}"

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
#                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted crowd zero report for ch_code {ch_code}\n"
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

# # Move model loading to a guard
# yolo_model = None
# def get_model():
#     global yolo_model
#     if yolo_model is None:
#         print("Loading YOLO model...")
#         yolo_model = YOLO(MODEL_PATH)
#     return yolo_model

# last_save_times = {}
# person_counts = {}  # Store person counts for each camera

# def load_camera_config():
#     try:
#         df = pd.read_excel(EXCEL_FILE)
#         logging.info(f"Loaded Excel file: {EXCEL_FILE}")
#         logging.info(f"Columns found: {list(df.columns)}")
#         logging.info(f"Total rows: {len(df)}")
        
#         # Check if required columns exist
#         required_columns = ['device_id', 'camera_no', 'Scene Classification']
#         if not all(col in df.columns for col in required_columns):
#             logging.error(f"Required columns {required_columns} not found in Excel file")
#             logging.error(f"Available columns: {list(df.columns)}")
#             return [], None
        
#         # Filter for Server Room or Computer Lab
#         filtered_df = df[df['Scene Classification'].isin(['Outdoor Scene','Outside area','Parking Lot','Entry'])]
        
#         # Clean and process data
#         filtered_df = filtered_df.dropna(subset=['device_id', 'camera_no'])
#         filtered_df['device_id'] = filtered_df['device_id'].astype(str)
#         filtered_df['camera_no'] = filtered_df['camera_no'].astype(int)
        
#         camera_configs = []
#         for index, row in filtered_df.iterrows():
#             device_id = str(row['device_id']).strip()
#             camera_no = int(row['camera_no'])
#             camera_configs.append({
#                 'device_id': device_id,
#                 'camera_no': camera_no,
#                 'index': index  # Store index to update Excel later
#             })
        
#         logging.info(f"Successfully loaded {len(camera_configs)} camera configurations ('Outdoor Scene','Outside area','Parking Lot'):")
#         for config in camera_configs:
#             logging.info(f"  Device ID: {config['device_id']}, Camera No: {config['camera_no']}")
        
#         return camera_configs, df  # Return DataFrame for updating later
        
#     except FileNotFoundError:
#         logging.error(f"Excel file '{EXCEL_FILE}' not found.")
#         return [], None
#     except Exception as e:
#         logging.error(f"Error reading Excel file: {e}")
#         return [], None

# def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
#     """Detect persons in a frame using YOLO and optionally save detections if crowd threshold is met"""
#     model = get_model()
#     results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
#     person_detections = [box for box in results.boxes if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD]
#     person_count = len(person_detections)
#     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

#     # Draw bounding boxes for detected persons
#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         label = f"Person {conf:.2f}"
#         cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

#     # Add detection info to frame
#     y_offset = 30
#     cv2.putText(frame, f"Persons: {person_count}", (10, y_offset), 
#                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     y_offset += 30
#     cv2.putText(frame, f"Device: {device_id}, Cam: {camera_no}", (10, y_offset), 
#                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # Save frame if crowd detected and cooldown period passed
#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     time_elapsed = now - last_save_times.get(key, 0)

#     crowd_detected = person_count < LOW_PERSON_THRESHOLD
#     if crowd_detected and time_elapsed >= COOLDOWN_TIME:
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         filename = f"{SAVE_FOLDER}/{key}_{timestamp}_persons{person_count}_conf{max_conf:.2f}.jpg"
#         cv2.imwrite(filename, frame)
#         last_save_times[key] = now
#         logging.info(f"[Device {device_id} - Camera {camera_no}] 💾 ZERO PERSON DETECTED & saved: {filename}")
#     elif crowd_detected:
#         remaining = int(COOLDOWN_TIME - time_elapsed)
#         logging.info(f"[Device {device_id} - Camera {camera_no}] ⏳ Crowd detected but cooldown active ({remaining}s left)")

#     # Update person count for this camera
#     person_counts[key] = person_counts.get(key, 0) + person_count
    
#     return frame, crowd_detected, person_count

# def generate_signature(userName, password, realm, randomKey):
#     temp = hashlib.md5(password.encode()).hexdigest()
#     temp = hashlib.md5((userName + temp).encode()).hexdigest()
#     temp = hashlib.md5(temp.encode()).hexdigest()
#     temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
#     signature = hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()
#     return signature

# def make_api_call(url, payload, headers):
#     response = requests.post(url, headers=headers, data=json.dumps(payload))
#     return response

# def process_rtsp_stream_with_crowd_detection(rtsp_url, device_id, camera_no, verbose=False):
#     """
#     Process RTSP stream with YOLO crowd detection
#     """
#     if verbose:
#         logging.info(f"Starting crowd detection on RTSP stream...")
#         logging.info(f"Device ID: {device_id}, Camera No: {camera_no}")
#         logging.info(f"RTSP URL: {rtsp_url}")
    
#     backends = [
#         (cv2.CAP_FFMPEG, "FFmpeg"),
#         (cv2.CAP_GSTREAMER, "GStreamer"), 
#         (cv2.CAP_V4L2, "V4L2"),
#         (cv2.CAP_ANY, "Any available")
#     ]
    
#     cap = None
#     successful_backend = None
    
#     for backend, backend_name in backends:
#         if verbose:
#             logging.info(f"Trying {backend_name} backend...")
#         try:
#             cap = cv2.VideoCapture(rtsp_url, backend)
#             cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
#             cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
#             cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
#             if cap.isOpened():
#                 ret, test_frame = cap.read()
#                 if ret and test_frame is not None:
#                     if verbose:
#                         logging.info(f"Successfully opened RTSP stream with {backend_name} backend")
#                     successful_backend = backend_name
#                     break
#                 else:
#                     if verbose:
#                         logging.info(f"{backend_name} backend opened but cannot read frames")
#                     cap.release()
#                     cap = None
#             else:
#                 if verbose:
#                     logging.info(f"Failed to open with {backend_name} backend")
#                 cap.release()
#                 cap = None
#         except Exception as e:
#             if verbose:
#                 logging.error(f"Error with {backend_name} backend: {e}")
#             if cap:
#                 cap.release()
#                 cap = None
    
#     if cap is None or not cap.isOpened():
#         logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to open RTSP stream: {rtsp_url}")
#         return False
    
#     if verbose:
#         logging.info(f"Stream opened successfully with {successful_backend} backend")
    
#     fps = cap.get(cv2.CAP_PROP_FPS)
#     width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
#     height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
#     if fps <= 0 or fps > 60:
#         fps = 25.0
#         if verbose:
#             logging.info(f"Invalid FPS detected, using default: {fps}")
#     if verbose:
#         logging.info(f"Stream properties: {width}x{height} @ {fps} FPS")
#     frame_count = 0
#     start_time = time.time()
#     fail_count = 0
#     try:
#         if verbose:
#             logging.info("Starting crowd detection...")
#             logging.info("Press Ctrl+C to stop")
#         while True:
#             ret, frame = cap.read()
#             if not ret:
#                 logging.warning(f"[Device {device_id} - Camera {camera_no}] Failed to receive frame")
#                 fail_count += 1
#                 if fail_count >= 3:
#                     logging.error(f"[Device {device_id} - Camera {camera_no}] Max retries reached, stopping")
#                     break
#                 time.sleep(3)
#                 continue
#             fail_count = 0
#             frame_count += 1
#             current_time = time.time()
#             elapsed_time = current_time - start_time
#             if frame_count % 5 == 0:
#                 processed_frame, crowd_detected, person_count = detect_persons_in_frame(
#                     frame, device_id, camera_no
#                 )
#                 if frame_count % 50 == 0:
#                     if crowd_detected:
#                         logging.info(f"[Device {device_id} - Camera {camera_no}] 👥 Crowd detected! Count: {person_count}")
#                     else:
#                         logging.info(f"[Device {device_id} - Camera {camera_no}] ✅ Monitoring active - No crowd detected")
#             if frame_count % (int(fps) * 60) == 0:
#                 logging.info(f"[Device {device_id} - Camera {camera_no}] 🔄 Processing: {elapsed_time:.1f}s elapsed ({frame_count} frames)")
#             time.sleep(1)  # As in crowd_det.py to control processing rate
#     except KeyboardInterrupt:
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection interrupted by user")
#     except Exception as e:
#         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during detection: {e}")
#     finally:
#         if cap:
#             cap.release()
#         cv2.destroyAllWindows()
#         total_time = time.time() - start_time
#         actual_fps = frame_count / total_time if total_time > 0 else 0
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection finished!")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Total frames processed: {frame_count}")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Total processing time: {total_time:.2f} seconds")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Actual processing FPS: {actual_fps:.2f}")
#     return True

# def authenticate_and_get_token():
#     """Authenticate and get token for API access"""
#     logging.info("Starting authentication...")
    
#     url = "https://d11.camview.io:443/admin/API/accounts/authorize"
#     headers = {
#         "Content-Type": "application/json;charset=UTF-8",
#         "Connection": "close",
#         "HOST": "d11.camview.io:443"
#     }
#     payload = {
#         "userName": "system",
#         "ipAddress": "",
#         "clientType": "WINPC_V1"
#     }
    
#     response = make_api_call(url, payload, headers)
#     response_content = json.loads(response.content.decode('utf-8'))
#     res_head = response.headers
    
#     logging.info(f"Status Code 1: {response.status_code}")
    
#     userName = "system"
#     password = "Coreiseven@@"
#     realm = response_content["realm"]
#     randomKey = response_content["randomKey"]
#     publicKey = response_content["publickey"]
#     cookie = res_head['Set-Cookie']
#     signature = generate_signature(userName, password, realm, randomKey)
    
#     payload2 = {
#         "mac": '',
#         "signature": signature,
#         "userName": userName,
#         "randomKey": randomKey,
#         "publicKey": publicKey,
#         "encryptType": "MD5",
#         "ipAddress": "",
#         "clientType": "WINPC_V1",
#         "userType": "0"
#     }
    
#     headers2 = {
#         "Content-Type": "application/json;charset=UTF-8",
#         "Connection": "close",
#         "Cookie": cookie
#     }
    
#     response2 = make_api_call(url, payload2, headers2)
#     response_content2 = json.loads(response2.content.decode('utf-8'))
#     logging.info(f"Status Code 2: {response2.status_code}")
#     print(payload2)
#     logging.info(f"Response Content 2: {response_content2}")
    
#     token = response_content2["token"]
#     return token

# def start_camera_detection(device_id, camera_no, token, df, index):
#     """Start detection for a specific camera and update Excel with results"""
#     logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting camera detection...")
    
#     url3 = f'https://d11.camview.io:443/admin/API/MTS/Video/StartVideo?token={token}'
#     headers3 = {
#         "Connection": "close",
#         "Content-Type": "application/json;charset=UTF-8",
#         "X-Subject-Token": token
#     }
#     payload3 = {
#         "clientType": "WINPC_V1",
#         "clientMac": '',
#         "clientPushId": "",
#         "project": "PSDK",
#         "method": "MTS.Video.StartVideo",
#         "data": {
#             "streamType": "1",
#             "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
#             "trackId": "",
#             "extend": "",
#             "channelId": f"{device_id}$1$0${camera_no}",
#             "keyCode": "",
#             "planId": "",
#             "dataType": "2",
#             "enableRtsps": "0"
#         }
#     }
    
#     try:
#         response3 = make_api_call(url3, payload3, headers3)
#         response_content3 = json.loads(response3.content.decode('utf-8'))
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Status Code 3: {response3.status_code}")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Response Content 3: {response_content3}")
        
#         if response3.status_code != 200 or 'data' not in response_content3:
#             logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to get video stream URL")
#             return
        
#         rtsp_urls = []
#         if '|' in response_content3['data']['url']:
#             urls = response_content3['data']['url'].split('|')
#             if len(urls) >= 2 and urls[1].strip():
#                 rtsp_url = urls[1] + '?token=' + response_content3['data']['token']
#                 rtsp_urls.append(rtsp_url)
#             else:
#                 logging.info(f"[Device {device_id} - Camera {camera_no}] Second URL not available, using first URL")
#                 rtsp_url = urls[0] + '?token=' + response_content3['data']['token']
#                 rtsp_urls.append(rtsp_url)
#         else:
#             rtsp_url = response_content3['data']['url'] + '?token=' + response_content3['data']['token']
#             rtsp_urls.append(rtsp_url)
        
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Found {len(rtsp_urls)} RTSP URLs:")
#         for i, url in enumerate(rtsp_urls):
#             logging.info(f"  {i+1}. {url}")
        
#         if rtsp_urls:
#             url_to_process = rtsp_urls[0]
#             logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting crowd detection on RTSP URL: {url_to_process}")
#             success = process_rtsp_stream_with_crowd_detection(url_to_process, device_id, camera_no, verbose=False)
#             if success:
#                 logging.info(f"Successfully processed crowd detection for camera {device_id} - Camera {camera_no}")
#                 # Update Excel with person count
#                 key = f"{device_id}_{camera_no}"
#                 df.at[index, 'Persons Detected'] = person_counts.get(key, 0)
#             else:
#                 logging.error(f"Failed to process RTSP stream for camera No {device_id}: Camera {camera_no}")
#                 df.at[index, 'Persons Detected'] = 0
#         else:
#             logging.error(f"[Device {device_id} - Camera {camera_no}] No RTSP URLs found in the response")
#             df.at[index, 'Persons Detected'] = 0
            
#     except Exception as e:
#         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during camera detection: {e}")
#         df.at[index, 'Persons Detected'] = 0
    
#     # Save updated DataFrame to Excel
#     try:
#         df.to_excel(EXCEL_FILE, index=False)
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Updated Excel file with crowd detection results")
#     except Exception as e:
#         logging.error(f"[Device {device_id} - Camera {camera_no}] Error saving Excel file: {e}")
# def main():
#     """Main function to orchestrate the entire process"""
#     logging.info("=== RTSP Crowd Detection with Excel Configuration ===\n")
    
#     # Load camera configurations from Excel
#     camera_configs, df = load_camera_config()
    
#     if not camera_configs or df is None:
#         logging.error("No camera configurations found. Please check your Excel file.")
#         return
    
#     # Initialize Persons Detected column
#     if 'Persons Detected' not in df.columns:
#         df['Persons Detected'] = -1  # Default to -1 for all
#     else:
#         # Set Persons Detected to -1 for cameras not in Server Room or Computer Lab
#         df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
#     # Save initial DataFrame with -1 for non-processed cameras
#     try:
#         df.to_excel(EXCEL_FILE, index=False)
#         logging.info(f"Initialized Excel file with Persons Detected set to -1 for non-processed cameras")
#     except Exception as e:
#         logging.error(f"Error saving initial Excel file: {e}")
#         return
    
#     # Authenticate and get token
#     try:
#         token = authenticate_and_get_token()
#         logging.info(f"Authentication successful. Token obtained.")
#     except Exception as e:
#         logging.error(f"Authentication failed: {e}")
#         return
    
#     # Start detection for all cameras in parallel
#     logging.info(f"\nStarting crowd detection for {len(camera_configs)} cameras...")
#     threads = []  # Initialize threads list
    
#     for config in camera_configs:
#         device_id = config['device_id']
#         camera_no = config['camera_no']
#         index = config['index']
        
#         t = threading.Thread(
#             target=start_camera_detection, 
#             args=(device_id, camera_no, token, df, index),
#             name=f"Camera-{device_id}-{camera_no}"
#         )
#         t.start()
#         threads.append(t)
        
#         # Small delay between starting threads to avoid overwhelming the server
#         time.sleep(1)
    
#     # Log and print after threads are created
#     logging.info(f"Started {len(threads)} camera detection threads.")
#     print(f"Started {len(threads)} camera detection threads.")
#     logging.info("Press Ctrl+C to stop all detections.\n")
    
#     # Wait for all threads to complete
#     try:
#         for t in threads:
#             t.join()
#     except KeyboardInterrupt:
#         logging.info("\nInterrupt received. Stopping all camera detections...")
    
#     # Final update: Ensure non-processed cameras still have -1
#     df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
#     # Final save of Excel file
#     try:
#         df.to_excel(EXCEL_FILE, index=False)
#         logging.info(f"Final update: Saved Excel file with all crowd detection results")
#     except Exception as e:
#         logging.error(f"Error saving final Excel file: {e}")
    
#     logging.info("All camera detections completed.")
#     print("All camera detections completed.")

# if __name__ == "__main__":
#     main()



# changes on 15-04-2026
"""
TCS Zero-Person Detection Script
==================================
Detects frames where person count drops to zero/low occupancy
in Outdoor / Entry / Parking camera feeds.

Architecture: GPU-batched YOLO worker + per-camera feeder threads
  - NO motion pre-filter (empty area = no motion = would skip exactly
    the frames we want to catch)
  - Single GPU worker drains shared queue in true batches
  - Rate limiter (25 detections/min globally)

Compatible with TCS streaming links (HLS format).
"""

import queue
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
import threading
import signal
import logging
import uuid
import torch

# Fix threading/BLAS errors
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter
from utils.db_client import get_hls_cameras, get_rtsp_cameras
from crowd_zero_det import report_to_db_hls
# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402


try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logging.warning("YOLO not available — install ultralytics.")

logger = logging.getLogger(__name__)

_STOP_EVENT = threading.Event()


def _handle_stop(sig, frame):
    _STOP_EVENT.set()


if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ─────────────────────────── paths ────────────────────────────────────────────
TCS_ZERO_SAVE_FOLDER = os.path.join(
    PROJECT_ROOT, "results/tcs_detections/zero_person_detection"
)

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_threshold")


def ensure_save_paths():
    os.makedirs(TCS_ZERO_SAVE_FOLDER, exist_ok=True)
    os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
    logger.info(f"TCS Zero-person detections will be saved to: {TCS_ZERO_SAVE_FOLDER}")

MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# ─────────────────────────── thresholds ───────────────────────────────────────
LOW_PERSON_THRESHOLD = 1      # save when person_count < this (zero/low occupancy)
COOLDOWN_TIME        = 240    # 4 min between saves per camera (matches original)
CONFIDENCE           = 0.45   # YOLO confidence threshold (matches original)

# target scenes — same as original crowd_det_zero
TARGET_SCENES = [
    "Computer Lab"
]

# ─────────────────────────── queue / batching ─────────────────────────────────
SAMPLE_EVERY   = int(os.environ.get("TCS_CROWD_ZERO_SAMPLE_EVERY",  10))
GPU_BATCH_SIZE = int(os.environ.get("TCS_CROWD_ZERO_BATCH_SIZE",    64))
GPU_QUEUE_SIZE = int(os.environ.get("TCS_CROWD_ZERO_QUEUE_SIZE",  128))
THREAD_DELAY   = float(os.environ.get("TCS_CROWD_ZERO_THREAD_DELAY", 0.1))

# ─────────────────────────── globals ──────────────────────────────────────────
gpu_queue: queue.Queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter("crowd_zero", max_per_minute=25)
df_lock      = threading.Lock()

# single shared YOLO model
_yolo_model = None
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()

def get_yolo_model():
    global _yolo_model
    ensure_save_paths()
    if _yolo_model is None and YOLO_AVAILABLE:
        logger.info("Loading YOLO model...")
        _yolo_model = YOLO(MODEL_PATH)
        logger.info("YOLO model loaded successfully")
    return _yolo_model

# ══════════════════════════════════════════════════════════════════════════════
#  RTSP Worker  — standalone process entry point
# ══════════════════════════════════════════════════════════════════════════════
_rtsp_last_save = {}

def detect_zero_crowd(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = ""):
    model = get_yolo_model()
    if model is None:
        return

    results = model(frame, conf=CONFIDENCE, verbose=False)[0]
    person_boxes = [b for b in results.boxes if int(b.cls[0]) == 0]
    person_count = len(person_boxes)

    if person_count < LOW_PERSON_THRESHOLD:
        key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
        log_key = f"{device_id}_{camera_no}"
        now = time.time()
        
        if now - _rtsp_last_save.get(key, 0) >= COOLDOWN_TIME:
            _rtsp_last_save[key] = now
            ts = time.strftime("%Y%m%d_%H%M%S")
            # Standard format: crowd_zero_{device_id}_{camera_no}_{ts}.jpg
            fname = f"crowd_zero_{device_id}_{camera_no}_{ts}.jpg"
            
            filename = os.path.join(save_folder, fname)
            
            # draw boxes
            for b in person_boxes:
                x1, y1, x2, y2 = map(int, b.xyxy[0])
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
            cv2.imwrite(filename, frame)
            logger.warning(
                f"[CrowdZeroWorker] ZERO/LOW PERSON: pk={camera_id_pk} {log_key} "
                f"({person_count} persons) saved → {filename}"
            )

def crowd_zero_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives packets from the RTSP producer and pushes them into
    the shared gpu_queue for batch inference.
    """
    import torch
    logger.info("🟢 [CrowdZeroWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the SAME GPU batch worker that HLS uses
    gpu_t = threading.Thread(
        target=gpu_worker,
        args=(None, stop_event),
        daemon=True,
        name="crowd_zero_rtsp_gpu_worker"
    )
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None:
                logger.info("🔴 [CrowdZeroWorker] RTSP batch-worker stopping")
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
                gpu_queue.put({
                    "frame":    frame.copy(),
                    "device_id": str(device_id),
                    "camera_no": str(camera_no),
                    "ch_no":    str(camera_no), # for compatibility
                    "source_type": "RTSP",
                    "state":    {"last_save": 0},
                }, timeout=0.1)
            except queue.Full:
                pass
            del frame

    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("🔴 [CrowdZeroWorker] GPU worker shut down")


# ══════════════════════════════════════════════════════════════════════════════
#  Config loader
# ══════════════════════════════════════════════════════════════════════════════

def load_camera_config():
    """Load camera list from DB tables using assignment context env vars."""
    exam_id = str(os.environ.get("EXAM_ID", "")).strip()
    shift_id = str(os.environ.get("SHIFT_ID", "")).strip()
    assignment_date = str(os.environ.get("ASSIGNMENT_DATE", "")).strip() or time.strftime("%Y-%m-%d")
    link_type = str(os.environ.get("LINK_TYPE", "HLS")).strip().upper()

    if not exam_id:
        logger.error("EXAM_ID is required for DB camera loading")
        return [], None

    try:
        exam_id_int = int(exam_id)
        if link_type == "RTSP":
            rows = get_rtsp_cameras(exam_id_int)
        else:
            shift_id_int = int(shift_id) if shift_id else -1
            rows = get_hls_cameras(exam_id_int, shift_id_int, assignment_date)

        logger.info(f"Loaded {len(rows)} cameras from DB (link_type={link_type})")
        configs = []
        for row in rows:
            url = str(row.get("cctv_url") or "").strip()
            if not url:
                continue

            scene = str(row.get("classification") or "")
            if scene and scene not in TARGET_SCENES:
                continue

            if link_type == "RTSP":
                camera_id = str(row.get("device_id") or "").strip()
                ch_no = camera_id or "unknown"
            else:
                ch_no = str(row.get("ch_code") or "").strip() or "unknown"
                camera_id = ch_no

            if not camera_id:
                continue

            configs.append({
                "url":       url,
                "camera_id": camera_id,
                "ch_no":     ch_no,
                "classification": scene,
            })

        logger.info(f"Loaded {len(configs)} camera configs")
        return configs, None

    except Exception as exc:
        logger.error(f"Error loading cameras from DB: {exc}")
        return [], None


# ══════════════════════════════════════════════════════════════════════════════
#  GPU worker  — single thread, true batch YOLO inference
# ══════════════════════════════════════════════════════════════════════════════

def gpu_worker(df, stop_event: threading.Event):
    """
    Drain gpu_queue in batches.
      1. Collect up to GPU_BATCH_SIZE frames within a 200 ms window.
      2. Run a single batched YOLO forward pass (true GPU batching).
      3. Save frames where person_count < LOW_PERSON_THRESHOLD.
      4. Apply cooldown and rate limiter before saving.
    """
    logger.info("GPU worker started (zero-person batch mode)")

    model = get_yolo_model()
    if model is None:
        logger.error("YOLO unavailable — GPU worker exiting.")
        return

    while not stop_event.is_set():

        # ── collect a batch ───────────────────────────────────────────────────
        batch = []
        try:
            batch.append(gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + 0.2
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        # ── true batch YOLO inference ─────────────────────────────────────────
        frames = [item["frame"] for item in batch]
        try:
            results = model(frames, conf=CONFIDENCE, verbose=False)
        except Exception as exc:
            logger.error(f"[GPU] YOLO batch error: {exc}")
            for item in batch:
                if 'frame' in item: del item['frame']
            del batch
            continue

        # ── per-frame post-processing ─────────────────────────────────────────
        for item, result in zip(batch, results):
            person_count  = sum(1 for b in result.boxes if int(b.cls[0]) == 0)
            zero_detected = person_count < LOW_PERSON_THRESHOLD

            camera_id = item["camera_id"]
            ch_no     = item["ch_no"]
            state     = item["state"]
            frame     = item["frame"]

            if not zero_detected:
                continue

            now = time.time()

            # per-camera cooldown
            if now - state["last_save"] < COOLDOWN_TIME:
                continue
            # global rate limiter
            if now - state.get('last_save', 0) > COOLDOWN_TIME:
                should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
                if should_save:
                    state['last_save'] = now
                    timestamp = time.strftime("%Y%m%d_%H%M%S")
                    
                    # ── Source-Aware Naming Format ──────────────
                    if item.get("source_type") == "HLS":
                        _uid = str(uuid.uuid4())
                        _exam_id = str(os.environ.get("EXAM_ID", "0")).strip()
                        filename = os.path.join(TCS_ZERO_SAVE_FOLDER, f"crowd_zero_ch{ch_no}_exam{_exam_id}_{timestamp}_{_uid}.jpg")
                    else:
                        # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
                        dev_id = item.get("device_id") or camera_id
                        filename = os.path.join(TCS_ZERO_SAVE_FOLDER, f"crowd_zero_{dev_id}_{ch_no}_{timestamp}.jpg")
                    
                    cv2.imwrite(filename, frame)
                    logger.info(f"🚨 ALERT: CROWD ZERO at {camera_id} (count={person_count})")
                    
                    # --- Report to DB (HLS only) ---
                    if item.get("source_type") == "HLS":
                        try:
                            report_to_db_hls(
                                ch_code=str(ch_no),
                                image_name=os.path.basename(filename),
                                folder="zero_person_detection"
                            )
                        except Exception as e:
                            logger.error(f"[CrowdZeroWorker] DB Reporting Error: {e}")
            
            if 'frame' in item: del item['frame']

        del batch
        if 'results' in locals(): del results
        # GPU memory report
        if torch.cuda.is_available():
            mem = torch.cuda.memory_allocated() / 1e9
            logger.debug(f"[GPU] {mem:.2f} GB allocated")


def _ensure_shared_hls_gpu_worker():
    global _HLS_GPU_WORKER
    with _HLS_GPU_LOCK:
        if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
            _HLS_GPU_WORKER = threading.Thread(
                target=gpu_worker,
                args=(None, _STOP_EVENT),
                daemon=True,
                name="crowd_zero_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()
            logger.info("[CrowdZeroWorker] Shared GPU worker started")


# ══════════════════════════════════════════════════════════════════════════════
#  Camera feeder thread
# ══════════════════════════════════════════════════════════════════════════════

def camera_thread(cfg: dict, stop_event: threading.Event):
    camera_id = cfg.get("camera_id") or "unknown_camera"
    ch_no = cfg.get("ch_no") or cfg.get("camera_no") or "unknown"

    initial_url = cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url") or ""
    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url or not test_hls_stream(hls_url):
        logger.error(f"[{camera_id}] Stream failed — skipping.")
        return

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] cap.isOpened() == False — skipping.")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    logger.info(f"[{camera_id}] Stream open @ {fps:.1f} FPS")

    state = {"last_save": 0}

    frame_count        = 0
    skipped_queue_full = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[{camera_id}] Stream ended / read failed.")
            break

        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        # NOTE: No motion pre-filter — if the area is empty (zero persons)
        # there will be no motion. Filtering on motion would skip exactly
        # the frames we want to detect.

        try:
            gpu_queue.put({
                'frame': frame.copy(),
                'camera_id': camera_id,
                'ch_no': ch_no,
                'source_type': 'HLS',
                'state': state
            }, timeout=0.1)
        except queue.Full:
            skipped_queue_full += 1
            del frame
            continue
        
        # Cleanup
        del frame

    cap.release()
    logger.info(
        f"[{camera_id}] Done. frames={frame_count} "
        f"queue-full-dropped={skipped_queue_full}"
    )


def crowd_zero_det_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point used by master_pipeline.
    Accepts one camera config dict or a list of configs.
    """
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    filtered_configs = []
    for cfg in camera_configs:
        stream_url = cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url")
        if stream_url:
            filtered_configs.append(cfg)

    if not filtered_configs:
        logger.warning("[CrowdZeroWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    camera_configs = filtered_configs

    cv2.setNumThreads(0) # Prevent thread explosion
    if persistent_mode:
        _ensure_shared_hls_gpu_worker()
    else:
        gpu_t = threading.Thread(
            target=gpu_worker,
            args=(None, stop_event),
            daemon=True,
            name="crowd_zero_gpu_worker",
        )
        gpu_t.start()

    threads = []
    for cfg in camera_configs:
        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"crowd_zero_{cfg.get('camera_id', 'cam')}",
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(f"[CrowdZeroWorker][HLS] Started {len(threads)} camera threads")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[CrowdZeroWorker][HLS] Camera threads completed (shared GPU worker still running)")
        return

    stop_event.set()
    logger.info("[CrowdZeroWorker][HLS] All cameras completed")


# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    logger.info("=== TCS Zero-Person Detection — Outdoor/Entry Cameras (batch-GPU architecture) ===")

    if not YOLO_AVAILABLE:
        logger.error("YOLO is not available. Install with: pip install ultralytics")
        return

    camera_configs, _ = load_camera_config()
    if not camera_configs:
        logger.warning("No cameras found — exiting.")
        return

    cv2.setNumThreads(0)
    stop_event = threading.Event()

    # single GPU worker
    gpu_t = threading.Thread(
        target=gpu_worker, args=(None, stop_event), daemon=True, name="gpu_worker"
    )
    gpu_t.start()

    # per-camera feeder threads
    # Start camera threads using ThreadPoolExecutor
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in camera_configs:
            executor.submit(camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    try:
        stop_event.wait()
    except KeyboardInterrupt:
        logger.info("Interrupted — stopping...")
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    logger.info("✅ All crowd_zero HLS cameras completed")


if __name__ == "__main__":
    main()