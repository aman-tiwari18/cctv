

#initial
# import requests
# import json
# import cv2
# import time
# import pandas as pd
# import os
# import sys
# import shutil
# from tqdm import tqdm
# from PIL import Image
# import subprocess
# import uuid
# import logging
# from datetime import datetime
# import base64
# from concurrent.futures import ThreadPoolExecutor, as_completed
# import threading
# import re
# import queue
# from collections import defaultdict
# import numpy as np

# # ============================================================
# # Logging Setup
# # ============================================================
# log_dir = "logs"
# os.makedirs(log_dir, exist_ok=True)
# log_filename = os.path.join(log_dir, f"tcs_classification_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

# logging.basicConfig(
#     level=logging.DEBUG,
#     format='%(asctime)s - %(levelname)s - %(message)s',
#     handlers=[
#         logging.FileHandler(log_filename),
#         logging.StreamHandler()
#     ]
# )
# logger = logging.getLogger(__name__)

# logger.info("="*80)
# logger.info("Starting TCS Camera Classification Process - OPTIMIZED VERSION")
# logger.info("="*80)

# # ============================================================
# # Configuration - OPTIMIZED SETTINGS
# # ============================================================
# # Performance settings
# MAX_WORKERS_NETWORK = 64  # High parallelism for network I/O
# MAX_WORKERS_VLM = 4       # Concurrent VLM requests (GPU limited)
# CHECKPOINT_INTERVAL = 500  # Save progress every N cameras

# # Timeout settings (reduced for speed)
# TIMEOUT_EXTRACT_URL = 3    # Extract HLS URL timeout (seconds)
# TIMEOUT_TEST_STREAM = 3    # Test stream accessibility timeout (seconds)
# TIMEOUT_OPENCV = 3000      # OpenCV timeout (milliseconds)
# TIMEOUT_FFMPEG = 5         # FFmpeg timeout (seconds)
# TIMEOUT_VLM = 60           # VLM classification timeout (seconds)

# # Processing mode
# TWO_PASS_MODE = True       # Enable two-pass processing for efficiency
# RESUME_FROM_CHECKPOINT = True  # Resume from last checkpoint if exists

# # ============================================================
# # Excel Loading - TCS Format
# # ============================================================
# # INPUT_EXCEL = "28 Jan Shift 2 - CDIS.xlsx"
# INPUT_EXCEL = "/home/suvam/projects/cctv/cctv-analytics-system/cctv_classfication/CCTV Camera Report_CUET (PG) - 2026 06th March 2026 - IITK.xlsx"
# SCENE_COLUMN_TARGET = "Scene Classification"
# CHECKPOINT_FILE = "checkpoint_progress.json"

# # Check if input file exists
# if not os.path.exists(INPUT_EXCEL):
#     logger.error(f"Input Excel file not found: {INPUT_EXCEL}")
#     logger.error("Please ensure the TCS Excel file is placed at the correct location")
#     sys.exit(1)

# # Load Excel file
# try:
#     excel_file = pd.ExcelFile(INPUT_EXCEL)
#     logger.info(f"Loaded Excel file: {INPUT_EXCEL}")
#     logger.info(f"Available sheets: {excel_file.sheet_names}")
    
#     # Use the first sheet
#     EXCEL_SHEET = excel_file.sheet_names[0]
#     df = excel_file.parse(EXCEL_SHEET)
#     df.columns = [col.strip() for col in df.columns]

#     print(df.columns)     # columns check karne ke liye
#     print(df.head())      # first rows dekhne ke liye
    
#     logger.info(f"Using sheet: {EXCEL_SHEET}")
#     logger.info(f"Columns found: {list(df.columns)}")
    
#     # Expected columns: CCTV URL, Center Name, Camera Location, etc.
#     # Add Scene Classification and Status columns if not present
#     if SCENE_COLUMN_TARGET not in df.columns:
#         df[SCENE_COLUMN_TARGET] = pd.NA
    
#     if "Status" not in df.columns:
#         df["Status"] = ""
#     else:
#         df["Status"] = df["Status"].fillna("")
    
#     # Add Status Detail column for uncertain/obstructed cameras
#     if "Status Detail" not in df.columns:
#         df["Status Detail"] = ""
    
#     # Add a unique ID column for tracking
#     if "Row_ID" not in df.columns:
#         df["Row_ID"] = range(len(df))
    
#     logger.info(f"Total rows in Excel: {len(df)}")
#     logger.info(f"Optimized settings: {MAX_WORKERS_NETWORK} network workers, {MAX_WORKERS_VLM} VLM workers")
#     logger.info(f"Timeouts: Extract={TIMEOUT_EXTRACT_URL}s, Test={TIMEOUT_TEST_STREAM}s, OpenCV={TIMEOUT_OPENCV}ms, FFmpeg={TIMEOUT_FFMPEG}s")
    
# except Exception as e:
#     logger.error(f"Failed to load Excel file: {e}", exc_info=True)
#     sys.exit(1)

# # ============================================================
# # HLS Stream URL Processing - OPTIMIZED
# # ============================================================
# def extract_hls_streaming_url(initial_url, timeout=None):
#     """
#     Extract the actual HLS streaming URL from the initial TCS URL (OPTIMIZED)
    
#     Args:
#         initial_url: The URL from the Excel file (CCTV URL column)
#         timeout: Request timeout in seconds (uses global TIMEOUT_EXTRACT_URL if None)
    
#     Returns:
#         The actual HLS streaming URL, or None if extraction fails
#     """
#     if timeout is None:
#         timeout = TIMEOUT_EXTRACT_URL
    
#     logger.debug(f"Extracting HLS URL: {initial_url[:80]}...")
    
#     try:
#         # Make request to the initial URL
#         response = requests.get(initial_url, timeout=timeout, allow_redirects=True)
        
#         if response.status_code != 200:
#             logger.debug(f"Initial URL failed with status {response.status_code}")
#             return None
        
#         # Method 1: Look for .m3u8 URL in the response text
#         m3u8_pattern = r'https?://[^\s<>"]+?\.m3u8[^\s<>"]*'
#         matches = re.findall(m3u8_pattern, response.text)
        
#         if matches:
#             streaming_url = matches[0]
#             logger.debug(f"✅ Found HLS URL: {streaming_url[:80]}...")
#             return streaming_url
        
#         # Method 2: Look for URL in JSON response
#         try:
#             json_data = response.json()
#             if isinstance(json_data, dict):
#                 for key in ['url', 'stream_url', 'hls_url', 'playback_url', 'streaming_url']:
#                     if key in json_data:
#                         streaming_url = json_data[key]
#                         logger.debug(f"✅ Found HLS URL in JSON: {streaming_url[:80]}...")
#                         return streaming_url
#         except:
#             pass
        
#         # Method 3: Extract quoted .m3u8 URLs
#         if '.m3u8' in response.text:
#             pattern = r'(["\'])(https?://[^"\']+\.m3u8[^"\']*)(["\'])'
#             matches = re.findall(pattern, response.text)
#             if matches:
#                 streaming_url = matches[0][1]
#                 logger.debug(f"✅ Found HLS URL (quoted): {streaming_url[:80]}...")
#                 return streaming_url
        
#         logger.debug("No HLS URL found in response")
#         return None
        
#     except requests.exceptions.Timeout:
#         logger.debug(f"Timeout accessing URL after {timeout}s")
#         return None
#     except Exception as e:
#         logger.debug(f"Failed to extract HLS URL: {e}")
#         return None


# def test_hls_stream(hls_url, timeout=None):
#     """
#     Test if the HLS stream is accessible (OPTIMIZED)
    
#     Args:
#         hls_url: The HLS streaming URL (.m3u8)
#         timeout: Request timeout in seconds (uses global TIMEOUT_TEST_STREAM if None)
    
#     Returns:
#         Tuple: (is_accessible, status_code)
#     """
#     if timeout is None:
#         timeout = TIMEOUT_TEST_STREAM
    
#     logger.debug(f"Testing HLS: {hls_url[:80]}...")
    
#     try:
#         response = requests.get(hls_url, timeout=timeout, stream=True)
        
#         if response.status_code == 200:
#             logger.debug("✅ HLS stream accessible")
#             return True, 200
#         else:
#             logger.debug(f"HLS stream status: {response.status_code}")
#             return False, response.status_code
            
#     except Exception as e:
#         logger.debug(f"HLS stream test failed: {e}")
#         return False, None


# # ============================================================
# # Frame Capture from HLS Stream - OPTIMIZED
# # ============================================================
# def capture_frame_from_hls(hls_url, row_id, skip_ffmpeg=False, timeout_ms=None):
#     """
#     Capture a frame from HLS stream (OPTIMIZED with smart bailout)
    
