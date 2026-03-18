import requests
import json
import hashlib
import cv2
import time
import pandas as pd
import urllib.parse
import os
import sys
import shutil
from tqdm import tqdm
from PIL import Image
import subprocess
import uuid
import logging
from datetime import datetime
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# ============================================================
# Logging Setup
# ============================================================
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_filename = os.path.join(log_dir, f"classification_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

logger.info("="*80)
logger.info("Starting Camera Classification Process")
logger.info("="*80)

# ============================================================
# Excel Loading
# ============================================================
INPUT_EXCEL = "sheet.xlsx"
PREFERRED_SHEET = "sheet1"
SCENE_COLUMN_TARGET = "scence classification"
SUCCESS_STATUS_CODES = {200, 401}
AUTH_MAX_ATTEMPTS = 3
AUTH_URL = "https://d11.camview.io/admin/API/accounts/authorize"

# Performance optimization constants
RTSP_TIMEOUT_MS = 5000  # 5 seconds timeout for RTSP streams
MAX_RETRY_ATTEMPTS = 1  # Only 1 retry attempt

excel_file = pd.ExcelFile(INPUT_EXCEL)
EXCEL_SHEET = None
df = None

for sheet_name in excel_file.sheet_names:
    temp_df = excel_file.parse(sheet_name)
    temp_df.columns = [col.strip() for col in temp_df.columns]
    if any(col.lower() == SCENE_COLUMN_TARGET.lower() for col in temp_df.columns):
        df = temp_df
        EXCEL_SHEET = sheet_name
        break

if df is None:
    fallback_sheet = PREFERRED_SHEET if PREFERRED_SHEET in excel_file.sheet_names else excel_file.sheet_names[0]
    df = excel_file.parse(fallback_sheet)
    df.columns = [col.strip() for col in df.columns]
    EXCEL_SHEET = fallback_sheet

df["Device ID"] = df["Device ID"].astype(str).str.strip()

scene_column = next((col for col in df.columns if col.lower() == SCENE_COLUMN_TARGET.lower()), None)
if scene_column is None:
    scene_column = SCENE_COLUMN_TARGET
    df[scene_column] = pd.NA

SCENE_COLUMN_NAME = scene_column

# Add Status column if not present
if "Status" not in df.columns:
    df["Status"] = ""
else:
    df["Status"] = df["Status"].fillna("")

device_ids = df["Device ID"].unique().tolist()

device_camera_map = {
    device_id: sorted(df[df["Device ID"] == device_id]["Camera No"].tolist())
    for device_id in device_ids
}


def parse_json_response(response, context):
    logger.info(f"Parsing JSON response for context: {context}")
    try:
        parsed_data = json.loads(response.content.decode("utf-8"))
        logger.debug(f"[{context}] Parsed JSON response: {json.dumps(parsed_data, indent=2)}")
        return parsed_data
    except Exception as exc:
        logger.error(f"Failed to parse JSON for {context}: {exc}")
        logger.error(f"Raw response text: {getattr(response, 'text', 'N/A')}")
        sys.exit(1)


def extract_rtsp_urls(api_data):
    urls = []
    for key in ("url", "url2"):
        raw = api_data.get(key)
        if not raw:
            continue
        parts = [part.strip() for part in raw.split('|') if part.strip()]
        urls.extend(parts)
    return urls

# ============================================================
# DSS Authentication
# ============================================================
def generate_signature(userName, password, realm, randomKey):
    temp = hashlib.md5(password.encode()).hexdigest()
    temp = hashlib.md5((userName + temp).encode()).hexdigest()
    temp = hashlib.md5(temp.encode()).hexdigest()
    temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
    return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()

def make_api_call(url, payload, headers):
    try:
        logger.info(f"Making API call to: {url}")
        logger.debug(f"Request payload: {json.dumps(payload, indent=2)}")
        logger.debug(f"Request headers: {json.dumps(headers, indent=2)}")
        
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        
        logger.info(f"Response status code: {response.status_code}")
        logger.debug(f"Response headers: {dict(response.headers)}")
        
        if response.status_code in SUCCESS_STATUS_CODES:
            logger.info(f"Response status {response.status_code} treated as success")
        else:
            logger.warning(f"Response status {response.status_code} not in success codes")
            
        try:
            logger.debug(f"Response content: {response.text[:1000]}")
        except:
            logger.debug("Could not log response content")
            
        return response
    except Exception as e:
        logger.error(f"API request failed: {e}", exc_info=True)
        return None

def authenticate(max_attempts=AUTH_MAX_ATTEMPTS):
    logger.info("Starting authentication process")
    headers = {"Content-Type": "application/json"}
    payload = {"userName": "system", "ipAddress": "", "clientType": "WINPC_V1"}

    for attempt in range(1, max_attempts + 1):
        logger.info(f"Authentication attempt {attempt}/{max_attempts}")
        res = make_api_call(AUTH_URL, payload, headers)

        resp_json = parse_json_response(res, "initial authorization")
        if resp_json.get("code") not in (None, 1000):
            logger.warning(f"Initial authorization returned error code: {resp_json.get('code')}")
            logger.debug(f"Full response: {resp_json}")
            continue

        required_fields = ["realm", "randomKey", "publickey"]
        missing = [field for field in required_fields if field not in resp_json]
        if missing:
            logger.warning(f"Missing required fields {missing} in authorization response")
            logger.debug(f"Response received: {resp_json}")
            continue

        realm = resp_json["realm"]
        randomKey = resp_json["randomKey"]
        publicKey = resp_json["publickey"]
        cookie = res.headers.get("Set-Cookie", "")
        
        logger.info(f"Received auth parameters - realm: {realm}, randomKey: {randomKey[:20]}...")
        logger.debug(f"Cookie received: {cookie[:100]}..." if cookie else "No cookie")

        sig = generate_signature("system", "Coreiseven@@", realm, randomKey)
        logger.debug(f"Generated signature: {sig[:20]}...")
        
        payload2 = {
            "mac": "",
            "signature": sig,
            "userName": "system",
            "randomKey": randomKey,
            "publicKey": publicKey,
            "encryptType": "MD5",
            "ipAddress": "",
            "clientType": "WINPC_V1",
            "userType": "0"
        }


        headers2 = {"Content-Type": "application/json", "Cookie": cookie}
        logger.info("Sending token exchange request")
        res2 = make_api_call(AUTH_URL, payload2, headers2)
        if not res2:
            logger.warning("No response for signature authorization, retrying…")
            continue

        resp_json2 = parse_json_response(res2, "token exchange")
        if resp_json2.get("code") not in (None, 1000):
            logger.warning(f"Token exchange returned error code: {resp_json2.get('code')}")
            logger.debug(f"Full response: {resp_json2}")
            continue

        token = resp_json2.get("token")
        if token:
            logger.info(f"Authentication successful! Token received: {token[:20]}...")
            return token

        logger.warning(f"Token missing in token exchange response")
        logger.debug(f"Response: {resp_json2}")

    logger.error("Authentication failed after maximum attempts")
    sys.exit(1)


# Global token and timestamp tracking
token = authenticate()
token_timestamp = time.time()
TOKEN_EXPIRY_SECONDS = 90  # Refresh token after 90 seconds (before 2-min expiry)
token_lock = threading.Lock()  # Thread-safe token access

def refresh_token_if_needed():
    """Check if token needs refresh and refresh if necessary (thread-safe)"""
    global token, token_timestamp
    
    with token_lock:
        elapsed = time.time() - token_timestamp
        if elapsed > TOKEN_EXPIRY_SECONDS:
            logger.warning(f"Token expired ({elapsed:.0f}s elapsed). Re-authenticating...")
            token = authenticate()
            token_timestamp = time.time()
            logger.info(f"Token refreshed successfully")
        return token

# ============================================================
# RTSP Stream
# ============================================================
def start_video_stream(device_id, camera_no, token):
    logger.info(f"Starting video stream for Device ID: {device_id}, Camera No: {camera_no}")
    url = f"https://d11.camview.io/admin/API/MTS/Video/StartVideo?token={token}"
    headers = {"Content-Type": "application/json", "X-Subject-Token": token}

    payload = {
        "clientType": "WINPC_V1",
        "project": "PSDK",
        "method": "MTS.Video.StartVideo",
        "data": {
            "streamType": "1",
            "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
            "channelId": f"{device_id}$1$0${camera_no}",
            "dataType": "2",
            "enableRtsps": "0"
        }
    }

    res = make_api_call(url, payload, headers)
    logger.debug(f"Start video stream response object: {res}")
    
    if not res:
        logger.error(f"Failed to start video stream for Device ID {device_id}, Camera No {camera_no}")
        logger.error(f"Response status: No response")
        return None, None
    
    # Check if token expired (401 error)
    if res.status_code == 401:
        logger.warning(f"Got 401 Unauthorized - token expired for Device ID {device_id}, Camera No {camera_no}")
        return None, None
    
    if res.status_code not in SUCCESS_STATUS_CODES:
        logger.error(f"Failed to start video stream for Device ID {device_id}, Camera No {camera_no}")
        logger.error(f"Response status: {res.status_code}")
        return None, None

    resp_json = parse_json_response(res, f"start video stream - Device {device_id} Camera {camera_no}")
    data = resp_json.get("data")
    if not data:
        logger.error(f"Missing 'data' in video stream response for Device ID {device_id}, Camera No {camera_no}")
        logger.debug(f"Full response: {resp_json}")
        return None, None

    urls = extract_rtsp_urls(data)
    if not urls:
        logger.error(f"No RTSP URLs returned for Device ID {device_id}, Camera No {camera_no}")
        logger.debug(f"Data received: {data}")
        return None, None

    logger.info(f"Extracted {len(urls)} RTSP URL(s) for Device ID {device_id}, Camera No {camera_no}")
    for i, url in enumerate(urls, 1):
        logger.debug(f"RTSP URL {i}: {url}")

    stream_token = data.get("token") or token
    if not data.get("token"):
        logger.warning(f"Stream token missing for Device ID {device_id}, Camera No {camera_no}; using session token")
    else:
        logger.info(f"Stream token received: {stream_token[:20]}...")

    return urls, stream_token

def add_token_to_url(rtsp_url, token):
    parsed = urllib.parse.urlparse(rtsp_url)
    query = urllib.parse.parse_qs(parsed.query)
    query['token'] = [token]
    return urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query, doseq=True)))

