# # """
# # TCS Crowd Detection Script — Final
# # ====================================
# # Detection Logic  : crowd_det_less_than_5   (less-than-5 persons trigger)
# # Camera Source    : Computer Lab cameras only
# # Architecture     : True GPU Batch Mode (Script 2 pattern)

# # Excel columns used:
# #   - Centre Name
# #   - Camera Name
# #   - CCTV URL
# #   - ch_no(unique key value)   ← used in saved filename
# #   - Scene Classification      ← filtered to "Computer Lab"

# # Saved filename format:  lessthan5_ch{ch_no}_{timestamp}.jpg
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
# # from ultralytics import YOLO

# # # ── Fix MKL / oneDNN thread-safety issues ─────────────────────────────────────
# # torch.backends.mkldnn.enabled = False
# # torch.set_num_threads(1)
# # os.environ["OMP_NUM_THREADS"] = "1"
# # os.environ["MKL_NUM_THREADS"] = "1"

# # # ── Project root setup ────────────────────────────────────────────────────────
# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# # sys.path.insert(0, PROJECT_ROOT)

# # # ── Local TCS utils ───────────────────────────────────────────────────────────
# # from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
# # from tcs_scheduler import frame_should_process, get_sample_every
# # from detection_rate_limiter import get_rate_limiter
# # from motion_detector import get_motion_detector
# # from utils.db_client import get_hls_cameras, get_rtsp_cameras

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  CONFIG
# # # ══════════════════════════════════════════════════════════════════════════════

# # SAVE_FOLDER = os.path.join(
# #     PROJECT_ROOT, "results/tcs_detections/crowd_detection_threshold"
# # )
# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_threshold")
# # os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)

# # # Thresholds
# # MIN_PERSONS   = int(os.getenv("TCS_CROWD_FIVE_THRESHOLD", "5"))
# # COOLDOWN_TIME = int(os.getenv("TCS_CROWD_FIVE_COOLDOWN", "240"))
# # CONFIDENCE    = float(os.getenv("TCS_CROWD_FIVE_CONF", "0.45"))
# # person_counts = {}

# # # Frame sampling
# # SAMPLE_EVERY = get_sample_every("TCS_CROWD_SAMPLE_EVERY", default=10)

# # # GPU Batch Worker
# # GPU_BATCH_SIZE  = int(os.getenv("TCS_GPU_BATCH_SIZE",    "64"))
# # GPU_QUEUE_SIZE  = int(os.getenv("TCS_GPU_QUEUE_SIZE",    "128"))
# # GPU_FILL_WINDOW = float(os.getenv("TCS_GPU_FILL_WINDOW", "0.2"))
# # THREAD_DELAY    = float(os.getenv("TCS_THREAD_DELAY",    "0.1"))

# # # Rate limiter
# # RATE_LIMIT_PER_MIN = int(os.getenv("TCS_RATE_LIMIT", "25"))

# # # Scene filter
# # TARGET_SCENES = ["Computer Lab"]

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  LOGGING
# # # ══════════════════════════════════════════════════════════════════════════════

# # logging.basicConfig(
# #     level=logging.INFO,
# #     format="%(asctime)s [%(levelname)s] %(message)s",
# # )
# # logger = logging.getLogger(__name__)

# # logger.info(f"Save folder  : {SAVE_FOLDER}")
# # logger.info(f"MIN_PERSONS  : {MIN_PERSONS}")
# # logger.info(f"COOLDOWN     : {COOLDOWN_TIME}s")
# # logger.info(f"SAMPLE_EVERY : {SAMPLE_EVERY}")
# # logger.info(f"BATCH SIZE   : {GPU_BATCH_SIZE}")
# # logger.info(f"RATE LIMIT   : {RATE_LIMIT_PER_MIN}/min")

# # _STOP_EVENT = threading.Event()


# # def _handle_stop(sig, frame):
# #     _STOP_EVENT.set()


# # if threading.current_thread() is threading.main_thread():
# #     signal.signal(signal.SIGINT, _handle_stop)
# #     signal.signal(signal.SIGTERM, _handle_stop)

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  SHARED OBJECTS
# # # ══════════════════════════════════════════════════════════════════════════════

# # gpu_queue    = queue.Queue(maxsize=GPU_QUEUE_SIZE)
# # rate_limiter = get_rate_limiter("crowd_five", max_per_minute=RATE_LIMIT_PER_MIN)
# # df_lock      = threading.Lock()
# # _yolo_model = None
# # _HLS_GPU_WORKER = None
# # _HLS_GPU_LOCK = threading.Lock()


# # def get_yolo_model():
# #     global _yolo_model
# #     if _yolo_model is None:
# #         model_path = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# #         logger.info("Loading YOLO model for crowd_five worker...")
# #         _yolo_model = YOLO(model_path)
# #     return _yolo_model

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  RTSP Worker  — standalone process entry point
# # # ══════════════════════════════════════════════════════════════════════════════
# # _rtsp_last_save = {}
# # _rtsp_rate_limiter = get_rate_limiter("crowd_five_rtsp", max_per_minute=RATE_LIMIT_PER_MIN)