#     Args:
#         hls_url: The HLS streaming URL (.m3u8)
#         row_id: Unique identifier for this camera
#         skip_ffmpeg: Skip FFmpeg fallback (for known bad streams)
#         timeout_ms: Timeout in milliseconds (uses global TIMEOUT_OPENCV if None)
    
#     Returns:
#         Path to saved frame image, or None if capture fails
#     """
#     if timeout_ms is None:
#         timeout_ms = TIMEOUT_OPENCV
    
#     logger.debug(f"Capturing frame for Row ID {row_id}")
    
#     # Try with OpenCV first
#     img_path = capture_frame_with_opencv_hls(hls_url, row_id, timeout_ms)
    
#     if img_path:
#         return img_path
    
#     # Skip FFmpeg if we know the stream is bad (404, 502, etc.)
#     if skip_ffmpeg:
#         logger.debug("Skipping FFmpeg (stream known bad)")
#         return None
    
#     # Fallback to FFmpeg
#     logger.debug("OpenCV failed, trying FFmpeg...")
#     img_path = capture_frame_with_ffmpeg_hls(hls_url, row_id)
    
#     return img_path


# def capture_frame_with_opencv_hls(hls_url, row_id, timeout_ms):
#     """Capture frame using OpenCV (OPTIMIZED)"""
#     try:
#         cap = cv2.VideoCapture(hls_url)
        
#         # Set aggressive timeouts
#         cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
#         cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms)
        
#         if not cap.isOpened():
#             logger.debug(f"OpenCV failed to open stream for Row ID {row_id}")
#             return None
        
#         # Read frame
#         ret, frame = cap.read()
#         cap.release()
        
#         if not ret or frame is None:
#             logger.debug(f"OpenCV failed to read frame for Row ID {row_id}")
#             return None
        
#         # Save frame
#         save_dir = f"frames/tcs/{row_id}"
#         os.makedirs(save_dir, exist_ok=True)
#         img_path = f"{save_dir}/frame_{uuid.uuid4().hex}.jpg"
#         cv2.imwrite(img_path, frame)
        
#         logger.debug(f"✅ Frame captured with OpenCV: {img_path}")
#         return img_path
        
#     except Exception as e:
#         logger.debug(f"OpenCV capture failed: {e}")
#         return None


# def capture_frame_with_ffmpeg_hls(hls_url, row_id):
#     """Capture frame using FFmpeg (OPTIMIZED)"""
#     if not shutil.which("ffmpeg"):
#         logger.debug("ffmpeg not found")
#         return None
    
#     save_dir = f"frames/tcs/{row_id}"
#     os.makedirs(save_dir, exist_ok=True)
#     img_path = f"{save_dir}/frame_{uuid.uuid4().hex}.jpg"
    
#     cmd = [
#         "ffmpeg",
#         "-y",
#         "-timeout", str(TIMEOUT_FFMPEG * 1000000),  # Convert to microseconds
#         "-i", hls_url,
#         "-frames:v", "1",
#         "-loglevel", "error",
#         img_path
#     ]
    
#     try:
#         result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, 
#                               timeout=TIMEOUT_FFMPEG)
        
#         if result.returncode != 0 or not os.path.exists(img_path):
#             logger.debug(f"FFmpeg failed for Row ID {row_id}")
#             return None
        
#         logger.debug(f"✅ Frame captured with FFmpeg: {img_path}")
#         return img_path
        
#     except subprocess.TimeoutExpired:
#         logger.debug(f"FFmpeg timed out for Row ID {row_id}")
#         return None
#     except Exception as e:
#         logger.debug(f"FFmpeg error: {e}")
#         return None


# # ============================================================
# # VLM Classification - OPTIMIZED with Grey/Obstruction Detection
# # ============================================================

# # Global VLM queue for batch processing
# vlm_queue = queue.Queue()
# vlm_results = {}
# vlm_results_lock = threading.Lock()

# def is_grey_or_obstructed(image_path):
#     """
#     Quick check if image is grey screen or heavily obstructed
#     Returns: (is_problematic, reason)
#     """
#     try:
#         img = cv2.imread(image_path)
#         if img is None:
#             return True, "Failed to read image"
        
#         # Convert to grayscale
#         gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
#         # Check 1: Nearly uniform color (grey screen)
#         std_dev = gray.std()
#         if std_dev < 5:  # Very low variance = uniform grey
#             return True, "Uniform grey screen"
        
#         # Check 2: Very dark image (camera blocked)
#         mean_brightness = gray.mean()
#         if mean_brightness < 10:
#             return True, "Very dark/blocked camera"
        
#         # Check 3: Very bright image (overexposed/white)
#         if mean_brightness > 245:
#             return True, "Overexposed/white screen"
        
#         # Check 4: Low detail (blurry/obstructed)
#         laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
#         if laplacian_var < 10:
#             return True, "Low detail/obstructed"
        
#         return False, None
        
#     except Exception as e:
#         logger.debug(f"Grey check failed: {e}")
#         return False, None


# def classify_with_vlm(image_path):
#     """
#     Uses Ollama Vision Model for scene classification (OPTIMIZED)
#     Includes detection for grey/obstructed cameras
#     """
#     logger.debug(f"VLM classification: {image_path}")
    
#     # Quick pre-check for grey/obstructed images
#     is_bad, reason = is_grey_or_obstructed(image_path)
#     if is_bad:
#         logger.debug(f"Image flagged as problematic: {reason}")
#         return "Uncertain/Obstructed", reason

#     # === CATEGORY DEFINITIONS ===
#     CATEGORIES = [
#         "Server Room",
#         "Outdoor Scene",
#         "Outside Area",
#         "Parking Lot",
#         "Entry",
#         "Computer Lab"
#     ]

#     PROMPT = f"""You are an expert computer vision classifier.
# Classify the given image into one of the following categories:

# {', '.join(CATEGORIES)}.

# Rules:
# - "Server Room": small room with limited visibility with laptop or computers.
# - "Computer Lab": large room with many computers, chairs, people or desks.
# - "Outdoor Scene": nature, roads, gardens, sky, trees.
# - "Outside Area": surroundings of a building, campus, boundary, hallway, outdoor environment.
# - "Parking Lot": cars, bikes, open area with marked spaces or vehicles.
# - "Entry": building entrances, gates, doors, signboards, or main access points.

# If the image is grey, blank, heavily obstructed, or unclear, respond with "Uncertain".

# Return **only** the JSON response:
# {{"category": "<one of the above categories or Uncertain>", "reason": "<short explanation>"}}"""

#     url = "http://localhost:11434/api/generate"
    
#     # Read and encode the image to base64
#     try:
#         with open(image_path, 'rb') as image_file:
#             image_data = base64.b64encode(image_file.read()).decode('utf-8')
#     except Exception as e:
#         logger.debug(f"Failed to encode image: {e}")
#         return "Uncertain", "Failed to read image"
    
#     payload = {
#         "model": "qwen3-vl:8b",
#         "prompt": PROMPT,
#         "images": [image_data],
#         "stream": False
#     }

#     try:
#         response = requests.post(url, json=payload, timeout=TIMEOUT_VLM)
        
#         if response.status_code != 200:
#             logger.debug(f"VLM request failed: {response.status_code}")
#             return "Uncertain", "VLM request failed"
        
#         response_json = response.json()
#         result = response_json.get("response", "").strip()
        
#         if not result:
#             return "Uncertain", "Empty VLM response"
        
#         # Parse JSON response
#         try:
#             result_json = json.loads(result)
#             category = result_json.get("category", "Uncertain")
#             reason = result_json.get("reason", "")
            
#             # Check if VLM also detected uncertainty
#             if "uncertain" in category.lower() or "unclear" in category.lower():
#                 return "Uncertain/Obstructed", reason
            
#             return category, reason
#         except json.JSONDecodeError:
#             logger.debug("Could not parse VLM JSON")
#             return "Uncertain", "Invalid VLM response"
            
#     except requests.exceptions.Timeout:
#         logger.debug("VLM request timed out")
#         return "Uncertain", "VLM timeout"
#     except Exception as e:
#         logger.debug(f"VLM error: {e}")
#         return "Uncertain", str(e)


# # ============================================================
# # Excel Update & Checkpoint System (Thread-safe)
# # ============================================================
# excel_lock = threading.Lock()
# checkpoint_counter = 0