# ============================================================
# Frame Saving + VLM Classification
# ============================================================
def save_frame(frame, device_id, camera_no):
    save_dir = f"frames/{device_id}/{camera_no}"
    os.makedirs(save_dir, exist_ok=True)

    save_path = f"{save_dir}/frame.jpg"
    cv2.imwrite(save_path, frame)

    return save_path


def classify_with_vlm(image_path):
    """
    Uses Ollama-installed Vision Model (e.g., qwen2-vl or llava) for scene classification.
    """
    logger.info(f"Starting VLM classification for image: {image_path}")

    # === CATEGORY DEFINITIONS ===
    CATEGORIES = [
        "Server Room",
        "Outdoor Scene",
        "Outside Area",
        "Parking Lot",
        "Entry",
        "Computer Lab"
    ]

    PROMPT = f"""
    You are an expert computer vision classifier.
    Classify the given image into one of the following categories:

    {', '.join(CATEGORIES)}.

    Rules:
    - "Server Room": small room with limited visibility with laptop or computers.
    - "Computer Lab": large room with many computers, chairs, people or desks.
    - "Outdoor Scene": nature, roads, gardens, sky, trees.
    - "Outside Area": surroundings of a building, campus, boundary,hallway, outdoor environment.
    - "Parking Lot": cars, bikes, open area with marked spaces or vehicles.
    - "Entry": building entrances, gates, doors, signboards, or main access points.

    Return **only** the JSON response with:
    {{
    "category": "<one of the above categories>",
    "reason": "<short explanation>"
    }}
    """

    url = "http://localhost:11434/api/generate"
    
    # Read and encode the image to base64
    try:
        with open(image_path, 'rb') as image_file:
            image_data = base64.b64encode(image_file.read()).decode('utf-8')
        logger.debug(f"Image successfully encoded to base64 (length: {len(image_data)})")
    except Exception as e:
        logger.error(f"Failed to read and encode image: {e}", exc_info=True)
        return "Uncertain"
    
    payload = {
        "model": "qwen3-vl:8b",     # change to your installed model name
        "prompt": PROMPT,
        "images": [image_data],
        "stream": False
    }

    try:
        logger.debug(f"Sending VLM request to: {url}")
        logger.debug(f"VLM payload model: {payload['model']}, prompt length: {len(PROMPT)}, image data length: {len(image_data)}")
        
        response = requests.post(url, json=payload, timeout=30)  # Reduced from 60s to 30s
        
        logger.info(f"VLM response status: {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"VLM request failed with status {response.status_code}")
            logger.debug(f"VLM error response: {response.text}")
            return "Uncertain"
        
        response_json = response.json()
        logger.debug(f"VLM full response: {json.dumps(response_json, indent=2)}")
        
        result = response_json.get("response", "").strip()
        logger.info(f"VLM classification result: {result}")
        
        if not result:
            logger.warning("VLM returned empty result")
            return "Uncertain"
        
        # Parse JSON response and extract only the category
        try:
            result_json = json.loads(result)
            category = result_json.get("category", "Uncertain")
            logger.info(f"Extracted category: {category}")
            return category
        except json.JSONDecodeError:
            logger.warning(f"Could not parse JSON response, returning raw result")
            return result
    except Exception as e:
        logger.error(f"VLM request failed: {e}", exc_info=True)
        return "Uncertain"


def capture_frame_with_opencv(rtsp_url, token, device_id, camera_no, timeout_ms=RTSP_TIMEOUT_MS):
    logger.info(f"Capturing frame with OpenCV for Device {device_id}, Camera {camera_no}")
    tokenized_url = add_token_to_url(rtsp_url, token)
    logger.debug(f"Tokenized RTSP URL: {tokenized_url[:100]}...")
    
    cap = cv2.VideoCapture(tokenized_url, cv2.CAP_FFMPEG)
    
    # Set timeout using optimized constant
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms)

    if not cap.isOpened():
        logger.error(f"❌ FRAME CAPTURE FAILED: Failed to open stream for Device ID {device_id}, Camera No {camera_no}")
        return None

    ret, frame = cap.read()
    cap.release()

    if not ret:
        logger.error(f"❌ FRAME CAPTURE FAILED: Failed to read frame from Device ID {device_id}, Camera No {camera_no}")
        return None

    save_dir = f"frames/{device_id}/{camera_no}"
    os.makedirs(save_dir, exist_ok=True)
    img_path = f"{save_dir}/frame_{uuid.uuid4().hex}.jpg"
    cv2.imwrite(img_path, frame)
    logger.info(f"✅ FRAME CAPTURED SUCCESSFULLY: Frame saved to {img_path}")
    return img_path


