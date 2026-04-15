# # import cv2
# # import time
# # import os
# # import logging
# # import threading
# # import torch
# # import torchvision.transforms as transforms
# # import sys
# # import numpy as np
# # from torchvision import models
# # from ultralytics import YOLO
# # from PIL import Image
# # from datetime import datetime

# # # ================= LOGGING =================
# # logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # # ================= CONFIG ==================
# # # Detection directory is parent of this file
# # DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
# # PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

# # MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10m.pt")
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection_results")

# # # Ensure models directory exists
# # os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # DEVICE_ID = "TCS_NODE"
# # CAMERA_NO = "unknown"

# # CONF_THRESHOLD = 0.25
# # COOLDOWN_TIME  = 480  # seconds

# # # ================= PLACES365 =================
# # _places_model = None
# # _places_classes = []

# # def load_places365():
# #     global _places_model, _places_classes
# #     if _places_model is not None:
# #         return _places_model, _places_classes

# #     logging.info("Loading Places365 model...")
# #     model = models.resnet18()
# #     num_ftrs = model.fc.in_features
# #     model.fc = torch.nn.Linear(num_ftrs, 365)

# #     try:
# #         checkpoint = torch.hub.load_state_dict_from_url(
# #             "http://places2.csail.mit.edu/models_places365/resnet18_places365.pth.tar",
# #             map_location=torch.device("cpu"),
# #             progress=True
# #         )
# #         state_dict = {k.replace("module.", ""): v for k, v in checkpoint["state_dict"].items()}
# #         model.load_state_dict(state_dict)
# #         model.eval()
# #         _places_model = model
        
# #         # Load categories
# #         cat_path = os.path.join(DETECTION_ROOT, "categories_places365.txt")
# #         if os.path.exists(cat_path):
# #             with open(cat_path) as f:
# #                 _places_classes = [line.strip().split(" ")[0][3:] for line in f]
# #         else:
# #             logging.warning("categories_places365.txt not found")
        
# #         logging.info("Places365 model loaded successfully")
# #     except Exception as e:
# #         logging.warning(f"Places365 load failed: {e}")
# #         _places_model = None
    
# #     return _places_model, _places_classes

# # transform_places = transforms.Compose([
# #     transforms.Resize((256, 256)),
# #     transforms.CenterCrop(224),
# #     transforms.ToTensor(),
# #     transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
# # ])

# # # ================= CORE LOGIC =================

# # def classify_scene(frame):
# #     model, classes = load_places365()
# #     if model is None or not classes:
# #         return ["scene_disabled"]

# #     try:
# #         img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
# #         tensor = transform_places(img).unsqueeze(0).to(next(model.parameters()).device)

# #         with torch.no_grad():
# #             out = model(tensor)
# #             topk = torch.topk(out, 3)
# #             return [classes[i] for i in topk.indices[0]]
# #     except Exception as e:
# #         logging.error(f"Scene classification error: {e}")
# #         return ["error"]

# # # ================= BATCH INFERENCE =================
# # _model = None
# # _model_lock = threading.Lock()

# # def get_yolo_model():
# #     """True batch GPU warmup / loading"""
# #     global _model
# #     if _model is None:
# #         with _model_lock:
# #             if _model is None:
# #                 if not os.path.exists(MODEL_PATH):
# #                     logging.error(f"YOLO Model not found at {MODEL_PATH}")
# #                     return None
                    
# #                 logging.info(f"Loading YOLO model from {MODEL_PATH}")
# #                 _model = YOLO(MODEL_PATH)
                
# #                 if torch.cuda.is_available():
# #                     device = 'cuda'
# #                     _model.to(device)
# #                     # GPU warmup
# #                     logging.info("Warming up GPU...")
# #                     dummy = [np.zeros((640, 640, 3), dtype=np.uint8)] * 4
# #                     _model(dummy, verbose=False)
# #                     torch.cuda.synchronize()
# #                 else:
# #                     logging.info("Running on CPU")
                    
# #     return _model

# # def detect_phones_batch(items):
# #     """
# #     True batch inference for phones.
# #     Also runs Places365 scene classification per frame.
# #     """
# #     model = get_yolo_model()
# #     if model is None:
# #         return [(item['frame'], False, 0) for item in items]
        
# #     frames = [item['frame'] for item in items]
    
# #     # 1. Run YOLO batch
# #     results = model(frames, conf=CONF_THRESHOLD, verbose=False)

# #     outputs = []

# #     for item, result in zip(items, results):
# #         frame = item['frame'].copy()
# #         ch_no = item.get('ch_no', 'unknown')
        
# #         # 2. Add Scene Classification
# #         scene_labels = classify_scene(frame)
        
# #         names = result.names
# #         phone_count = 0
# #         phone_detected = False

