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
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_results")

# MIN_PERSONS = 12
# CONF_THRESHOLD = 0.45
# COOLDOWN_TIME = 240  # seconds

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [CrowdWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# last_save_times = {}

# # =====================================================
# # SAME LOGIC (slightly adapted, frame in → result out)
# # =====================================================
# def detect_crowd(frame, device_id, camera_no):
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

#     crowd_detected = person_count >= MIN_PERSONS

#     if crowd_detected and elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = (
#             f"{SAVE_FOLDER}/{key}_{ts}"
#             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )
#         cv2.imwrite(path, frame)
#         last_save_times[key] = now
#         logging.warning(
#             f"[CrowdWorker] 👥 Crowd detected! Count={person_count}, saved={path}"
#         )

#     return crowd_detected, person_count

# # =====================================================
# # WORKER LOOP
# # =====================================================
# def crowd_worker(frame_queue):
#     logging.info("🟢 Crowd Worker started")

#     while True:
#         frame = frame_queue.get()

#         if frame is None:
#             logging.info("🔴 Crowd Worker stopping")
#             break

#         # IMPORTANT: work on a copy
#         frame = frame.copy()

#         detect_crowd(frame, DEVICE_ID, CAMERA_NO)






















#latest working version

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
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_results")

# MIN_PERSONS = 12
# CONF_THRESHOLD = 0.45
# COOLDOWN_TIME = 240

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # global cache per process
# yolo_model = None
# last_save_times = {}

# # =====================================================
# # YOLO LOADER (lazy load for multiprocessing safety)
# # =====================================================
# def get_model():
#     global yolo_model
#     if yolo_model is None:
#         print("🔄 [CrowdWorker] Loading YOLO model...")
#         yolo_model = YOLO(MODEL_PATH)
#     return yolo_model


# # =====================================================
# # DETECTION LOGIC
# # =====================================================
# def detect_crowd(frame, device_id, camera_no):
#     model = get_model()

#     results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

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

#     crowd_detected = person_count >= MIN_PERSONS

#     if crowd_detected and elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = (
#             f"{SAVE_FOLDER}/{key}_{ts}"
#             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )

#         cv2.imwrite(path, frame)
#         last_save_times[key] = now

#         logging.warning(
#             f"[CrowdWorker] 👥 Crowd detected! "
#             f"{device_id}-{camera_no} Count={person_count}"
#         )

#     return crowd_detected, person_count


# # =====================================================
# # WORKER LOOP (RTSP READY)
# # =====================================================
# def crowd_worker(frame_queue):
#     logging.info("🟢 Crowd Worker started")

#     # 🔥 dynamic camera naming from queue metadata (future-safe)
#     device_id = "CAM"
#     camera_no = "01"

#     while True:
#         frame = frame_queue.get()

#         if frame is None:
#             logging.info("🔴 Crowd Worker stopping")
#             break

#         # work on copy
#         frame = frame.copy()

#         detect_crowd(frame, device_id, camera_no)
















#working before hls
#crowd_worker.py
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
# MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/crowd_detection_results")

# MIN_PERSONS    = 12
# CONF_THRESHOLD = 0.45
# COOLDOWN_TIME  = 240

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # Global cache per process
# yolo_model     = None
# last_save_times = {}


# # =====================================================
# # YOLO LOADER (lazy load for multiprocessing safety)
# # =====================================================
# def get_model():
#     global yolo_model
#     if yolo_model is None:
#         print("🔄 [CrowdWorker] Loading YOLO model...")
#         yolo_model = YOLO(MODEL_PATH)
#     return yolo_model


# # =====================================================
# # DETECTION LOGIC
# # =====================================================
# def detect_crowd(frame, device_id, camera_no):
#     model   = get_model()
#     results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf     = float(max([box.conf[0] for box in person_detections], default=0))

#     # Draw boxes
#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)

#     key     = f"{device_id}_{camera_no}"
#     now     = time.time()
#     elapsed = now - last_save_times.get(key, 0)

#     crowd_detected = person_count >= MIN_PERSONS

#     if crowd_detected and elapsed >= COOLDOWN_TIME:
#         ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = (
#             f"{SAVE_FOLDER}/{key}_{ts}"
#             f"_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )
#         cv2.imwrite(path, frame)
#         last_save_times[key] = now
#         logging.warning(
#             f"[CrowdWorker] 👥 Crowd detected! "
#             f"{device_id}-{camera_no} Count={person_count}"
#         )

#     return crowd_detected, person_count


# # =====================================================
# # WORKER LOOP
# # =====================================================
# def crowd_worker(frame_queue):
#     logging.info("🟢 Crowd Worker started")

#     while True:
#         packet = frame_queue.get()

#         if packet is None:
#             logging.info("🔴 Crowd Worker stopping")
#             break

#         # ✅ Unpack tuple sent by rtsp_producer
#         frame, device_id, camera_no = packet

#         # Work on a copy for shared memory safety
#         frame = frame.copy()

#         detect_crowd(frame, device_id, camera_no)
























#twst
# workers/crowd_worker.py
"""
Crowd Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - Crowd_det_complete.py  (RTSP / DSS flow)
  - crowd_det_tcs.py       (HLS / TCS flow)
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

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_results")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/crowd_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

MIN_PERSONS    = 5
CONF_THRESHOLD = 0.45
COOLDOWN_TIME  = 240    # seconds between saves per camera

HLS_SAMPLE_EVERY = 10   # process every Nth frame
HLS_FAIL_LIMIT   = 3

# ================= SHARED STATE ============
last_save_times = {}
person_counts   = {}
_state_lock     = threading.Lock()

# ================= YOLO (lazy load) ========
yolo_model = None

def get_model():
    global yolo_model
    if yolo_model is None:
        print("🔄 [CrowdWorker] Loading YOLO model...")
        yolo_model = YOLO(MODEL_PATH)
        logger.info("✅ [CrowdWorker] YOLO model loaded")
    return yolo_model


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_crowd(frame, device_id: str, camera_no: str, save_folder: str):
    """
    Run YOLO, detect crowd, save if threshold met and cooldown passed.

    Returns:
        (crowd_detected: bool, person_count: int)
    """
    model   = get_model()
    results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_detections = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
    ]

    person_count = len(person_detections)
    max_conf     = float(max((box.conf[0] for box in person_detections), default=0))

    # ── Draw bounding boxes ──────────────────────────────
    for box in person_detections:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame, f"Person {conf:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2
        )

    # ── Overlay info ─────────────────────────────────────
    cv2.putText(frame, f"Persons: {person_count}",
                (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # ── Save logic ───────────────────────────────────────
    key = f"{device_id}_{camera_no}"
    now = time.time()

    with _state_lock:
        elapsed        = now - last_save_times.get(key, 0)
        crowd_detected = person_count >= MIN_PERSONS

        if crowd_detected and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = os.path.join(
                save_folder,
                f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
            )
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.warning(
                f"[CrowdWorker] 👥 Crowd detected! "
                f"Device={device_id} Cam={camera_no} "
                f"Count={person_count} "
                f"💾 Saved → {path}"
            )
        elif crowd_detected:
            remaining = int(COOLDOWN_TIME - elapsed)
            logger.debug(
                f"[CrowdWorker] ⏳ Crowd detected but cooldown active "
                f"({remaining}s left) → {key}"
            )

        person_counts[key] = person_counts.get(key, 0) + person_count

    return crowd_detected, person_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def crowd_worker(frame_queue):
    """
    Queue-based worker — receives (frame, device_id, camera_no)
    packets from the RTSP producer.
    """
    logger.info("🟢 Crowd Worker started")

    while True:
        packet = frame_queue.get()
        if packet is None:
            logger.info("🔴 Crowd Worker stopping")
            break

        frame, device_id, camera_no = packet
        detect_crowd(
            frame.copy(),
            str(device_id),
            str(camera_no),
            save_folder=RTSP_SAVE_FOLDER
        )


# =====================================================
# 📡  HLS PATH  — standalone, reads its own stream
# =====================================================
def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
    """Open HLS stream and run crowd detection until stopped."""
    from tcs_hls_utils import open_hls_stream

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[CrowdWorker][HLS] ❌ Could not open stream for {camera_id}")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0

    logger.info(f"[CrowdWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

    frame_count = 0
    fail_count  = 0
    start_time  = time.time()
    label       = camera_name if camera_name else camera_id

    try:
        while not _STOP_EVENT.is_set():
            # Non-blocking read with 5s timeout
            read_result = [None, None]
            def _read():
                read_result[0], read_result[1] = cap.read()
            t = threading.Thread(target=_read, daemon=True)
            t.start()
            t.join(timeout=5)

            if _STOP_EVENT.is_set():
                break

            ret, frame = read_result
            if not ret or frame is None:
                fail_count += 1
                logger.warning(f"[CrowdWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
                if fail_count >= HLS_FAIL_LIMIT:
                    logger.error(f"[CrowdWorker][HLS] ❌ Max failures → {camera_id}")
                    break
                time.sleep(3)
                continue

            fail_count   = 0
            frame_count += 1

            if frame_count % HLS_SAMPLE_EVERY == 0:
                crowd_detected, person_count = detect_crowd(
                    frame.copy(),
                    device_id=label,
                    camera_no="",
                    save_folder=HLS_SAVE_FOLDER
                )

                if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
                    if crowd_detected:
                        logger.warning(
                            f"[CrowdWorker][HLS] 🚨 Crowd: {person_count} persons → {camera_id}"
                        )
                    else:
                        logger.info(
                            f"[CrowdWorker][HLS] ✅ Monitoring OK → {camera_id}"
                        )

            if max_frames and frame_count >= max_frames:
                break

    except KeyboardInterrupt:
        _STOP_EVENT.set()
        logger.info(f"[CrowdWorker][HLS] Interrupted → {camera_id}")
    except Exception as e:
        logger.error(f"[CrowdWorker][HLS] Error → {camera_id}: {e}")
    finally:
        cap.release()
        elapsed    = time.time() - start_time
        actual_fps = frame_count / elapsed if elapsed > 0 else 0
        logger.info(
            f"[CrowdWorker][HLS] 🔴 Stopped → {camera_id} | "
            f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
        )

    return True


def crowd_worker_hls(camera_config: dict, max_frames=None):
    """
    HLS worker entry point — used by master_pipeline for HLS cameras.

    camera_config = {
        'camera_id':   str,
        'stream_url':  str,
        'camera_name': str,
    }
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

    camera_id   = camera_config.get("camera_id", "unknown")
    initial_url = camera_config.get("stream_url", "")
    camera_name = camera_config.get("camera_name", "")

    hls_url = extract_hls_streaming_url(initial_url)
    if not hls_url:
        logger.error(f"[CrowdWorker][HLS] ❌ Could not resolve URL for {camera_id}")
        return

    if not test_hls_stream(hls_url):
        logger.error(f"[CrowdWorker][HLS] ❌ Stream test failed for {camera_id}")
        return

    logger.info(f"[CrowdWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
    _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)