def capture_frame_with_ffmpeg(rtsp_url, token, device_id, camera_no):
    logger.info(f"Attempting FFmpeg frame capture for Device {device_id}, Camera {camera_no}")
    
    if not shutil.which("ffmpeg"):
        logger.warning("ffmpeg executable not found on PATH; skipping this URL")
        return None  # Don't fall back to OpenCV - just fail fast

    tokenized_url = add_token_to_url(rtsp_url, token)
    save_dir = f"frames/{device_id}/{camera_no}"
    os.makedirs(save_dir, exist_ok=True)
    img_path = f"{save_dir}/frame_{uuid.uuid4().hex}.jpg"

    logger.info(f"Using FFmpeg to capture frame from: {tokenized_url[:100]}...")
    logger.debug(f"Output path: {img_path}")

    cmd = [
        "ffmpeg",
        "-y",
        "-rtsp_transport", "tcp",
        "-timeout", str(RTSP_TIMEOUT_MS * 1000),  # Convert ms to microseconds for ffmpeg
        "-i", tokenized_url,
        "-frames:v", "1",
        "-loglevel", "error",  # Reduce verbose output
        img_path
    ]

    try:
        logger.debug(f"Running FFmpeg command: {' '.join(cmd[:8])}...")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)  # Reduced from 20s to 10s
        
        logger.debug(f"FFmpeg stdout: {result.stdout.decode(errors='ignore')[:500]}")
        logger.debug(f"FFmpeg stderr: {result.stderr.decode(errors='ignore')[:500]}")
        
        if result.returncode != 0:
            logger.warning(f"FFmpeg exited with code {result.returncode} - URL likely not accessible")
            logger.debug(f"FFmpeg stderr: {result.stderr.decode(errors='ignore')[:500]}")
            return None  # Don't fall back - fail fast
    except FileNotFoundError:
        logger.warning("ffmpeg command not found")
        return None  # Fail fast - no fallback
    except subprocess.TimeoutExpired:
        logger.warning(f"FFmpeg timed out after 10 seconds")
        return None  # Fail fast
    except Exception as e:
        logger.error(f"FFmpeg failed: {e}")
        return None  # Fail fast

    if not os.path.exists(img_path):
        logger.warning("❌ FRAME CAPTURE FAILED: FFmpeg did not create an output frame")
        return None  # Fail fast

    logger.info(f"✅ FRAME CAPTURED SUCCESSFULLY: Frame saved with FFmpeg to {img_path}")
    return img_path


