"""
TCS Phone Detection Script
===========================
Detects phones in TCS HLS camera streams and saves detection results.
Compatible with TCS streaming links (HLS format).
"""

import sys
import os

# Add parent directory to path to import tcs_hls_utils
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
from datetime import datetime
import threading
import pandas as pd
import logging
import numpy as np
from detection_rate_limiter import get_rate_limiter
from motion_detector import get_motion_detector
from tcs_scheduler import (
    camera_slot,
    frame_should_process,
    get_sample_every,
    get_max_concurrency,
    get_max_frames_per_run,
    get_bool,
    get_positive_float,
    CameraWorkerPool,
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
sys.path.insert(0, PROJECT_ROOT)
from scripts.detection import phone_det_complete as phone_core

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

# === Logging Setup ===
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Override the save folder for TCS phone detections
TCS_PHONE_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/phone_detection")
os.makedirs(TCS_PHONE_SAVE_FOLDER, exist_ok=True)
phone_core.SAVE_FOLDER = TCS_PHONE_SAVE_FOLDER
logger.info(f"TCS Phone detections will be saved to: {TCS_PHONE_SAVE_FOLDER}")

# === Configuration ===
# Get project root (2 levels up from scripts/tcs/)
EXCEL_FILE = os.path.join(PROJECT_ROOT, "results/tcs_classification/accessible_cameras_phone.xlsx")
phone_counts = phone_core.phone_counts if hasattr(phone_core, "phone_counts") else {}
SAMPLE_EVERY = get_sample_every("TCS_PHONE_SAMPLE_EVERY", 15)  # Optimized: process every 15th frame
MAX_CONCURRENCY = get_max_concurrency("TCS_PHONE_MAX_CONCURRENCY", None)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_PHONE_MAX_FRAMES_PER_RUN", None)
USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
df_lock = threading.Lock()

# Rate limiter for 25 detections per minute
rate_limiter = get_rate_limiter('phone', max_per_minute=25)

def load_camera_config():
    """Load TCS camera configuration from Excel file"""
    try:
        df = pd.read_excel(EXCEL_FILE)
        logger.info(f"Loaded Excel file: {EXCEL_FILE}")
        logger.info(f"Columns found: {list(df.columns)}")
        logger.info(f"Total rows: {len(df)}")
        
        # Support both old and new column names (case-insensitive)
        center_column = None
        for col in df.columns:
            if col.upper() in ['TC NAME', 'TC NAM', 'CENTER NAME']:
                center_column = col
                break
        
        location_column = None
        for col in df.columns:
            if col.upper() in ['CAMERA NAME', 'CAMERA LOCATION']:
                location_column = col
                break
        
        if not center_column or not location_column or 'CCTV URL' not in df.columns:
            logger.error(f"Required columns not found. Available columns: {list(df.columns)}")
            logger.error(f"Looking for: CCTV URL, TC NAME/Center Name, Camera Name/Camera Location")
            return [], None
        
        # Filter for Computer Lab or Server Room scenes if Scene Classification exists
        if 'Scene Classification' in df.columns:
            filtered_df = df[df['Scene Classification'].isin(['Server Room', 'Computer Lab'])].copy()
        else:
            filtered_df = df.copy()
        
        # Clean and process data
        filtered_df = filtered_df.dropna(subset=['CCTV URL'])
        
        camera_configs = []
        for index, row in filtered_df.iterrows():
            initial_url = str(row['CCTV URL']).strip()
            center_name = str(row.get(center_column, 'Unknown'))
            camera_location = str(row.get(location_column, 'Unknown'))
            # Sanitize camera_id by replacing slashes and spaces with underscores
            safe_camera_id = f"{center_name}_{camera_location}".replace('/', '_').replace(' ', '_')
            
            camera_configs.append({
                'initial_url': initial_url,
                'center_name': center_name,
                'camera_location': camera_location,
                'camera_id': safe_camera_id,
                'index': index
            })
        
        logger.info(f"Successfully loaded {len(camera_configs)} TCS camera configurations")
        for config in camera_configs:
            logger.info(f"  Camera: {config['center_name']} - {config['camera_location']}")
        
        return camera_configs, df
        
    except FileNotFoundError:
        logger.error(f"Excel file '{EXCEL_FILE}' not found.")
        return [], None
    except Exception as e:
        logger.error(f"Error reading Excel file: {e}", exc_info=True)
        return [], None

def detect_phones_in_frame(frame, camera_id="unknown"):
    processed_frame, phone_detected, phone_count = phone_core.detect_phones_in_frame(
        frame, device_id=camera_id, camera_no=camera_id
    )
    return processed_frame, phone_detected, phone_count

def process_hls_stream_with_phone_detection(hls_url, camera_id, verbose=False, max_frames=None):
    """
    Process HLS stream with YOLO phone detection
    """
    if verbose:
        logger.info(f"Starting phone detection on HLS stream for camera {camera_id}")
    
    cap = open_hls_stream(hls_url)
    
    if cap is None or not cap.isOpened():
        logger.error(f"[Camera {camera_id}] Failed to open HLS stream")
        return False
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
        
    logger.info(f"[Camera {camera_id}] 📱 Phone detection started @ {fps} FPS")
    
    frame_count = 0
    detection_count = 0
    skipped_no_motion = 0
    skipped_rate_limit = 0
    start_time = time.time()
    motion_detector = get_motion_detector(camera_id, motion_threshold=1200)
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                logger.warning(f"[Camera {camera_id}] Stream ended")
                break
            
            frame_count += 1
            
            if frame_should_process(frame_count, SAMPLE_EVERY):
                # Pre-filter: Check for motion
                if not motion_detector.has_motion(frame):
                    skipped_no_motion += 1
                    continue
                
                # Run detection
                processed_frame, phone_detected, phone_count = detect_phones_in_frame(frame, camera_id)
                
                # Check rate limiter before saving
                if phone_detected:
                    should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
                    if should_save:
                        detection_count += 1
                        logger.warning(f"[Camera {camera_id}] 📱 PHONE DETECTED! Count: {phone_count} (Alert {current_rate}/25 this minute)")
                    else:
                        skipped_rate_limit += 1
                        logger.debug(f"[Camera {camera_id}] Phone detected but rate limit reached")
                
                if frame_count % 150 == 0:
                    stats = rate_limiter.get_stats()
                    logger.info(f"[Camera {camera_id}] ✓ Monitoring | Stats: {detection_count} alerts, {skipped_no_motion} no-motion | Rate: {stats['current_rate']}/25/min")

            if max_frames and frame_count >= max_frames:
                break
            
            if frame_count % (int(fps) * 60) == 0:
                elapsed_time = time.time() - start_time
                logger.info(f"[Camera {camera_id}] 🔄 Processing: {elapsed_time:.1f}s elapsed ({frame_count} frames)")
    
    except KeyboardInterrupt:
        logger.info(f"[Camera {camera_id}] Detection interrupted by user.")
    except Exception as e:
        logger.error(f"[Camera {camera_id}] Error during detection: {e}", exc_info=True)
    finally:
        if cap:
            cap.release()
        cv2.destroyAllWindows()
        
        total_time = time.time() - start_time
        actual_fps = frame_count / total_time if total_time > 0 else 0
        logger.info(f"[Camera {camera_id}] Detection finished!")
        logger.info(f"[Camera {camera_id}] Total frames processed: {frame_count}")
        logger.info(f"[Camera {camera_id}] Total processing time: {total_time:.2f} seconds")
        logger.info(f"[Camera {camera_id}] Actual processing FPS: {actual_fps:.2f}")
    
    return True

def start_camera_detection(config, df, max_frames=None):
    """Start detection for a specific TCS camera"""
    camera_id = config['camera_id']
    initial_url = config['initial_url']
    center_name = config['center_name']
    camera_location = config['camera_location']
    index = config['index']
    
    logger.info(f"\n[{camera_id}] Starting TCS camera detection...")
    logger.info(f"[{camera_id}] Center: {center_name}, Location: {camera_location}")
    
    try:
        with camera_slot("phone", MAX_CONCURRENCY):
            logger.info(f"[{camera_id}] Extracting HLS URL from initial URL...")
            hls_url = extract_hls_streaming_url(initial_url)
            
            if not hls_url:
                logger.error(f"[{camera_id}] Failed to extract HLS URL")
                if df is not None:
                    with df_lock:
                        df.at[index, 'Phones Detected'] = 0
                return
            
            if not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] HLS stream not accessible")
                if df is not None:
                    with df_lock:
                        df.at[index, 'Phones Detected'] = 0
                return
            
            success = process_hls_stream_with_phone_detection(hls_url, camera_id, verbose=False, max_frames=max_frames)
            
            if success and df is not None:
                with df_lock:
                    df.at[index, 'Phones Detected'] = phone_counts.get(camera_id, 0)
        
    except Exception as e:
        logger.error(f"[{camera_id}] Error during camera detection: {e}", exc_info=True)
        if df is not None:
            with df_lock:
                df.at[index, 'Phones Detected'] = 0