# #         for box in result.boxes:
# #             cls_id = int(box.cls[0])
# #             if names[cls_id] == "cell phone":
# #                 phone_detected = True
# #                 phone_count += 1
                
# #                 x1, y1, x2, y2 = map(int, box.xyxy[0])
# #                 cv2.rectangle(frame, (x1,y1), (x2,y2), (0,0,255), 2)
# #                 conf = float(box.conf[0])
# #                 cv2.putText(frame, f"Phone {conf:.2f}", (x1, y1-10),
# #                             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

# #         # 3. Add Overlays
# #         cv2.putText(frame, f"Scene: {', '.join(scene_labels[:2])}", (10, 30),
# #                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #         cv2.putText(frame, f"Phones: {phone_count}", (10, 60),
# #                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #         cv2.putText(frame, f"CH: {ch_no}", (10, 90),
# #                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #         outputs.append((frame, phone_detected, phone_count))

# #     return outputs



# import cv2
# import time
# import os
# import logging
# import threading
# import torch
# import torchvision.transforms as transforms
# import sys
# import numpy as np
# from torchvision import models
# from ultralytics import YOLO
# from PIL import Image
# from datetime import datetime
# import pymysql
# import re


# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# # ================= CONFIG ==================
# # Detection directory is parent of this file
# DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

# MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10m.pt")
# SAVE_FOLDER = "/data/cctv_dev/cctv/script-server/scripts/detection/results/tcs_detections/phone_detection"

# # Ensure models directory exists
# os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
# os.makedirs(SAVE_FOLDER, exist_ok=True)

# DEVICE_ID = "TCS_NODE"
# CAMERA_NO = "unknown"

# CONF_THRESHOLD = 0.25
# COOLDOWN_TIME  = 480  # seconds

# # ================= PLACES365 =================
# _places_model = None
# _places_classes = []

# def load_places365():
#     global _places_model, _places_classes
#     if _places_model is not None:
#         return _places_model, _places_classes

#     logging.info("Loading Places365 model...")
#     model = models.resnet18()
#     num_ftrs = model.fc.in_features
#     model.fc = torch.nn.Linear(num_ftrs, 365)

#     try:
#         checkpoint = torch.hub.load_state_dict_from_url(
#             "http://places2.csail.mit.edu/models_places365/resnet18_places365.pth.tar",
#             map_location=torch.device("cpu"),
#             progress=True
#         )
#         state_dict = {k.replace("module.", ""): v for k, v in checkpoint["state_dict"].items()}
#         model.load_state_dict(state_dict)
#         model.eval()
#         _places_model = model
        
#         # Load categories
#         cat_path = os.path.join(DETECTION_ROOT, "categories_places365.txt")
#         if os.path.exists(cat_path):
#             with open(cat_path) as f:
#                 _places_classes = [line.strip().split(" ")[0][3:] for line in f]
#         else:
#             logging.warning("categories_places365.txt not found")
        
#         logging.info("Places365 model loaded successfully")
#     except Exception as e:
#         logging.warning(f"Places365 load failed: {e}")
#         _places_model = None
    
#     return _places_model, _places_classes

# transform_places = transforms.Compose([
#     transforms.Resize((256, 256)),
#     transforms.CenterCrop(224),
#     transforms.ToTensor(),
#     transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
# ])

# # ================= CORE LOGIC =================

# def classify_scene(frame):
#     model, classes = load_places365()
#     if model is None or not classes:
#         return ["scene_disabled"]

#     try:
#         img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
#         tensor = transform_places(img).unsqueeze(0).to(next(model.parameters()).device)

#         with torch.no_grad():
#             out = model(tensor)
#             topk = torch.topk(out, 3)
#             return [classes[i] for i in topk.indices[0]]
#     except Exception as e:
#         logging.error(f"Scene classification error: {e}")
#         return ["error"]

# # ================= BATCH INFERENCE =================
# _model = None
# _model_lock = threading.Lock()

# def get_yolo_model():
#     """True batch GPU warmup / loading"""
#     global _model
#     if _model is None:
#         with _model_lock:
#             if _model is None:
#                 if not os.path.exists(MODEL_PATH):
#                     logging.error(f"YOLO Model not found at {MODEL_PATH}")
#                     return None
                    
#                 logging.info(f"Loading YOLO model from {MODEL_PATH}")
#                 _model = YOLO(MODEL_PATH)
                
#                 if torch.cuda.is_available():
#                     device = 'cuda'
#                     _model.to(device)
#                     # GPU warmup
#                     logging.info("Warming up GPU...")
#                     dummy = [np.zeros((640, 640, 3), dtype=np.uint8)] * 4
#                     _model(dummy, verbose=False)
#                     torch.cuda.synchronize()
#                 else:
#                     logging.info("Running on CPU")
                    
#     return _model