def try_capture_single_url(rtsp_url, token, device_id, camera_no, url_index):
    """Try to capture frame from a single URL (used for parallel testing)"""
    logger.debug(f"Testing RTSP URL {url_index} for Device {device_id}, Camera {camera_no}")
    img_path = capture_frame_with_ffmpeg(rtsp_url, token, device_id, camera_no)
    if img_path:
        logger.info(f"✅ Successfully captured frame using URL {url_index} for Device {device_id}, Camera {camera_no}")
    return img_path

def try_open_and_classify_rtsp_stream_parallel(rtsp_urls, token, device_id, camera_no):
    """Test all RTSP URLs in parallel and use first successful one"""
    logger.info(f"Testing {len(rtsp_urls)} RTSP URLs in parallel for Device {device_id}, Camera {camera_no}")
    
    img_path = None
    
    # Test all URLs in parallel using ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=len(rtsp_urls)) as executor:
        # Submit all URL tests simultaneously
        future_to_url = {
            executor.submit(try_capture_single_url, url, token, device_id, camera_no, idx): idx 
            for idx, url in enumerate(rtsp_urls, 1)
        }
        
        # Get the first successful result
        for future in as_completed(future_to_url):
            result = future.result()
            if result:
                img_path = result
                logger.info(f"First successful capture received for Device {device_id}, Camera {camera_no}")
                # Cancel remaining futures since we got a success
                for f in future_to_url:
                    f.cancel()
                break
    
    if not img_path:
        logger.error(f"Failed to capture frame from any URL for Device {device_id}, Camera {camera_no}")
        return None
    
    label = classify_with_vlm(img_path)
    logger.info(f"Classification complete for Device {device_id}, Camera {camera_no}: {label}")
    return label

