"""
QP Box Detection Script (RTSP)
===============================
Detects when Question Paper (QP) box is NOT visible in strong room cameras.
The QP box is typically white/grey/brown colored and should be present in the frame.

Compatible with RTSP streaming links.
"""

import requests
import json
import hashlib
import cv2
import time
import torch
from ultralytics import YOLO
from datetime import datetime
import os
import threading
import logging
import numpy as np

# === Logging Setup ===
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# === Configuration ===
# Get current directory (scripts/detection/)
DETECTION_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(DETECTION_ROOT, '../..'))
SAVE_FOLDER = os.path.join(DETECTION_ROOT, "results/tcs_detections/qp_box_missing")
os.makedirs(SAVE_FOLDER, exist_ok=True)
COOLDOWN_TIME = 240  # 4 minutes between saves - optimized for 25 alerts/min
MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
CONFIDENCE = 0.45  # YOLO confidence threshold
MIN_BOX_AREA = 5000    # Minimum area for QP box detection (pixels)
MAX_BOX_AREA = 200000  # Maximum area for QP box detection (pixels)

# Color ranges for QP box detection (HSV)
# White/Grey/Brown color ranges
COLOR_RANGES = {
    'white': {
        'lower': np.array([0, 0, 180]),
        'upper': np.array([180, 30, 255])
    },
    'grey': {
        'lower': np.array([0, 0, 80]),
        'upper': np.array([180, 50, 180])
    },
    'brown': {
        'lower': np.array([10, 50, 50]),
        'upper': np.array([20, 255, 200])
    }
}

# Target scenes — Strong Room cameras only
TARGET_SCENES = [
    "Server Room",
    "Strong Room"
]

# ================= DB CLIENT =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_rtsp, get_rtsp_cameras  # noqa: E402


# Move model loading to a guard
yolo_model = None
def get_model():
    global yolo_model
    if yolo_model is None:
        print("Loading YOLO model...")
        yolo_model = YOLO(MODEL_PATH)
    return yolo_model

last_save_times = {}
qp_box_detections = {}  # Store QP box detection status for each camera


def detect_qp_box_color(frame, bbox):
    """
    Check if the detected box matches QP box color (white/grey/brown).
    
    Args:
        frame: Input frame
        bbox: Bounding box [x1, y1, x2, y2]
    
    Returns:
        bool: True if box matches QP box color
    """
    x1, y1, x2, y2 = map(int, bbox)
    
    # Extract ROI
    roi = frame[y1:y2, x1:x2]
    if roi.size == 0:
        return False
    
    # Convert to HSV
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    
    # Check each color range
    for color_name, color_range in COLOR_RANGES.items():
        mask = cv2.inRange(hsv, color_range['lower'], color_range['upper'])
        color_ratio = np.count_nonzero(mask) / mask.size
        
        # If more than 30% of the box matches the color, consider it a QP box
        if color_ratio > 0.3:
            return True
    
    return False


