# # import time
# # import os
# # import logging
# # import math
# # from datetime import datetime
# # from collections import defaultdict, deque
# # import cv2
# # from ultralytics import YOLO

# # # ================= LOGGING =================
# # logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # # ================= CONFIG ==================
# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/close_proximity_results")

# # CONF_THRESHOLD = 0.45
# # PROXIMITY_THRESHOLD = 100   # pixels (same as original)
# # COOLDOWN_TIME = 90          # seconds

# # DEVICE_ID = "DAV_NVR"
# # CAMERA_NO = "CH19"

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("🔄 [CloseProximityWorker] Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_time = 0

# # # =====================================================
# # # HELPER FUNCTIONS (SAME LOGIC)
# # # =====================================================
# # def bottom_center(box):
# #     x1, y1, x2, y2 = box
# #     return ((x1 + x2) / 2, y2)

# # def distance(p1, p2):
# #     return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

# # # =====================================================
# # # PROXIMITY DETECTION LOGIC
# # # =====================================================
# # def detect_close_proximity(frame):
# #     global last_save_time

# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     boxes = []
# #     for box in results.boxes:
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD:
# #             x1, y1, x2, y2 = map(int, box.xyxy[0])
# #             boxes.append((x1, y1, x2, y2))

# #     violations = []

# #     for i in range(len(boxes)):
# #         for j in range(i + 1, len(boxes)):
# #             p1 = bottom_center(boxes[i])
# #             p2 = bottom_center(boxes[j])
# #             d = distance(p1, p2)
# #             if d < PROXIMITY_THRESHOLD:
# #                 violations.append((i, j))

# #     # draw boxes
# #     for idx, (x1, y1, x2, y2) in enumerate(boxes):
# #         color = (0, 0, 255) if any(idx in v for v in violations) else (0, 255, 0)
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

# #     # draw violation lines
# #     for i, j in violations:
# #         c1 = bottom_center(boxes[i])
# #         c2 = bottom_center(boxes[j])
# #         cv2.line(
# #             frame,
# #             (int(c1[0]), int(c1[1])),
# #             (int(c2[0]), int(c2[1])),
# #             (0, 0, 255),
# #             2
# #         )

# #     now = time.time()
# #     if violations and (now - last_save_time) >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         path = f"{SAVE_FOLDER}/{DEVICE_ID}_{CAMERA_NO}_{ts}_violations{len(violations)}.jpg"
# #         cv2.imwrite(path, frame)
# #         last_save_time = now
# #         logging.warning(
# #             f"[CloseProximityWorker] ⚠️ Proximity violation! Count={len(violations)}, saved={path}"
# #         )

# #     return len(violations)

# # # =====================================================
# # # WORKER LOOP
# # # =====================================================
# # def close_proximity_worker(frame_queue):
# #     logging.info("🟢 Close Proximity Worker started")

# #     while True:
# #         frame = frame_queue.get()

# #         if frame is None:
# #             logging.info("🔴 Close Proximity Worker stopping")
# #             break

# #         # IMPORTANT: work on a copy
# #         frame = frame.copy()

# #         detect_close_proximity(frame)


































# #latest working version
# # import time
# # import os
# # import logging
# # import math
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
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/close_proximity_results")

# # CONF_THRESHOLD = 0.45
# # PROXIMITY_THRESHOLD = 100
# # COOLDOWN_TIME = 90

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # lazy globals
# # yolo_model = None
# # last_save_times = {}

# # # =====================================================
# # # YOLO SAFE LOADER
# # # =====================================================
# # def get_model():
# #     global yolo_model
# #     if yolo_model is None:
# #         print("🔄 [CloseProximityWorker] Loading YOLO model...")
# #         yolo_model = YOLO(MODEL_PATH)
# #     return yolo_model


# # # =====================================================
# # # HELPER FUNCTIONS
# # # =====================================================
# # def bottom_center(box):
# #     x1, y1, x2, y2 = box
# #     return ((x1 + x2) / 2, y2)

# # def distance(p1, p2):
# #     return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)


# # # =====================================================
# # # PROXIMITY DETECTION
# # # =====================================================
# # def detect_close_proximity(frame, device_id, camera_no):
# #     global last_save_times

# #     model = get_model()
# #     results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     boxes = []
# #     for box in results.boxes:
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD:
# #             x1, y1, x2, y2 = map(int, box.xyxy[0])
# #             boxes.append((x1, y1, x2, y2))

# #     violations = []

# #     for i in range(len(boxes)):
# #         for j in range(i + 1, len(boxes)):
# #             p1 = bottom_center(boxes[i])
# #             p2 = bottom_center(boxes[j])
# #             d = distance(p1, p2)
# #             if d < PROXIMITY_THRESHOLD:
# #                 violations.append((i, j))

# #     # draw boxes
# #     for idx, (x1, y1, x2, y2) in enumerate(boxes):
# #         color = (0, 0, 255) if any(idx in v for v in violations) else (0, 255, 0)
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

# #     # draw lines
# #     for i, j in violations:
# #         c1 = bottom_center(boxes[i])
# #         c2 = bottom_center(boxes[j])
# #         cv2.line(
# #             frame,
# #             (int(c1[0]), int(c1[1])),
# #             (int(c2[0]), int(c2[1])),
# #             (0, 0, 255),
# #             2
# #         )

# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     elapsed = now - last_save_times.get(key, 0)

# #     if violations and elapsed >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         path = f"{SAVE_FOLDER}/{key}_{ts}_violations{len(violations)}.jpg"

# #         cv2.imwrite(path, frame)
# #         last_save_times[key] = now

# #         logging.warning(
# #             f"[CloseProximityWorker] ⚠️ Proximity violation! "
# #             f"{device_id}-{camera_no} Count={len(violations)}"
# #         )

# #     return len(violations)


# # # =====================================================
# # # WORKER LOOP
# # # =====================================================
# # def close_proximity_worker(frame_queue):
# #     logging.info("🟢 Close Proximity Worker started")

# #     # temporary defaults (future: master will pass)
# #     device_id = "CAM"
# #     camera_no = "01"

# #     while True:
# #         frame = frame_queue.get()

# #         if frame is None:
# #             logging.info("🔴 Close Proximity Worker stopping")
# #             break

# #         frame = frame.copy()
# #         detect_close_proximity(frame, device_id, camera_no)









# #working before hls
# #close_proximity_worker.py
# # import time
# # import os
# # import logging
# # import math
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
# # MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/close_proximity_results")

# # CONF_THRESHOLD      = 0.45
# # PROXIMITY_THRESHOLD = 100
# # COOLDOWN_TIME       = 90

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # Lazy globals
# # yolo_model      = None
# # last_save_times = {}


# # # =====================================================
# # # YOLO SAFE LOADER
# # # =====================================================
# # def get_model():
# #     global yolo_model
# #     if yolo_model is None:
# #         print("🔄 [CloseProximityWorker] Loading YOLO model...")
# #         yolo_model = YOLO(MODEL_PATH)
# #     return yolo_model


# # # =====================================================
# # # HELPER FUNCTIONS
# # # =====================================================
# # def bottom_center(box):
# #     x1, y1, x2, y2 = box
# #     return ((x1 + x2) / 2, y2)


# # def distance(p1, p2):
# #     return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)


# # # =====================================================
# # # PROXIMITY DETECTION
# # # =====================================================
# # def detect_close_proximity(frame, device_id, camera_no):
# #     global last_save_times

# #     model   = get_model()
# #     results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     boxes = []
# #     for box in results.boxes:
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD:
# #             x1, y1, x2, y2 = map(int, box.xyxy[0])
# #             boxes.append((x1, y1, x2, y2))

# #     violations = []
# #     for i in range(len(boxes)):
# #         for j in range(i + 1, len(boxes)):
# #             p1 = bottom_center(boxes[i])
# #             p2 = bottom_center(boxes[j])
# #             d  = distance(p1, p2)
# #             if d < PROXIMITY_THRESHOLD:
# #                 violations.append((i, j))

# #     # Draw boxes
# #     for idx, (x1, y1, x2, y2) in enumerate(boxes):
# #         color = (0, 0, 255) if any(idx in v for v in violations) else (0, 255, 0)
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

# #     # Draw violation lines
# #     for i, j in violations:
# #         c1 = bottom_center(boxes[i])
# #         c2 = bottom_center(boxes[j])
# #         cv2.line(
# #             frame,
# #             (int(c1[0]), int(c1[1])),
# #             (int(c2[0]), int(c2[1])),
# #             (0, 0, 255),
# #             2
# #         )

# #     key     = f"{device_id}_{camera_no}"
# #     now     = time.time()
# #     elapsed = now - last_save_times.get(key, 0)

# #     if violations and elapsed >= COOLDOWN_TIME:
# #         ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         path = f"{SAVE_FOLDER}/{key}_{ts}_violations{len(violations)}.jpg"
# #         cv2.imwrite(path, frame)
# #         last_save_times[key] = now
# #         logging.warning(
# #             f"[CloseProximityWorker] ⚠️ Proximity violation! "
# #             f"{device_id}-{camera_no} Count={len(violations)}"
# #         )

# #     return len(violations)


# # # =====================================================
# # # WORKER LOOP
# # # =====================================================
# # def close_proximity_worker(frame_queue):
# #     logging.info("🟢 Close Proximity Worker started")

# #     while True:
# #         packet = frame_queue.get()

# #         if packet is None:
# #             logging.info("🔴 Close Proximity Worker stopping")
# #             break

# #         # ✅ Unpack tuple sent by rtsp_producer
# #         frame, device_id, camera_no = packet

# #         # Work on a copy for shared memory safety
# #         frame = frame.copy()

# #         detect_close_proximity(frame, device_id, camera_no)


















# #test
# # workers/close_proximity_worker.py
# """
# Close Proximity Worker — supports both RTSP (via master_pipeline producer)
# and HLS (via its own internal OpenCV reader).

# Merged from:
#   - close_proximity.py      (RTSP / DSS flow)
#   - close_proximity_tcs.py  (HLS / TCS flow)
# """

# import time
# import os
# import logging
# import math
# import threading
# import signal
# from datetime import datetime
# from collections import defaultdict

# import cv2
# import numpy as np
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
# MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10x.pt")

# RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/close_proximity_results")
# HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/proximity_detection")

# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
# os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

# CONF_THRESHOLD      = 0.45
# PROXIMITY_THRESHOLD = 100     # pixels — bottom-center distance
# COOLDOWN_TIME       = 90      # seconds between saves per camera

# HLS_SAMPLE_EVERY = 5          # process every Nth frame
# HLS_FAIL_LIMIT   = 3          # consecutive failures before giving up

# # ================= SHARED STATE ============
# last_save_times  = {}          # key → last save epoch
# violation_counts = {}          # key → cumulative violation count
# _state_lock      = threading.Lock()

# # ================= YOLO ====================
# logger.info("🔄 [CloseProximityWorker] Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)
# logger.info("✅ [CloseProximityWorker] YOLO model loaded")


# # =====================================================
# # 📐 GEOMETRY HELPERS
# # =====================================================
# def _bottom_center(box):
#     x1, y1, x2, y2 = box
#     return ((x1 + x2) / 2, y2)

# def _dist(p1, p2):
#     return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


# # =====================================================
# # 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# # =====================================================
# def detect_close_proximity(frame, device_id: str, camera_no: str, save_folder: str):
#     """
#     Run YOLO, find proximity violations, annotate frame, save if needed.

#     Returns:
#         violation_count (int)
#     """
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     boxes = []
#     for box in results.boxes:
#         if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD:
#             x1, y1, x2, y2 = map(int, box.xyxy[0])
#             boxes.append((x1, y1, x2, y2))

#     # ── Find violations ──────────────────────────────────
#     violations = []
#     for i in range(len(boxes)):
#         for j in range(i + 1, len(boxes)):
#             p1 = _bottom_center(boxes[i])
#             p2 = _bottom_center(boxes[j])
#             if _dist(p1, p2) < PROXIMITY_THRESHOLD:
#                 violations.append((i, j))

#     # ── Annotate frame ───────────────────────────────────
#     for idx, (x1, y1, x2, y2) in enumerate(boxes):
#         color = (0, 0, 255) if any(idx in v for v in violations) else (0, 255, 0)
#         cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

#     for i, j in violations:
#         c1 = _bottom_center(boxes[i])
#         c2 = _bottom_center(boxes[j])
#         cv2.line(frame,
#                  (int(c1[0]), int(c1[1])),
#                  (int(c2[0]), int(c2[1])),
#                  (0, 0, 255), 2)
#         mid_x = int((c1[0] + c2[0]) / 2)
#         mid_y = int((c1[1] + c2[1]) / 2)
#         cv2.putText(frame, f"{_dist(c1,c2):.1f}px",
#                     (mid_x, mid_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

#     # ── Status overlay ───────────────────────────────────
#     status_color = (0, 0, 255) if violations else (0, 255, 0)
#     status_text  = "PROXIMITY VIOLATION!" if violations else "All Clear"
#     cv2.putText(frame, status_text,             (20, 35),  cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
#     cv2.putText(frame, f"Persons: {len(boxes)}", (20, 60),  cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 1)
#     cv2.putText(frame, f"Violations: {len(violations)}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 1)
#     cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 1)

#     # ── Save logic ───────────────────────────────────────
#     key = f"{device_id}_{camera_no}"
#     now = time.time()

#     with _state_lock:
#         elapsed = now - last_save_times.get(key, 0)

#         if violations and elapsed >= COOLDOWN_TIME:
#             ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
#             path = os.path.join(
#                 save_folder,
#                 f"{key}_{ts}_violations{len(violations)}.jpg"
#             )
#             cv2.imwrite(path, frame)
#             last_save_times[key] = now
#             logger.warning(
#                 f"[CloseProximityWorker] ⚠️ Proximity violation! "
#                 f"Device={device_id} Cam={camera_no} "
#                 f"Count={len(violations)} "
#                 f"💾 Saved → {path}"
#             )

#         violation_counts[key] = violation_counts.get(key, 0) + len(violations)

#     return len(violations)


# # =====================================================
# # 📡  RTSP PATH  — called by master_pipeline producer
# # =====================================================
# def close_proximity_worker(frame_queue):
#     """
#     Queue-based worker loop — receives (frame, device_id, camera_no)
#     packets from the RTSP producer.
#     """
#     logger.info("🟢 [CloseProximityWorker] RTSP worker started")

#     while True:
#         packet = frame_queue.get()
#         if packet is None:
#             logger.info("🔴 [CloseProximityWorker] RTSP worker stopping")
#             break

#         frame, device_id, camera_no = packet
#         detect_close_proximity(
#             frame.copy(),
#             str(device_id),
#             str(camera_no),
#             save_folder=RTSP_SAVE_FOLDER
#         )


# # =====================================================
# # 📡  HLS PATH  — standalone, reads its own stream
# # =====================================================
# def _run_hls_camera(camera_id: str, hls_url: str, camera_name: str = "", max_frames=None):
#     """Open HLS stream and run proximity detection until stopped."""
#     from tcs_hls_utils import open_hls_stream

#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[CloseProximityWorker][HLS] ❌ Could not open stream for {camera_id}")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[CloseProximityWorker][HLS] 🟢 Detection started for {camera_id} @ {fps:.1f} FPS")

#     frame_count = 0
#     fail_count  = 0
#     start_time  = time.time()

#     # Label used in filenames — prefer camera_name over camera_id
#     label = camera_name if camera_name else camera_id

#     try:
#         while not _STOP_EVENT.is_set():
#             # Non-blocking read with 5s timeout so _STOP_EVENT is checked regularly
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
#                 logger.warning(f"[CloseProximityWorker][HLS] ⚠️ Frame fail #{fail_count} → {camera_id}")
#                 if fail_count >= HLS_FAIL_LIMIT:
#                     logger.error(f"[CloseProximityWorker][HLS] ❌ Max failures → {camera_id}")
#                     break
#                 time.sleep(3)
#                 continue

#             fail_count   = 0
#             frame_count += 1

#             if frame_count % HLS_SAMPLE_EVERY == 0:
#                 violation_count = detect_close_proximity(
#                     frame.copy(),
#                     device_id=label,
#                     camera_no="",
#                     save_folder=HLS_SAVE_FOLDER
#                 )

#                 if (frame_count // HLS_SAMPLE_EVERY) % 90 == 0:
#                     if violation_count:
#                         logger.critical(
#                             f"[CloseProximityWorker][HLS] 🚨 {violation_count} violations → {camera_id}"
#                         )
#                     else:
#                         logger.info(
#                             f"[CloseProximityWorker][HLS] ✅ Monitoring OK → {camera_id}"
#                         )

#             if max_frames and frame_count >= max_frames:
#                 break

#     except KeyboardInterrupt:
#         _STOP_EVENT.set()
#         logger.info(f"[CloseProximityWorker][HLS] Interrupted → {camera_id}")
#     except Exception as e:
#         logger.error(f"[CloseProximityWorker][HLS] Error → {camera_id}: {e}")
#     finally:
#         cap.release()
#         elapsed    = time.time() - start_time
#         actual_fps = frame_count / elapsed if elapsed > 0 else 0
#         logger.info(
#             f"[CloseProximityWorker][HLS] 🔴 Stopped → {camera_id} | "
#             f"Frames: {frame_count} | Time: {elapsed:.1f}s | FPS: {actual_fps:.1f}"
#         )

#     return True


# def close_proximity_worker_hls(camera_config: dict, max_frames=None):
#     """
#     HLS worker entry point — used by master_pipeline for HLS cameras.

#     camera_config = {
#         'camera_id':   str,
#         'stream_url':  str,   # raw URL from Excel
#         'camera_name': str,   # e.g. "11365_ENTRY_S39"  (used in filename)
#     }
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream

#     camera_id   = camera_config.get("camera_id", "unknown")
#     initial_url = camera_config.get("stream_url", "")
#     camera_name = camera_config.get("camera_name", "")

#     hls_url = extract_hls_streaming_url(initial_url)
#     if not hls_url:
#         logger.error(f"[CloseProximityWorker][HLS] ❌ Could not resolve URL for {camera_id}")
#         return

#     if not test_hls_stream(hls_url):
#         logger.error(f"[CloseProximityWorker][HLS] ❌ Stream test failed for {camera_id}")
#         return

#     logger.info(f"[CloseProximityWorker][HLS] ▶ Starting → {camera_id} ({camera_name})  URL: {hls_url}")
#     _run_hls_camera(camera_id, hls_url, camera_name=camera_name, max_frames=max_frames)




# added by samarth
#test
# workers/close_proximity_worker.py
"""
Close Proximity Worker — supports both RTSP (via master_pipeline producer)
and HLS (via its own internal OpenCV reader).

Merged from:
  - close_proximity.py      (RTSP / DSS flow)
  - close_proximity_tcs.py  (HLS / TCS flow)
"""

import time
import os
import logging
import math
import threading
import signal
from datetime import datetime
from collections import defaultdict

import cv2
import numpy as np
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
MODEL_PATH   = os.path.join(PROJECT_ROOT, "models/yolov10x.pt")

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/close_proximity_results")
HLS_SAVE_FOLDER  = os.path.join(PROJECT_ROOT, "results/tcs_detections/proximity_detection")

os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER,  exist_ok=True)