def try_open_and_classify_rtsp_stream(rtsp_url, token, device_id, camera_no):
    """Legacy function - captures from single URL"""
    logger.info(f"Attempting to open and classify RTSP stream for Device {device_id}, Camera {camera_no}")
    logger.debug(f"RTSP URL: {rtsp_url[:100]}...")
    
    img_path = capture_frame_with_ffmpeg(rtsp_url, token, device_id, camera_no)
    if not img_path:
        logger.error(f"Failed to capture frame for Device {device_id}, Camera {camera_no}")
        return None

    label = classify_with_vlm(img_path)
    logger.info(f"Classification complete for Device {device_id}, Camera {camera_no}: {label}")
    return label
# ============================================================
# Excel Update (Optimized with batching)
# ============================================================
excel_update_queue = []  # Queue for batched updates
excel_lock = threading.Lock()  # Thread-safe Excel updates

def update_excel_in_memory(device_id, camera_no, label, status="Accessible"):
    """Update dataframe in memory without writing to disk (faster)"""
    logger.info(f"Queuing Excel update for Device ID {device_id}, Camera No {camera_no} with label: {label}, status: {status}")
    global df
    with excel_lock:
        mask = (df["Device ID"] == device_id) & (df["Camera No"] == camera_no)
        if mask.any():
            df.loc[mask, SCENE_COLUMN_NAME] = label
            df.loc[mask, "Status"] = status
            excel_update_queue.append((device_id, camera_no, label, status))
            logger.debug(f"In-memory update queued: Device ID {device_id}, Camera No {camera_no}")
        else:
            logger.warning(f"No match in Excel for Device ID {device_id}, Camera No {camera_no}")