def detect_qp_box_in_frame(frame, device_id="unknown", camera_no="unknown"):
    """
    Detect if QP box is present in the frame and save if NOT found.
    
    Returns:
        tuple: (frame, qp_box_missing, detected_boxes_count)
    """
    model = get_model()
    results = model(frame, conf=CONFIDENCE, verbose=False)[0]
    
    # Look for objects that could be boxes (class IDs: 24=backpack, 25=umbrella, 26=handbag, 28=suitcase, 73=book, 84=book)
    box_class_ids = [24, 25, 26, 28, 73, 84]  # Potential box-like objects
    
    detected_boxes = []
    qp_box_found = False
    
    for box in results.boxes:
        class_id = int(box.cls[0])
        conf = float(box.conf[0])
        
        if class_id in box_class_ids and conf >= CONFIDENCE:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            area = (x2 - x1) * (y2 - y1)
            
            # Check if size is appropriate for QP box
            if MIN_BOX_AREA <= area <= MAX_BOX_AREA:
                # Check color
                if detect_qp_box_color(frame, [x1, y1, x2, y2]):
                    detected_boxes.append({
                        'bbox': [x1, y1, x2, y2],
                        'conf': conf,
                        'class_id': class_id,
                        'area': area
                    })
                    qp_box_found = True
                    # Draw bounding box for detected QP box
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    label = f"QP Box {conf:.2f}"
                    cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    
    # Add detection info to frame
    y_offset = 30
    status_text = "QP BOX PRESENT" if qp_box_found else "QP BOX MISSING!"
    status_color = (0, 255, 0) if qp_box_found else (0, 0, 255)
    cv2.putText(frame, status_text, (10, y_offset), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
    y_offset += 30
    cv2.putText(frame, f"Device: {device_id}, Cam: {camera_no}", (10, y_offset), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    y_offset += 30
    cv2.putText(frame, f"Boxes Detected: {len(detected_boxes)}", (10, y_offset), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # Save frame if QP box is NOT detected and cooldown period passed
    key = f"{device_id}_{camera_no}"
    now = time.time()
    time_elapsed = now - last_save_times.get(key, 0)

    qp_box_missing = not qp_box_found
    if qp_box_missing and time_elapsed >= COOLDOWN_TIME:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{SAVE_FOLDER}/qp_box_missing_{key}_{timestamp}.jpg"
        cv2.imwrite(filename, frame)
        last_save_times[key] = now
        logging.warning(f"[Device {device_id} - Camera {camera_no}] 🚨 QP BOX MISSING & saved: {filename}")
        
        # Report to DB
        try:
            report_to_db_rtsp(
                device_id=device_id,
                camera_no=str(camera_no),
                image_name=os.path.basename(filename),
                folder="qp_box_missing"
            )
        except Exception as e:
            logging.error(f"[Device {device_id} - Camera {camera_no}] DB Reporting Error: {e}")
            
    elif qp_box_missing:
        remaining = int(COOLDOWN_TIME - time_elapsed)
        logging.info(f"[Device {device_id} - Camera {camera_no}] ⏳ QP box missing but cooldown active ({remaining}s left)")

    # Update QP box detection status for this camera
    qp_box_detections[key] = qp_box_found
    
    return frame, qp_box_missing, len(detected_boxes)


def load_camera_config():
    """Load camera configurations from database filtered by target scenes."""
    exam_id = os.environ.get("EXAM_ID")
    
    if not exam_id:
        logging.error("EXAM_ID environment variable is required")
        return []
    
    try:
        exam_id_int = int(exam_id)
        
        # Fetch RTSP cameras from database
        rows = get_rtsp_cameras(exam_id_int)
        
        if not rows:
            logging.warning(f"No RTSP cameras found for exam_id={exam_id_int}")
            return []
        
        # Filter for Strong Room or Server Room cameras
        camera_configs = []
        for row in rows:
            classification = str(row.get("classification") or "")
            
            # Only include cameras with target scene classifications
            if classification in TARGET_SCENES:
                device_id = str(row.get("device_id") or "").strip()
                camera_no = str(row.get("camera_no") or "").strip()
                cctv_url = str(row.get("cctv_url") or "").strip()
                
                if device_id and camera_no and cctv_url:
                    camera_configs.append({
                        'device_id': device_id,
                        'camera_no': camera_no,
                        'cctv_url': cctv_url,
                        'classification': classification,
                        'camera_name': row.get('camera_name', ''),
                        'centre_name': row.get('centre_name', ''),
                        'city': row.get('city', ''),
                        'state': row.get('state', ''),
                        'tc_code': row.get('tc_code', ''),
                    })
        
        logging.info(f"Successfully loaded {len(camera_configs)} RTSP cameras for QP Box detection:")
        for config in camera_configs:
            logging.info(f"  Device ID: {config['device_id']}, Camera No: {config['camera_no']}, Scene: {config['classification']}")
        
        return camera_configs
        
    except ValueError:
        logging.error(f"Invalid EXAM_ID: {exam_id} (must be an integer)")
        return []
    except Exception as e:
        logging.error(f"Error loading cameras from database: {e}")
        return []


def generate_signature(userName, password, realm, randomKey):
    """Generate authentication signature."""
    temp = hashlib.md5(password.encode()).hexdigest()
    temp = hashlib.md5((userName + temp).encode()).hexdigest()
    temp = hashlib.md5(temp.encode()).hexdigest()
    temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
    signature = hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()
    return signature


def make_api_call(url, payload, headers):
    """Make API call to RTSP server."""
    response = requests.post(url, headers=headers, data=json.dumps(payload))
    return response


def process_rtsp_stream_with_qp_detection(rtsp_url, device_id, camera_no, verbose=False):
    """
    Process RTSP stream with YOLO QP box detection.
    """
    if verbose:
        logging.info(f"Starting QP box detection on RTSP stream...")
        logging.info(f"Device ID: {device_id}, Camera No: {camera_no}")
        logging.info(f"RTSP URL: {rtsp_url}")
    
    backends = [
        (cv2.CAP_FFMPEG, "FFmpeg"),
        (cv2.CAP_GSTREAMER, "GStreamer"), 
        (cv2.CAP_V4L2, "V4L2"),
        (cv2.CAP_ANY, "Any available")
    ]
    
    cap = None
    successful_backend = None
    
    for backend, backend_name in backends:
        if verbose:
            logging.info(f"Trying {backend_name} backend...")
        try:
            cap = cv2.VideoCapture(rtsp_url, backend)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
            if cap.isOpened():
                ret, test_frame = cap.read()
                if ret and test_frame is not None:
                    if verbose:
                        logging.info(f"Successfully opened RTSP stream with {backend_name} backend")
                    successful_backend = backend_name
                    break
                else:
                    if verbose:
                        logging.info(f"{backend_name} backend opened but cannot read frames")
                    cap.release()
                    cap = None
            else:
                if verbose:
                    logging.info(f"Failed to open with {backend_name} backend")
                cap.release()
                cap = None
        except Exception as e:
            if verbose:
                logging.error(f"Error with {backend_name} backend: {e}")
            if cap:
                cap.release()
                cap = None
    
    if cap is None or not cap.isOpened():
        logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to open RTSP stream: {rtsp_url}")
        return False
    
    if verbose:
        logging.info(f"Stream opened successfully with {successful_backend} backend")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if fps <= 0 or fps > 60:
        fps = 25.0
        if verbose:
            logging.info(f"Invalid FPS detected, using default: {fps}")
    if verbose:
        logging.info(f"Stream properties: {width}x{height} @ {fps} FPS")
    
    frame_count = 0
    start_time = time.time()
    fail_count = 0
    
    try:
        if verbose:
            logging.info("Starting QP box detection...")
            logging.info("Press Ctrl+C to stop")
        while True:
            ret, frame = cap.read()
            if not ret:
                logging.warning(f"[Device {device_id} - Camera {camera_no}] Failed to receive frame")
                fail_count += 1
                if fail_count >= 3:
                    logging.error(f"[Device {device_id} - Camera {camera_no}] Max retries reached, stopping")
                    break
                time.sleep(3)
                continue
            fail_count = 0
            frame_count += 1
            current_time = time.time()
            elapsed_time = current_time - start_time
            
            # Process every 5th frame
            if frame_count % 5 == 0:
                processed_frame, qp_box_missing, boxes_count = detect_qp_box_in_frame(
                    frame, device_id, camera_no
                )
                if frame_count % 50 == 0:
                    if qp_box_missing:
                        logging.warning(f"[Device {device_id} - Camera {camera_no}] 🚨 QP BOX MISSING!")
                    else:
                        logging.info(f"[Device {device_id} - Camera {camera_no}] ✅ QP Box present - Monitoring active")
            
            if frame_count % (int(fps) * 60) == 0:
                logging.info(f"[Device {device_id} - Camera {camera_no}] 🔄 Processing: {elapsed_time:.1f}s elapsed ({frame_count} frames)")
            
            time.sleep(1)  # Control processing rate
            
    except KeyboardInterrupt:
        logging.info(f"[Device {device_id} - Camera {camera_no}] Detection interrupted by user")
    except Exception as e:
        logging.error(f"[Device {device_id} - Camera {camera_no}] Error during detection: {e}")
    finally:
        if cap:
            cap.release()
        cv2.destroyAllWindows()
        total_time = time.time() - start_time
        actual_fps = frame_count / total_time if total_time > 0 else 0
        logging.info(f"[Device {device_id} - Camera {camera_no}] Detection finished!")
        logging.info(f"[Device {device_id} - Camera {camera_no}] Total frames processed: {frame_count}")
        logging.info(f"[Device {device_id} - Camera {camera_no}] Total processing time: {total_time:.2f} seconds")
        logging.info(f"[Device {device_id} - Camera {camera_no}] Actual processing FPS: {actual_fps:.2f}")
    return True


def authenticate_and_get_token():
    """Authenticate and get token for API access."""
    logging.info("Starting authentication...")
    
    url = "https://d11.camview.io:443/admin/API/accounts/authorize"
    headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Connection": "close",
        "HOST": "d11.camview.io:443"
    }
    payload = {
        "userName": "system",
        "ipAddress": "",
        "clientType": "WINPC_V1"
    }
    
    response = make_api_call(url, payload, headers)
    response_content = json.loads(response.content.decode('utf-8'))
    res_head = response.headers
    
    logging.info(f"Status Code 1: {response.status_code}")
    
    userName = "system"
    password = "Coreiseven@@"
    realm = response_content["realm"]
    randomKey = response_content["randomKey"]
    publicKey = response_content["publickey"]
    cookie = res_head['Set-Cookie']
    signature = generate_signature(userName, password, realm, randomKey)
    
    payload2 = {
        "mac": '',
        "signature": signature,
        "userName": userName,
        "randomKey": randomKey,
        "publicKey": publicKey,
        "encryptType": "MD5",
        "ipAddress": "",
        "clientType": "WINPC_V1",
        "userType": "0"
    }
    
    headers2 = {
        "Content-Type": "application/json;charset=UTF-8",
        "Connection": "close",
        "Cookie": cookie
    }
    
    response2 = make_api_call(url, payload2, headers2)
    response_content2 = json.loads(response2.content.decode('utf-8'))
    logging.info(f"Status Code 2: {response2.status_code}")
    logging.info(f"Response Content 2: {response_content2}")
    
    token = response_content2["token"]
    return token


def start_camera_detection(device_id, camera_no, token, cctv_url):
    """Start QP box detection for a specific camera."""
    logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting QP box detection...")
    
    url3 = f'https://d11.camview.io:443/admin/API/MTS/Video/StartVideo?token={token}'
    headers3 = {
        "Connection": "close",
        "Content-Type": "application/json;charset=UTF-8",
        "X-Subject-Token": token
    }
    payload3 = {
        "clientType": "WINPC_V1",
        "clientMac": '',
        "clientPushId": "",
        "project": "PSDK",
        "method": "MTS.Video.StartVideo",
        "data": {
            "streamType": "1",
            "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
            "trackId": "",
            "extend": "",
            "channelId": f"{device_id}$1$0${camera_no}",
            "keyCode": "",
            "planId": "",
            "dataType": "2",
            "enableRtsps": "0"
        }
    }
    
    try:
        response3 = make_api_call(url3, payload3, headers3)
        response_content3 = json.loads(response3.content.decode('utf-8'))
        logging.info(f"[Device {device_id} - Camera {camera_no}] Status Code 3: {response3.status_code}")
        logging.info(f"[Device {device_id} - Camera {camera_no}] Response Content 3: {response_content3}")
        
        if response3.status_code != 200 or 'data' not in response_content3:
            logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to get video stream URL")
            return
        
        rtsp_urls = []
        if '|' in response_content3['data']['url']:
            urls = response_content3['data']['url'].split('|')
            if len(urls) >= 2 and urls[1].strip():
                rtsp_url = urls[1] + '?token=' + response_content3['data']['token']
                rtsp_urls.append(rtsp_url)
            else:
                logging.info(f"[Device {device_id} - Camera {camera_no}] Second URL not available, using first URL")
                rtsp_url = urls[0] + '?token=' + response_content3['data']['token']
                rtsp_urls.append(rtsp_url)
        else:
            rtsp_url = response_content3['data']['url'] + '?token=' + response_content3['data']['token']
            rtsp_urls.append(rtsp_url)
        
        logging.info(f"[Device {device_id} - Camera {camera_no}] Found {len(rtsp_urls)} RTSP URLs:")
        for i, url in enumerate(rtsp_urls):
            logging.info(f"  {i+1}. {url}")
        
        if rtsp_urls:
            url_to_process = rtsp_urls[0]
            logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting QP box detection on RTSP URL: {url_to_process}")
            success = process_rtsp_stream_with_qp_detection(url_to_process, device_id, camera_no, verbose=False)
            if success:
                logging.info(f"Successfully processed QP box detection for camera {device_id} - Camera {camera_no}")
            else:
                logging.error(f"Failed to process RTSP stream for camera No {device_id}: Camera {camera_no}")
        else:
            logging.error(f"[Device {device_id} - Camera {camera_no}] No RTSP URLs found in the response")
            
    except Exception as e:
        logging.error(f"[Device {device_id} - Camera {camera_no}] Error during camera detection: {e}")


def main():
    """Main function to orchestrate the QP box detection process."""
    logging.info("=== RTSP QP Box Detection for Strong Room Cameras ===\n")
    
    # Load camera configurations from database
    camera_configs = load_camera_config()
    
    if not camera_configs:
        logging.error("No camera configurations found. Please check EXAM_ID and database.")
        return
    
    # Authenticate and get token
    try:
        token = authenticate_and_get_token()
        logging.info(f"Authentication successful. Token obtained.")
    except Exception as e:
        logging.error(f"Authentication failed: {e}")
        return
    
    # Start detection for all cameras in parallel
    logging.info(f"\nStarting QP box detection for {len(camera_configs)} cameras...")
    threads = []
    
    for config in camera_configs:
        device_id = config['device_id']
        camera_no = config['camera_no']
        cctv_url = config['cctv_url']
        
        t = threading.Thread(
            target=start_camera_detection, 
            args=(device_id, camera_no, token, cctv_url),
            name=f"Camera-{device_id}-{camera_no}"
        )
        t.start()
        threads.append(t)
        
        # Small delay between starting threads to avoid overwhelming the server
        time.sleep(1)
    
    logging.info(f"Started {len(threads)} camera detection threads.")
    print(f"Started {len(threads)} camera detection threads.")
    logging.info("Press Ctrl+C to stop all detections.\n")
    
    # Wait for all threads to complete
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        logging.info("\nInterrupt received. Stopping all camera detections...")
    
    logging.info("All QP box detections completed.")
    print("All QP box detections completed.")


if __name__ == "__main__":
    main()