CONF_THRESHOLD      = 0.45
PROXIMITY_THRESHOLD = 100     # pixels — bottom-center distance
COOLDOWN_TIME       = 90      # seconds between saves per camera

HLS_SAMPLE_EVERY = 5          # process every Nth frame
HLS_FAIL_LIMIT   = 3          # consecutive failures before giving up

# ================= SHARED STATE ============
last_save_times  = {}          # key → last save epoch
violation_counts = {}          # key → cumulative violation count
_state_lock      = threading.Lock()

# ================= YOLO ====================
logger.info("🔄 [CloseProximityWorker] Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)
logger.info("✅ [CloseProximityWorker] YOLO model loaded")


# =====================================================
# 📐 GEOMETRY HELPERS
# =====================================================
def _bottom_center(box):
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2, y2)

def _dist(p1, p2):
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


# =====================================================
# 🔍 CORE DETECTION  (shared by RTSP + HLS paths)
# =====================================================
def detect_close_proximity(frame, device_id: str, camera_no: str, save_folder: str, script_name: str = "proximity"):
    """
    Run YOLO, find proximity violations, annotate frame, save if needed.

    Returns:
        violation_count (int)
    """
    results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    boxes = []
    for box in results.boxes:
        if int(box.cls[0]) == 0 and float(box.conf[0]) >= CONF_THRESHOLD:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            boxes.append((x1, y1, x2, y2))

    # ── Find violations ──────────────────────────────────
    violations = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            p1 = _bottom_center(boxes[i])
            p2 = _bottom_center(boxes[j])
            if _dist(p1, p2) < PROXIMITY_THRESHOLD:
                violations.append((i, j))

    # ── Annotate frame ───────────────────────────────────
    for idx, (x1, y1, x2, y2) in enumerate(boxes):
        color = (0, 0, 255) if any(idx in v for v in violations) else (0, 255, 0)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    for i, j in violations:
        c1 = _bottom_center(boxes[i])
        c2 = _bottom_center(boxes[j])
        cv2.line(frame,
                 (int(c1[0]), int(c1[1])),
                 (int(c2[0]), int(c2[1])),
                 (0, 0, 255), 2)
        mid_x = int((c1[0] + c2[0]) / 2)
        mid_y = int((c1[1] + c2[1]) / 2)
        cv2.putText(frame, f"{_dist(c1,c2):.1f}px",
                    (mid_x, mid_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    # ── Status overlay ───────────────────────────────────
    status_color = (0, 0, 255) if violations else (0, 255, 0)
    status_text  = "PROXIMITY VIOLATION!" if violations else "All Clear"
    cv2.putText(frame, status_text,             (20, 35),  cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
    cv2.putText(frame, f"Persons: {len(boxes)}", (20, 60),  cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 1)
    cv2.putText(frame, f"Violations: {len(violations)}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 1)
    cv2.putText(frame, f"Device: {device_id}  Cam: {camera_no}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,255,255), 1)

    # ── Save logic ───────────────────────────────────────
    key = f"{device_id}_{camera_no}"
    now = time.time()

    with _state_lock:
        elapsed = now - last_save_times.get(key, 0)

        if violations and elapsed >= COOLDOWN_TIME:
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
                f"[CloseProximityWorker] ⚠️ Proximity violation! "
                f"Device={device_id} Cam={camera_no} "
                f"Count={len(violations)} "
                f"💾 Saved → {path}"
            )

        violation_counts[key] = violation_counts.get(key, 0) + len(violations)

    return len(violations)


# =====================================================
# 📡  RTSP PATH  — called by master_pipeline producer
# =====================================================
def close_proximity_worker(frame_queue):
    """
    Queue-based worker loop — receives (frame, device_id, camera_no)
    packets from the RTSP producer.
    """
    logger.info("🟢 [CloseProximityWorker] RTSP worker started")

    while True:
        packet = frame_queue.get()
        if packet is None:
            logger.info("🔴 [CloseProximityWorker] RTSP worker stopping")
            break

        # Unpack: (frame, device_id, camera_no) or (frame, device_id, camera_no, script_name)
        if len(packet) == 4:
            frame, device_id, camera_no, script_name = packet
        else:
            frame, device_id, camera_no = packet
            script_name = "proximity"

        detect_close_proximity(
            frame.copy(),
            str(device_id),
            str(camera_no),
            save_folder=RTSP_SAVE_FOLDER,
            script_name=script_name
        )


# =====================================================
# 📡  HLS PATH  — GPU Batch Queue + Motion Filter
# =====================================================
#
# Architecture (from close_proximity TCS file):
#   - Camera threads read HLS streams + motion filter (CPU only)
#   - Motion frames pushed to gpu_queue
#   - Single GPU batch worker runs YOLO on batches
#   - Callback (result_cb) sends results back to camera thread for save
#   - Uses proximity_core.ProximityDetector for annotation + save
#   - Staggered thread starts (200ms between each)
# =====================================================

import sys
import gc
import queue

_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from scripts.detection import close_proximity as proximity_core
from detection_rate_limiter import get_rate_limiter
from motion_detector import get_motion_detector
from tcs_scheduler import frame_should_process, get_sample_every

# ── GPU Queue Config ─────────────────────────────────
GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "16"))
GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "64"))
THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "200")) / 1000.0

