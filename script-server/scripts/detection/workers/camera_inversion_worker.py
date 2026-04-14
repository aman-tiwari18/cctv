# # workers/camera_inversion_worker.py
# """
# Camera Inversion Worker — GPU Batch Optimized
# =============================================
# Detects camera rotation using YOLOv11 + Places365.
# Truly batched: N frames -> 4*N rotations -> Single inference pass.
# """

# import queue
# import os
# import sys
# import time
# import cv2
# import logging
# import threading
# import signal
# import torch
# import numpy as np
# from datetime import datetime
# from PIL import Image
# from torchvision import models, transforms

# # ================= GRACEFUL STOP FLAG =================
# _STOP_EVENT = threading.Event()

# def _handle_stop(sig, frame):
#     _STOP_EVENT.set()

# if threading.current_thread() is threading.main_thread():
#     signal.signal(signal.SIGINT,  _handle_stop)
#     signal.signal(signal.SIGTERM, _handle_stop)

# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
# logger = logging.getLogger(__name__)

# # ================= PATH SETUP =================
# _DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# _PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))

# # ================= CONFIG ==================
# HLS_SAVE_FOLDER = os.path.join(_DETECTION_ROOT, "results/tcs_detections/camera_inversion_detection")
# os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

# GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
# GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "128"))
# THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0
# INVERSION_COOLDOWN = 120
# SAMPLE_EVERY       = 3  # 🔥 High frequency for rotation checks

# # ================= DEVICE =================
# DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# # ================= MODELS (lazy load) =================
# _yolo_model = None
# _places_model = None
# _classes = []
# _transform = transforms.Compose([
#     transforms.Resize((224, 224)),
#     transforms.ToTensor(),
#     transforms.Normalize([0.485, 0.456, 0.406],
#                          [0.229, 0.224, 0.225])
# ])

# def _load_models():
#     global _yolo_model, _places_model, _classes
#     if _yolo_model is not None: return

#     from ultralytics import YOLO
    
#     # YOLOv11
#     yolo_path = os.path.join(_PROJECT_ROOT, "models/yolo11n.pt")
#     _yolo_model = YOLO(yolo_path if os.path.exists(yolo_path) else "yolo11n.pt")
#     _yolo_model.to(DEVICE)

#     # Places365
#     _places_model = models.resnet50(num_classes=365)
#     ckpt_path = os.path.join(_DETECTION_ROOT, "resnet50_places365.pth.tar")
#     if os.path.exists(ckpt_path):
#         checkpoint = torch.load(ckpt_path, map_location=DEVICE)
#         state_dict = {k.replace("module.", ""): v for k, v in checkpoint["state_dict"].items()}
#         _places_model.load_state_dict(state_dict)
#     _places_model = _places_model.to(DEVICE)
#     _places_model.eval()

#     # Categories
#     cats_path = os.path.join(_DETECTION_ROOT, "categories_places365.txt")
#     if os.path.exists(cats_path):
#         with open(cats_path) as f:
#             for line in f:
#                 _classes.append(line.strip().split(" ")[0][3:])

# # ================= SHARED STATE ============
# _gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)
# _last_save_time = {}

# # ================= BATCH DETECTION =================
# def _detect_orientation_batch(frames):
#     _load_models()
#     if not frames: return []

#     all_rotations = []
#     meta = []

#     for idx, frame in enumerate(frames):
#         rot_v = [
#             ("original", frame),
#             ("180", cv2.rotate(frame, cv2.ROTATE_180)),
#         ]
#         for name, img in rot_v:
#             all_rotations.append(img)
#             meta.append((idx, name, img))

#     # 🔥 YOLO BATCH
#     results = _yolo_model(all_rotations, conf=0.35, verbose=False)
#     yolo_outs = []
#     for r in results:
#         boxes = r.boxes
#         count = len(boxes)
#         confs = [float(b.conf) for b in boxes]
#         avg_conf = sum(confs)/len(confs) if confs else 0
#         yolo_outs.append((count, avg_conf))

#     # 🔥 PLACES365 BATCH
#     tensors = [ _transform(Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))) for f in all_rotations ]
#     batch_tensor = torch.stack(tensors).to(DEVICE)
#     with torch.no_grad():
#         out = _places_model(batch_tensor)
#         probs = torch.nn.functional.softmax(out, dim=1)
#         scene_scores, _ = probs.topk(1)
#         scene_scores = scene_scores.squeeze(1).tolist()