# def update_excel_in_memory(row_id, label, status, status_detail=""):
#     """Update dataframe in memory (thread-safe) with status detail"""
#     global df, checkpoint_counter
#     with excel_lock:
#         mask = df["Row_ID"] == row_id
#         if mask.any():
#             df.loc[mask, SCENE_COLUMN_TARGET] = label
#             df.loc[mask, "Status"] = status
#             df.loc[mask, "Status Detail"] = status_detail
#             logger.debug(f"Updated Row {row_id}: {status} - {label}")
            
#             # Increment checkpoint counter
#             checkpoint_counter += 1
#             if checkpoint_counter % CHECKPOINT_INTERVAL == 0:
#                 save_checkpoint()
#         else:
#             logger.warning(f"Row ID {row_id} not found")


# def save_checkpoint():
#     """Save current progress to checkpoint file"""
#     try:
#         checkpoint_data = {
#             'timestamp': datetime.now().isoformat(),
#             'processed_rows': df[df['Status'] != ''].shape[0],
#             'total_rows': len(df),
#             'dataframe': df.to_dict('records')
#         }
        
#         with open(CHECKPOINT_FILE, 'w') as f:
#             json.dump(checkpoint_data, f)
        
#         logger.info(f"✅ Checkpoint saved: {checkpoint_data['processed_rows']}/{checkpoint_data['total_rows']}")
#     except Exception as e:
#         logger.error(f"Failed to save checkpoint: {e}")


# def load_checkpoint():
#     """Load progress from checkpoint file"""
#     global df
    
#     if not os.path.exists(CHECKPOINT_FILE):
#         return False
    
#     try:
#         with open(CHECKPOINT_FILE, 'r') as f:
#             checkpoint_data = json.load(f)
        
#         logger.info(f"Found checkpoint from {checkpoint_data['timestamp']}")
#         logger.info(f"Previously processed: {checkpoint_data['processed_rows']}/{checkpoint_data['total_rows']}")
        
#         # Restore dataframe
#         df_checkpoint = pd.DataFrame(checkpoint_data['dataframe'])
        
#         # Merge with current df (in case Excel changed)
#         if len(df_checkpoint) == len(df):
#             df = df_checkpoint
#             logger.info("✅ Checkpoint loaded successfully")
#             return True
#         else:
#             logger.warning("Checkpoint size mismatch, starting fresh")
#             return False
            
#     except Exception as e:
#         logger.error(f"Failed to load checkpoint: {e}")
#         return False


# # ============================================================
# # Camera Processing - OPTIMIZED TWO-PASS STRATEGY
# # ============================================================

# def quick_accessibility_check(row):
#     """
#     PASS 1: Quick accessibility check (no frame capture, no classification)
#     Just test if we can reach the stream
    
#     Returns: (row_id, hls_url, is_accessible, error_code)
#     """
#     row_id = row['Row_ID']
#     initial_url = row.get('CCTV URL', '')
    
#     # Validate URL
#     if pd.isna(initial_url) or not initial_url.strip():
#         return (row_id, None, False, 'No URL')
    
#     try:
#         # Extract HLS URL
#         hls_url = extract_hls_streaming_url(initial_url)
#         if not hls_url:
#             return (row_id, None, False, 'Extract failed')
        
#         # Test stream
#         is_accessible, status_code = test_hls_stream(hls_url)
        
#         # Smart bailout: don't try to capture frames for known bad status codes
#         if status_code in [404, 502, 503, 500]:
#             return (row_id, hls_url, False, f'HTTP {status_code}')
        
#         if is_accessible:
#             return (row_id, hls_url, True, None)
#         else:
#             return (row_id, hls_url, False, f'Stream test failed')
            
#     except Exception as e:
#         return (row_id, None, False, str(e))


# def process_accessible_camera(row, hls_url):
#     """
#     PASS 2: Full processing for accessible cameras (capture + classify)
    
#     Args:
#         row: Pandas Series with camera data
#         hls_url: Pre-validated HLS streaming URL
    
#     Returns:
#         Dictionary with processing results
#     """
#     row_id = row['Row_ID']
    
#     result = {
#         'row_id': row_id,
#         'status': 'Accessible',
#         'label': 'Uncertain',
#         'status_detail': '',
#         'error': None
#     }
    
#     try:
#         # Capture frame (skip FFmpeg for efficiency if OpenCV fails)
#         img_path = capture_frame_from_hls(hls_url, row_id, skip_ffmpeg=False)
        
#         if not img_path:
#             result['status'] = 'Not Accessible'
#             result['label'] = 'Failed to Classify'
#             result['error'] = 'Frame capture failed'
#             result['status_detail'] = 'Could not capture frame'
#             return result
        
#         # Classify the frame
#         label, reason = classify_with_vlm(img_path)
        
#         if "Uncertain" in label or "Obstructed" in label:
#             # Mark as Accessible but Uncertain/Obstructed (Option A)
#             result['status'] = 'Accessible'
#             result['label'] = 'Uncertain/Obstructed'
#             result['status_detail'] = reason or 'Image unclear or obstructed'
#         else:
#             result['status'] = 'Accessible'
#             result['label'] = label
#             result['status_detail'] = 'Successfully classified'
        
#         return result
        
#     except Exception as e:
#         logger.error(f"Error in Pass 2 for Row {row_id}: {e}")
#         result['status'] = 'Accessible'
#         result['label'] = 'Uncertain'
#         result['status_detail'] = f'Error: {str(e)}'
#         result['error'] = str(e)
#         return result


# def process_single_camera_legacy(row):
#     """
#     LEGACY: Single-pass processing (for backwards compatibility)
#     Used when TWO_PASS_MODE = False
#     """
#     row_id = row['Row_ID']
#     initial_url = row.get('CCTV URL', '')
    
#     logger.debug("="*60)
#     logger.debug(f"Processing Row ID: {row_id}")
#     logger.debug("="*60)
    
#     result = {
#         'row_id': row_id,
#         'status': 'Not Accessible',
#         'label': 'Failed to Classify',
#         'status_detail': '',
#         'error': None
#     }
    
#     # Validate initial URL
#     if pd.isna(initial_url) or not initial_url.strip():
#         result['error'] = 'No URL provided'
#         result['status_detail'] = 'Empty URL'
#         update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
#         return result
    
#     try:
#         # Extract HLS URL
#         hls_url = extract_hls_streaming_url(initial_url)
#         if not hls_url:
#             result['error'] = 'Failed to extract HLS URL'
#             result['status_detail'] = 'URL extraction failed'
#             update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
#             return result
        
#         # Test stream
#         is_accessible, status_code = test_hls_stream(hls_url)
#         skip_ffmpeg = status_code in [404, 502, 503, 500]  # Skip FFmpeg for known bad codes
        
#         if not is_accessible:
#             result['error'] = 'HLS stream not accessible'
#             result['status_detail'] = f'HTTP {status_code}' if status_code else 'Connection failed'
#             update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
#             return result
        
#         # Capture frame
#         img_path = capture_frame_from_hls(hls_url, row_id, skip_ffmpeg=skip_ffmpeg)
#         if not img_path:
#             result['error'] = 'Frame capture failed'
#             result['status_detail'] = 'Could not capture frame'
#             update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
#             return result
        
#         # Classify
#         label, reason = classify_with_vlm(img_path)
        
#         if "Uncertain" in label or "Obstructed" in label:
#             result['status'] = 'Accessible'
#             result['label'] = 'Uncertain/Obstructed'
#             result['status_detail'] = reason or 'Image unclear'
#         else:
#             result['status'] = 'Accessible'
#             result['label'] = label
#             result['status_detail'] = 'Successfully classified'
        
#         update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
#         return result
        
#     except Exception as e:
#         logger.error(f"Error processing Row {row_id}: {e}")
#         result['error'] = str(e)
#         result['status_detail'] = 'Processing error'
#         update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
#         return result


# # ============================================================
# # Main Processing Loop - OPTIMIZED TWO-PASS STRATEGY
# # ============================================================
# def main():
#     global df
    
#     logger.info("="*80)
#     logger.info("🚀 OPTIMIZED TCS Camera Classification - TWO-PASS MODE")
#     logger.info("="*80)
#     logger.info(f"Total cameras: {len(df)}")
#     logger.info(f"Network workers: {MAX_WORKERS_NETWORK}")
#     logger.info(f"VLM workers: {MAX_WORKERS_VLM}")
#     logger.info(f"Checkpoint interval: {CHECKPOINT_INTERVAL}")
#     logger.info("="*80)
    