_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)
_hls_rate_limiter = get_rate_limiter('proximity', max_per_minute=25)


def _detect_violations_batch(person_boxes, proximity_threshold):
    """Detect pairs of people too close — mirrors ProximityDetector logic."""
    violations = []
    for i in range(len(person_boxes)):
        for j in range(i + 1, len(person_boxes)):
            box1, box2 = person_boxes[i][:4], person_boxes[j][:4]
            x1, y1 = (box1[0] + box1[2]) / 2, box1[3]
            x2, y2 = (box2[0] + box2[2]) / 2, box2[3]
            distance = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            if distance < proximity_threshold:
                violations.append({
                    'person1': i, 'person2': j,
                    'distance': distance, 'boxes': (box1, box2),
                })
    return violations


def _hls_gpu_batch_worker(stop_event):
    """
    GPU batch worker — single thread, owns GPU.
    Pulls frames from _gpu_queue, runs YOLO batch, fires result_cb.
    NO saving here — camera thread handles save via callback.
    """
    logger.info(f"🚀 [CloseProximityWorker][HLS] GPU worker started (batch={GPU_BATCH_SIZE})")

    # Use proximity_core model if available
    if hasattr(proximity_core, 'proximity_detector') and proximity_core.proximity_detector:
        model = proximity_core.proximity_detector.model
        conf = proximity_core.proximity_detector.confidence_threshold
        threshold = proximity_core.proximity_detector.proximity_threshold
    else:
        model = yolo_model
        conf = CONF_THRESHOLD
        threshold = PROXIMITY_THRESHOLD

    while not stop_event.is_set():
        batch = []

        try:
            batch.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        while len(batch) < GPU_BATCH_SIZE:
            try:
                batch.append(_gpu_queue.get_nowait())
            except queue.Empty:
                break

        try:
            raw_frames = [item['frame'] for item in batch]
            results = model(raw_frames, conf=conf, verbose=False)

            for item, result in zip(batch, results):
                person_boxes = []
                if result.boxes is not None:
                    for box in result.boxes:
                        if int(box.cls[0]) == 0:
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf_score = box.conf[0].cpu().numpy()
                            person_boxes.append([x1, y1, x2, y2, conf_score])

                violations = _detect_violations_batch(person_boxes, threshold)

                # Fire callback back to camera thread
                item['result_cb'](
                    len(violations) > 0,
                    len(violations),
                    item['frame'],
                    person_boxes,
                    violations,
                    item['ch_no']
                )

        except Exception as e:
            logger.error(f"[HLS-GPU] Batch error: {e}")

    logger.info("🔴 [CloseProximityWorker][HLS] GPU worker stopped")