# def detect_phones_batch(items):
#     """
#     True batch inference for phones.
#     Also runs Places365 scene classification per frame.
#     """
#     model = get_yolo_model()
#     if model is None:
#         return [(item['frame'], False, 0) for item in items]
        
#     frames = [item['frame'] for item in items]
    
#     # 1. Run YOLO batch
#     results = model(frames, conf=CONF_THRESHOLD, verbose=False)

#     outputs = []

#     for item, result in zip(items, results):
#         frame = item['frame'].copy()
#         ch_no = item.get('ch_no', 'unknown')
        
#         # 2. Add Scene Classification
#         scene_labels = classify_scene(frame)
        
#         names = result.names
#         phone_count = 0
#         phone_detected = False

#         for box in result.boxes:
#             cls_id = int(box.cls[0])
#             if names[cls_id] == "cell phone":
#                 phone_detected = True
#                 phone_count += 1
                
#                 x1, y1, x2, y2 = map(int, box.xyxy[0])
#                 cv2.rectangle(frame, (x1,y1), (x2,y2), (0,0,255), 2)
#                 conf = float(box.conf[0])
#                 cv2.putText(frame, f"Phone {conf:.2f}", (x1, y1-10),
#                             cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

#         # 3. Add Overlays
#         cv2.putText(frame, f"Scene: {', '.join(scene_labels[:2])}", (10, 30),
#                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#         cv2.putText(frame, f"Phones: {phone_count}", (10, 60),
#                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#         cv2.putText(frame, f"CH: {ch_no}", (10, 90),
#                     cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#         outputs.append((frame, phone_detected, phone_count))

#     return outputs


# # ================= DB CONFIG =================
# DB_CONFIG = {
#     "host": "localhost",
#     "user": "root",
#     "password": "rootpassword123",
#     "database": "cctv_monitoring",
#     "cursorclass": pymysql.cursors.DictCursor
# }

# def report_to_db_hls(ch_code, image_name, folder="phone_detection"):
#     """
#     Look up camera info by ch_code and report detection to camera_report_hls.
#     Specifically for HLS detections.
#     """
#     try:
#         # 0. Get the project root based on this script's location
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         log_file = os.path.join(script_dir, "../../db_reports.log")
        
#         with open(log_file, "a") as f:
#             f.write(f"\n--- New Phone Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
#             f.write(f"Image: {image_name} | Passed ch_code: {ch_code}\n")

#         # 0.1 Try to extract a numeric ch_code from the image_name if the passed one is generic
#         if not str(ch_code).isdigit():
#             match = re.search(r'_ch(\d+)_', image_name)
#             if match:
#                 ch_code = match.group(1)
#                 with open(log_file, "a") as f: f.write(f"Extracted ch_code from filename: {ch_code}\n")

#         # 1. Get metadata from Env
#         exam_id = os.environ.get("EXAM_ID")
#         shift_id = os.environ.get("SHIFT_ID")
        
#         if not exam_id:
#             msg = "[DB-REPORT] ❌ ERROR: EXAM_ID not found in environment. Detection NOT saved to DB.\n"
#             logging.error(msg)
#             with open(log_file, "a") as f: f.write(msg)
#             return False

#         # 2. Extract timestamp from filename
#         ts_match = re.search(r'(\d{8}_\d{6})', image_name)
#         if ts_match:
#             raw_ts = ts_match.group(1)
#             dt_obj = datetime.strptime(raw_ts, "%Y%m%d_%H%M%S")
#             date_time = dt_obj.strftime("%d/%m/%Y %H:%M:%S")
#         else:
#             date_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

#         # 3. Connection and Lookup
#         connection = pymysql.connect(**DB_CONFIG)
#         try:
#             with connection.cursor() as cursor:
#                 # Search camera_links_hls
#                 query = """
#                     SELECT * FROM camera_links_hls 
#                     WHERE ch_code = %s AND exam_id = %s
#                     AND (shift_id = %s OR shift_id IS NULL)
#                     LIMIT 1
#                 """
#                 cursor.execute(query, (ch_code, exam_id, shift_id))
#                 cam = cursor.fetchone()

#                 if not cam:
#                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found in camera_links_hls for ch_code={ch_code}, exam_id={exam_id}, shift_id={shift_id}\n"
#                     logging.error(msg)
#                     with open(log_file, "a") as f: f.write(msg)
#                     return False

#                 # 4. Prepare Report Data
#                 camera_name = cam.get('camera_name', '')
#                 parts = camera_name.split('/')
#                 report_camera_id = f"{parts[0]}_{parts[2]}" if len(parts) >= 3 else camera_name
#                 status_raw = str(cam.get('status', '')).lower()
#                 camera_status = "Online" if status_raw == 'accessible' else "Offline"
#                 image_url = f"http://www.examscctvmonitoring.com/cctv_dev/serve-detection-images/{folder}/{image_name}"