# # def detect_five_crowd(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = ""):
# #     model = get_yolo_model()
# #     if model is None:
# #         return

# #     results = model(frame, conf=CONFIDENCE, verbose=False)[0]
# #     person_boxes = [b for b in results.boxes if int(b.cls[0]) == 0]
# #     person_count = len(person_boxes)

# #     if person_count < MIN_PERSONS:
# #         key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
# #         log_key = f"{device_id}_{camera_no}"
# #         now = time.time()
        
# #         if now - _rtsp_last_save.get(key, 0) >= COOLDOWN_TIME:
# #             should_save, current_rate, _ = _rtsp_rate_limiter.should_save_detection(key)
# #             if not should_save:
# #                 return

# #             _rtsp_last_save[key] = now
# #             ts = time.strftime("%Y%m%d_%H%M%S")
            
# #             # ── Source-Aware Naming Format ──────────────
# #             # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
# #             fname = f"crowd_five_{device_id}_{camera_no}_{ts}.jpg"
            
# #             filename = os.path.join(save_folder, fname)
            
# #             # draw boxes
# #             for b in person_boxes:
# #                 x1, y1, x2, y2 = map(int, b.xyxy[0])
# #                 cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
# #             cv2.imwrite(filename, frame)
# #             logger.warning(
# #                 f"[CrowdFiveWorker] CROWD SAVED: pk={camera_id_pk} {log_key} "
# #                 f"({person_count} persons) saved → {fname}"
# #             )

# # def crowd_five_worker(frame_queue):
# #     """
# #     RTSP Worker — GPU Batch Queue Architecture.
# #     Receives packets from the RTSP producer and pushes them into
# #     the shared gpu_queue for batch inference.
# #     """
# #     import torch
# #     logger.info("🟢 [CrowdFiveWorker] RTSP batch-worker started")
# #     stop_event = threading.Event()

# #     # Start the SAME GPU batch worker that HLS uses
# #     gpu_t = threading.Thread(
# #         target=gpu_worker,
# #         args=(stop_event,),
# #         daemon=True,
# #         name="crowd_five_rtsp_gpu_worker"
# #     )
# #     gpu_t.start()

# #     try:
# #         while True:
# #             data = frame_queue.get()
# #             if data is None:
# #                 logger.info("🔴 [CrowdFiveWorker] RTSP batch-worker stopping")
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
# #                     "frame":        frame.copy(),
# #                     "device_id":    str(device_id),
# #                     "camera_no":    str(camera_no),
# #                     "ch_no":        str(camera_no), # for compatibility
# #                     "camera_id_pk": str(camera_id_pk),
# #                     "source_type":  "RTSP",
# #                     "save_folder":  RTSP_SAVE_FOLDER,
# #                 }, timeout=0.1)
# #             except queue.Full:
# #                 pass
# #             del frame

# #     finally:
# #         stop_event.set()
# #         gpu_t.join(timeout=5)
# #         if torch.cuda.is_available():
# #             torch.cuda.empty_cache()
# #         logger.info("🔴 [CrowdFiveWorker] GPU worker shut down")

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  EXCEL LOADER
# # # ══════════════════════════════════════════════════════════════════════════════

# # def load_camera_config():
# #     """Load camera configs from DB tables using assignment context env vars."""
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
# #         logger.info(f"DB loaded: {len(rows)} camera rows (link_type={link_type})")
# #     except Exception as exc:
# #         logger.error(f"Cannot read cameras from DB: {exc}")
# #         return [], None

# #     configs = []
# #     for row in rows:
# #         url = str(row.get("cctv_url") or "").strip()
# #         if not url:
# #             continue

# #         scene = str(row.get("classification") or "")
# #         if scene and scene not in TARGET_SCENES:
# #             continue

# #         if link_type == "RTSP":
# #             cam_id = str(row.get("device_id") or "").strip()
# #             ch_no = cam_id or "0"
# #         else:
# #             ch_no = str(row.get("ch_code") or "").strip() or "0"
# #             cam_name = str(row.get("camera_name") or "camera").strip()
# #             cam_id = f"{cam_name}_{ch_no}".replace(" ", "_").replace("/", "_")

# #         if not cam_id:
# #             continue

# #         configs.append({
# #             "initial_url": url,
# #             "camera_id":   cam_id,
# #             "ch_no":       ch_no,
# #             "classification": scene,
# #         })

# #     logger.info(f"Total cameras to process: {len(configs)}")
# #     return configs, None

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  GPU BATCH WORKER
# # # ══════════════════════════════════════════════════════════════════════════════