def _hls_camera_thread(cfg, stop_event):
    """
    Camera reader thread — opens HLS, reads frames, motion filters,
    pushes to GPU queue, handles save via callback.
    """
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

    camera_id   = cfg['camera_id']
    center_name = cfg.get('center_name', '')
    camera_name = cfg.get('camera_location', cfg.get('camera_name', ''))
    script_name = cfg.get('script_code', 'proximity')
    ch_no       = cfg.get('ch_no', cfg.get('camera_id', 'unknown'))
    initial_url = cfg.get('cctv_url') or cfg.get('initial_url') or cfg.get('stream_url', '')

    sample_every = get_sample_every("PROXIMITY_SAMPLE_EVERY", 5)
    cooldown = int(os.environ.get("PROXIMITY_COOLDOWN_SEC", "90"))

    cap = None
    motion_detector = None
    stats = {'frames': 0, 'detections': 0, 'no_motion': 0, 'cooldown_skipped': 0}
    last_save_time = {'t': 0.0}

    # Callback — called by GPU worker with results
    def on_result(violation_detected, violation_count, frame, person_boxes, violations, ch):
        if not violation_detected:
            return

        now = time.time()
        if now - last_save_time['t'] < cooldown:
            stats['cooldown_skipped'] += 1
            return

        should_save, _, _ = _hls_rate_limiter.should_save_detection(camera_id)
        if should_save:
            last_save_time['t'] = now
            stats['detections'] += 1

            # Use ProximityDetector for annotation + save if available
            if hasattr(proximity_core, 'proximity_detector') and proximity_core.proximity_detector:
                annotated = proximity_core.proximity_detector.annotate_frame(
                    frame, person_boxes, violations
                )
                annotated = proximity_core.proximity_detector.add_status_overlay(
                    annotated, violations, len(person_boxes),
                    camera_id, camera_id
                )
                proximity_core.proximity_detector.save_violation_frame(
                    annotated, violations,
                    camera_id, ch,
                    center_name=center_name,
                    camera_name=camera_name,
                )
            else:
                # Fallback: simple save with new naming
                ts = time.strftime("%Y%m%d_%H%M%S")
                filename = os.path.join(
                    HLS_SAVE_FOLDER,
                    f"Proximity_ch{ch}_{ts}.jpg"
                )
                cv2.imwrite(filename, frame)

            logger.critical(f"[{camera_id}] 🚨 PROXIMITY VIOLATION: {violation_count}")

    try:
        hls_url = extract_hls_streaming_url(initial_url)
        if not hls_url or not test_hls_stream(hls_url):
            return

        cap = open_hls_stream(hls_url)
        if not cap:
            return

        motion_detector = get_motion_detector(camera_id, motion_threshold=800)
        logger.info(f"[CloseProximityWorker][HLS] 🟢 Camera thread started → {camera_id}")

        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                break

            stats['frames'] += 1

            if not frame_should_process(stats['frames'], sample_every):
                continue

            # CPU motion filter — skip static frames
            if not motion_detector.has_motion(frame):
                stats['no_motion'] += 1
                continue

            # Cooldown before GPU push — save GPU time
            if time.time() - last_save_time['t'] < cooldown:
                stats['cooldown_skipped'] += 1
                continue

            try:
                _gpu_queue.put_nowait({
                    'frame':       frame,
                    'camera_id':   camera_id,
                    'center_name': center_name,
                    'camera_name': camera_name,
                    'ch_no':       ch_no,
                    'result_cb':   on_result,
                })
            except queue.Full:
                continue

    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")
    finally:
        if cap:
            cap.release()
        if motion_detector:
            del motion_detector
        gc.collect()

    logger.info(
        f"[CloseProximityWorker][HLS] 🔴 {camera_id} done — "
        f"frames={stats['frames']} alerts={stats['detections']} "
        f"no_motion={stats['no_motion']}"
    )