#     # Load checkpoint if exists
#     if RESUME_FROM_CHECKPOINT and load_checkpoint():
#         # Filter to only unprocessed rows
#         unprocessed = df[df['Status'] == '']
#         if len(unprocessed) == 0:
#             logger.info("✅ All cameras already processed!")
#             save_results()
#             return
#         logger.info(f"Resuming: {len(unprocessed)} cameras remaining")
    
#     start_time = time.time()
    
#     if TWO_PASS_MODE:
#         # ========== PASS 1: Quick Accessibility Check ==========
#         logger.info("\n" + "="*80)
#         logger.info("PASS 1: Quick Accessibility Check (No frame capture)")
#         logger.info("="*80)
        
#         accessible_cameras = []
#         pass1_start = time.time()
        
#         # Get rows to process
#         rows_to_check = df[df['Status'] == ''].copy()
        
#         with ThreadPoolExecutor(max_workers=MAX_WORKERS_NETWORK) as executor:
#             futures = [executor.submit(quick_accessibility_check, row) 
#                       for _, row in rows_to_check.iterrows()]
            
#             with tqdm(total=len(futures), desc="Pass 1: Checking accessibility") as pbar:
#                 for future in as_completed(futures):
#                     try:
#                         row_id, hls_url, is_accessible, error = future.result()
                        
#                         if is_accessible and hls_url:
#                             # Store for Pass 2
#                             accessible_cameras.append((row_id, hls_url))
#                         else:
#                             # Mark as not accessible
#                             update_excel_in_memory(
#                                 row_id, 
#                                 'Failed to Classify', 
#                                 'Not Accessible',
#                                 error or 'Stream not accessible'
#                             )
                        
#                         pbar.update(1)
                        
#                     except Exception as e:
#                         logger.error(f"Pass 1 task failed: {e}")
#                         pbar.update(1)
        
#         pass1_time = time.time() - pass1_start
        
#         logger.info(f"\n✅ Pass 1 Complete!")
#         logger.info(f"   Time: {int(pass1_time//60)}m {int(pass1_time%60)}s")
#         logger.info(f"   Accessible: {len(accessible_cameras)}")
#         logger.info(f"   Not Accessible: {len(rows_to_check) - len(accessible_cameras)}")
        
#         # Save checkpoint after Pass 1
#         save_checkpoint()
        
#         if len(accessible_cameras) == 0:
#             logger.warning("No accessible cameras found!")
#             save_results()
#             return
        
#         # ========== PASS 2: Frame Capture & Classification ==========
#         logger.info("\n" + "="*80)
#         logger.info(f"PASS 2: Frame Capture & Classification ({len(accessible_cameras)} cameras)")
#         logger.info("="*80)
        
#         pass2_start = time.time()
#         classified_count = 0
#         uncertain_count = 0
        
#         # Process accessible cameras with VLM
#         with ThreadPoolExecutor(max_workers=MAX_WORKERS_VLM) as executor:
#             # Create tasks for accessible cameras
#             tasks = []
#             for row_id, hls_url in accessible_cameras:
#                 row = df[df['Row_ID'] == row_id].iloc[0]
#                 tasks.append(executor.submit(process_accessible_camera, row, hls_url))
            
#             with tqdm(total=len(tasks), desc="Pass 2: Classifying") as pbar:
#                 for future in as_completed(tasks):
#                     try:
#                         result = future.result()
                        
#                         # Update dataframe
#                         update_excel_in_memory(
#                             result['row_id'],
#                             result['label'],
#                             result['status'],
#                             result['status_detail']
#                         )
                        
#                         if 'Uncertain' in result['label']:
#                             uncertain_count += 1
#                         else:
#                             classified_count += 1
                        
#                         pbar.update(1)
                        
#                     except Exception as e:
#                         logger.error(f"Pass 2 task failed: {e}")
#                         pbar.update(1)
        
#         pass2_time = time.time() - pass2_start
        
#         logger.info(f"\n✅ Pass 2 Complete!")
#         logger.info(f"   Time: {int(pass2_time//60)}m {int(pass2_time%60)}s")
#         logger.info(f"   Classified: {classified_count}")
#         logger.info(f"   Uncertain/Obstructed: {uncertain_count}")
        
#     else:
#         # ========== LEGACY: Single-Pass Processing ==========
#         logger.info("Using LEGACY single-pass mode")
        
#         rows_to_process = df[df['Status'] == ''].copy()
        
#         with ThreadPoolExecutor(max_workers=MAX_WORKERS_NETWORK) as executor:
#             futures = [executor.submit(process_single_camera_legacy, row) 
#                       for _, row in rows_to_process.iterrows()]
            
#             with tqdm(total=len(futures), desc="Processing cameras") as pbar:
#                 for future in as_completed(futures):
#                     try:
#                         future.result()
#                         pbar.update(1)
#                     except Exception as e:
#                         logger.error(f"Task failed: {e}")
#                         pbar.update(1)
    
#     # ========== Final Summary ==========
#     total_time = time.time() - start_time
    
#     accessible_total = len(df[df['Status'] == 'Accessible'])
#     not_accessible = len(df[df['Status'] == 'Not Accessible'])
#     uncertain = len(df[df['Status Detail'].str.contains('Uncertain|Obstructed', na=False)])
    
#     summary = f"""
# {'='*80}
# 🎉 FINAL SUMMARY
# {'='*80}
# Total Cameras: {len(df)}
# ✅ Accessible (Classified): {accessible_total - uncertain}
# ⚠️  Accessible (Uncertain/Obstructed): {uncertain}
# ❌ Not Accessible: {not_accessible}
# ⏱️  Total Time: {int(total_time//60)}m {int(total_time%60)}s
# 📊 Success Rate: {(accessible_total/len(df)*100):.1f}%
# {'='*80}
# """
    
#     print(summary)
#     logger.info(summary)
    
#     # Save final results
#     save_results()
    
#     # Clean up checkpoint
#     if os.path.exists(CHECKPOINT_FILE):
#         os.remove(CHECKPOINT_FILE)
#         logger.info("✅ Checkpoint file cleaned up")


# def save_results():
#     """
#     Save results to THREE separate Excel files (Option A):
#     1. Accessible cameras (classified successfully)
#     2. Accessible but Uncertain/Obstructed cameras
#     3. Not Accessible cameras
#     """
#     logger.info("="*80)
#     logger.info("Saving results to Excel files")
#     logger.info("="*80)
    
#     # Create output directory
#     output_dir = "results/tcs_classification"
#     os.makedirs(output_dir, exist_ok=True)
    
#     timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
#     try:
#         # Split dataframe into three categories
#         accessible_df = df[
#             (df['Status'] == 'Accessible') & 
#             (~df['Status Detail'].str.contains('Uncertain|Obstructed', na=False))
#         ].copy()
        
#         uncertain_df = df[
#             (df['Status'] == 'Accessible') & 
#             (df['Status Detail'].str.contains('Uncertain|Obstructed', na=False))
#         ].copy()
        
#         not_accessible_df = df[df['Status'] == 'Not Accessible'].copy()
        
#         # Remove Row_ID column (internal use only)
#         for dataframe in [accessible_df, uncertain_df, not_accessible_df]:
#             if 'Row_ID' in dataframe.columns:
#                 dataframe.drop('Row_ID', axis=1, inplace=True)
        
#         # Save accessible cameras
#         if len(accessible_df) > 0:
#             accessible_file = os.path.join(output_dir, f"accessible_classified_{timestamp}.xlsx")
#             accessible_df.to_excel(accessible_file, index=False, sheet_name="Classified")
#             logger.info(f"✅ Saved {len(accessible_df)} classified cameras to: {accessible_file}")
#             print(f"   ✅ Classified: {accessible_file}")
        
#         # Save uncertain/obstructed cameras
#         if len(uncertain_df) > 0:
#             uncertain_file = os.path.join(output_dir, f"accessible_uncertain_{timestamp}.xlsx")
#             uncertain_df.to_excel(uncertain_file, index=False, sheet_name="Uncertain")
#             logger.info(f"⚠️  Saved {len(uncertain_df)} uncertain/obstructed cameras to: {uncertain_file}")
#             print(f"   ⚠️  Uncertain: {uncertain_file}")
        
#         # Save non-accessible cameras
#         if len(not_accessible_df) > 0:
#             not_accessible_file = os.path.join(output_dir, f"not_accessible_{timestamp}.xlsx")
#             not_accessible_df.to_excel(not_accessible_file, index=False, sheet_name="Not Accessible")
#             logger.info(f"❌ Saved {len(not_accessible_df)} non-accessible cameras to: {not_accessible_file}")
#             print(f"   ❌ Not Accessible: {not_accessible_file}")
        