def flush_excel_updates():
    """Write all pending updates to Excel file (batch operation)"""
    global df
    if not excel_update_queue:
        logger.info("No pending Excel updates to flush")
        return
    
    with excel_lock:
        logger.info(f"Flushing {len(excel_update_queue)} Excel updates to disk...")
        try:
            with pd.ExcelWriter(INPUT_EXCEL, engine="openpyxl", mode="a", if_sheet_exists="replace") as writer:
                df.to_excel(writer, sheet_name=EXCEL_SHEET, index=False)
            logger.info(f"✅ Successfully flushed {len(excel_update_queue)} updates to Excel")
            excel_update_queue.clear()
        except Exception as e:
            logger.error(f"Failed to flush Excel updates: {e}", exc_info=True)

def update_excel_sheet(device_id, camera_no, label, status="Accessible"):
    """Legacy function - now uses in-memory updates"""
    update_excel_in_memory(device_id, camera_no, label, status)


def create_new_sheets(output_dir="."):
    """Create 7 new Excel files with renamed columns"""
    try:
        logger.info("Creating 7 new Excel files with renamed columns...")
        
        # Filter successful classifications only
        classified_df = df[
            (df[SCENE_COLUMN_NAME] != "") & 
            (df[SCENE_COLUMN_NAME].notna()) &
            (df[SCENE_COLUMN_NAME] != "Failed to Classify")
        ].copy()
        
        # Rename columns
        new_df = classified_df[["Device ID", "Camera No", SCENE_COLUMN_NAME]].copy()
        new_df.columns = ["device_id", "camera_no", "Scene Classification"]
        
        # Split into 7 files
        total_rows = len(new_df)
        rows_per_file = (total_rows + 6) // 7  # Ceiling division
        
        logger.info(f"Total classified cameras: {total_rows}, distributing across 7 files...")
        
        for i in range(1, 8):
            start_idx = (i - 1) * rows_per_file
            end_idx = min(i * rows_per_file, total_rows)
            
            file_df = new_df.iloc[start_idx:end_idx]
            filename = os.path.join(output_dir, f"new_sheet{i}.xlsx")
            
            file_df.to_excel(filename, index=False, sheet_name="Sheet1")
            logger.info(f"✅ Created {filename} with {len(file_df)} rows")
        
        logger.info("✅ All 7 Excel files created successfully")
        
    except Exception as e:
        logger.error(f"Error creating new Excel files: {e}", exc_info=True)

# ============================================================
# Per Camera Flow (Optimized with caching)
# ============================================================
def is_camera_already_classified(device_id, camera_no):
    """Check if camera is already classified (skip re-classification)"""
    global df
    mask = (df["Device ID"] == device_id) & (df["Camera No"] == camera_no)
    if mask.any():
        existing_label = df.loc[mask, SCENE_COLUMN_NAME].values[0]
        # Check if already has a valid classification
        if pd.notna(existing_label) and existing_label != "" and existing_label != "Failed to Classify":
            logger.info(f"✓ Camera {device_id}/{camera_no} already classified as '{existing_label}' - skipping classification")
            return True, existing_label
    return False, None