#     index_map = {}
#     for (idx, name, img), (obj_count, obj_conf), scene_conf in zip(meta, yolo_outs, scene_scores):
#         score = obj_count * obj_conf + scene_conf
#         if idx not in index_map or score > index_map[idx][0]:
#             index_map[idx] = (score, img, name)

#     outputs = []
#     for i in range(len(frames)):
#         outputs.append((index_map[i][1], index_map[i][2]))
    
#     # Explicit cleanup
#     del all_rotations
#     del tensors
#     del meta
    
#     return outputs

# # ================= GPU WORKER =================
# def _hls_gpu_batch_worker(stop_event, save_folder):
#     logger.info("🚀 [InversionWorker] GPU Batch Worker started")
    
#     while not stop_event.is_set():
#         batch_items = []
#         try:
#             batch_items.append(_gpu_queue.get(timeout=0.1))
#         except queue.Empty:
#             continue

#         deadline = time.time() + 0.2
#         while len(batch_items) < (GPU_BATCH_SIZE // 2) and time.time() < deadline:
#             try:
#                 batch_items.append(_gpu_queue.get_nowait())
#             except queue.Empty:
#                 time.sleep(0.002)

#         if not batch_items: continue

#         try:
#             frames = [ item['frame'] for item in batch_items ]
#             results = _detect_orientation_batch(frames)

#             for item, (corrected, orientation) in zip(batch_items, results):
#                 cam_id = item['camera_id']
#                 ch_no = item['ch_no']

#                 if orientation != "original":
#                     now = time.time()
#                     if now - _last_save_time.get(cam_id, 0) < INVERSION_COOLDOWN:
#                         continue
                    
#                     _last_save_time[cam_id] = now
#                     ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    
#                     # ── Source-Aware Naming Format ──────────────
#                     if item.get("source_type") == "HLS":
#                         # Inversion_ch[ch_no]_[timestamp].jpg
#                         filename = os.path.join(save_folder, f"Inversion_ch{ch_no}_{ts}.jpg")
#                     else:
#                         # RTSP: Inversion_[device_id]_[camera_no]_[timestamp].jpg
#                         dev_id = item.get("device_id") or cam_id
#                         filename = os.path.join(save_folder, f"Inversion_{dev_id}_{ch_no}_{ts}.jpg")
                    
#                     cv2.imwrite(filename, corrected)
#                     logger.warning(f"[INVERSION] 🔄 {cam_id} ({orientation}) saved to {filename}")
                
#                 # Cleanup
#                 if 'frame' in item: del item['frame']
#                 del corrected

#             del batch_items
#             if 'results' in locals(): del results

#         except Exception as e:
#             logger.error(f"[BATCH ERROR] {e}")
#             for item in batch_items:
#                 if 'frame' in item: del item['frame']
#             del batch_items

#     logger.info("🔴 [InversionWorker] GPU Batch Worker stopped")


# # ================= CAMERA THREAD =================
# def _hls_camera_thread(cfg, stop_event):
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
#     from tcs_scheduler import frame_should_process

#     cam_id = cfg['camera_id']
#     initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

#     hls = extract_hls_streaming_url(initial_url)
#     if not hls or not test_hls_stream(hls):
#         return

#     cap = open_hls_stream(hls)
#     if not cap or not cap.isOpened():
#         return

#     frame_count = 0
#     while not stop_event.is_set():
#         ret, frame = cap.read()
#         if not ret: break

#         frame_count += 1
#         if not frame_should_process(frame_count, SAMPLE_EVERY):
#             continue

#         try:
#             _gpu_queue.put({
#                 "frame": frame.copy(),
#                 "camera_id": cam_id,
#                 "ch_no": cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown'),
#                 "source_type": "HLS",
#             }, timeout=0.1)
#         except queue.Full:
#             del frame
#             continue
        
#         # Cleanup
#         del frame
#     cap.release()

# # ================= PERSISTENT GPU WORKER STATE =================
# _HLS_GPU_WORKER = None
# _HLS_GPU_LOCK = threading.Lock()


# def _ensure_shared_hls_gpu_worker():
#     global _HLS_GPU_WORKER
#     with _HLS_GPU_LOCK:
#         if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
#             _HLS_GPU_WORKER = threading.Thread(
#                 target=_hls_gpu_batch_worker,
#                 args=(_STOP_EVENT, HLS_SAVE_FOLDER),
#                 daemon=True,
#                 name="inversion_hls_gpu_worker",
#             )
#             _HLS_GPU_WORKER.start()
#             logger.info("[InversionWorker] 🚀 Shared GPU worker started")