#         # Also save complete results in one file
#         complete_file = os.path.join(output_dir, f"complete_results_{timestamp}.xlsx")
#         df_save = df.copy()
#         if 'Row_ID' in df_save.columns:
#             df_save.drop('Row_ID', axis=1, inplace=True)
        
#         with pd.ExcelWriter(complete_file, engine='openpyxl') as writer:
#             if len(accessible_df) > 0:
#                 accessible_df.to_excel(writer, sheet_name="Classified", index=False)
#             if len(uncertain_df) > 0:
#                 uncertain_df.to_excel(writer, sheet_name="Uncertain", index=False)
#             if len(not_accessible_df) > 0:
#                 not_accessible_df.to_excel(writer, sheet_name="Not Accessible", index=False)
#             df_save.to_excel(writer, sheet_name="All Results", index=False)
        
#         logger.info(f"📊 Saved complete results to: {complete_file}")
#         print(f"\n📁 Complete Results: {complete_file}")
        
#     except Exception as e:
#         logger.error(f"Failed to save results: {e}", exc_info=True)


# # ============================================================
# # Entry Point
# # ============================================================
# if __name__ == "__main__":
#     try:
#         main()
#         logger.info("="*80)
#         logger.info("Processing completed successfully!")
#         logger.info(f"Log file: {log_filename}")
#         logger.info("="*80)
#     except KeyboardInterrupt:
#         logger.warning("\n\nProcessing interrupted by user")
#         save_results()
#         sys.exit(1)
#     except Exception as e:
#         logger.error(f"Fatal error: {e}", exc_info=True)
#         sys.exit(1)




















import requests
import json
import cv2
import time
import pandas as pd
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
import re
import queue
from collections import defaultdict
import numpy as np

# ============================================================
# Logging Setup
# ============================================================
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
log_filename = os.path.join(log_dir, f"tcs_classification_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

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
logger.info("Starting TCS Camera Classification Process - OPTIMIZED VERSION")
logger.info("="*80)

# ============================================================
# Configuration - OPTIMIZED SETTINGS
# ============================================================
# Performance settings
MAX_WORKERS_NETWORK = 64  # High parallelism for network I/O
MAX_WORKERS_VLM = 4       # Concurrent VLM requests (GPU limited)
CHECKPOINT_INTERVAL = 500  # Save progress every N cameras

# Timeout settings (reduced for speed)
TIMEOUT_EXTRACT_URL = 3    # Extract HLS URL timeout (seconds)
TIMEOUT_TEST_STREAM = 3    # Test stream accessibility timeout (seconds)
TIMEOUT_OPENCV = 3000      # OpenCV timeout (milliseconds)
TIMEOUT_FFMPEG = 5         # FFmpeg timeout (seconds)
TIMEOUT_VLM = 60           # VLM classification timeout (seconds)

# Processing mode
TWO_PASS_MODE = True       # Enable two-pass processing for efficiency
RESUME_FROM_CHECKPOINT = True  # Resume from last checkpoint if exists

# ============================================================
# Excel Loading - TCS Format
# ============================================================
# INPUT_EXCEL = "28 Jan Shift 2 - CDIS.xlsx"
# INPUT_EXCEL = "/home/suvam/projects/cctv/cctv-analytics-system/cctv_classfication/CCTV Camera Report_CUET (PG) - 2026 06th March 2026 - IITK.xlsx"
INPUT_EXCEL = "/home/suvam/projects/cctv/cctv-analytics-system/cctv_classfication/CCTV Camera Report_CUET (PG) - 2026 12th March 2026 IITK.xlsx"
SCENE_COLUMN_TARGET = "Scene Classification"
CHECKPOINT_FILE = "checkpoint_progress.json"

# Check if input file exists
if not os.path.exists(INPUT_EXCEL):
    logger.error(f"Input Excel file not found: {INPUT_EXCEL}")
    logger.error("Please ensure the TCS Excel file is placed at the correct location")
    sys.exit(1)

# Load Excel file
try:
    excel_file = pd.ExcelFile(INPUT_EXCEL)
    logger.info(f"Loaded Excel file: {INPUT_EXCEL}")
    logger.info(f"Available sheets: {excel_file.sheet_names}")
    
    # Use the first sheet
    EXCEL_SHEET = excel_file.sheet_names[0]
    df = excel_file.parse(EXCEL_SHEET)
    df.columns = [col.strip() for col in df.columns]

    print(df.columns)     # columns check karne ke liye
    print(df.head())      # first rows dekhne ke liye
    
    logger.info(f"Using sheet: {EXCEL_SHEET}")
    logger.info(f"Columns found: {list(df.columns)}")
    
    # Expected columns: CCTV URL, Center Name, Camera Location, etc.
    # Add Scene Classification and Status columns if not present
    if SCENE_COLUMN_TARGET not in df.columns:
        df[SCENE_COLUMN_TARGET] = pd.NA
    
    if "Status" not in df.columns:
        df["Status"] = ""
    else:
        df["Status"] = df["Status"].fillna("")
    
    # Add Status Detail column for uncertain/obstructed cameras
    if "Status Detail" not in df.columns:
        df["Status Detail"] = ""
    
    # Add a unique ID column for tracking
    if "Row_ID" not in df.columns:
        df["Row_ID"] = range(len(df))
    
    logger.info(f"Total rows in Excel: {len(df)}")
    logger.info(f"Optimized settings: {MAX_WORKERS_NETWORK} network workers, {MAX_WORKERS_VLM} VLM workers")
    logger.info(f"Timeouts: Extract={TIMEOUT_EXTRACT_URL}s, Test={TIMEOUT_TEST_STREAM}s, OpenCV={TIMEOUT_OPENCV}ms, FFmpeg={TIMEOUT_FFMPEG}s")
    
except Exception as e:
    logger.error(f"Failed to load Excel file: {e}", exc_info=True)
    sys.exit(1)

# ============================================================
# HLS Stream URL Processing - OPTIMIZED
# ============================================================
def extract_hls_streaming_url(initial_url, timeout=None):
    """
    Extract the actual HLS streaming URL from the initial TCS URL (OPTIMIZED)
    
    Args:
        initial_url: The URL from the Excel file (CCTV URL column)
        timeout: Request timeout in seconds (uses global TIMEOUT_EXTRACT_URL if None)
    
    Returns:
        The actual HLS streaming URL, or None if extraction fails
    """
    if timeout is None:
        timeout = TIMEOUT_EXTRACT_URL
    
    logger.debug(f"Extracting HLS URL: {initial_url[:80]}...")
    
    try:
        # Make request to the initial URL
        response = requests.get(initial_url, timeout=timeout, allow_redirects=True)
        
        if response.status_code != 200:
            logger.debug(f"Initial URL failed with status {response.status_code}")
            return None
        
        # Method 1: Look for .m3u8 URL in the response text
        m3u8_pattern = r'https?://[^\s<>"]+?\.m3u8[^\s<>"]*'
        matches = re.findall(m3u8_pattern, response.text)
        
        if matches:
            streaming_url = matches[0]
            logger.debug(f"✅ Found HLS URL: {streaming_url[:80]}...")
            return streaming_url
        
        # Method 2: Look for URL in JSON response
        try:
            json_data = response.json()
            if isinstance(json_data, dict):
                for key in ['url', 'stream_url', 'hls_url', 'playback_url', 'streaming_url']:
                    if key in json_data:
                        streaming_url = json_data[key]
                        logger.debug(f"✅ Found HLS URL in JSON: {streaming_url[:80]}...")
                        return streaming_url
        except:
            pass
        
        # Method 3: Extract quoted .m3u8 URLs
        if '.m3u8' in response.text:
            pattern = r'(["\'])(https?://[^"\']+\.m3u8[^"\']*)(["\'])'
            matches = re.findall(pattern, response.text)
            if matches:
                streaming_url = matches[0][1]
                logger.debug(f"✅ Found HLS URL (quoted): {streaming_url[:80]}...")
                return streaming_url
        
        logger.debug("No HLS URL found in response")
        return None
        
    except requests.exceptions.Timeout:
        logger.debug(f"Timeout accessing URL after {timeout}s")
        return None
    except Exception as e:
        logger.debug(f"Failed to extract HLS URL: {e}")
        return None


def test_hls_stream(hls_url, timeout=None):
    """
    Test if the HLS stream is accessible (OPTIMIZED)
    
    Args:
        hls_url: The HLS streaming URL (.m3u8)
        timeout: Request timeout in seconds (uses global TIMEOUT_TEST_STREAM if None)
    
    Returns:
        Tuple: (is_accessible, status_code)
    """
    if timeout is None:
        timeout = TIMEOUT_TEST_STREAM
    
    logger.debug(f"Testing HLS: {hls_url[:80]}...")
    
    try:
        response = requests.get(hls_url, timeout=timeout, stream=True)
        
        if response.status_code == 200:
            logger.debug("✅ HLS stream accessible")
            return True, 200
        else:
            logger.debug(f"HLS stream status: {response.status_code}")
            return False, response.status_code
            
    except Exception as e:
        logger.debug(f"HLS stream test failed: {e}")
        return False, None


# ============================================================
# Frame Capture from HLS Stream - OPTIMIZED
# ============================================================
def capture_frame_from_hls(hls_url, row_id, skip_ffmpeg=False, timeout_ms=None):
    """
    Capture a frame from HLS stream (OPTIMIZED with smart bailout)
    
    Args:
        hls_url: The HLS streaming URL (.m3u8)
        row_id: Unique identifier for this camera
        skip_ffmpeg: Skip FFmpeg fallback (for known bad streams)
        timeout_ms: Timeout in milliseconds (uses global TIMEOUT_OPENCV if None)
    
    Returns:
        Path to saved frame image, or None if capture fails
    """
    if timeout_ms is None:
        timeout_ms = TIMEOUT_OPENCV
    
    logger.debug(f"Capturing frame for Row ID {row_id}")
    
    # Try with OpenCV first
    img_path = capture_frame_with_opencv_hls(hls_url, row_id, timeout_ms)
    
    if img_path:
        return img_path
    
    # Skip FFmpeg if we know the stream is bad (404, 502, etc.)
    if skip_ffmpeg:
        logger.debug("Skipping FFmpeg (stream known bad)")
        return None
    
    # Fallback to FFmpeg
    logger.debug("OpenCV failed, trying FFmpeg...")
    img_path = capture_frame_with_ffmpeg_hls(hls_url, row_id)
    
    return img_path


def capture_frame_with_opencv_hls(hls_url, row_id, timeout_ms):
    """Capture frame using OpenCV (OPTIMIZED)"""
    try:
        cap = cv2.VideoCapture(hls_url)
        
        # Set aggressive timeouts
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_ms)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, timeout_ms)
        
        if not cap.isOpened():
            logger.debug(f"OpenCV failed to open stream for Row ID {row_id}")
            return None
        
        # Read frame
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            logger.debug(f"OpenCV failed to read frame for Row ID {row_id}")
            return None
        
        # Save frame
        save_dir = f"frames/tcs/{row_id}"
        os.makedirs(save_dir, exist_ok=True)
        img_path = f"{save_dir}/frame_{uuid.uuid4().hex}.jpg"
        cv2.imwrite(img_path, frame)
        
        logger.debug(f"✅ Frame captured with OpenCV: {img_path}")
        return img_path
        
    except Exception as e:
        logger.debug(f"OpenCV capture failed: {e}")
        return None


