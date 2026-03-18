# import time
# import os
# import logging
# from datetime import datetime
# import cv2
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/server_room_detection_results")

# COOLDOWN_TIME = 90
# MIN_PERSONS = 1
# CONF_THRESHOLD = 0.45

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [ServerRoom] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# last_save_times = {}
# person_counts = {}

# # =====================================================
# # SAME LOGIC (UNCHANGED)
# # =====================================================
# def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame,
#             f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.6,
#             (0, 0, 255),
#             2
#         )

#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     elapsed = now - last_save_times.get(key, 0)

#     server_detected = person_count >= MIN_PERSONS

#     if server_detected and elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = f"{SAVE_FOLDER}/{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#         cv2.imwrite(path, frame)
#         last_save_times[key] = now
#         logging.warning(f"[ServerRoom] 🚨 Intrusion saved: {path}")

#     person_counts[key] = person_counts.get(key, 0) + person_count
#     return server_detected, person_count

# # =====================================================
# # WORKER LOOP (NEW)
# # =====================================================
# def server_room_worker(frame_queue):
#     logging.info("🟢 Server Room Worker started")

#     while True:
#         frame = frame_queue.get()

#         if frame is None:
#             logging.info("🔴 Server Room Worker stopping")
#             break

#         # IMPORTANT: copy frame (safe)
#         frame = frame.copy()

#         detect_persons_in_frame(frame, DEVICE_ID, CAMERA_NO)
















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
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/server_room_detection_results")

