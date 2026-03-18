import requests
import json
import hashlib
import cv2
import time
import pandas as pd
import urllib.parse
import torch
import torchvision.transforms as transforms
from torchvision import models
from PIL import Image
from ultralytics import YOLO

# === HTTP debug helper ===
def dump_response(resp, label=""):
    try:
        print(f"\n--- {label} ---")
        print("URL:", getattr(resp.request, 'method', None), resp.url)
        print("Status:", resp.status_code, getattr(resp, 'reason', ''))
        print("Headers:", dict(resp.headers))
        if "WWW-Authenticate" in resp.headers:
            print("WWW-Authenticate:", resp.headers.get("WWW-Authenticate"))
        try:
            print("JSON:", json.dumps(resp.json(), indent=2)[:2000])
        except ValueError:
            print("Text:", (resp.text or "")[:2000])
        if resp.request is not None:
            rh = dict(resp.request.headers or {})
            if "Authorization" in rh:
                rh["Authorization"] = "<redacted>"
            print("Request headers:", rh)
            body = resp.request.body
            if isinstance(body, bytes):
                body = body.decode("utf-8", errors="ignore")
            print("Request body:", (body[:2000] if body else None))
        print("--- end ---\n")
    except Exception as e:
        print("dump_response error:", e)

# === Excel: Load Device/Camera Info ===
df = pd.read_excel("SSC_12-AUG_1.1.xlsx", sheet_name="Sheet1")

# Ensure required columns exist
required_columns = [
    "lisp_idz", "Device ID", "camera_no", "camera_name", "tc_code",
    "center_name", "is_working", "status_message",
    "connection_time", "rtsp_url", "error_details", "Scene Classification"
]
for col in required_columns:
    if col not in df.columns:
        df[col] = pd.NA

df["Device ID"] = df["Device ID"].astype(str).str.strip()
device_ids = df["Device ID"].unique().tolist()

# Create device-camera mapping
device_camera_map = {}
for device_id in device_ids:
    # Fix: Use the correct column name for camera numbers
    camera_col = "Camera No" if "Camera No" in df.columns else "camera_no"
    camera_nos = df[df["Device ID"] == device_id][camera_col].tolist()
    device_camera_map[device_id] = sorted(set(camera_nos))  # Remove duplicates
print("Device to Camera Mapping:", device_camera_map)


# === DSS Authentication ===
def generate_signature(userName, password, realm, randomKey):
    temp = hashlib.md5(password.encode()).hexdigest()
    temp = hashlib.md5((userName + temp).encode()).hexdigest()
    temp = hashlib.md5(temp.encode()).hexdigest()
    temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
    return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()

def make_api_call(url, payload, headers):
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=20)
        print(f"API Response - Status Code: {response.status_code}")
        print(f"API Response - Headers: {response.headers}")
        print(f"API Response - Content: {response.text}")
        return response
    except Exception as e:
        print("Request failed:", e)
        return None


# === Login Step 1 ===
url = "https://d15.camview.io:443/admin/API/accounts/authorize"
headers = {"Content-Type": "application/json"}
payload = {"userName": "system", "ipAddress": "", "clientType": "WINPC_V1"}

res = make_api_call(url, payload, headers)
if res is None:  # Fixed: Check for None specifically
    raise Exception("Initial login request failed: No response from server")

# Accept 200 or 401 (401 is expected challenge carrying realm/randomKey)
if res.status_code not in (200, 401):
    dump_response(res, "Login step 1 error")
    raise Exception(f"Unexpected status code during login step 1: {res.status_code}")

try:
    resp_json = res.json()
except ValueError as e:
    raise Exception(f"Failed to parse login response: {e}, raw={res.text}")

realm = resp_json.get("realm")
randomKey = resp_json.get("randomKey")
publicKey = resp_json.get("publickey")
cookie = res.headers.get("Set-Cookie")

if not (realm and randomKey and publicKey):
    raise Exception(f"Login step 1 missing required fields. Response: {resp_json}")