def close_proximity_worker_hls(camera_configs, stop_event=None):
    """
    HLS worker entry point — GPU batch queue + motion filter architecture.

    Accepts a LIST of camera configs (from camera_loader) and runs
    all cameras with a shared GPU worker thread.

    Can also accept a single dict for backward compatibility.
    """
    import torch

    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT

    # Set save folder on proximity_core
    proximity_core.SAVE_FOLDER = HLS_SAVE_FOLDER
    if hasattr(proximity_core, 'proximity_detector') and proximity_core.proximity_detector:
        proximity_core.proximity_detector.output_folder = HLS_SAVE_FOLDER

    # Start GPU batch worker FIRST
    gpu_t = threading.Thread(
        target=_hls_gpu_batch_worker,
        args=(stop_event,),
        name="Proximity-GPU-worker",
        daemon=True
    )
    gpu_t.start()

    # Start camera threads with staggered delay
    threads = []
    total = len(camera_configs)
    for i, cfg in enumerate(camera_configs):
        t = threading.Thread(
            target=_hls_camera_thread,
            args=(cfg, stop_event),
            name=f"Prox-{cfg.get('camera_id', i)}",
            daemon=True
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_START_DELAY)

        if (i + 1) % 100 == 0:
            logger.info(f"  {i + 1}/{total} proximity camera threads started...")

    logger.info(f"[CloseProximityWorker][HLS] All {total} cameras started + 1 GPU worker")

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("[CloseProximityWorker][HLS] ✅ All cameras completed")