def capture_frame_with_ffmpeg_hls(hls_url, row_id):
    """Capture frame using FFmpeg (OPTIMIZED)"""
    if not shutil.which("ffmpeg"):
        logger.debug("ffmpeg not found")
        return None
    
    save_dir = f"frames/tcs/{row_id}"
    os.makedirs(save_dir, exist_ok=True)
    img_path = f"{save_dir}/frame_{uuid.uuid4().hex}.jpg"
    
    cmd = [
        "ffmpeg",
        "-y",
        "-timeout", str(TIMEOUT_FFMPEG * 1000000),  # Convert to microseconds
        "-i", hls_url,
        "-frames:v", "1",
        "-loglevel", "error",
        img_path
    ]
    
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, 
                              timeout=TIMEOUT_FFMPEG)
        
        if result.returncode != 0 or not os.path.exists(img_path):
            logger.debug(f"FFmpeg failed for Row ID {row_id}")
            return None
        
        logger.debug(f"✅ Frame captured with FFmpeg: {img_path}")
        return img_path
        
    except subprocess.TimeoutExpired:
        logger.debug(f"FFmpeg timed out for Row ID {row_id}")
        return None
    except Exception as e:
        logger.debug(f"FFmpeg error: {e}")
        return None


# ============================================================
# VLM Classification - OPTIMIZED with Grey/Obstruction Detection
# ============================================================

# Global VLM queue for batch processing
vlm_queue = queue.Queue()
vlm_results = {}
vlm_results_lock = threading.Lock()

def is_grey_or_obstructed(image_path):
    """
    Quick check if image is grey screen or heavily obstructed
    Returns: (is_problematic, reason)
    """
    try:
        img = cv2.imread(image_path)
        if img is None:
            return True, "Failed to read image"
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Check 1: Nearly uniform color (grey screen)
        std_dev = gray.std()
        if std_dev < 5:  # Very low variance = uniform grey
            return True, "Uniform grey screen"
        
        # Check 2: Very dark image (camera blocked)
        mean_brightness = gray.mean()
        if mean_brightness < 10:
            return True, "Very dark/blocked camera"
        
        # Check 3: Very bright image (overexposed/white)
        if mean_brightness > 245:
            return True, "Overexposed/white screen"
        
        # Check 4: Low detail (blurry/obstructed)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < 10:
            return True, "Low detail/obstructed"
        
        return False, None
        
    except Exception as e:
        logger.debug(f"Grey check failed: {e}")
        return False, None


def classify_with_vlm(image_path):
    """
    Uses Ollama Vision Model for scene classification (OPTIMIZED)
    Includes detection for grey/obstructed cameras
    """
    logger.debug(f"VLM classification: {image_path}")
    
    # Quick pre-check for grey/obstructed images
    is_bad, reason = is_grey_or_obstructed(image_path)
    if is_bad:
        logger.debug(f"Image flagged as problematic: {reason}")
        return "Uncertain/Obstructed", reason

    # === CATEGORY DEFINITIONS ===
    CATEGORIES = [
        "Server Room",
        "Outdoor Scene",
        "Outside Area",
        "Parking Lot",
        "Entry",
        "Computer Lab"
    ]

    PROMPT = f"""You are an expert computer vision classifier.
Classify the given image into one of the following categories:

{', '.join(CATEGORIES)}.

Rules:
- "Server Room": small room with limited visibility with laptop or computers.
- "Computer Lab": large room with many computers, chairs, people or desks.
- "Outdoor Scene": nature, roads, gardens, sky, trees.
- "Outside Area": surroundings of a building, campus, boundary, hallway, outdoor environment.
- "Parking Lot": cars, bikes, open area with marked spaces or vehicles.
- "Entry": building entrances, gates, doors, signboards, or main access points.

If the image is grey, blank, heavily obstructed, or unclear, respond with "Uncertain".

Return **only** the JSON response:
{{"category": "<one of the above categories or Uncertain>", "reason": "<short explanation>"}}"""

    url = "http://localhost:11434/api/generate"
    
    # Read and encode the image to base64
    try:
        with open(image_path, 'rb') as image_file:
            image_data = base64.b64encode(image_file.read()).decode('utf-8')
    except Exception as e:
        logger.debug(f"Failed to encode image: {e}")
        return "Uncertain", "Failed to read image"
    
    payload = {
        "model": "qwen3-vl:8b",
        "prompt": PROMPT,
        "images": [image_data],
        "stream": False
    }

    try:
        response = requests.post(url, json=payload, timeout=TIMEOUT_VLM)
        
        if response.status_code != 200:
            logger.debug(f"VLM request failed: {response.status_code}")
            return "Uncertain", "VLM request failed"
        
        response_json = response.json()
        result = response_json.get("response", "").strip()
        
        if not result:
            return "Uncertain", "Empty VLM response"
        
        # Parse JSON response
        try:
            result_json = json.loads(result)
            category = result_json.get("category", "Uncertain")
            reason = result_json.get("reason", "")
            
            # Check if VLM also detected uncertainty
            if "uncertain" in category.lower() or "unclear" in category.lower():
                return "Uncertain/Obstructed", reason
            
            return category, reason
        except json.JSONDecodeError:
            logger.debug("Could not parse VLM JSON")
            return "Uncertain", "Invalid VLM response"
            
    except requests.exceptions.Timeout:
        logger.debug("VLM request timed out")
        return "Uncertain", "VLM timeout"
    except Exception as e:
        logger.debug(f"VLM error: {e}")
        return "Uncertain", str(e)


# ============================================================
# Excel Update & Checkpoint System (Thread-safe)
# ============================================================
excel_lock = threading.Lock()
checkpoint_counter = 0