# # 🔧 SAFE & STABLE SETTINGS (SERVER ROOM)
# MIN_PERSONS = 1              # server room = 1 person enough
# CONF_THRESHOLD = 0.45        # lower for distant / CCTV cams
# COOLDOWN_TIME = 90           # seconds

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [ServerRoomWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# # ================= STATE ===================
# last_save_times = {}

# # =====================================================
# # SERVER ROOM DETECTION LOGIC
# # =====================================================
# def detect_persons_in_frame(frame, device_id, camera_no):
#     """
#     Detect persons in server room.
#     Save image if >= MIN_PERSONS detected and cooldown passed.
#     """

#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_boxes = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_boxes)
#     max_conf = float(max([box.conf[0] for box in person_boxes], default=0))

#     # 🔍 DEBUG (helps during tuning)
#     logging.debug(
#         f"[SERVER DEBUG] persons={person_count}, conf_th={CONF_THRESHOLD}"
#     )

#     # draw bounding boxes
#     for box in person_boxes:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame,
#             f"Person {conf:.2f}",
#             (x1, y1 - 6),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.6,
#             (0, 0, 255),
#             2
#         )

#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     elapsed = now - last_save_times.get(key, 0)

#     server_violation = person_count >= MIN_PERSONS

#     if server_violation and elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = (
#             f"{SAVE_FOLDER}/"
#             f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )
#         cv2.imwrite(path, frame)
#         last_save_times[key] = now

#         logging.warning(
#             f"[ServerRoom] 🚨 Person detected! "
#             f"Count={person_count}, saved={path}"
#         )

#     return server_violation, person_count

# # =====================================================
# # WORKER LOOP
# # =====================================================
# def server_room_worker(frame_queue):
#     logging.info("🟢 Server Room Worker started")

#     while True:
#         frame = frame_queue.get()

#         if frame is None:
#             logging.info("🔴 Server Room Worker stopping")
#             break

#         # IMPORTANT: work on copy (shared frame safety)
#         frame = frame.copy()

#         detect_persons_in_frame(frame, DEVICE_ID, CAMERA_NO)












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
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/server_room_detection_results")

# # 🔧 SAFE & STABLE SETTINGS (SERVER ROOM)
# MIN_PERSONS = 1              # server room = 1 person enough
# CONF_THRESHOLD = 0.45        # lower for distant / CCTV cams
# COOLDOWN_TIME = 90           # seconds

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [ServerRoomWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# # ================= STATE ===================
# last_save_times = {}

# # =====================================================
# # SERVER ROOM DETECTION LOGIC
# # =====================================================
# def detect_persons_in_frame(frame, device_id, camera_no):
#     """
#     Detect persons in server room.
#     Save image if >= MIN_PERSONS detected and cooldown passed.
#     """

#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_boxes = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_boxes)
#     max_conf = float(max([box.conf[0] for box in person_boxes], default=0))

#     # 🔍 DEBUG (helps during tuning)
#     logging.debug(
#         f"[SERVER DEBUG] persons={person_count}, conf_th={CONF_THRESHOLD}"
#     )

#     # draw bounding boxes
#     for box in person_boxes:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame,
#             f"Person {conf:.2f}",
#             (x1, y1 - 6),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.6,
#             (0, 0, 255),
#             2
#         )

#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     elapsed = now - last_save_times.get(key, 0)

#     server_violation = person_count >= MIN_PERSONS

#     if server_violation and elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = (
#             f"{SAVE_FOLDER}/"
#             f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )
#         cv2.imwrite(path, frame)
#         last_save_times[key] = now

#         logging.warning(
#             f"[ServerRoom] 🚨 Person detected! "
#             f"Count={person_count}, saved={path}"
#         )

#     return server_violation, person_count

# # =====================================================
# # WORKER LOOP
# # =====================================================
# def server_room_worker(frame_queue):
#     logging.info("🟢 Server Room Worker started")

#     while True:
#         frame = frame_queue.get()

#         if frame is None:
#             logging.info("🔴 Server Room Worker stopping")
#             break

#         # IMPORTANT: work on copy (shared frame safety)
#         frame = frame.copy()

#         detect_persons_in_frame(frame, DEVICE_ID, CAMERA_NO)









#working before hls 
#server_room_worker.py
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
# SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/server_room_detection_results")

# # 🔧 SAFE & STABLE SETTINGS (SERVER ROOM)
# MIN_PERSONS      = 1     # server room = 1 person enough
# CONF_THRESHOLD   = 0.45  # lower for distant / CCTV cams
# COOLDOWN_TIME    = 90    # seconds

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("🔄 [ServerRoomWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# # ================= STATE ===================
# last_save_times = {}


# # =====================================================
# # SERVER ROOM DETECTION LOGIC
# # =====================================================
# def detect_persons_in_frame(frame, device_id, camera_no):
#     """
#     Detect persons in server room.
#     Save image if >= MIN_PERSONS detected and cooldown passed.
#     """
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_boxes = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_boxes)
#     max_conf = float(max([box.conf[0] for box in person_boxes], default=0))

#     # 🔍 DEBUG (helps during tuning)
#     logging.debug(
#         f"[SERVER DEBUG] cam={device_id}_{camera_no} "
#         f"persons={person_count}, conf_th={CONF_THRESHOLD}"
#     )

#     # Draw bounding boxes
#     for box in person_boxes:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame,
#             f"Person {conf:.2f}",
#             (x1, y1 - 6),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.6,
#             (0, 0, 255),
#             2
#         )

#     key     = f"{device_id}_{camera_no}"
#     now     = time.time()
#     elapsed = now - last_save_times.get(key, 0)

#     server_violation = person_count >= MIN_PERSONS

#     if server_violation and elapsed >= COOLDOWN_TIME:
#         ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#         path = (
#             f"{SAVE_FOLDER}/"
#             f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
#         )
#         cv2.imwrite(path, frame)
#         last_save_times[key] = now
#         logging.warning(
#             f"[ServerRoom] 🚨 Person detected! "
#             f"cam={key} count={person_count} saved={path}"
#         )

#     return server_violation, person_count


# # =====================================================
# # WORKER LOOP
# # =====================================================
# def server_room_worker(frame_queue):
#     logging.info("🟢 Server Room Worker started")

#     while True:
#         packet = frame_queue.get()

#         if packet is None:
#             logging.info("🔴 Server Room Worker stopping")
#             break

#         # ✅ Unpack tuple sent by rtsp_producer
#         frame, device_id, camera_no = packet

#         # Work on a copy for shared memory safety
#         frame = frame.copy()

#         detect_persons_in_frame(frame, device_id, camera_no)
























#test
# workers/server_room_worker.py
"""
Server Room Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - Server_room_det.py      (RTSP / DSS flow)
  - server_room_det_tcs.py  (HLS / TCS flow)
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

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/server_room_detection_results")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/server_room_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

MIN_PERSONS    = 1      # server room = 1 person enough
CONF_THRESHOLD = 0.45
COOLDOWN_TIME  = 90     # seconds between saves per camera

HLS_SAMPLE_EVERY = 5
HLS_FAIL_LIMIT   = 3

# ================= SHARED STATE ============
last_save_times = {}
person_counts   = {}
_state_lock     = threading.Lock()

# ================= YOLO ====================
print("🔄 [ServerRoomWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [ServerRoomWorker] YOLO model loaded")


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_persons_in_frame(frame, device_id: str, camera_no: str, save_folder: str):
    """
    Detect persons in server room frame.
    Save if >= MIN_PERSONS detected and cooldown passed.

    Returns:
        (server_violation: bool, person_count: int)
    """
    results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_boxes = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD
    ]

    person_count = len(person_boxes)
    max_conf     = float(max((box.conf[0] for box in person_boxes), default=0))

    logger.debug(
        f"[ServerRoom DEBUG] cam={device_id}_{camera_no} "
        f"persons={person_count} conf_th={CONF_THRESHOLD}"
    )

    # ── Draw bounding boxes ──────────────────────────────
    for box in person_boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame, f"Person {conf:.2f}",
            (x1, y1 - 6),
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
        elapsed           = now - last_save_times.get(key, 0)
        server_violation  = person_count >= MIN_PERSONS

        if server_violation and elapsed >= COOLDOWN_TIME:
            ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = os.path.join(
                save_folder,
                f"{key}_{ts}_persons{person_count}_conf{max_conf:.2f}.jpg"
            )
            cv2.imwrite(path, frame)
            last_save_times[key] = now
            logger.warning(
                f"[ServerRoom] 🚨 Person detected! "
                f"cam={key} count={person_count} "
                f"💾 Saved → {path}"
            )
        elif server_violation:
            remaining = int(COOLDOWN_TIME - elapsed)
            logger.debug(
                f"[ServerRoom] ⏳ Detected but cooldown active "
                f"({remaining}s left) → {key}"
            )

        person_counts[key] = person_counts.get(key, 0) + person_count

    return server_violation, person_count


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def server_room_worker(frame_queue):
    """
    Queue-based worker — receives (frame, device_id, camera_no)
    packets from the RTSP producer.
    """
    logger.info("🟢 Server Room Worker started")

    while True:
        packet = frame_queue.get()
        if packet is None:
            logger.info("🔴 Server Room Worker stopping")
            break

        frame, device_id, camera_no = packet
        detect_persons_in_frame(
            frame.copy(),
            str(device_id),
            str(camera_no),
            save_folder=RTSP_SAVE_FOLDER
        )


# =====================================================
# 📡  HLS PATH  — standalone, reads its own stream
# =====================================================
def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
    """Open HLS stream and run server room detection until stopped."""
    from tcs_hls_utils import open_hls_stream

    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[ServerRoom][HLS] ❌ Could not open stream for {camera_id}")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0

    logger.info(f"[ServerRoom][HLS] 🔒 Monitoring started for {camera_id} @ {fps:.1f} FPS")

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
                logger.warning(f"[ServerRoom][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
                if fail_count >= HLS_FAIL_LIMIT:
                    logger.error(f"[ServerRoom][HLS] ❌ Max failures → {camera_id}")
                    break
                time.sleep(3)
                continue

            fail_count   = 0
            frame_count += 1

            if frame_count % HLS_SAMPLE_EVERY == 0:
                detected, person_count = detect_persons_in_frame(
                    frame.copy(),
                    device_id=label,
                    camera_no="",
                    save_folder=HLS_SAVE_FOLDER
                )

                if (frame_count // HLS_SAMPLE_EVERY) % 100 == 0:
                    if detected:
                        logger.critical(
                            f"[ServerRoom][HLS] 🚨 SECURITY ALERT: {person_count} person(s) → {camera_id}"
                        )
                    else:
                        logger.info(
                            f"[ServerRoom][HLS] ✓ Secure → {camera_id}"
                        )

            if max_frames and frame_count >= max_frames:
                break

    except KeyboardInterrupt:
        _STOP_EVENT.set()
        logger.info(f"[ServerRoom][HLS] Interrupted → {camera_id}")
    except Exception as e:
        logger.error(f"[ServerRoom][HLS] Error → {camera_id}: {e}")
    finally:
        cap.release()
        elapsed    = time.time() - start_time
        actual_fps = frame_count / elapsed if elapsed > 0 else 0
        logger.info(
            f"[ServerRoom][HLS] 🔴 Stopped → {camera_id} | "
            f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
        )

    return True


def server_room_worker_hls(camera_config: dict, max_frames=None):
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
        logger.error(f"[ServerRoom][HLS] ❌ Could not resolve URL for {camera_id}")
        return

    if not test_hls_stream(hls_url):
        logger.error(f"[ServerRoom][HLS] ❌ Stream test failed for {camera_id}")
        return

    logger.info(f"[ServerRoom][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
    _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)