def process_camera(device_id, camera_no):
    logger.info("="*60)
    logger.info(f"Processing Camera - Device ID: {device_id}, Camera No: {camera_no}")
    logger.info("="*60)
    
    # Check if already classified (optimization: skip classification but still capture frame)
    already_classified, existing_label = is_camera_already_classified(device_id, camera_no)
    
    max_retries = MAX_RETRY_ATTEMPTS  # Use optimized retry count (1 attempt)
    for attempt in range(max_retries):
        logger.info(f"Attempt {attempt+1}/{max_retries} for Device: {device_id}, Camera: {camera_no}")

        # Refresh token if needed before making API call
        current_token = refresh_token_if_needed()
        
        urls, token_new = start_video_stream(device_id, camera_no, current_token)

        if not urls or not token_new:
            logger.warning(f"Stream URL issue on attempt {attempt+1}. Retrying in 2 seconds...")
            time.sleep(2)
            continue

        # NEW: Test all URLs in parallel instead of sequentially
        if already_classified:
            # Just capture frame to mark as accessible, but skip classification
            # Test all URLs in parallel, use first success
            with ThreadPoolExecutor(max_workers=len(urls)) as executor:
                future_to_url = {
                    executor.submit(capture_frame_with_ffmpeg, url, token_new, device_id, camera_no): idx 
                    for idx, url in enumerate(urls, 1)
                }
                
                img_path = None
                for future in as_completed(future_to_url):
                    result = future.result()
                    if result:
                        img_path = result
                        # Cancel remaining futures
                        for f in future_to_url:
                            f.cancel()
                        break
                
                if img_path:
                    update_excel_sheet(device_id, camera_no, existing_label, "Accessible")
                    logger.info(f"Successfully verified Device {device_id}, Camera {camera_no} (already classified)")
                    return
        else:
            # Full classification for new cameras - test all URLs in parallel
            label = try_open_and_classify_rtsp_stream_parallel(urls, token_new, device_id, camera_no)
            if label:
                update_excel_sheet(device_id, camera_no, label, "Accessible")
                logger.info(f"Successfully processed Device {device_id}, Camera {camera_no}")
                return

        if attempt < max_retries - 1:  # Only delay if there are more attempts
            logger.warning(f"Retry delay before next attempt...")
            time.sleep(1)  # Reduced from 2s to 1s

    logger.error(f"Failed to classify Device {device_id}, Camera {camera_no} after {max_retries} attempts")
    update_excel_sheet(device_id, camera_no, "Failed to Classify", "Not Accessible")

# ============================================================
# MAIN LOOP (PARALLEL PROCESSING)
# ============================================================
logger.info("="*80)
logger.info(f"Starting main processing loop for {len(device_ids)} devices")
total_cameras = sum(len(cameras) for cameras in device_camera_map.values())
logger.info(f"Total cameras to process: {total_cameras}")
logger.info("="*80)

# Configuration for parallel processing
MAX_WORKERS = 12  # Optimized for H100 GPU + 24 CPU cores (balance between network I/O and VLM processing)
BATCH_FLUSH_SIZE = 20  # Flush Excel updates every 20 cameras

camera_counter = 0
accessible_counter = 0
not_accessible_counter = 0
counter_lock = threading.Lock()
progress_update_interval = 20  # Update progress every 20 seconds

def process_camera_with_progress(device_id, camera_no):
    """Wrapper function for parallel processing with progress tracking"""
    global camera_counter, accessible_counter, not_accessible_counter
    
    try:
        # Check final status before processing
        initial_status = None
        mask = (df["Device ID"] == device_id) & (df["Camera No"] == camera_no)
        if mask.any():
            initial_status = df.loc[mask, "Status"].values[0] if "Status" in df.columns else None
        
        process_camera(device_id, camera_no)
        
        # Check final status after processing
        final_status = None
        mask = (df["Device ID"] == device_id) & (df["Camera No"] == camera_no)
        if mask.any():
            final_status = df.loc[mask, "Status"].values[0] if "Status" in df.columns else None
        
        # Update counters (thread-safe)
        with counter_lock:
            camera_counter += 1
            
            # Update accessibility counters
            if final_status == "Accessible":
                accessible_counter += 1
            elif final_status == "Not Accessible":
                not_accessible_counter += 1
            
            current_count = camera_counter
            
            # Flush Excel updates periodically
            if current_count % BATCH_FLUSH_SIZE == 0:
                flush_excel_updates()
            
    except Exception as e:
        logger.error(f"Error processing camera {device_id}/{camera_no}: {e}", exc_info=True)
        with counter_lock:
            camera_counter += 1
            not_accessible_counter += 1

# Build list of all cameras to process
all_cameras = []
for device_id in device_ids:
    cameras = device_camera_map[device_id]
    for camera_no in cameras:
        all_cameras.append((device_id, camera_no))

logger.info(f"Starting parallel processing with {MAX_WORKERS} workers...")
print(f"\n🚀 Processing {total_cameras} cameras in parallel with {MAX_WORKERS} workers...\n")