# # def gpu_worker(stop_event: threading.Event):
# #     """
# #     Single GPU worker thread.
# #     Fills batches from gpu_queue, runs detection, saves crowd frames.
# #     """
# #     logger.info("GPU batch worker started")
# #     get_yolo_model()    # warm up YOLO once
# #     logger.info("YOLO model ready")

# #     while not stop_event.is_set():

# #         # Step 1 — wait for first frame
# #         batch = []
# #         try:
# #             batch.append(gpu_queue.get(timeout=0.1))
# #         except queue.Empty:
# #             continue

# #         # Step 2 — fill batch within time window
# #         deadline = time.time() + GPU_FILL_WINDOW
# #         while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
# #             try:
# #                 batch.append(gpu_queue.get_nowait())
# #             except queue.Empty:
# #                 time.sleep(0.002)

# #         logger.debug(f"[GPU] Batch: {len(batch)} frames")

# #         # Step 3 — detect + save each item
# #         for item in batch:
# #             _detect_and_save(item)
# #             if 'frame' in item: del item['frame'] # Cleanup after detection

# #         del batch

# #         # Step 4 — VRAM stats
# #         if torch.cuda.is_available():
# #             logger.debug(f"[GPU] VRAM: {torch.cuda.memory_allocated()/1e9:.2f} GB")

# #     logger.info("GPU worker stopped.")


# # def _ensure_shared_hls_gpu_worker():
# #     global _HLS_GPU_WORKER
# #     with _HLS_GPU_LOCK:
# #         if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
# #             _HLS_GPU_WORKER = threading.Thread(
# #                 target=gpu_worker,
# #                 args=(_STOP_EVENT,),
# #                 daemon=True,
# #                 name="crowd_five_hls_gpu_worker",
# #             )
# #             _HLS_GPU_WORKER.start()
# #             logger.info("[CrowdFiveWorker] Shared GPU worker started")


# # def _detect_and_save(item: dict):
# #     """
# #     Run crowd_det_less_than_5 on one frame.
# #     Filename format: lessthan5_ch{ch_no}_{timestamp}.jpg
# #     """
# #     frame     = item["frame"]
# #     camera_id = item["camera_id"]
# #     ch_no     = item["ch_no"]
# #     state     = item["state"]   # {"last_save": float}

# #     # ── Detection ─────────────────────────────────────────────────────────
# #     try:
# #         model = get_yolo_model()
# #         result = model(frame, conf=CONFIDENCE, verbose=False)[0]
# #         person_boxes = [b for b in result.boxes if int(b.cls[0]) == 0]
# #         person_count = len(person_boxes)
# #         processed_frame = frame.copy()
# #         for b in person_boxes:
# #             x1, y1, x2, y2 = map(int, b.xyxy[0])
# #             cv2.rectangle(processed_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #     except Exception as exc:
# #         logger.error(f"[{camera_id}] Detection error: {exc}")
# #         return

# #     person_counts[camera_id] = person_count
# #     low_count_detected = person_count < MIN_PERSONS
# #     logger.debug(f"[{camera_id}] persons={person_count} low={low_count_detected}")

# #     if not low_count_detected:
# #         return

# #     now = time.time()

# #     # ── Cooldown ──────────────────────────────────────────────────────────
# #     if now - state["last_save"] < COOLDOWN_TIME:
# #         logger.debug(f"[{camera_id}] Cooldown active — skip")
# #         return

# #     # ── Rate limit ────────────────────────────────────────────────────────
# #     should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
# #     if not should_save:
# #         logger.info(f"[{camera_id}] Rate limit {current_rate}/{RATE_LIMIT_PER_MIN}/min — skip")
# #         return

# #     # ── Save  →  lessthan5_ch{ch_no}_{timestamp}.jpg ─────────────────────
# #     state["last_save"] = now
# #     timestamp = time.strftime("%Y%m%d_%H%M%S")
    
# #     # ── Source-Aware Naming Format ──────────────
# #     if item.get("source_type") == "HLS":
# #         fname = f"lessthan5_ch{ch_no}_{timestamp}.jpg"
# #     else:
# #         # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
# #         dev_id = item.get("device_id") or camera_id
# #         fname = f"crowd_five_{dev_id}_{ch_no}_{timestamp}.jpg"
    
# #     filename = os.path.join(item.get("save_folder", SAVE_FOLDER), fname)

# #     save_frame = processed_frame if processed_frame is not None else frame
# #     cv2.imwrite(filename, save_frame)

# #     logger.warning(
# #         f"[{camera_id}] CROWD SAVED — {person_count} persons | "
# #         f"{os.path.basename(filename)} | rate {current_rate}/{RATE_LIMIT_PER_MIN}/min"
# #     )

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  CAMERA THREAD
# # # ══════════════════════════════════════════════════════════════════════════════