# # =====================================================
# # 📡 RTSP WORKER (queue-based, receives frames from producer)
# # =====================================================
# RTSP_SAVE_FOLDER = os.path.join(_DETECTION_ROOT, "results/camera_inversion_detection")
# os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)

# _inversion_last_save = {}


# def camera_inversion_worker(frame_queue):
#     """
#     RTSP Worker — GPU Batch Queue Architecture.
#     Receives packets from the RTSP producer and pushes them into
#     the shared gpu_queue for batch inference via _ensure_shared_hls_gpu_worker.
#     """
#     import torch
#     logger.info("🟢 [InversionWorker] RTSP batch-worker started")
#     stop_event = threading.Event()

#     # Start the SAME GPU batch worker that HLS uses
#     _ensure_shared_hls_gpu_worker()

#     try:
#         while True:
#             data = frame_queue.get()
#             if data is None:
#                 logger.info("🔴 [InversionWorker] RTSP batch-worker stopping")
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
#                     "source_type":  "RTSP",
#                     "save_folder":  RTSP_SAVE_FOLDER,
#                 }, timeout=0.1)
#             except queue.Full:
#                 pass
#             del frame

#     finally:
#         stop_event.set()
#         _STOP_EVENT.set()
#         if torch.cuda.is_available():
#             torch.cuda.empty_cache()
#         logger.info("🔴 [InversionWorker] GPU worker shut down")


# # ================= ENTRY POINT =================
# def camera_inversion_worker_hls(camera_configs, stop_event=None):
#     cv2.setNumThreads(0) # Prevent thread explosion
#     if isinstance(camera_configs, dict):
#         camera_configs = [camera_configs]

#     persistent_mode = stop_event is None
#     if stop_event is None:
#         stop_event = _STOP_EVENT

#     # 🔥 URL filter — inversion can occur in any scene; just require a valid URL
#     filtered_configs = []
#     for cfg in camera_configs:
#         stream_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
#         if not stream_url:
#             continue
#         filtered_configs.append(cfg)

#     if not filtered_configs:
#         logger.warning("[CameraInversion][HLS] No cameras with valid URLs. Skipping.")
#         return

#     camera_configs = filtered_configs

#     if persistent_mode:
#         _ensure_shared_hls_gpu_worker()
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
#         for cfg in camera_configs:
#             executor.submit(_hls_camera_thread, cfg, stop_event)
#             time.sleep(THREAD_START_DELAY)

#     logger.info(f"[InversionWorker][HLS] Started {len(camera_configs)} camera threads + 1 GPU worker")

#     try:
#         stop_event.wait()
#     except KeyboardInterrupt:
#         stop_event.set()

#     if persistent_mode:
#         logger.info("[InversionWorker][HLS] ✅ Camera threads completed (shared GPU worker still running)")
#         return

#     stop_event.set()

#     logger.info("[InversionWorker][HLS] ✅ All cameras completed")



# workers/camera_inversion_worker.py
"""
Camera Inversion Worker — GPU Batch Optimized
=============================================
Detects camera rotation using YOLOv11 + Places365.
Truly batched: N frames -> 4*N rotations -> Single inference pass.
"""

import queue
import os
import sys
import time
import cv2
import logging
import threading
import signal
import torch
from datetime import datetime
import pymysql
import re
import numpy as np
from PIL import Image
from torchvision import models, transforms

# ================= GRACEFUL STOP FLAG =================
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT,  _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ================= PATH SETUP =================
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))

# ================= CONFIG ==================
HLS_SAVE_FOLDER = os.path.join(_DETECTION_ROOT, "results/tcs_detections/camera_inversion_detection")
os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "64"))
GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "128"))
THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "100")) / 1000.0
INVERSION_COOLDOWN = 120
SAMPLE_EVERY       = 3  # 🔥 High frequency for rotation checks

# ================= DEVICE =================
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ================= MODELS (lazy load) =================
_yolo_model = None
_places_model = None
_classes = []
_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