def update_excel_in_memory(row_id, label, status, status_detail=""):
    """Update dataframe in memory (thread-safe) with status detail"""
    global df, checkpoint_counter
    with excel_lock:
        mask = df["Row_ID"] == row_id
        if mask.any():
            df.loc[mask, SCENE_COLUMN_TARGET] = label
            df.loc[mask, "Status"] = status
            df.loc[mask, "Status Detail"] = status_detail
            logger.debug(f"Updated Row {row_id}: {status} - {label}")
            
            # Increment checkpoint counter
            checkpoint_counter += 1
            if checkpoint_counter % CHECKPOINT_INTERVAL == 0:
                save_checkpoint()
        else:
            logger.warning(f"Row ID {row_id} not found")


def save_checkpoint():
    """Save current progress to checkpoint file"""
    try:
        checkpoint_data = {
            'timestamp': datetime.now().isoformat(),
            'processed_rows': df[df['Status'] != ''].shape[0],
            'total_rows': len(df),
            'dataframe': df.to_dict('records')
        }
        
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump(checkpoint_data, f)
        
        logger.info(f"✅ Checkpoint saved: {checkpoint_data['processed_rows']}/{checkpoint_data['total_rows']}")
    except Exception as e:
        logger.error(f"Failed to save checkpoint: {e}")


def load_checkpoint():
    """Load progress from checkpoint file"""
    global df
    
    if not os.path.exists(CHECKPOINT_FILE):
        return False
    
    try:
        with open(CHECKPOINT_FILE, 'r') as f:
            checkpoint_data = json.load(f)
        
        logger.info(f"Found checkpoint from {checkpoint_data['timestamp']}")
        logger.info(f"Previously processed: {checkpoint_data['processed_rows']}/{checkpoint_data['total_rows']}")
        
        # Restore dataframe
        df_checkpoint = pd.DataFrame(checkpoint_data['dataframe'])
        
        # Merge with current df (in case Excel changed)
        if len(df_checkpoint) == len(df):
            df = df_checkpoint
            logger.info("✅ Checkpoint loaded successfully")
            return True
        else:
            logger.warning("Checkpoint size mismatch, starting fresh")
            return False
            
    except Exception as e:
        logger.error(f"Failed to load checkpoint: {e}")
        return False


# ============================================================
# Camera Processing - OPTIMIZED TWO-PASS STRATEGY
# ============================================================

def quick_accessibility_check(row):
    """
    PASS 1: Quick accessibility check (no frame capture, no classification)
    Just test if we can reach the stream
    
    Returns: (row_id, hls_url, is_accessible, error_code)
    """
    row_id = row['Row_ID']
    initial_url = row.get('CCTV URL', '')
    
    # Validate URL
    if pd.isna(initial_url) or not initial_url.strip():
        return (row_id, None, False, 'No URL')
    
    try:
        # Extract HLS URL
        hls_url = extract_hls_streaming_url(initial_url)
        if not hls_url:
            return (row_id, None, False, 'Extract failed')
        
        # Test stream
        is_accessible, status_code = test_hls_stream(hls_url)
        
        # Smart bailout: don't try to capture frames for known bad status codes
        if status_code in [404, 502, 503, 500]:
            return (row_id, hls_url, False, f'HTTP {status_code}')
        
        if is_accessible:
            return (row_id, hls_url, True, None)
        else:
            return (row_id, hls_url, False, f'Stream test failed')
            
    except Exception as e:
        return (row_id, None, False, str(e))


def process_accessible_camera(row, hls_url):
    """
    PASS 2: Full processing for accessible cameras (capture + classify)
    
    Args:
        row: Pandas Series with camera data
        hls_url: Pre-validated HLS streaming URL
    
    Returns:
        Dictionary with processing results
    """
    row_id = row['Row_ID']
    
    result = {
        'row_id': row_id,
        'status': 'Accessible',
        'label': 'Uncertain',
        'status_detail': '',
        'error': None
    }
    
    try:
        # Capture frame (skip FFmpeg for efficiency if OpenCV fails)
        img_path = capture_frame_from_hls(hls_url, row_id, skip_ffmpeg=False)
        
        if not img_path:
            result['status'] = 'Not Accessible'
            result['label'] = 'Failed to Classify'
            result['error'] = 'Frame capture failed'
            result['status_detail'] = 'Could not capture frame'
            return result
        
        # Classify the frame
        label, reason = classify_with_vlm(img_path)
        
        if "Uncertain" in label or "Obstructed" in label:
            # Mark as Accessible but Uncertain/Obstructed (Option A)
            result['status'] = 'Accessible'
            result['label'] = 'Uncertain/Obstructed'
            result['status_detail'] = reason or 'Image unclear or obstructed'
        else:
            result['status'] = 'Accessible'
            result['label'] = label
            result['status_detail'] = 'Successfully classified'
        
        return result
        
    except Exception as e:
        logger.error(f"Error in Pass 2 for Row {row_id}: {e}")
        result['status'] = 'Accessible'
        result['label'] = 'Uncertain'
        result['status_detail'] = f'Error: {str(e)}'
        result['error'] = str(e)
        return result


def process_single_camera_legacy(row):
    """
    LEGACY: Single-pass processing (for backwards compatibility)
    Used when TWO_PASS_MODE = False
    """
    row_id = row['Row_ID']
    initial_url = row.get('CCTV URL', '')
    
    logger.debug("="*60)
    logger.debug(f"Processing Row ID: {row_id}")
    logger.debug("="*60)
    
    result = {
        'row_id': row_id,
        'status': 'Not Accessible',
        'label': 'Failed to Classify',
        'status_detail': '',
        'error': None
    }
    
    # Validate initial URL
    if pd.isna(initial_url) or not initial_url.strip():
        result['error'] = 'No URL provided'
        result['status_detail'] = 'Empty URL'
        update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
        return result
    
    try:
        # Extract HLS URL
        hls_url = extract_hls_streaming_url(initial_url)
        if not hls_url:
            result['error'] = 'Failed to extract HLS URL'
            result['status_detail'] = 'URL extraction failed'
            update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
            return result
        
        # Test stream
        is_accessible, status_code = test_hls_stream(hls_url)
        skip_ffmpeg = status_code in [404, 502, 503, 500]  # Skip FFmpeg for known bad codes
        
        if not is_accessible:
            result['error'] = 'HLS stream not accessible'
            result['status_detail'] = f'HTTP {status_code}' if status_code else 'Connection failed'
            update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
            return result
        
        # Capture frame
        img_path = capture_frame_from_hls(hls_url, row_id, skip_ffmpeg=skip_ffmpeg)
        if not img_path:
            result['error'] = 'Frame capture failed'
            result['status_detail'] = 'Could not capture frame'
            update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
            return result
        
        # Classify
        label, reason = classify_with_vlm(img_path)
        
        if "Uncertain" in label or "Obstructed" in label:
            result['status'] = 'Accessible'
            result['label'] = 'Uncertain/Obstructed'
            result['status_detail'] = reason or 'Image unclear'
        else:
            result['status'] = 'Accessible'
            result['label'] = label
            result['status_detail'] = 'Successfully classified'
        
        update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
        return result
        
    except Exception as e:
        logger.error(f"Error processing Row {row_id}: {e}")
        result['error'] = str(e)
        result['status_detail'] = 'Processing error'
        update_excel_in_memory(row_id, result['label'], result['status'], result['status_detail'])
        return result


