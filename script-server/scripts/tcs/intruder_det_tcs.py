"""
TCS Intruder Detection Script
==============================
Detects intruders in restricted areas or after hours.
Compatible with TCS streaming links (HLS format).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
from datetime import datetime
import threading
import pandas as pd
import logging
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
from scripts.detection import Intruder_det as intruder_core

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Override the save folder for TCS intruder detections
TCS_INTRUDER_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")
os.makedirs(TCS_INTRUDER_SAVE_FOLDER, exist_ok=True)
intruder_core.SAVE_FOLDER = TCS_INTRUDER_SAVE_FOLDER
logger.info(f"TCS Intruder detections will be saved to: {TCS_INTRUDER_SAVE_FOLDER}")

EXCEL_FILE = os.path.join(PROJECT_ROOT, "/root/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_intruder.xlsx")

# Reuse the original intruder detection logic and shared YOLO model
COOLDOWN_TIME = intruder_core.COOLDOWN_TIME
intruder_counts = intruder_core.person_counts if hasattr(intruder_core, "person_counts") else {}
SAMPLE_EVERY = get_sample_every("TCS_INTRUDER_SAMPLE_EVERY", 3)
MAX_CONCURRENCY = get_max_concurrency("TCS_INTRUDER_MAX_CONCURRENCY", None)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_INTRUDER_MAX_FRAMES_PER_RUN", None)
USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
df_lock = threading.Lock()

def load_camera_config():
    try:
        df = pd.read_excel(EXCEL_FILE)
        logger.info(f"Loaded Excel file: {EXCEL_FILE}")
        
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
        
        if 'Scene Classification' in df.columns:
            filtered_df = df[df['Scene Classification'].isin(['Outdoor Scene', 'Outside area', 'Parking Lot', 'Entry'])].copy()
        else:
            filtered_df = df.copy()
        
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
        return camera_configs, df
        
    except Exception as e:
        logger.error(f"Error reading Excel file: {e}")
        return [], None

def detect_intruders(frame, camera_id="unknown"):
    # Delegate to the original intruder detector for identical logic
    processed_frame, intruder_detected, person_count = intruder_core.detect_persons_in_frame(
        frame, device_id=camera_id, camera_no=camera_id
    )
    return processed_frame, intruder_detected, person_count

def process_hls_stream(hls_url, camera_id, max_frames=None):
    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Failed to open HLS stream")
        return False
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    
    logger.info(f"[{camera_id}] Intruder detection started @ {fps} FPS")
    
    frame_count = 0
    start_time = time.time()
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            if frame_should_process(frame_count, SAMPLE_EVERY):
                _, is_intruder, count = detect_intruders(frame, camera_id)
                if frame_count % 90 == 0:  # Log every ~3 seconds
                    if is_intruder:
                        logger.critical(f"[{camera_id}] 🚨 INTRUDER: {count} person(s)")
                    else:
                        logger.info(f"[{camera_id}] Monitoring... (Status: OK)")
            if max_frames and frame_count >= max_frames:
                break
    except KeyboardInterrupt:
        logger.info(f"[{camera_id}] Interrupted")
    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")
    finally:
        if cap:
            cap.release()
        cv2.destroyAllWindows()
    
    return True

def start_camera_detection(config, df, max_frames=None):
    camera_id = config['camera_id']
    try:
        with camera_slot("intruder", MAX_CONCURRENCY):
            hls_url = extract_hls_streaming_url(config['initial_url'])
            if not hls_url or not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] Failed to get HLS stream")
                return
            
            process_hls_stream(hls_url, camera_id, max_frames=max_frames)
            if df is not None:
                with df_lock:
                    df.at[config['index'], 'Intruder Alerts'] = intruder_counts.get(camera_id, 0)
    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")

def main():
    logger.info("=== TCS Intruder Detection System ===\n")
    camera_configs, df = load_camera_config()
    if not camera_configs:
        logger.warning("No outdoor cameras found")
        return
    
    if df is not None and 'Intruder Alerts' not in df.columns:
        df['Intruder Alerts'] = 0
    
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
            t = threading.Thread(target=start_camera_detection, args=(config, df, None))
            t.start()
            threads.append(t)
            time.sleep(1)
        
        try:
            for t in threads:
                t.join()
        except KeyboardInterrupt:
            logger.info("\nStopping...")
    
    if df is not None:
        try:
            df.to_excel(EXCEL_FILE, index=False)
        except Exception as e:
            logger.error(f"Error saving: {e}")

if __name__ == "__main__":
    main()