# Progress reporting thread
stop_progress_thread = threading.Event()
start_time = time.time()

def progress_reporter():
    """Thread function that reports progress every 20 seconds"""
    while not stop_progress_thread.is_set():
        time.sleep(progress_update_interval)
        
        with counter_lock:
            current_count = camera_counter
            accessible = accessible_counter
            not_accessible = not_accessible_counter
            pending = total_cameras - current_count
        
        elapsed_time = time.time() - start_time
        progress_percent = (current_count / total_cameras) * 100 if total_cameras > 0 else 0
        
        # Create progress bar
        bar_length = 50
        filled_length = int(bar_length * current_count // total_cameras) if total_cameras > 0 else 0
        bar = '█' * filled_length + '-' * (bar_length - filled_length)
        
        # Format time
        elapsed_str = f"{int(elapsed_time // 60)}m {int(elapsed_time % 60)}s"
        
        # Create progress message
        progress_msg = (
            f"\n{'='*80}\n"
            f"PROGRESS UPDATE (Elapsed: {elapsed_str})\n"
            f"{'='*80}\n"
            f"|{bar}| {progress_percent:.1f}%\n"
            f"Completed: {current_count}/{total_cameras} cameras\n"
            f"✅ Accessible: {accessible}\n"
            f"❌ Not Accessible: {not_accessible}\n"
            f"⏳ Pending: {pending}\n"
            f"{'='*80}\n"
        )
        
        # Print to console
        print(progress_msg)
        
        # Log to file
        logger.info(f"PROGRESS: {progress_percent:.1f}% ({current_count}/{total_cameras}) | "
                   f"Accessible: {accessible} | Not Accessible: {not_accessible} | "
                   f"Pending: {pending} | Elapsed: {elapsed_str}")

# Start progress reporting thread
progress_thread = threading.Thread(target=progress_reporter, daemon=True)
progress_thread.start()

# Process cameras in parallel using ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    # Submit all tasks
    futures = [executor.submit(process_camera_with_progress, device_id, camera_no) 
               for device_id, camera_no in all_cameras]
    
    # Wait for all tasks to complete
    for future in as_completed(futures):
        try:
            future.result()  # This will raise any exceptions that occurred
        except Exception as e:
            logger.error(f"Task failed with exception: {e}", exc_info=True)

# Stop progress reporting thread
stop_progress_thread.set()
progress_thread.join(timeout=1)

# Final flush of any remaining updates
flush_excel_updates()

# Calculate final statistics
total_elapsed = time.time() - start_time
elapsed_str = f"{int(total_elapsed // 60)}m {int(total_elapsed % 60)}s"

# Print final summary
final_summary = (
    f"\n{'='*80}\n"
    f"FINAL SUMMARY\n"
    f"{'='*80}\n"
    f"Total Cameras: {total_cameras}\n"
    f"✅ Accessible: {accessible_counter}\n"
    f"❌ Not Accessible: {not_accessible_counter}\n"
    f"⏱️  Total Time: {elapsed_str}\n"
    f"📊 Success Rate: {(accessible_counter/total_cameras*100):.1f}%\n"
    f"{'='*80}\n"
)

print(final_summary)

logger.info("="*80)
logger.info("All devices processed successfully!")
logger.info(f"Log file saved to: {log_filename}")
logger.info(f"Total cameras processed: {camera_counter}/{total_cameras}")
logger.info(f"Accessible cameras: {accessible_counter}")
logger.info(f"Not accessible cameras: {not_accessible_counter}")
logger.info(f"Total time: {elapsed_str}")
logger.info("="*80)

# Create 7 new Excel files with renamed columns
logger.info("\n" + "="*80)
logger.info("Creating 7 new Excel files with renamed columns...")
logger.info("="*80)
try:
    output_dir = "data/sheets"
    os.makedirs(output_dir, exist_ok=True)
    create_new_sheets(output_dir)
except Exception as e:
    logger.error(f"Failed to create new Excel files: {e}", exc_info=True)

print("\nAll devices processed.")
print(f"Detailed logs saved to: {log_filename}")
print("✅ 7 new Excel files created in data/sheets/: new_sheet1.xlsx to new_sheet7.xlsx")