def _load_models():
    global _yolo_model, _places_model, _classes
    if _yolo_model is not None: return

    from ultralytics import YOLO
    
    # YOLOv11
    yolo_path = os.path.join(_PROJECT_ROOT, "models/yolo11n.pt")
    _yolo_model = YOLO(yolo_path if os.path.exists(yolo_path) else "yolo11n.pt")
    _yolo_model.to(DEVICE)

    # Places365
    _places_model = models.resnet50(num_classes=365)
    ckpt_path = os.path.join(_DETECTION_ROOT, "resnet50_places365.pth.tar")
    if os.path.exists(ckpt_path):
        checkpoint = torch.load(ckpt_path, map_location=DEVICE)
        state_dict = {k.replace("module.", ""): v for k, v in checkpoint["state_dict"].items()}
        _places_model.load_state_dict(state_dict)
    _places_model = _places_model.to(DEVICE)
    _places_model.eval()

    # Categories
    cats_path = os.path.join(_DETECTION_ROOT, "categories_places365.txt")
    if os.path.exists(cats_path):
        with open(cats_path) as f:
            for line in f:
                _classes.append(line.strip().split(" ")[0][3:])

# ================= SHARED STATE ============
_gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)
_last_save_time = {}

# ================= DB CONFIG =================
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "rootpassword123",
    "database": "cctv_monitoring",
    "cursorclass": pymysql.cursors.DictCursor
}