# # def camera_thread(cfg: dict, stop_event: threading.Event):
# #     """One thread per camera — read HLS, motion filter, enqueue frames."""
# #     camera_id = cfg["camera_id"]

# #     initial_url = cfg.get("initial_url") or cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url") or ""
# #     hls_url = extract_hls_streaming_url(initial_url)
# #     if not hls_url or not test_hls_stream(hls_url):
# #         logger.error(f"[{camera_id}] HLS stream unavailable — skipping")
# #         return

# #     cap = open_hls_stream(hls_url)
# #     if cap is None or not cap.isOpened():
# #         logger.error(f"[{camera_id}] Cannot open stream — skipping")
# #         return

# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0
# #     logger.info(f"[{camera_id}] Stream open @ {fps:.1f} FPS | ch_no={cfg['ch_no']}")

# #     per_camera_state = {"last_save": 0.0}
# #     motion_detector  = get_motion_detector(camera_id, motion_threshold=1000)

# #     frame_count = skip_motion = skip_queue = 0

# #     while not stop_event.is_set():
# #         ret, frame = cap.read()
# #         if not ret:
# #             logger.warning(f"[{camera_id}] Stream ended")
# #             break

# #         frame_count += 1

# #         # Frame sampling
# #         if not frame_should_process(frame_count, SAMPLE_EVERY):
# #             continue

# #         # Motion pre-filter
# #         if not motion_detector.has_motion(frame):
# #             skip_motion += 1
# #             continue

# #         # Enqueue
# #         try:
# #             gpu_queue.put({
# #                 "frame":       frame.copy(),
# #                 "camera_id":   camera_id,
# #                 "ch_no":       cfg.get("ch_no") or cfg.get("camera_no") or "0",
# #                 "state":       per_camera_state,
# #                 "source_type": "HLS",
# #                 "save_folder": SAVE_FOLDER,
# #             }, timeout=0.1)
# #         except queue.Full:
# #             skip_queue += 1
# #             del frame
# #             if skip_queue % 100 == 1:
# #                 logger.warning(f"[{camera_id}] Queue full — drops: {skip_queue}")
# #             continue

# #         # Periodic stats
# #         if frame_count % 500 == 0:
# #             rl = rate_limiter.get_stats()
# #             logger.info(
# #                 f"[{camera_id}] frames={frame_count} | "
# #                 f"no_motion={skip_motion} | queue_drops={skip_queue} | "
# #                 f"rate={rl.get('current_rate','?')}/{RATE_LIMIT_PER_MIN}/min"
# #             )

# #     cap.release()
# #     logger.info(
# #         f"[{camera_id}] Done | frames={frame_count} | "
# #         f"no_motion={skip_motion} | queue_drops={skip_queue}"
# #     )


# # def crowd_five_det_worker_hls(camera_configs, stop_event=None):
# #     """HLS worker entry point for low-person (<5) detection analytics."""
# #     if isinstance(camera_configs, dict):
# #         camera_configs = [camera_configs]

# #     persistent_mode = stop_event is None
# #     if stop_event is None:
# #         stop_event = _STOP_EVENT

# #     filtered_configs = []
# #     for cfg in camera_configs:
# #         stream_url = cfg.get("initial_url") or cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url")
# #         if stream_url:
# #             filtered_configs.append(cfg)

# #     if not filtered_configs:
# #         logger.warning("[CrowdFiveWorker][HLS] No cameras with valid URLs. Skipping.")
# #         return

# #     if persistent_mode:
# #         _ensure_shared_hls_gpu_worker()
# #     else:
# #         gpu_t = threading.Thread(
# #             target=gpu_worker,
# #             args=(stop_event,),
# #             daemon=True,
# #             name="crowd_five_gpu_worker",
# #         )
# #         gpu_t.start()

# #     threads = []
# #     for cfg in filtered_configs:
# #         if "camera_id" not in cfg:
# #             cam_name = str(cfg.get("camera_name") or "camera")
# #             ch = str(cfg.get("ch_no") or cfg.get("camera_no") or "0")
# #             cfg = {
# #                 **cfg,
# #                 "camera_id": f"{cam_name}_{ch}".replace(" ", "_"),
# #             }

# #         t = threading.Thread(
# #             target=camera_thread,
# #             args=(cfg, stop_event),
# #             daemon=True,
# #             name=f"crowd_five_{cfg.get('camera_id', 'cam')}",
# #         )
# #         t.start()
# #         threads.append(t)
# #         time.sleep(THREAD_DELAY)

# #     logger.info(f"[CrowdFiveWorker][HLS] Started {len(threads)} camera threads")

# #     try:
# #         for t in threads:
# #             t.join()
# #     except KeyboardInterrupt:
# #         stop_event.set()

# #     if persistent_mode:
# #         logger.info("[CrowdFiveWorker][HLS] Camera threads completed (shared GPU worker still running)")
# #         return