# === Login Step 2 ===
sig = generate_signature("system", "Coreiseven@@", realm, randomKey)
payload2 = {
    "mac": '', "signature": sig, "userName": "system",
    "randomKey": randomKey, "publicKey": publicKey, "encryptType": "MD5",
    "ipAddress": "", "clientType": "WINPC_V1", "userType": "0"
}
headers2 = {"Content-Type": "application/json", "Cookie": cookie}
res2 = make_api_call(url, payload2, headers2)
if res2 is None:  # Fixed: Check for None specifically
    raise Exception("Login step 2 failed: No response from server")
if res2.status_code != 200:
    dump_response(res2, "Login step 2 error")
    raise Exception(f"Login step 2 failed with HTTP {res2.status_code}")
try:
    token = res2.json().get("token")
except ValueError as e:
    raise Exception(f"Login step 2: invalid JSON: {e}, raw={res2.text}")
if not token:
    dump_response(res2, "Login step 2 missing token")
    raise Exception("Login step 2: token missing in response")

print(f"Successfully authenticated. Token: {token[:20]}...")


# === RTSP Stream ===
def start_video_stream(device_id, camera_no, token):
    url = f"https://d15.camview.io:443/admin/API/MTS/Video/StartVideo?token={token}"
    headers = {"Content-Type": "application/json", "X-Subject-Token": token}
    payload = {
        "clientType": "WINPC_V1", "project": "PSDK", "method": "MTS.Video.StartVideo",
        "data": {
            "streamType": "1",
            "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
            "channelId": f"{device_id}$1$0${camera_no}",
            "dataType": "2",
            "enableRtsps": "0"
        }
    }
    res = make_api_call(url, payload, headers)
    if res is None or res.status_code != 200:
        if res is not None:
            dump_response(res, "StartVideo error")
        return None, None
    try:
        data = res.json().get("data")
        if not data:
            return None, None
    except ValueError:
        dump_response(res, "StartVideo non-JSON")
        return None, None
    urls = data["url"].split('|') if '|' in data["url"] else [data["url"]]
    return urls, data["token"]

def add_token_to_url(rtsp_url, token_new):
    parsed = urllib.parse.urlparse(rtsp_url)
    query = urllib.parse.parse_qs(parsed.query)
    query['token'] = [token_new]
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))


# === YOLO + Places365 Models ===
print("Loading YOLO model...")
yolo_model = YOLO("yolo11m.pt")

def load_places_model():
    print("Loading Places365 model...")
    model = models.resnet18(num_classes=365)
    checkpoint = torch.hub.load_state_dict_from_url(
        'http://places2.csail.mit.edu/models_places365/resnet18_places365.pth.tar',
        progress=True,
        map_location=torch.device('cpu')
    )
    state_dict = {str.replace(k, 'module.', ''): v for k, v in checkpoint['state_dict'].items()}
    model.load_state_dict(state_dict)
    model.eval()
    return model

places_model = load_places_model()

with open("./categories_places365.txt") as f:
    classes_places = [line.strip().split(' ')[0][3:] for line in f]