def report_to_db_hls(ch_code, image_name, folder="camera_inversion_detection"):
    """
    Look up camera info by ch_code and report detection to camera_report_hls.
    Specifically for HLS detections.
    """
    try:
        # 0. Get the project root based on this script's location
        script_dir = os.path.dirname(os.path.abspath(__file__))
        log_file = os.path.join(script_dir, "../../db_reports.log")
        
        with open(log_file, "a") as f:
            f.write(f"\n--- New Inversion Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
            f.write(f"Image: {image_name} | Passed ch_code: {ch_code}\n")

        # 0.1 Try to extract a numeric ch_code from the image_name if the passed one is generic
        if not str(ch_code).isdigit():
            match = re.search(r'_ch(\d+)_', image_name)
            if match:
                ch_code = match.group(1)
                with open(log_file, "a") as f: f.write(f"Extracted ch_code from filename: {ch_code}\n")

        # 1. Get metadata from Env
        exam_id = os.environ.get("EXAM_ID")
        shift_id = os.environ.get("SHIFT_ID")
        
        if not exam_id:
            msg = "[DB-REPORT] ❌ ERROR: EXAM_ID not found in environment. Detection NOT saved to DB.\n"
            logging.error(msg)
            with open(log_file, "a") as f: f.write(msg)
            return False

        # 2. Extract timestamp from filename
        ts_match = re.search(r'(\d{8}_\d{6})', image_name)
        if ts_match:
            raw_ts = ts_match.group(1)
            dt_obj = datetime.strptime(raw_ts, "%Y%m%d_%H%M%S")
            date_time = dt_obj.strftime("%d/%m/%Y %H:%M:%S")
        else:
            date_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

        # 3. Connection and Lookup
        connection = pymysql.connect(**DB_CONFIG)
        try:
            with connection.cursor() as cursor:
                # Search camera_links_hls
                query = """
                    SELECT * FROM camera_links_hls 
                    WHERE ch_code = %s AND exam_id = %s
                    AND (shift_id = %s OR shift_id IS NULL)
                    LIMIT 1
                """
                cursor.execute(query, (ch_code, exam_id, shift_id))
                cam = cursor.fetchone()

                if not cam:
                    msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (inversion) for ch_code={ch_code}, exam_id={exam_id}, shift_id={shift_id}\n"
                    logging.error(msg)
                    with open(log_file, "a") as f: f.write(msg)
                    return False

                # 4. Prepare Report Data
                camera_name = cam.get('camera_name', '')
                parts = camera_name.split('/')
                report_camera_id = f"{parts[0]}_{parts[2]}" if len(parts) >= 3 else camera_name
                status_raw = str(cam.get('status', '')).lower()
                camera_status = "Online" if status_raw == 'accessible' else "Offline"
                image_url = f"http://www.examscctvmonitoring.com/cctv_dev/serve-detection-images/{folder}/{image_name}"

                # 5. Insert into camera_report_hls
                insert_query = """
                    INSERT INTO camera_report_hls (
                        exam_id, shift_id, city, center_name, camera_id, 
                        camera_name, camera_category, tc_code, ch_code, 
                        state, camera_status, events, date_time, 
                        imageurl, detection_type
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(insert_query, (
                    cam.get('exam_id'), cam.get('shift_id'), cam.get('city'),
                    cam.get('centre_name'), report_camera_id, camera_name,
                    cam.get('camera_category'), cam.get('tc_code'), ch_code,
                    cam.get('state'), camera_status, 1, date_time, image_url, folder
                ))
                connection.commit()
                msg = f"[DB-REPORT] ✅ SUCCESS: Inserted inversion report for ch_code {ch_code} (Camera: {report_camera_id})\n"
                logging.info(msg)
                with open(log_file, "a") as f: f.write(msg)
                return True
        finally:
            connection.close()
    except Exception as e:
        msg = f"[DB-REPORT] ❌ FATAL ERROR: {e}\n"
        logging.error(msg)
        with open(log_file, "a") as f: f.write(msg)
        return False

# ================= BATCH DETECTION =================
def _detect_orientation_batch(frames):
    _load_models()
    if not frames: return []

    all_rotations = []
    meta = []

    for idx, frame in enumerate(frames):
        rot_v = [
            ("original", frame),
            ("180", cv2.rotate(frame, cv2.ROTATE_180)),
        ]
        for name, img in rot_v:
            all_rotations.append(img)
            meta.append((idx, name, img))

    # 🔥 YOLO BATCH
    results = _yolo_model(all_rotations, conf=0.35, verbose=False)
    yolo_outs = []
    for r in results:
        boxes = r.boxes
        count = len(boxes)
        confs = [float(b.conf) for b in boxes]
        avg_conf = sum(confs)/len(confs) if confs else 0
        yolo_outs.append((count, avg_conf))

    # 🔥 PLACES365 BATCH
    tensors = [ _transform(Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))) for f in all_rotations ]
    batch_tensor = torch.stack(tensors).to(DEVICE)
    with torch.no_grad():
        out = _places_model(batch_tensor)
        probs = torch.nn.functional.softmax(out, dim=1)
        scene_scores, _ = probs.topk(1)
        scene_scores = scene_scores.squeeze(1).tolist()

    index_map = {}
    for (idx, name, img), (obj_count, obj_conf), scene_conf in zip(meta, yolo_outs, scene_scores):
        score = obj_count * obj_conf + scene_conf
        if idx not in index_map or score > index_map[idx][0]:
            index_map[idx] = (score, img, name)

    outputs = []
    for i in range(len(frames)):
        outputs.append((index_map[i][1], index_map[i][2]))
    
    # Explicit cleanup
    del all_rotations
    del tensors
    del meta
    
    return outputs

# ================= GPU WORKER =================
def _hls_gpu_batch_worker(stop_event, save_folder):
    logger.info("🚀 [InversionWorker] GPU Batch Worker started")
    
    while not stop_event.is_set():
        batch_items = []
        try:
            batch_items.append(_gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + 0.2
        while len(batch_items) < (GPU_BATCH_SIZE // 2) and time.time() < deadline:
            try:
                batch_items.append(_gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        if not batch_items: continue

        try:
            frames = [ item['frame'] for item in batch_items ]
            results = _detect_orientation_batch(frames)

            for item, (corrected, orientation) in zip(batch_items, results):
                cam_id = item['camera_id']
                ch_no = item['ch_no']

                if orientation != "original":
                    now = time.time()
                    if now - _last_save_time.get(cam_id, 0) < INVERSION_COOLDOWN:
                        continue
                    
                    _last_save_time[cam_id] = now
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    
                    # ── Source-Aware Naming Format ──────────────
                    if item.get("source_type") == "HLS":
                        # Inversion_ch[ch_no]_[timestamp].jpg
                        filename = os.path.join(save_folder, f"Inversion_ch{ch_no}_{ts}.jpg")
                    else:
                        # RTSP: Inversion_[device_id]_[camera_no]_[timestamp].jpg
                        dev_id = item.get("device_id") or cam_id
                        filename = os.path.join(save_folder, f"Inversion_{dev_id}_{ch_no}_{ts}.jpg")
                    
                    cv2.imwrite(filename, corrected)
                    logger.warning(f"[INVERSION] 🔄 {cam_id} ({orientation}) saved to {filename}")

                    # --- Report to DB (HLS only) ---
                    if item.get("source_type") == "HLS":
                        try:
                            report_to_db_hls(
                                ch_code=str(ch_no), 
                                image_name=os.path.basename(filename),
                                folder="camera_inversion_detection"
                            )
                        except Exception as e:
                            logger.error(f"[InversionWorker] DB Reporting Error: {e}")
                
                # Cleanup
                if 'frame' in item: del item['frame']
                del corrected

            del batch_items
            if 'results' in locals(): del results

        except Exception as e:
            logger.error(f"[BATCH ERROR] {e}")
            for item in batch_items:
                if 'frame' in item: del item['frame']
            del batch_items

    logger.info("🔴 [InversionWorker] GPU Batch Worker stopped")


# ================= CAMERA THREAD =================
def _hls_camera_thread(cfg, stop_event):
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
    from tcs_scheduler import frame_should_process

    cam_id = cfg['camera_id']
    initial_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

    hls = extract_hls_streaming_url(initial_url)
    if not hls or not test_hls_stream(hls):
        return

    cap = open_hls_stream(hls)
    if not cap or not cap.isOpened():
        return

    frame_count = 0
    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret: break

        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            _gpu_queue.put({
                "frame": frame.copy(),
                "camera_id": cam_id,
                "ch_no": cfg.get('ch_no') or cfg.get('camera_no') or cfg.get('camera_id', 'unknown'),
                "source_type": "HLS",
            }, timeout=0.1)
        except queue.Full:
            del frame
            continue
        
        # Cleanup
        del frame
    cap.release()

# ================= PERSISTENT GPU WORKER STATE =================
_HLS_GPU_WORKER = None
_HLS_GPU_LOCK = threading.Lock()


def _ensure_shared_hls_gpu_worker():
    global _HLS_GPU_WORKER
    with _HLS_GPU_LOCK:
        if _HLS_GPU_WORKER is None or not _HLS_GPU_WORKER.is_alive():
            _HLS_GPU_WORKER = threading.Thread(
                target=_hls_gpu_batch_worker,
                args=(_STOP_EVENT, HLS_SAVE_FOLDER),
                daemon=True,
                name="inversion_hls_gpu_worker",
            )
            _HLS_GPU_WORKER.start()
            logger.info("[InversionWorker] 🚀 Shared GPU worker started")


# =====================================================
# 📡 RTSP WORKER (queue-based, receives frames from producer)
# =====================================================
RTSP_SAVE_FOLDER = os.path.join(_DETECTION_ROOT, "results/camera_inversion_detection")
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)

_inversion_last_save = {}


def camera_inversion_worker(frame_queue):
    """
    RTSP Worker — GPU Batch Queue Architecture.
    Receives packets from the RTSP producer and pushes them into
    the shared gpu_queue for batch inference via _ensure_shared_hls_gpu_worker.
    """
    import torch
    logger.info("🟢 [InversionWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    # Start the SAME GPU batch worker that HLS uses
    _ensure_shared_hls_gpu_worker()

    try:
        while True:
            data = frame_queue.get()
            if data is None:
                logger.info("🔴 [InversionWorker] RTSP batch-worker stopping")
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
                    "source_type":  "RTSP",
                    "save_folder":  RTSP_SAVE_FOLDER,
                }, timeout=0.1)
            except queue.Full:
                pass
            del frame

    finally:
        stop_event.set()
        _STOP_EVENT.set()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("🔴 [InversionWorker] GPU worker shut down")


# ================= ENTRY POINT =================
def camera_inversion_worker_hls(camera_configs, stop_event=None):
    cv2.setNumThreads(0) # Prevent thread explosion
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    persistent_mode = stop_event is None
    if stop_event is None:
        stop_event = _STOP_EVENT

    # 🔥 URL filter — inversion can occur in any scene; just require a valid URL
    filtered_configs = []
    for cfg in camera_configs:
        stream_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url')
        if not stream_url:
            continue
        filtered_configs.append(cfg)

    if not filtered_configs:
        logger.warning("[CameraInversion][HLS] No cameras with valid URLs. Skipping.")
        return

    camera_configs = filtered_configs

    if persistent_mode:
        _ensure_shared_hls_gpu_worker()
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
        for cfg in camera_configs:
            executor.submit(_hls_camera_thread, cfg, stop_event)
            time.sleep(THREAD_START_DELAY)

    logger.info(f"[InversionWorker][HLS] Started {len(camera_configs)} camera threads + 1 GPU worker")

    try:
        stop_event.wait()
    except KeyboardInterrupt:
        stop_event.set()

    if persistent_mode:
        logger.info("[InversionWorker][HLS] ✅ Camera threads completed (shared GPU worker still running)")
        return

    stop_event.set()

    logger.info("[InversionWorker][HLS] ✅ All cameras completed")