# #     stop_event.set()
# #     logger.info("[CrowdFiveWorker][HLS] All cameras completed")

# # # ══════════════════════════════════════════════════════════════════════════════
# # #  MAIN
# # # ══════════════════════════════════════════════════════════════════════════════

# # def main():
# #     logger.info("=" * 65)
# #     logger.info("  TCS Crowd Detection  |  crowd_det_less_than_5  |  GPU Batch")
# #     logger.info("=" * 65)

# #     configs, _ = load_camera_config()
# #     if not configs:
# #         logger.error("No cameras found — exiting.")
# #         return

# #     cv2.setNumThreads(0) # Prevent thread explosion
# #     _ensure_shared_hls_gpu_worker()

# #     stop_event = _STOP_EVENT

# #     # One thread per camera
# #     # Start threads with ThreadPoolExecutor
# #     from concurrent.futures import ThreadPoolExecutor
# #     with ThreadPoolExecutor(max_workers=64) as executor:
# #         for cfg in configs:
# #             executor.submit(camera_thread, cfg, stop_event)
# #             time.sleep(THREAD_DELAY)

# #     stop_event.wait()
# #     stop_event.set()
    
# #     if torch.cuda.is_available():
# #         torch.cuda.empty_cache()
# #     logger.info("✅ All crowd_five HLS cameras completed")


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
# SAVE_FOLDER = os.path.join(DETECTION_ROOT, "results/tcs_detection/crowd_detection_threshold")
# os.makedirs(SAVE_FOLDER, exist_ok=True)
# COOLDOWN_TIME = 240  # 4 minutes between saves - optimized for 25 alerts/min
# EXCEL_FILE = os.path.join(PROJECT_ROOT, "data/sheets/new_sheet1.xlsx")
# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# MIN_PERSONS = 5  # Minimum persons for crowd detection - increased to reduce false positives
# LOW_PERSON_THRESHOLD = 5  # Detect when persons < 5 (0–4 persons)
# CONF_THRESHOLD = 0.45  # Confidence threshold for person detection - increased for accuracy

# # ================= DB CONFIG =================
# DB_CONFIG = {
#     "host": "localhost",
#     "user": "root",
#     "password": "rootpassword123",
#     "database": "cctv_monitoring",
#     "cursorclass": pymysql.cursors.DictCursor
# }

# def report_to_db_hls(ch_code, image_name, folder="crowd_detection_threshold"):
#     """
#     Look up camera info by ch_code and report detection to camera_report_hls.
#     """
#     try:
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         log_file = os.path.join(script_dir, "../db_reports.log")
        
#         with open(log_file, "a") as f:
#             f.write(f"\n--- New Crowd Five Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
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
#                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (crowd_five) for ch_code={ch_code}, exam_id={exam_id}\n"
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
#                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted crowd five report for ch_code {ch_code}\n"
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
#         logging.info(f"[Device {device_id} - Camera {camera_no}] 💾 Low person count detected ({person_count}) & saved: {filename}")
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
TCS Crowd Detection Script — Final
====================================
Detection Logic  : crowd_det_less_than_5   (less-than-5 persons trigger)
Camera Source    : Computer Lab cameras only
Architecture     : True GPU Batch Mode (Script 2 pattern)

Excel columns used:
  - Centre Name
  - Camera Name
  - CCTV URL
  - ch_no(unique key value)   ← used in saved filename
  - Scene Classification      ← filtered to "Computer Lab"

Saved filename format:  lessthan5_ch{ch_no}_{timestamp}.jpg
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
import torch
from ultralytics import YOLO

# ── Fix MKL / oneDNN thread-safety issues ─────────────────────────────────────
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

# ── Project root setup ────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

# ── Local TCS utils ───────────────────────────────────────────────────────────
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process, get_sample_every
from detection_rate_limiter import get_rate_limiter
from motion_detector import get_motion_detector
from utils.db_client import get_hls_cameras, get_rtsp_cameras
from crowd_five_det import report_to_db_hls
# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402


# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════

SAVE_FOLDER = os.path.join(
    PROJECT_ROOT, "results/tcs_detections/crowd_detection_threshold"
)
os.makedirs(SAVE_FOLDER, exist_ok=True)

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_threshold")
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)

# Thresholds
MIN_PERSONS   = int(os.getenv("TCS_CROWD_FIVE_THRESHOLD", "5"))
COOLDOWN_TIME = int(os.getenv("TCS_CROWD_FIVE_COOLDOWN", "240"))
CONFIDENCE    = float(os.getenv("TCS_CROWD_FIVE_CONF", "0.45"))
person_counts = {}

# Frame sampling
SAMPLE_EVERY = get_sample_every("TCS_CROWD_SAMPLE_EVERY", default=10)