def main():
    """Main function to orchestrate the entire process"""
    logger.info("=== TCS Phone Detection System ===\n")
    
    # Load camera configurations from Excel
    camera_configs, df = load_camera_config()
    
    if not camera_configs or df is None:
        logger.error("No camera configurations found. Please check your Excel file.")
        return
    
    # Add Phones Detected column if it doesn't exist
    if df is not None and 'Phones Detected' not in df.columns:
        df['Phones Detected'] = 0
    
    logger.info(f"\nStarting phone detection for {len(camera_configs)} TCS cameras...")
    if USE_POOL:
        pool = CameraWorkerPool(worker_count=POOL_WORKERS, cooldown_sec=POOL_COOLDOWN)
        pool.start()
        for config in camera_configs:
            pool.submit(start_camera_detection, config, df, MAX_FRAMES_PER_RUN)
        try:
            pool.wait_forever()
        finally:
            pool.stop()
    else:
        threads = []
        for config in camera_configs:
            t = threading.Thread(
                target=start_camera_detection,
                args=(config, df, None),
                name=f"TCS-{config['camera_id']}"
            )
            t.start()
            threads.append(t)
            time.sleep(1)
        
        logger.info(f"Started {len(threads)} camera detection threads.")
        logger.info("Press Ctrl+C to stop all detections.\n")
        
        try:
            for t in threads:
                t.join()
        except KeyboardInterrupt:
            logger.info("\nInterrupt received. Stopping all camera detections...")
    
    # Final save of Excel file
    if df is not None:
        try:
            df.to_excel(EXCEL_FILE, index=False)
            logger.info(f"Final update: Saved Excel file with all phone detection results")
        except Exception as e:
            logger.error(f"Error saving final Excel file: {e}")
    
    logger.info("All TCS camera detections completed.")

if __name__ == "__main__":
    main()