# ============================================================
# Main Processing Loop - OPTIMIZED TWO-PASS STRATEGY
# ============================================================
def main():
    global df
    
    logger.info("="*80)
    logger.info("🚀 OPTIMIZED TCS Camera Classification - TWO-PASS MODE")
    logger.info("="*80)
    logger.info(f"Total cameras: {len(df)}")
    logger.info(f"Network workers: {MAX_WORKERS_NETWORK}")
    logger.info(f"VLM workers: {MAX_WORKERS_VLM}")
    logger.info(f"Checkpoint interval: {CHECKPOINT_INTERVAL}")
    logger.info("="*80)
    
    # Load checkpoint if exists
    if RESUME_FROM_CHECKPOINT and load_checkpoint():
        # Filter to only unprocessed rows
        unprocessed = df[df['Status'] == '']
        if len(unprocessed) == 0:
            logger.info("✅ All cameras already processed!")
            save_results()
            return
        logger.info(f"Resuming: {len(unprocessed)} cameras remaining")
    
    start_time = time.time()
    
    if TWO_PASS_MODE:
        # ========== PASS 1: Quick Accessibility Check ==========
        logger.info("\n" + "="*80)
        logger.info("PASS 1: Quick Accessibility Check (No frame capture)")
        logger.info("="*80)
        
        accessible_cameras = []
        pass1_start = time.time()
        
        # Get rows to process
        rows_to_check = df[df['Status'] == ''].copy()
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS_NETWORK) as executor:
            futures = [executor.submit(quick_accessibility_check, row) 
                      for _, row in rows_to_check.iterrows()]
            
            with tqdm(total=len(futures), desc="Pass 1: Checking accessibility") as pbar:
                for future in as_completed(futures):
                    try:
                        row_id, hls_url, is_accessible, error = future.result()
                        
                        if is_accessible and hls_url:
                            # Store for Pass 2
                            accessible_cameras.append((row_id, hls_url))
                        else:
                            # Mark as not accessible
                            update_excel_in_memory(
                                row_id, 
                                'Failed to Classify', 
                                'Not Accessible',
                                error or 'Stream not accessible'
                            )
                        
                        pbar.update(1)
                        
                    except Exception as e:
                        logger.error(f"Pass 1 task failed: {e}")
                        pbar.update(1)
        
        pass1_time = time.time() - pass1_start
        
        logger.info(f"\n✅ Pass 1 Complete!")
        logger.info(f"   Time: {int(pass1_time//60)}m {int(pass1_time%60)}s")
        logger.info(f"   Accessible: {len(accessible_cameras)}")
        logger.info(f"   Not Accessible: {len(rows_to_check) - len(accessible_cameras)}")
        
        # Save checkpoint after Pass 1
        save_checkpoint()
        
        if len(accessible_cameras) == 0:
            logger.warning("No accessible cameras found!")
            save_results()
            return
        
        # ========== PASS 2: Frame Capture & Classification ==========
        logger.info("\n" + "="*80)
        logger.info(f"PASS 2: Frame Capture & Classification ({len(accessible_cameras)} cameras)")
        logger.info("="*80)
        
        pass2_start = time.time()
        classified_count = 0
        uncertain_count = 0
        
        # Process accessible cameras with VLM
        with ThreadPoolExecutor(max_workers=MAX_WORKERS_VLM) as executor:
            # Create tasks for accessible cameras
            tasks = []
            for row_id, hls_url in accessible_cameras:
                row = df[df['Row_ID'] == row_id].iloc[0]
                tasks.append(executor.submit(process_accessible_camera, row, hls_url))
            
            with tqdm(total=len(tasks), desc="Pass 2: Classifying") as pbar:
                for future in as_completed(tasks):
                    try:
                        result = future.result()
                        
                        # Update dataframe
                        update_excel_in_memory(
                            result['row_id'],
                            result['label'],
                            result['status'],
                            result['status_detail']
                        )
                        
                        if 'Uncertain' in result['label']:
                            uncertain_count += 1
                        else:
                            classified_count += 1
                        
                        pbar.update(1)
                        
                    except Exception as e:
                        logger.error(f"Pass 2 task failed: {e}")
                        pbar.update(1)
        
        pass2_time = time.time() - pass2_start
        
        logger.info(f"\n✅ Pass 2 Complete!")
        logger.info(f"   Time: {int(pass2_time//60)}m {int(pass2_time%60)}s")
        logger.info(f"   Classified: {classified_count}")
        logger.info(f"   Uncertain/Obstructed: {uncertain_count}")
        
    else:
        # ========== LEGACY: Single-Pass Processing ==========
        logger.info("Using LEGACY single-pass mode")
        
        rows_to_process = df[df['Status'] == ''].copy()
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS_NETWORK) as executor:
            futures = [executor.submit(process_single_camera_legacy, row) 
                      for _, row in rows_to_process.iterrows()]
            
            with tqdm(total=len(futures), desc="Processing cameras") as pbar:
                for future in as_completed(futures):
                    try:
                        future.result()
                        pbar.update(1)
                    except Exception as e:
                        logger.error(f"Task failed: {e}")
                        pbar.update(1)
    
    # ========== Final Summary ==========
    total_time = time.time() - start_time
    
    accessible_total = len(df[df['Status'] == 'Accessible'])
    not_accessible = len(df[df['Status'] == 'Not Accessible'])
    uncertain = len(df[df['Status Detail'].str.contains('Uncertain|Obstructed', na=False)])
    
    summary = f"""
{'='*80}
🎉 FINAL SUMMARY
{'='*80}
Total Cameras: {len(df)}
✅ Accessible (Classified): {accessible_total - uncertain}
⚠️  Accessible (Uncertain/Obstructed): {uncertain}
❌ Not Accessible: {not_accessible}
⏱️  Total Time: {int(total_time//60)}m {int(total_time%60)}s
📊 Success Rate: {(accessible_total/len(df)*100):.1f}%
{'='*80}
"""
    
    print(summary)
    logger.info(summary)
    
    # Save final results
    save_results()
    
    # Clean up checkpoint
    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
        logger.info("✅ Checkpoint file cleaned up")


def save_results():
    """
    Save results to THREE separate Excel files (Option A):
    1. Accessible cameras (classified successfully)
    2. Accessible but Uncertain/Obstructed cameras
    3. Not Accessible cameras
    """
    logger.info("="*80)
    logger.info("Saving results to Excel files")
    logger.info("="*80)
    
    # Create output directory
    output_dir = "results/tcs_classification"
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    try:
        # Split dataframe into three categories
        accessible_df = df[
            (df['Status'] == 'Accessible') & 
            (~df['Status Detail'].str.contains('Uncertain|Obstructed', na=False))
        ].copy()
        
        uncertain_df = df[
            (df['Status'] == 'Accessible') & 
            (df['Status Detail'].str.contains('Uncertain|Obstructed', na=False))
        ].copy()
        
        not_accessible_df = df[df['Status'] == 'Not Accessible'].copy()
        
        # Remove Row_ID column (internal use only)
        for dataframe in [accessible_df, uncertain_df, not_accessible_df]:
            if 'Row_ID' in dataframe.columns:
                dataframe.drop('Row_ID', axis=1, inplace=True)
        
        # Save accessible cameras
        if len(accessible_df) > 0:
            accessible_file = os.path.join(output_dir, f"accessible_classified_{timestamp}.xlsx")
            accessible_df.to_excel(accessible_file, index=False, sheet_name="Classified")
            logger.info(f"✅ Saved {len(accessible_df)} classified cameras to: {accessible_file}")
            print(f"   ✅ Classified: {accessible_file}")
        
        # Save uncertain/obstructed cameras
        if len(uncertain_df) > 0:
            uncertain_file = os.path.join(output_dir, f"accessible_uncertain_{timestamp}.xlsx")
            uncertain_df.to_excel(uncertain_file, index=False, sheet_name="Uncertain")
            logger.info(f"⚠️  Saved {len(uncertain_df)} uncertain/obstructed cameras to: {uncertain_file}")
            print(f"   ⚠️  Uncertain: {uncertain_file}")
        
        # Save non-accessible cameras
        if len(not_accessible_df) > 0:
            not_accessible_file = os.path.join(output_dir, f"not_accessible_{timestamp}.xlsx")
            not_accessible_df.to_excel(not_accessible_file, index=False, sheet_name="Not Accessible")
            logger.info(f"❌ Saved {len(not_accessible_df)} non-accessible cameras to: {not_accessible_file}")
            print(f"   ❌ Not Accessible: {not_accessible_file}")
        
        # Also save complete results in one file
        complete_file = os.path.join(output_dir, f"complete_results_{timestamp}.xlsx")
        df_save = df.copy()
        if 'Row_ID' in df_save.columns:
            df_save.drop('Row_ID', axis=1, inplace=True)
        
        with pd.ExcelWriter(complete_file, engine='openpyxl') as writer:
            if len(accessible_df) > 0:
                accessible_df.to_excel(writer, sheet_name="Classified", index=False)
            if len(uncertain_df) > 0:
                uncertain_df.to_excel(writer, sheet_name="Uncertain", index=False)
            if len(not_accessible_df) > 0:
                not_accessible_df.to_excel(writer, sheet_name="Not Accessible", index=False)
            df_save.to_excel(writer, sheet_name="All Results", index=False)
        
        logger.info(f"📊 Saved complete results to: {complete_file}")
        print(f"\n📁 Complete Results: {complete_file}")
        
    except Exception as e:
        logger.error(f"Failed to save results: {e}", exc_info=True)


# ============================================================
# Entry Point
# ============================================================
if __name__ == "__main__":
    try:
        main()
        logger.info("="*80)
        logger.info("Processing completed successfully!")
        logger.info(f"Log file: {log_filename}")
        logger.info("="*80)
    except KeyboardInterrupt:
        logger.warning("\n\nProcessing interrupted by user")
        save_results()
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