# GPU Batch Worker
GPU_BATCH_SIZE  = int(os.getenv("TCS_GPU_BATCH_SIZE",    "64"))
GPU_QUEUE_SIZE  = int(os.getenv("TCS_GPU_QUEUE_SIZE",    "128"))
GPU_FILL_WINDOW = float(os.getenv("TCS_GPU_FILL_WINDOW", "0.2"))
THREAD_DELAY    = float(os.getenv("TCS_THREAD_DELAY",    "0.1"))

# Rate limiter
RATE_LIMIT_PER_MIN = int(os.getenv("TCS_RATE_LIMIT", "25"))

# Scene filter
TARGET_SCENES = ["Computer Lab"]

# ══════════════════════════════════════════════════════════════════════════════
#  LOGGING
# ══════════════════════════════════════════════════════════════════════════════

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

logger.info(f"Save folder  : {SAVE_FOLDER}")
logger.info(f"MIN_PERSONS  : {MIN_PERSONS}")
logger.info(f"COOLDOWN     : {COOLDOWN_TIME}s")
logger.info(f"SAMPLE_EVERY : {SAMPLE_EVERY}")
logger.info(f"BATCH SIZE   : {GPU_BATCH_SIZE}")
logger.info(f"RATE LIMIT   : {RATE_LIMIT_PER_MIN}/min")

_STOP_EVENT = threading.Event()


def _handle_stop(sig, frame):
    _STOP_EVENT.set()


if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ══════════════════════════════════════════════════════════════════════════════
#  SHARED OBJECTS
# ══════════════════════════════════════════════════════════════════════════════

gpu_queue    = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter("crowd_five", max_per_minute=RATE_LIMIT_PER_MIN)
df_lock      = threading.Lock()
_yolo_model = None
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        model_path = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
        logger.info("Loading YOLO model for crowd_five worker...")
        _yolo_model = YOLO(model_path)
    return _yolo_model

# ══════════════════════════════════════════════════════════════════════════════
#  RTSP Worker  — standalone process entry point
# ══════════════════════════════════════════════════════════════════════════════
_rtsp_last_save = {}
_rtsp_rate_limiter = get_rate_limiter("crowd_five_rtsp", max_per_minute=RATE_LIMIT_PER_MIN)

def detect_five_crowd(frame, device_id: str, camera_no: str, save_folder: str, camera_id_pk: str = ""):
    model = get_yolo_model()
    if model is None:
        return

    results = model(frame, conf=CONFIDENCE, verbose=False)[0]
    person_boxes = [b for b in results.boxes if int(b.cls[0]) == 0]
    person_count = len(person_boxes)

    if person_count < MIN_PERSONS:
        key = camera_id_pk if camera_id_pk else f"{device_id}_{camera_no}"
        log_key = f"{device_id}_{camera_no}"
        now = time.time()
        
        if now - _rtsp_last_save.get(key, 0) >= COOLDOWN_TIME:
            should_save, current_rate, _ = _rtsp_rate_limiter.should_save_detection(key)
            if not should_save:
                return

            _rtsp_last_save[key] = now
            ts = time.strftime("%Y%m%d_%H%M%S")
            
            # ── Source-Aware Naming Format ──────────────
            # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
            fname = f"crowd_five_{device_id}_{camera_no}_{ts}.jpg"
            
            filename = os.path.join(save_folder, fname)
            
            # draw boxes
            for b in person_boxes:
                x1, y1, x2, y2 = map(int, b.xyxy[0])
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
            cv2.imwrite(filename, frame)
            logger.warning(
                f"[CrowdFiveWorker] CROWD SAVED: pk={camera_id_pk} {log_key} "
                f"({person_count} persons) saved → {fname}"
            )