transform_places = transforms.Compose([
    transforms.Resize((256, 256)),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

print("Models loaded successfully!")


# === Scene Classification ===
def classify_single_frame(frame):
    # Places365 classification
    img_pil = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).convert("RGB")
    input_tensor = transform_places(img_pil).unsqueeze(0)
    with torch.no_grad():
        output = places_model(input_tensor)
        topk = torch.topk(output, 3)
        scene_labels = [classes_places[idx] for idx in topk[1][0]]

    # YOLO object detection
    results = yolo_model(frame, conf=0.15)[0]
    classes = [int(cls_id) for cls_id in results.boxes.cls] if results.boxes is not None else []

    chair_count = classes.count(56)
    tv_count = classes.count(62)
    laptop_count = classes.count(63)
    tvs_laptops = tv_count + laptop_count

    outdoor_scene_keywords = ["park", "campus", "field", "plaza", "street", "courtyard", "mountain", "garden", "beach", "forest", "highway"]
    is_outdoor_scene = any(keyword in label for label in scene_labels for keyword in outdoor_scene_keywords)
    outdoor_classes = [1, 2, 3, 5, 9, 14, 16, 18, 25, 28, 33, 41]
    is_outdoor_yolo = any(cls in outdoor_classes for cls in classes)

    if is_outdoor_scene or is_outdoor_yolo:
        vehicle_count = classes.count(2) + classes.count(3) + classes.count(5) + classes.count(7)
        if vehicle_count >= 1 and any(keyword in label for label in scene_labels for keyword in ["parking_lot", "street", "plaza", "highway"]):
            return "Parking Lot"
        elif any(keyword in label for label in scene_labels for keyword in ["park", "campus", "field", "courtyard", "garden", "forest"]):
            return "Outdoor Space"
        else:
            return "Outdoor Scene"

    if tvs_laptops >= 1:
        chair_to_device_ratio = chair_count / tvs_laptops if tvs_laptops > 0 else float('inf')
        if chair_to_device_ratio > 2 or tvs_laptops <= 3:
            return "Server Room"
        elif tvs_laptops >= 2:
            return "Computer Room"

    return "Uncertain"


# === Try RTSP and Classify ===
def try_open_and_classify_rtsp_stream(rtsp_url, token, device_id, camera_no):
    tokenized_url = add_token_to_url(rtsp_url, token)
    print(f"Attempting to connect to RTSP stream for Device {device_id}, Camera {camera_no}")
    
    cap = cv2.VideoCapture(tokenized_url, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        print(f"Failed to open stream: {tokenized_url}")
        return None, tokenized_url, "Stream not opened"

    ret, frame = cap.read()
    if not ret:
        cap.release()
        print("No frame received from stream")
        return None, tokenized_url, "No frame received"

    print("Frame captured successfully, classifying...")
    label = classify_single_frame(frame)
    cap.release()
    print(f"Classification result: {label}")
    return label, tokenized_url, None


# === Update Excel ===
def update_excel_sheet(device_id, camera_no, label, rtsp_url, error_details):
    global df
    cam_col = "Camera No" if "Camera No" in df.columns else ("camera_no" if "camera_no" in df.columns else None)
    if not cam_col:
        print("Warning: No camera number column found ('Camera No' or 'camera_no'). Skipping update.")
        return
    mask = (df["Device ID"] == device_id) & (df[cam_col] == camera_no)
    if mask.any():
        df.loc[mask, "Scene Classification"] = label
        df.loc[mask, "rtsp_url"] = rtsp_url
        df.loc[mask, "error_details"] = error_details
        df.loc[mask, "status_message"] = "Success" if error_details is None else "Failed"
        df.loc[mask, "is_working"] = error_details is None
        df.to_excel("Classification.xlsx", sheet_name="Sheet1", index=False)
        print(f"Updated Excel for Device {device_id}, Camera {camera_no}: {label}")


# === Process Camera ===
def process_camera(device_id, camera_no, token):
    print(f"\n=== Processing Device {device_id}, Camera {camera_no} ===")
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        print(f"Attempt {attempt}/{max_retries}")
        urls, token_new = start_video_stream(device_id, camera_no, token)
        if not urls or not token_new:
            print("Failed to get stream URLs")
            time.sleep(3)
            continue

        if len(urls) < 2:
            print("Not enough stream URLs returned")
            time.sleep(3)
            continue

        url = urls[1]  # Use second URL as per original code
        label, rtsp_url, error = try_open_and_classify_rtsp_stream(url, token_new, device_id, camera_no)
        if label:
            update_excel_sheet(device_id, camera_no, label, rtsp_url, error)
            return
        else:
            print(f"Classification failed: {error}")
            time.sleep(3)

    print(f"Max retries exceeded for Device {device_id}, Camera {camera_no}")
    update_excel_sheet(device_id, camera_no, "Failed to Classify", None, "Retries exceeded")


# === Main Loop ===
print("\n=== Starting Camera Processing ===")
total_devices = len(device_ids)
processed_devices = 0

for device_id in device_ids:
    processed_devices += 1
    print(f"\n--- Device {processed_devices}/{total_devices}: {device_id} ---")
    
    cameras = device_camera_map[device_id]
    total_cameras = len(cameras)
    
    for i, camera_no in enumerate(cameras, 1):
        print(f"Camera {i}/{total_cameras} (Camera No: {camera_no})")
        try:
            process_camera(device_id, camera_no, token)
        except Exception as e:
            print(f"Error processing Device {device_id}, Camera {camera_no}: {e}")
            update_excel_sheet(device_id, camera_no, "Error", None, str(e))

print("\n=== Process Complete ===")
print(f"Results saved to Classification.xlsx")
