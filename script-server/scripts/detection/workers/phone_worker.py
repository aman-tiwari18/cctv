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
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection_results")

# # CONF_THRESHOLD = 0.25
# # COOLDOWN_TIME = 480  # seconds

# # DEVICE_ID = "DAV_NVR"
# # CAMERA_NO = "CH19"

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("🔄 [PhoneWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_time = 0

# # # =====================================================
# # # PHONE DETECTION LOGIC (SAME CORE)
# # # =====================================================
# # def detect_phone(frame):
# #     global last_save_time

# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     phone_boxes = []

# #     for box in results.boxes:
# #         cls_id = int(box.cls[0])
# #         if results.names.get(cls_id, "") == "cell phone":
# #             phone_boxes.append(box)

# #     # draw boxes
# #     for box in phone_boxes:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(
# #             frame,
# #             f"Phone {conf:.2f}",
# #             (x1, y1 - 8),
# #             cv2.FONT_HERSHEY_SIMPLEX,
# #             0.6,
# #             (0, 0, 255),
# #             2
# #         )

# #     now = time.time()

# #     if phone_boxes and (now - last_save_time) >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         path = f"{SAVE_FOLDER}/{DEVICE_ID}_{CAMERA_NO}_{ts}_phones{len(phone_boxes)}.jpg"
# #         cv2.imwrite(path, frame)
# #         last_save_time = now
# #         logging.warning(
# #             f"[PhoneWorker] 📱 Phone detected! Count={len(phone_boxes)}, saved={path}"
# #         )

# #     return len(phone_boxes)

# # # =====================================================
# # # WORKER LOOP
# # # =====================================================
# # def phone_worker(frame_queue):
# #     logging.info("🟢 Phone Worker started")

# #     while True:
# #         frame = frame_queue.get()

# #         if frame is None:
# #             logging.info("🔴 Phone Worker stopping")
# #             break

# #         # IMPORTANT: work on a copy
# #         frame = frame.copy()

# #         detect_phone(frame)































# #working before hls
# # #phone_worker.py
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
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection_results")

# # CONF_THRESHOLD = 0.25
# # COOLDOWN_TIME = 480  # seconds

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("🔄 [PhoneWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_times = {}

# # # =====================================================
# # # PHONE DETECTION
# # # =====================================================
# # def detect_phone(frame, device_id, camera_no):
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     phone_boxes = []

# #     for box in results.boxes:
# #         cls_id = int(box.cls[0])
# #         if results.names.get(cls_id, "") == "cell phone":
# #             phone_boxes.append(box)

# #     # draw boxes
# #     for box in phone_boxes:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])

# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(
# #             frame,
# #             f"Phone {conf:.2f}",
# #             (x1, y1 - 8),
# #             cv2.FONT_HERSHEY_SIMPLEX,
# #             0.6,
# #             (0, 0, 255),
# #             2
# #         )

# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     elapsed = now - last_save_times.get(key, 0)

# #     if phone_boxes and elapsed >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# #         path = (
# #             f"{SAVE_FOLDER}/{key}_{ts}"
# #             f"_phones{len(phone_boxes)}.jpg"
# #         )

# #         cv2.imwrite(path, frame)
# #         last_save_times[key] = now

# #         logging.warning(
# #             f"[PhoneWorker] 📱 Phone detected! "
# #             f"Device={device_id}, Cam={camera_no}, Count={len(phone_boxes)}"
# #         )

# #     return len(phone_boxes)

# # # =====================================================
# # # WORKER LOOP (UPDATED)
# # # =====================================================
# # def phone_worker(frame_queue):
# #     logging.info("🟢 Phone Worker started")

# #     while True:
# #         data = frame_queue.get()

# #         if data is None:
# #             logging.info("🔴 Phone Worker stopping")
# #             break

# #         # 🔥 unpack metadata
# #         frame, device_id, camera_no = data

# #         frame = frame.copy()

# #         detect_phone(frame, device_id, camera_no)































# #test
# # workers/phone_worker.py
# """
# Phone Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - phone_det_complete.py  (RTSP / DSS flow)
#   - phone_det_tcs.py       (HLS / TCS flow)
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

# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/phone_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# CONF_THRESHOLD = 0.25
# COOLDOWN_TIME  = 480    # seconds between saves per camera

# HLS_SAMPLE_EVERY = 15   # process every Nth frame
# HLS_FAIL_LIMIT   = 3

# # ================= SHARED STATE ============
# last_save_times = {}
# phone_counts    = {}
# _state_lock     = threading.Lock()

# # ================= YOLO ====================
# print("🔄 [PhoneWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [PhoneWorker] YOLO model loaded")


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_phone(frame, device_id: str, camera_no: str, save_folder: str):
#     """
#     Run YOLO, detect cell phones, save if found and cooldown passed.

#     Returns:
#         phone_count (int)
#     """
#     results   = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
#     names     = results.names

#     phone_boxes = [
#         box for box in results.boxes
#         if names.get(int(box.cls[0]), "") == "cell phone"
#     ]

#     phone_count = len(phone_boxes)

#     # ── Draw bounding boxes ──────────────────────────────
#     for box in phone_boxes:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame, f"Phone {conf:.2f}",
#             (x1, y1 - 8),
#             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
#         )

#     # ── Overlay info ─────────────────────────────────────
#     cv2.putText(frame, f"Phones: {phone_count}",
#                 (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
#                 (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # ── Save logic ───────────────────────────────────────
#     key = f"{device_id}_{camera_no}"
#     now = time.time()

#     with _state_lock:
#         elapsed = now - last_save_times.get(key, 0)

#         if phone_boxes and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = os.path.join(
#                 save_folder,
#                 f"{key}_{ts}_phones{phone_count}.jpg"
#             )
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(
#                 f"[PhoneWorker] 📱 Phone detected! "
#                 f"Device={device_id} Cam={camera_no} "
#                 f"Count={phone_count} "
#                 f"💾 Saved → {path}"
#             )
#         elif phone_boxes:
#             remaining = int(COOLDOWN_TIME - elapsed)
#             logger.debug(
#                 f"[PhoneWorker] ⏳ Phone detected but cooldown active "
#                 f"({remaining}s left) → {key}"
#             )

#         phone_counts[key] = phone_counts.get(key, 0) + phone_count

#     return phone_count


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def phone_worker(frame_queue):
#     """
#     Queue-based worker — receives (frame, device_id, camera_no)
#     packets from the RTSP producer.
#     """
#     logger.info("🟢 Phone Worker started")

#     while True:
#         data = frame_queue.get()
#         if data is None:
#             logger.info("🔴 Phone Worker stopping")
#             break

#         frame, device_id, camera_no = data
#         detect_phone(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             save_folder=RTSP_SAVE_FOLDER
#         )


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
# def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
#     """Open HLS stream and run phone detection until stopped."""
#     from tcs_hls_utils import open_hls_stream

#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[PhoneWorker][HLS] ❌ Could not open stream for {camera_id}")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[PhoneWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

#     frame_count = 0
#     fail_count  = 0
#     start_time  = time.time()
#     label       = camera_name if camera_name else camera_id

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
#                 logger.warning(f"[PhoneWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
#                 if fail_count >= HLS_FAIL_LIMIT:
#                     logger.error(f"[PhoneWorker][HLS] ❌ Max failures → {camera_id}")
#                     break
#                 time.sleep(3)
#                 continue

#             fail_count   = 0
#             frame_count += 1

#             if frame_count % HLS_SAMPLE_EVERY == 0:
#                 phone_count = detect_phone(
#                     frame.copy(),
#                     device_id=label,
#                     camera_no="",
#                     save_folder=HLS_SAVE_FOLDER
#                 )

#                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
#                     if phone_count:
#                         logger.warning(
#                             f"[PhoneWorker][HLS] 📱 Phone detected: {phone_count} → {camera_id}"
#                         )
#                     else:
#                         logger.info(
#                             f"[PhoneWorker][HLS] ✅ Monitoring OK → {camera_id}"
#                         )

#             if max_frames and frame_count >= max_frames:
#                 break

#     except KeyboardInterrupt:
#         _STOP_EVENT.set()
#         logger.info(f"[PhoneWorker][HLS] Interrupted → {camera_id}")
#     except Exception as e:
#         logger.error(f"[PhoneWorker][HLS] Error → {camera_id}: {e}")
#     finally:
#         cap.release()
#         elapsed    = time.time() - start_time
#         actual_fps = frame_count / elapsed if elapsed > 0 else 0
#         logger.info(
#             f"[PhoneWorker][HLS] 🔴 Stopped → {camera_id} | "
#             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
#         )

#     return True


# def phone_worker_hls(camera_config: dict, max_frames=None):
#     """
#     HLS worker entry point — used by master_pipeline for HLS cameras.

#     camera_config = {
#         'camera_id':   str,
#         'stream_url':  str,
#         'camera_name': str,
#     }
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

#     camera_id   = camera_config.get("camera_id", "unknown")
#     initial_url = camera_config.get("stream_url", "")
#     camera_name = camera_config.get("camera_name", "")

#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url:
#         logger.error(f"[PhoneWorker][HLS] ❌ Could not resolve URL for {camera_id}")
#         return

#     if not test_hls_stream(hls_url):
#         logger.error(f"[PhoneWorker][HLS] ❌ Stream test failed for {camera_id}")
#         return

#     logger.info(f"[PhoneWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
#     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)




#added by samarth 

# workers/phone_worker.py
"""
Phone Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - phone_det_complete.py  (RTSP / DSS flow)
  - phone_det_tcs.py       (HLS / TCS flow)
"""

import time
import os
import logging
import threading
import signal
from datetime import datetime

import cv2
from ultralytics import YOLO

# ================= GRACEFUL STOP FLAG =================
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

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

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection_results")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/phone_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

CONF_THRESHOLD = 0.25
COOLDOWN_TIME  = 480    # seconds between saves per camera

HLS_SAMPLE_EVERY = 15   # process every Nth frame
HLS_FAIL_LIMIT   = 3

# ================= SHARED STATE ============
last_save_times = {}
phone_counts    = {}
_state_lock     = threading.Lock()

# ================= YOLO ====================
print("🔄 [PhoneWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [PhoneWorker] YOLO model loaded")


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_phone(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "phone"):
    """
    Run YOLO, detect cell phones, save if found and cooldown passed.

    Returns:
        phone_count (int)
    """
    results   = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
    names     = results.names

    phone_boxes = [
        box for box in results.boxes
        if names.get(int(box.cls[0]), "") == "cell phone"
    ]

    phone_count = len(phone_boxes)

    # ── Draw bounding boxes ──────────────────────────────
    for box in phone_boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame, f"Phone {conf:.2f}",
            (x1, y1 - 8),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
        )

    # ── Overlay info ─────────────────────────────────────
    cv2.putText(frame, f"Phones: {phone_count}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # ── Save logic ───────────────────────────────────────
    key = f"{device_id}_{camera_no}"
    now = time.time()

    with _state_lock:
        elapsed = now - last_save_times.get(key, 0)

        if phone_boxes and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            # New naming: {script_name}_{camera_id}_{timestamp}.jpg
            path = os.path.join(
                save_folder,
                f"{script_name}_{camera_no}_{ts}.jpg" if camera_no
                else f"{script_name}_{device_id}_{ts}.jpg"
            )
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.warning(
                f"[PhoneWorker] 📱 Phone detected! "
                f"Device={device_id} Cam={camera_no} "
                f"Count={phone_count} "
                f"💾 Saved → {path}"
            )
        elif phone_boxes:
            remaining = int(COOLDOWN_TIME - elapsed)
            logger.debug(
                f"[PhoneWorker] ⏳ Phone detected but cooldown active "
                f"({remaining}s left) → {key}"
            )

        phone_counts[key] = phone_counts.get(key, 0) + phone_count

    return phone_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def phone_worker(frame_queue):
    """
    Queue-based worker — receives (frame, device_id, camera_no)
    packets from the RTSP producer.
    """
    logger.info("🟢 Phone Worker started")

    while True:
        data = frame_queue.get()
        if data is None:
            logger.info("🔴 Phone Worker stopping")
            break

        # Unpack: (frame, device_id, camera_no) or (frame, device_id, camera_no, script_name)
        if len(data) == 4:
            frame, device_id, camera_no, script_name = data
        else:
            frame, device_id, camera_no = data
            script_name = "phone"

        detect_phone(
            frame.copy(),
            str(device_id),
            str(camera_no),
            save_folder=RTSP_SAVE_FOLDER,
            script_name=script_name
        )


# =====================================================
# 📡  HLS PATH  — GPU Batch Queue Architecture
# =====================================================
#
# Architecture (from phone_det_tcs.py):
#   - Camera threads read HLS streams → push frames to gpu_queue
#   - Single gpu_worker thread pulls batches → runs detection
#   - Uses phone_core (phone_det_complete.py) for actual detection
#   - tcs_scheduler for frame sampling (every 10 frames)
#   - detection_rate_limiter for save frequency control
# =====================================================

import sys
import queue

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

# ── GPU Queue Config ─────────────────────────────────
GPU_BATCH_SIZE      = 112    # true batch size — all frames in one GPU pass
GPU_QUEUE_SIZE      = 1024   # large queue for 921 camera threads
BATCH_WAIT_TIMEOUT  = 0.2    # seconds to wait for batch to fill
THREAD_DELAY        = 0.05   # stagger thread starts
PHONE_SAMPLE_EVERY  = 10     # phone detection every 10 frames

_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)


def _hls_gpu_worker(stop_event, save_folder, cooldown_time=480):
    """
    GPU batch worker — TRUE batch inference.

    Fills up to GPU_BATCH_SIZE frames within BATCH_WAIT_TIMEOUT seconds,
    then calls phone_core.detect_phones_batch() once — single GPU forward pass.
    """
    import torch
    logger.info("🚀 [PhoneWorker][HLS] GPU worker started (true batch mode)")

    # Warm up model
    phone_core.get_yolo_model()

    rate_limiter = get_rate_limiter('phone', max_per_minute=25)
    # Per-camera save state: camera_id → last_save timestamp
    cam_state    = {}
    log_counter  = 0

    while not stop_event.is_set():

        # ── Step 1: Wait for first frame ──────────────────
        batch = []
        try:
            batch.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        # ── Step 2: Fill batch within deadline ────────────
        deadline = time.time() + BATCH_WAIT_TIMEOUT
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(_gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        # ── Step 3: Build inference items ─────────────────
        inference_items = [
            {
                'frame':     item['frame'],
                'camera_id': item['camera_id'],
                'ch_no':     item['ch_no'],
            }
            for item in batch
        ]

        # ── Step 4: TRUE BATCH inference ────────────────────
        try:
            batch_results = phone_core.detect_phones_batch(inference_items)
        except Exception as e:
            logger.error(f"[PhoneWorker][HLS] Batch error: {e}")
            continue

        # ── Step 5: GPU memory logging (every 50 batches) ──
        log_counter += 1
        if torch.cuda.is_available() and log_counter % 50 == 0:
            mem = torch.cuda.memory_allocated() / 1e9
            logger.info(
                f"[PhoneWorker][GPU] batch={len(batch)} | mem={mem:.2f}GB"
            )

        # ── Step 6: Handle results per frame ───────────────
        for item, (annotated_frame, detected, phone_count) in zip(batch, batch_results):
            if not detected:
                continue

            camera_id   = item['camera_id']
            ch_no       = item['ch_no']
            script_name = item.get('script_name', 'phone')

            now = time.time()
            if now - cam_state.get(camera_id, 0) < cooldown_time:
                continue

            should_save, _, _ = rate_limiter.should_save_detection(camera_id)
            if not should_save:
                continue

            cam_state[camera_id] = now
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename  = os.path.join(
                save_folder,
                f"{script_name}_ch{ch_no}_{timestamp}.jpg"
            )
            cv2.imwrite(filename, annotated_frame)
            logger.warning(
                f"[PhoneWorker][HLS] 📱 SAVED phones={phone_count} → {filename}"
            )

    logger.info("🔴 [PhoneWorker][HLS] GPU worker stopped")


def _hls_camera_thread(cfg, stop_event):
    """
    Camera reader thread — opens HLS stream, reads frames,
    pushes to gpu_queue for batch processing.
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

    camera_id   = cfg['camera_id']
    script_name = cfg.get('script_code', 'phone')
    ch_no       = cfg.get('camera_id', 'unknown')
    initial_url = cfg.get('cctv_url') or cfg.get('stream_url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        logger.error(f"[PhoneWorker][HLS] ❌ Stream failed for {camera_id}")
        return

    cap = open_hls_stream(hls)
    if cap is None:
        logger.error(f"[PhoneWorker][HLS] ❌ Could not open stream for {camera_id}")
        return

    logger.info(f"[PhoneWorker][HLS] 🟢 Camera thread started → {camera_id}")

    frame_count = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        if not frame_should_process(frame_count, PHONE_SAMPLE_EVERY):
            continue

        try:
            _gpu_queue.put_nowait({
                "frame":       frame,
                "camera_id":   camera_id,
                "ch_no":       ch_no,
                "script_name": script_name,
            })
        except queue.Full:
            continue

    cap.release()
    logger.info(f"[PhoneWorker][HLS] 🔴 Camera thread stopped → {camera_id}")


def phone_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point — GPU batch queue architecture.

    Accepts a LIST of camera configs (from camera_loader) and runs
    all cameras with a shared GPU worker thread.

    Can also accept a single dict for backward compatibility.
    """
    import torch

    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT

    # ── Scene Classification Filter ──────────────────────
    valid_configs = []
    for cfg in camera_configs:
        cls_val = str(cfg.get('classification', '')).lower()
        if 'server room' in cls_val or 'computer lab' in cls_val:
            valid_configs.append(cfg)
        else:
            logger.info(f"[PhoneWorker] 🚫 Skipping {cfg.get('camera_id', 'unknown')} (Scene: {cls_val})")
            
    if not valid_configs:
        logger.warning("[PhoneWorker][HLS] ❌ No valid cameras found after Scene Classification filter. Exiting.")
        return
        
    camera_configs = valid_configs

    phone_core.SAVE_FOLDER = HLS_SAVE_FOLDER

    gpu_t = threading.Thread(
        target=_hls_gpu_worker,
        args=(stop_event, HLS_SAVE_FOLDER),
        daemon=True
    )
    gpu_t.start()

    threads = []
    for cfg in camera_configs:
        t = threading.Thread(
            target=_hls_camera_thread,
            args=(cfg, stop_event),
            daemon=True
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(f"[PhoneWorker][HLS] Started {len(threads)} camera threads + 1 GPU worker")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("[PhoneWorker][HLS] ✅ All HLS cameras completed")