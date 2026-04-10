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

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# ================= CONFIG ==================
# Detection directory is parent of this file
DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT   = os.path.abspath(os.path.join(DETECTION_ROOT, "../.."))

MODEL_PATH  = os.path.join(DETECTION_ROOT, "models/yolov10m.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/phone_detection_results")

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