#                 # 5. Insert into camera_report_hls
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
#                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted phone report for ch_code {ch_code} (Camera: {report_camera_id})\n"
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



# changes on 15-04-2026

import cv2
import time
import os
import logging
import threading
import torch
import torchvision.transforms as transforms
import sys
import numpy as np
from torchvision import models
from ultralytics import YOLO
from PIL import Image
from datetime import datetime
import pymysql
import re


# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# ================= CONFIG ==================
# Detection directory is parent of this file
DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10m.pt")
SAVE_FOLDER = os.path.join(DETECTION_ROOT, "results/tcs_detections/phone_detection")

# Ensure models directory exists
os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
os.makedirs(SAVE_FOLDER, exist_ok=True)

DEVICE_ID = "TCS_NODE"
CAMERA_NO = "unknown"

CONF_THRESHOLD = 0.25
COOLDOWN_TIME  = 480  # seconds

# ================= PLACES365 =================
_places_model = None
_places_classes = []

def load_places365():
    global _places_model, _places_classes
    if _places_model is not None:
        return _places_model, _places_classes

    logging.info("Loading Places365 model...")
    model = models.resnet18()
    num_ftrs = model.fc.in_features
    model.fc = torch.nn.Linear(num_ftrs, 365)

    try:
        checkpoint = torch.hub.load_state_dict_from_url(
            "http://places2.csail.mit.edu/models_places365/resnet18_places365.pth.tar",
            map_location=torch.device("cpu"),
            progress=True
        )
        state_dict = {k.replace("module.", ""): v for k, v in checkpoint["state_dict"].items()}
        model.load_state_dict(state_dict)
        model.eval()
        _places_model = model
        
        # Load categories
        cat_path = os.path.join(DETECTION_ROOT, "categories_places365.txt")
        if os.path.exists(cat_path):
            with open(cat_path) as f:
                _places_classes = [line.strip().split(" ")[0][3:] for line in f]
        else:
            logging.warning("categories_places365.txt not found")
        
        logging.info("Places365 model loaded successfully")
    except Exception as e:
        logging.warning(f"Places365 load failed: {e}")
        _places_model = None
    
    return _places_model, _places_classes

transform_places = transforms.Compose([
    transforms.Resize((256, 256)),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# ================= CORE LOGIC =================

def classify_scene(frame):
    model, classes = load_places365()
    if model is None or not classes:
        return ["scene_disabled"]

    try:
        img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        tensor = transform_places(img).unsqueeze(0).to(next(model.parameters()).device)

        with torch.no_grad():
            out = model(tensor)
            topk = torch.topk(out, 3)
            return [classes[i] for i in topk.indices[0]]
    except Exception as e:
        logging.error(f"Scene classification error: {e}")
        return ["error"]

# ================= BATCH INFERENCE =================
_model = None
_model_lock = threading.Lock()

def get_yolo_model():
    """True batch GPU warmup / loading"""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                if not os.path.exists(MODEL_PATH):
                    logging.error(f"YOLO Model not found at {MODEL_PATH}")
                    return None
                    
                logging.info(f"Loading YOLO model from {MODEL_PATH}")
                _model = YOLO(MODEL_PATH)
                
                if torch.cuda.is_available():
                    device = 'cuda'
                    _model.to(device)
                    # GPU warmup
                    logging.info("Warming up GPU...")
                    dummy = [np.zeros((640, 640, 3), dtype=np.uint8)] * 4
                    _model(dummy, verbose=False)
                    torch.cuda.synchronize()
                else:
                    logging.info("Running on CPU")
                    
    return _model

def detect_phones_batch(items):
    """
    True batch inference for phones.
    Also runs Places365 scene classification per frame.
    """
    model = get_yolo_model()
    if model is None:
        return [(item['frame'], False, 0) for item in items]
        
    frames = [item['frame'] for item in items]
    
    # 1. Run YOLO batch
    results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []

    for item, result in zip(items, results):
        frame = item['frame'].copy()
        ch_no = item.get('ch_no', 'unknown')
        
        # 2. Add Scene Classification
        scene_labels = classify_scene(frame)
        
        names = result.names
        phone_count = 0
        phone_detected = False

        for box in result.boxes:
            cls_id = int(box.cls[0])
            if names[cls_id] == "cell phone":
                phone_detected = True
                phone_count += 1
                
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cv2.rectangle(frame, (x1,y1), (x2,y2), (0,0,255), 2)
                conf = float(box.conf[0])
                cv2.putText(frame, f"Phone {conf:.2f}", (x1, y1-10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

        # 3. Add Overlays
        cv2.putText(frame, f"Scene: {', '.join(scene_labels[:2])}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"Phones: {phone_count}", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"CH: {ch_no}", (10, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        outputs.append((frame, phone_detected, phone_count))

    return outputs


# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402

