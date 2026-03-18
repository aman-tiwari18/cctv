"""
TCS Crowd Detection Script
===========================
Detects crowds in TCS HLS camera streams and saves detection results.
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

# Import the original detection logic to reuse the single shared YOLO model
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
sys.path.insert(0, PROJECT_ROOT)

# use of the crowd_det_complete.py
from scripts.detection import Crowd_det_complete as crowd_core   

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Override the save folder for TCS crowd detections
TCS_CROWD_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/crowd_detection")
os.makedirs(TCS_CROWD_SAVE_FOLDER, exist_ok=True)
crowd_core.SAVE_FOLDER = TCS_CROWD_SAVE_FOLDER
logger.info(f"TCS Crowd detections will be saved to: {TCS_CROWD_SAVE_FOLDER}")

# EXCEL_FILE = os.path.join(PROJECT_ROOT, "cctv_classfication/results/tcs_classification/accessible_cameras_crowd.xlsx")
EXCEL_FILE = os.path.join(PROJECT_ROOT, "/root/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_crowd.xlsx")

# Use the same thresholds, cooldowns, and saving rules as the original crowd detector
MIN_PERSONS = crowd_core.MIN_PERSONS
COOLDOWN_TIME = crowd_core.COOLDOWN_TIME
person_counts = crowd_core.person_counts
SAMPLE_EVERY = get_sample_every("TCS_CROWD_SAMPLE_EVERY", 10)  # Optimized: process every 10th frame
MAX_CONCURRENCY = get_max_concurrency("TCS_CROWD_MAX_CONCURRENCY", None)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_CROWD_MAX_FRAMES_PER_RUN", None)
USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
df_lock = threading.Lock()

# Rate limiter for 25 detections per minute
rate_limiter = get_rate_limiter('crowd', max_per_minute=25)

def has_motion(frame, camera_id):
    """Check if frame has significant motion using motion detector."""
    motion_detector = get_motion_detector(camera_id, motion_threshold=1000)
    return motion_detector.has_motion(frame)

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
            
            # Replace slashes and spaces in camera_id to avoid creating nested directories
            safe_camera_id = f"{center_name}_{camera_location}".replace(' ', '_').replace('/', '_')
            
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

def detect_crowd_in_frame(frame, camera_id="unknown"):
    # Delegate detection to the original crowd detector to keep logic identical
    processed_frame, crowd_detected, person_count = crowd_core.detect_persons_in_frame(
        frame, device_id=camera_id, camera_no=camera_id
    )
    return processed_frame, crowd_detected, person_count

def process_hls_stream(hls_url, camera_id, max_frames=None):
    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Failed to open HLS stream")
        return False
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    
    logger.info(f"[{camera_id}] Stream opened successfully @ {fps} FPS")
    frame_count = 0
    detection_count = 0
    skipped_no_motion = 0
    skipped_rate_limit = 0
    start_time = time.time()
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            
            # Check if we should process this frame
            if frame_should_process(frame_count, SAMPLE_EVERY):
                # Pre-filter: Check for motion first (saves GPU cycles)
                if not has_motion(frame, camera_id):
                    skipped_no_motion += 1
                    if frame_count % 100 == 0:
                        logger.debug(f"[{camera_id}] No motion detected, skipping YOLO")
                    continue
                
                # Run detection
                _, crowd_detected, person_count = detect_crowd_in_frame(frame, camera_id)
                
                # Check rate limiter before saving
                if crowd_detected:
                    should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
                    if should_save:
                        detection_count += 1
                        logger.warning(f"[{camera_id}] 🚨 CROWD: {person_count} persons (Alert {current_rate}/25 this minute)")
                    else:
                        skipped_rate_limit += 1
                        logger.info(f"[{camera_id}] Crowd detected but rate limit reached ({current_rate}/25), skipping save")
                
                # Log status periodically
                if frame_count % 100 == 0:
                    stats = rate_limiter.get_stats()
                    elapsed = time.time() - start_time
                    logger.info(
                        f"[{camera_id}] Stats: {frame_count} frames, {detection_count} saved, "
                        f"{skipped_no_motion} no-motion, {skipped_rate_limit} rate-limited | "
                        f"Rate: {stats['current_rate']}/25/min"
                    )

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
        
        # Final stats
        elapsed = time.time() - start_time
        logger.info(
            f"[{camera_id}] Completed: {frame_count} frames in {elapsed:.1f}s | "
            f"Detections saved: {detection_count} | Skipped: {skipped_no_motion} (no motion), "
            f"{skipped_rate_limit} (rate limit)"
        )
    
    return True

def start_camera_detection(config, df, max_frames=None):
    camera_id = config['camera_id']
    try:
        with camera_slot("crowd", MAX_CONCURRENCY):
            hls_url = extract_hls_streaming_url(config['initial_url'])
            if not hls_url or not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] Failed to get HLS stream")
                return
            
            process_hls_stream(hls_url, camera_id, max_frames=max_frames)
            if df is not None:
                with df_lock:
                    df.at[config['index'], 'Persons Detected'] = person_counts.get(camera_id, 0)
    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")

def main():
    logger.info("=== TCS Crowd Detection System ===\n")
    camera_configs, df = load_camera_config()
    
    if not camera_configs:
        return
    
    if df is not None and 'Persons Detected' not in df.columns:
        df['Persons Detected'] = 0
    
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










#test
# """
# TCS Crowd Detection Script
# ===========================
# Detects crowds in TCS HLS camera streams and saves detection results.
# Compatible with TCS streaming links (HLS format).
# """