def crowd_five_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives packets from the RTSP producer and pushes them into
    the shared gpu_queue for batch inference.
    """
    import torch
    logger.info("🟢 [CrowdFiveWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the SAME GPU batch worker that HLS uses
    gpu_t = threading.Thread(
        target=gpu_worker,
        args=(stop_event,),
        daemon=True,
        name="crowd_five_rtsp_gpu_worker"
    )
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None:
                logger.info("🔴 [CrowdFiveWorker] RTSP batch-worker stopping")
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
                    "frame":        frame.copy(),
                    "device_id":    str(device_id),
                    "camera_no":    str(camera_no),
                    "ch_no":        str(camera_no), # for compatibility
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
        logger.info("🔴 [CrowdFiveWorker] GPU worker shut down")

# ══════════════════════════════════════════════════════════════════════════════
#  EXCEL LOADER
# ══════════════════════════════════════════════════════════════════════════════

def load_camera_config():
    """Load camera configs from DB tables using assignment context env vars."""
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
        logger.info(f"DB loaded: {len(rows)} camera rows (link_type={link_type})")
    except Exception as exc:
        logger.error(f"Cannot read cameras from DB: {exc}")
        return [], None

    configs = []
    for row in rows:
        url = str(row.get("cctv_url") or "").strip()
        if not url:
            continue

        scene = str(row.get("classification") or "")
        if scene and scene not in TARGET_SCENES:
            continue

        if link_type == "RTSP":
            cam_id = str(row.get("device_id") or "").strip()
            ch_no = cam_id or "0"
        else:
            ch_no = str(row.get("ch_code") or "").strip() or "0"
            cam_name = str(row.get("camera_name") or "camera").strip()
            cam_id = f"{cam_name}_{ch_no}".replace(" ", "_").replace("/", "_")

        if not cam_id:
            continue

        configs.append({
            "initial_url": url,
            "camera_id":   cam_id,
            "ch_no":       ch_no,
            "classification": scene,
        })

    logger.info(f"Total cameras to process: {len(configs)}")
    return configs, None

# ══════════════════════════════════════════════════════════════════════════════
#  GPU BATCH WORKER
# ══════════════════════════════════════════════════════════════════════════════

def gpu_worker(stop_event: threading.Event):
    """
    Single GPU worker thread.
    Fills batches from gpu_queue, runs detection, saves crowd frames.
    """
    logger.info("GPU batch worker started")
    get_yolo_model()    # warm up YOLO once
    logger.info("YOLO model ready")

    while not stop_event.is_set():

        # Step 1 — wait for first frame
        batch = []
        try:
            batch.append(gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        # Step 2 — fill batch within time window
        deadline = time.time() + GPU_FILL_WINDOW
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        logger.debug(f"[GPU] Batch: {len(batch)} frames")

        # Step 3 — detect + save each item
        for item in batch:
            _detect_and_save(item)
            if 'frame' in item: del item['frame'] # Cleanup after detection

        del batch

        # Step 4 — VRAM stats
        if torch.cuda.is_available():
            logger.debug(f"[GPU] VRAM: {torch.cuda.memory_allocated()/1e9:.2f} GB")

    logger.info("GPU worker stopped.")


def _ensure_shared_hls_gpu_worker():
    global _HLS_GPU_WORKER
    with _HLS_GPU_LOCK:
        if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
            _HLS_GPU_WORKER = threading.Thread(
                target=gpu_worker,
                args=(_STOP_EVENT,),
                daemon=True,
                name="crowd_five_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()
            logger.info("[CrowdFiveWorker] Shared GPU worker started")


def _detect_and_save(item: dict):
    """
    Run crowd_det_less_than_5 on one frame.
    Filename format: lessthan5_ch{ch_no}_{timestamp}.jpg
    """
    frame     = item["frame"]
    camera_id = item["camera_id"]
    ch_no     = item["ch_no"]
    state     = item["state"]   # {"last_save": float}

    # ── Detection ─────────────────────────────────────────────────────────
    try:
        model = get_yolo_model()
        result = model(frame, conf=CONFIDENCE, verbose=False)[0]
        person_boxes = [b for b in result.boxes if int(b.cls[0]) == 0]
        person_count = len(person_boxes)
        processed_frame = frame.copy()
        for b in person_boxes:
            x1, y1, x2, y2 = map(int, b.xyxy[0])
            cv2.rectangle(processed_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
    except Exception as exc:
        logger.error(f"[{camera_id}] Detection error: {exc}")
        return

    person_counts[camera_id] = person_count
    low_count_detected = person_count < MIN_PERSONS
    logger.debug(f"[{camera_id}] persons={person_count} low={low_count_detected}")

    if not low_count_detected:
        return

    now = time.time()

    # ── Cooldown ──────────────────────────────────────────────────────────
    if now - state["last_save"] < COOLDOWN_TIME:
        logger.debug(f"[{camera_id}] Cooldown active — skip")
        return

    # ── Rate limit ────────────────────────────────────────────────────────
    should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
    if not should_save:
        logger.info(f"[{camera_id}] Rate limit {current_rate}/{RATE_LIMIT_PER_MIN}/min — skip")
        return

    # ── Save  →  lessthan5_ch{ch_no}_{timestamp}.jpg ─────────────────────
    state["last_save"] = now
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    
    # ── Source-Aware Naming Format ──────────────
    if item.get("source_type") == "HLS":
        fname = f"lessthan5_ch{ch_no}_{timestamp}.jpg"
    else:
        # RTSP: {script}_{device_id}_{camera_no}_{ts}.jpg
        dev_id = item.get("device_id") or camera_id
        fname = f"crowd_five_{dev_id}_{ch_no}_{timestamp}.jpg"
    
    filename = os.path.join(item.get("save_folder", SAVE_FOLDER), fname)

    save_frame = processed_frame if processed_frame is not None else frame
    cv2.imwrite(filename, save_frame)

    # --- Report to DB (HLS only) ---
    if item.get("source_type") == "HLS":
        try:
            report_to_db_hls(
                ch_code=str(ch_no),
                image_name=os.path.basename(filename),
                folder="crowd_detection_threshold"
            )
        except Exception as e:
            logger.error(f"[{camera_id}] DB Reporting Error: {e}")

    logger.warning(
        f"[{camera_id}] CROWD SAVED — {person_count} persons | "
        f"{os.path.basename(filename)} | rate {current_rate}/{RATE_LIMIT_PER_MIN}/min"
    )

# ══════════════════════════════════════════════════════════════════════════════
#  CAMERA THREAD
# ══════════════════════════════════════════════════════════════════════════════

def camera_thread(cfg: dict, stop_event: threading.Event):
    """One thread per camera — read HLS, motion filter, enqueue frames."""
    camera_id = cfg["camera_id"]

    initial_url = cfg.get("initial_url") or cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url") or ""
    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url or not test_hls_stream(hls_url):
        logger.error(f"[{camera_id}] HLS stream unavailable — skipping")
        return

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Cannot open stream — skipping")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    logger.info(f"[{camera_id}] Stream open @ {fps:.1f} FPS | ch_no={cfg['ch_no']}")

    per_camera_state = {"last_save": 0.0}
    motion_detector  = get_motion_detector(camera_id, motion_threshold=1000)

    frame_count = skip_motion = skip_queue = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.warning(f"[{camera_id}] Stream ended")
            break

        frame_count += 1

        # Frame sampling
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        # Motion pre-filter
        if not motion_detector.has_motion(frame):
            skip_motion += 1
            continue

        # Enqueue
        try:
            gpu_queue.put({
                "frame":       frame.copy(),
                "camera_id":   camera_id,
                "ch_no":       cfg.get("ch_no") or cfg.get("camera_no") or "0",
                "state":       per_camera_state,
                "source_type": "HLS",
                "save_folder": SAVE_FOLDER,
            }, timeout=0.1)
        except queue.Full:
            skip_queue += 1
            del frame
            if skip_queue % 100 == 1:
                logger.warning(f"[{camera_id}] Queue full — drops: {skip_queue}")
            continue

        # Periodic stats
        if frame_count % 500 == 0:
            rl = rate_limiter.get_stats()
            logger.info(
                f"[{camera_id}] frames={frame_count} | "
                f"no_motion={skip_motion} | queue_drops={skip_queue} | "
                f"rate={rl.get('current_rate','?')}/{RATE_LIMIT_PER_MIN}/min"
            )

    cap.release()
    logger.info(
        f"[{camera_id}] Done | frames={frame_count} | "
        f"no_motion={skip_motion} | queue_drops={skip_queue}"
    )


def crowd_five_det_worker_hls(camera_configs, stop_event=None):
    """HLS worker entry point for low-person (<5) detection analytics."""
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    filtered_configs = []
    for cfg in camera_configs:
        stream_url = cfg.get("initial_url") or cfg.get("url") or cfg.get("cctv_url") or cfg.get("stream_url")
        if stream_url:
            filtered_configs.append(cfg)

    if not filtered_configs:
        logger.warning("[CrowdFiveWorker][HLS] No cameras with valid URLs. Skipping.")
        return

    if persistent_mode:
        _ensure_shared_hls_gpu_worker()
    else:
        gpu_t = threading.Thread(
            target=gpu_worker,
            args=(stop_event,),
            daemon=True,
            name="crowd_five_gpu_worker",
        )
        gpu_t.start()

    threads = []
    for cfg in filtered_configs:
        if "camera_id" not in cfg:
            cam_name = str(cfg.get("camera_name") or "camera")
            ch = str(cfg.get("ch_no") or cfg.get("camera_no") or "0")
            cfg = {
                **cfg,
                "camera_id": f"{cam_name}_{ch}".replace(" ", "_"),
            }

        t = threading.Thread(
            target=camera_thread,
            args=(cfg, stop_event),
            daemon=True,
            name=f"crowd_five_{cfg.get('camera_id', 'cam')}",
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(f"[CrowdFiveWorker][HLS] Started {len(threads)} camera threads")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[CrowdFiveWorker][HLS] Camera threads completed (shared GPU worker still running)")
        return

    stop_event.set()
    logger.info("[CrowdFiveWorker][HLS] All cameras completed")

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    logger.info("=" * 65)
    logger.info("  TCS Crowd Detection  |  crowd_det_less_than_5  |  GPU Batch")
    logger.info("=" * 65)

    configs, _ = load_camera_config()
    if not configs:
        logger.error("No cameras found — exiting.")
        return

    cv2.setNumThreads(0) # Prevent thread explosion
    _ensure_shared_hls_gpu_worker()

    stop_event = _STOP_EVENT

    # One thread per camera
    # Start threads with ThreadPoolExecutor
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in configs:
            executor.submit(camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    stop_event.wait()
    stop_event.set()
    
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    logger.info("✅ All crowd_five HLS cameras completed")


if __name__ == "__main__":
    main()