# import sys
# import os
# sys.path.insert(0, os.path.dirname(__file__))

# import cv2
# import time
# from datetime import datetime
# import threading
# import pandas as pd
# import logging
# import numpy as np
# from detection_rate_limiter import get_rate_limiter
# from motion_detector import get_motion_detector
# from tcs_scheduler import (
#     camera_slot,
#     frame_should_process,
#     get_sample_every,
#     get_max_concurrency,
#     get_max_frames_per_run,
#     get_bool,
#     get_positive_float,
#     CameraWorkerPool,
# )

# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
# sys.path.insert(0, PROJECT_ROOT)

# from scripts.detection import Crowd_det_complete as crowd_core

# from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# logger = logging.getLogger(__name__)

# # Override the save folder for TCS crowd detections
# TCS_CROWD_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/crowd_detection")
# os.makedirs(TCS_CROWD_SAVE_FOLDER, exist_ok=True)
# crowd_core.SAVE_FOLDER = TCS_CROWD_SAVE_FOLDER
# logger.info(f"TCS Crowd detections will be saved to: {TCS_CROWD_SAVE_FOLDER}")

# EXCEL_FILE = os.path.join(PROJECT_ROOT, "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_crowd.xlsx")

# MIN_PERSONS = crowd_core.MIN_PERSONS
# COOLDOWN_TIME = crowd_core.COOLDOWN_TIME
# person_counts = crowd_core.person_counts
# SAMPLE_EVERY = get_sample_every("TCS_CROWD_SAMPLE_EVERY", 10)
# MAX_CONCURRENCY = get_max_concurrency("TCS_CROWD_MAX_CONCURRENCY", None)
# MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_CROWD_MAX_FRAMES_PER_RUN", None)
# USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
# POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
# POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
# df_lock = threading.Lock()

# # Rate limiter for 25 detections per minute
# rate_limiter = get_rate_limiter('crowd', max_per_minute=25)

# def load_camera_config():
#     try:
#         df = pd.read_excel(EXCEL_FILE)
#         logger.info(f"Loaded Excel file: {EXCEL_FILE}")

#         # Priority order: prefer 'Centre Name'/'Center Name' over 'TC Name' (TC Name is just a number)
#         col_map = {col.strip().upper(): col for col in df.columns}
#         logger.info(f"All Excel columns: {list(df.columns)}")

#         center_column = None
#         for key in ['CENTRE NAME', 'CENTER NAME', 'CENTRE_NAME', 'CENTER_NAME', 'TC NAME', 'TC NAM']:
#             if key in col_map:
#                 center_column = col_map[key]
#                 logger.info(f"Using column '{center_column}' as centre name")
#                 break

#         location_column = None
#         for key in ['CAMERA NAME', 'CAMERA LOCATION', 'CAMERA_NAME', 'CAMERA_LOCATION']:
#             if key in col_map:
#                 location_column = col_map[key]
#                 logger.info(f"Using column '{location_column}' as camera name")
#                 break

#         if not center_column or not location_column or 'CCTV URL' not in df.columns:
#             logger.error(f"Required columns not found. Available columns: {list(df.columns)}")
#             logger.error(f"Looking for: CCTV URL, TC NAME/Center Name, Camera Name/Camera Location")
#             return [], None

#         if 'Scene Classification' in df.columns:
#             filtered_df = df[df['Scene Classification'].isin(['Outdoor Scene', 'Outside area', 'Parking Lot', 'Entry'])].copy()
#         else:
#             filtered_df = df.copy()

#         filtered_df = filtered_df.dropna(subset=['CCTV URL'])

#         camera_configs = []
#         for index, row in filtered_df.iterrows():
#             center_name = str(row.get(center_column, 'Unknown')).strip()
#             camera_location = str(row.get(location_column, 'Unknown')).strip()
#             # camera_id for tracking/logging only — filename uses center_name + camera_location directly
#             safe_camera_id = f"{center_name}_{camera_location}".replace('/', '_').replace(' ', '_')
#             camera_configs.append({
#                 'initial_url': str(row['CCTV URL']).strip(),
#                 'center_name': center_name,
#                 'camera_location': camera_location,
#                 'camera_id': safe_camera_id,
#                 'index': index
#             })

#         logger.info(f"Successfully loaded {len(camera_configs)} TCS camera configurations")
#         for config in camera_configs:
#             logger.info(f"  Centre: '{config['center_name']}', Camera: '{config['camera_location']}', ID: '{config['camera_id']}'")
#         return camera_configs, df

#     except Exception as e:
#         logger.error(f"Error reading Excel file: {e}")
#         return [], None

# def detect_crowd_in_frame(frame, camera_id="unknown", center_name="", camera_name=""):
#     """Delegate to crowd_core, passing centre/camera name for clean filenames"""
#     processed_frame, crowd_detected, person_count = crowd_core.detect_persons_in_frame(
#         frame,
#         device_id=camera_id,
#         camera_no=camera_id,
#         center_name=center_name,
#         camera_name=camera_name
#     )
#     return processed_frame, crowd_detected, person_count

# def process_hls_stream(hls_url, camera_id, center_name="", camera_name="", max_frames=None):
#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[{camera_id}] Failed to open HLS stream")
#         return False

#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0

#     logger.info(f"[{camera_id}] Stream opened successfully @ {fps} FPS")
#     logger.info(f"[{camera_id}] Centre: '{center_name}', Camera: '{camera_name}'")
#     frame_count = 0
#     detection_count = 0
#     skipped_no_motion = 0
#     skipped_rate_limit = 0
#     start_time = time.time()
#     motion_detector = get_motion_detector(camera_id, motion_threshold=1000)

#     try:
#         while True:
#             ret, frame = cap.read()
#             if not ret:
#                 break
#             frame_count += 1

#             if frame_should_process(frame_count, SAMPLE_EVERY):
#                 if not motion_detector.has_motion(frame):
#                     skipped_no_motion += 1
#                     continue

#                 # Pass centre/camera name so filenames are clean
#                 _, crowd_detected, person_count = detect_crowd_in_frame(
#                     frame, camera_id,
#                     center_name=center_name,
#                     camera_name=camera_name
#                 )

#                 if crowd_detected:
#                     should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
#                     if should_save:
#                         detection_count += 1
#                         logger.warning(f"[{camera_id}] 🚨 CROWD: {person_count} persons (Alert {current_rate}/25 this minute)")
#                     else:
#                         skipped_rate_limit += 1
#                         logger.info(f"[{camera_id}] Crowd detected but rate limit reached ({current_rate}/25), skipping save")

#                 if frame_count % 100 == 0:
#                     stats = rate_limiter.get_stats()
#                     elapsed = time.time() - start_time
#                     logger.info(
#                         f"[{camera_id}] Stats: {frame_count} frames, {detection_count} saved, "
#                         f"{skipped_no_motion} no-motion, {skipped_rate_limit} rate-limited | "
#                         f"Rate: {stats['current_rate']}/25/min"
#                     )

#             if max_frames and frame_count >= max_frames:
#                 break
#     except KeyboardInterrupt:
#         logger.info(f"[{camera_id}] Interrupted")
#     except Exception as e:
#         logger.error(f"[{camera_id}] Error: {e}")
#     finally:
#         if cap:
#             cap.release()
#         cv2.destroyAllWindows()
#         elapsed = time.time() - start_time
#         logger.info(
#             f"[{camera_id}] Completed: {frame_count} frames in {elapsed:.1f}s | "
#             f"Detections saved: {detection_count} | Skipped: {skipped_no_motion} (no motion), "
#             f"{skipped_rate_limit} (rate limit)"
#         )

#     return True

# def start_camera_detection(config, df, max_frames=None):
#     camera_id = config['camera_id']
#     center_name = config.get('center_name', '')
#     camera_name = config.get('camera_location', '')
#     try:
#         with camera_slot("crowd", MAX_CONCURRENCY):
#             hls_url = extract_hls_streaming_url(config['initial_url'])
#             if not hls_url or not test_hls_stream(hls_url):
#                 logger.error(f"[{camera_id}] Failed to get HLS stream")
#                 return

#             process_hls_stream(
#                 hls_url, camera_id,
#                 center_name=center_name,
#                 camera_name=camera_name,
#                 max_frames=max_frames
#             )
#             if df is not None:
#                 with df_lock:
#                     df.at[config['index'], 'Persons Detected'] = person_counts.get(camera_id, 0)
#     except Exception as e:
#         logger.error(f"[{camera_id}] Error: {e}")

# def main():
#     logger.info("=== TCS Crowd Detection System ===\n")
#     camera_configs, df = load_camera_config()

#     if not camera_configs:
#         return

#     if df is not None and 'Persons Detected' not in df.columns:
#         df['Persons Detected'] = 0

#     if USE_POOL:
#         pool = CameraWorkerPool(worker_count=POOL_WORKERS, cooldown_sec=POOL_COOLDOWN)
#         pool.start()
#         for config in camera_configs:
#             pool.submit(start_camera_detection, config, df, MAX_FRAMES_PER_RUN)
#         try:
#             pool.wait_forever()
#         finally:
#             pool.stop()
#     else:
#         threads = []
#         for config in camera_configs:
#             t = threading.Thread(target=start_camera_detection, args=(config, df, None))
#             t.start()
#             threads.append(t)
#             time.sleep(1)

#         try:
#             for t in threads:
#                 t.join()
#         except KeyboardInterrupt:
#             logger.info("\nStopping...")

#     if df is not None:
#         try:
#             df.to_excel(EXCEL_FILE, index=False)
#         except Exception as e:
#             logger.error(f"Error saving: {e}")

# if __name__ == "__main__":
#     main()