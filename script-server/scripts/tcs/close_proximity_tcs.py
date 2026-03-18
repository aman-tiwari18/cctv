# """
# TCS Close Proximity Detection Script
# =====================================
# Detects people in close proximity in TCS HLS camera streams.
# Compatible with TCS streaming links (HLS format).
# """

# import sys
# import os
# sys.path.insert(0, os.path.dirname(__file__))

# import cv2
# import time
# import threading
# import pandas as pd
# import logging
# import numpy as np
# from detection_rate_limiter import get_rate_limiter
# from motion_detector import get_motion_detector
# from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
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
# from scripts.detection import close_proximity as proximity_core

# # Override save folder for TCS-specific results
# TCS_PROXIMITY_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/proximity_detection")
# os.makedirs(TCS_PROXIMITY_SAVE_FOLDER, exist_ok=True)
# proximity_core.SAVE_FOLDER = TCS_PROXIMITY_SAVE_FOLDER
# # Also override the detector instance's output_folder
# proximity_core.proximity_detector.output_folder = TCS_PROXIMITY_SAVE_FOLDER
# logger_proximity = logging.getLogger(__name__)
# logger_proximity.info(f"TCS Proximity save folder set to: {TCS_PROXIMITY_SAVE_FOLDER}")

# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# logger = logging.getLogger(__name__)

# EXCEL_FILE = os.path.join(PROJECT_ROOT, "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_proximity.xlsx")
# proximity_counts = proximity_core.violation_counts if hasattr(proximity_core, "violation_counts") else {}
# SAMPLE_EVERY = get_sample_every("TCS_PROXIMITY_SAMPLE_EVERY", 5)  # CRITICAL: faster sampling for priority detection
# MAX_CONCURRENCY = get_max_concurrency("TCS_PROXIMITY_MAX_CONCURRENCY", None)
# MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_PROXIMITY_MAX_FRAMES_PER_RUN", None)
# USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
# POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
# POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
# df_lock = threading.Lock()

# # Rate limiter for 25 detections per minute - CRITICAL priority
# rate_limiter = get_rate_limiter('proximity', max_per_minute=25)

# def load_camera_config():
#     try:
#         df = pd.read_excel(EXCEL_FILE)
#         logger.info(f"Loaded Excel file: {EXCEL_FILE}")
        
#         # Support both old and new column names (case-insensitive)
#         center_column = None
#         for col in df.columns:
#             if col.upper() in ['TC NAME', 'TC NAM', 'CENTER NAME']:
#                 center_column = col
#                 break
        
#         location_column = None
#         for col in df.columns:
#             if col.upper() in ['CAMERA NAME', 'CAMERA LOCATION']:
#                 location_column = col
#                 break
        
#         if not center_column or not location_column or 'CCTV URL' not in df.columns:
#             logger.error(f"Required columns not found. Available columns: {list(df.columns)}")
#             logger.error(f"Looking for: CCTV URL, TC NAME/Center Name, Camera Name/Camera Location")
#             return [], None
        
#         # Filter for Computer Lab scenes
#         if 'Scene Classification' in df.columns:
#             filtered_df = df[df['Scene Classification'].isin(['Computer Lab'])].copy()
#         else:
#             filtered_df = df.copy()
        
#         filtered_df = filtered_df.dropna(subset=['CCTV URL'])
        
#         camera_configs = []
#         for index, row in filtered_df.iterrows():
#             center_name = str(row.get(center_column, 'Unknown'))
#             camera_location = str(row.get(location_column, 'Unknown'))
#             # Sanitize camera_id by replacing slashes and spaces with underscores
#             safe_camera_id = f"{center_name}_{camera_location}".replace('/', '_').replace(' ', '_')
#             camera_configs.append({
#                 'initial_url': str(row['CCTV URL']).strip(),
#                 'center_name': center_name,
#                 'camera_location': camera_location,
#                 'camera_id': safe_camera_id,
#                 'index': index
#             })
        
#         logger.info(f"Loaded {len(camera_configs)} TCS camera configurations")
#         return camera_configs, df
#     except Exception as e:
#         logger.error(f"Error reading Excel file: {e}")
#         return [], None

# def detect_proximity_in_frame(frame, camera_id="unknown"):
#     processed_frame, violation_detected, violation_count = proximity_core.detect_proximity_in_frame(
#         frame, device_id=camera_id, camera_no=camera_id
#     )
#     return processed_frame, violation_detected, violation_count

# def process_hls_stream(hls_url, camera_id, max_frames=None):
#     cap = open_hls_stream(hls_url)
#     if not cap:
#         logger.error(f"[{camera_id}] Failed to open stream")
#         return False
    
#     fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
#     logger.info(f"[{camera_id}] 🔍 CRITICAL: Proximity monitoring started @ {fps} FPS")
#     frame_count = 0
#     detection_count = 0
#     skipped_no_motion = 0
#     skipped_rate_limit = 0
#     motion_detector = get_motion_detector(camera_id, motion_threshold=800)
    
#     try:
#         while True:
#             ret, frame = cap.read()
#             if not ret:
#                 break
#             frame_count += 1
            
#             if frame_should_process(frame_count, SAMPLE_EVERY):
#                 # Pre-filter: Check for motion
#                 if not motion_detector.has_motion(frame):
#                     skipped_no_motion += 1
#                     continue
                
#                 # Run detection
#                 _, violation_detected, violation_count = detect_proximity_in_frame(frame, camera_id)
                
#                 # Check rate limiter before saving - CRITICAL alerts
#                 if violation_detected:
#                     should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
#                     if should_save:
#                         detection_count += 1
#                         logger.critical(f"[{camera_id}] 🚨 PROXIMITY VIOLATION: {violation_count} violations! (Alert {current_rate}/25 this minute)")
#                     else:
#                         skipped_rate_limit += 1
#                         logger.warning(f"[{camera_id}] Violation detected but rate limit reached ({current_rate}/25)")
                
#                 if frame_count % 100 == 0:
#                     stats = rate_limiter.get_stats()
#                     logger.info(f"[{camera_id}] Stats: {detection_count} alerts, {skipped_no_motion} no-motion | Rate: {stats['current_rate']}/25/min")
            
#             if max_frames and frame_count >= max_frames:
#                 break
#     except KeyboardInterrupt:
#         logger.info(f"[{camera_id}] Interrupted")
#     finally:
#         cap.release()
#         logger.info(f"[{camera_id}] Completed: {detection_count} alerts saved, {skipped_rate_limit} rate-limited")
#     return True

# def start_camera_detection(config, df, max_frames=None):
#     camera_id = config['camera_id']
#     try:
#         with camera_slot("proximity", MAX_CONCURRENCY):
#             hls_url = extract_hls_streaming_url(config['initial_url'])
#             if hls_url and test_hls_stream(hls_url):
#                 process_hls_stream(hls_url, camera_id, max_frames=max_frames)
#                 if df is not None:
#                     with df_lock:
#                         df.at[config['index'], 'Proximity Violations'] = proximity_counts.get(camera_id, 0)
#     except Exception as e:
#         logger.error(f"[{camera_id}] Error: {e}")

# def main():
#     logger.info("=== TCS Close Proximity Detection ===\n")
#     camera_configs, df = load_camera_config()
#     if not camera_configs:
#         return
    
#     if df is not None and 'Proximity Violations' not in df.columns:
#         df['Proximity Violations'] = 0
    
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













#test
# """
# TCS Close Proximity Detection Script
# =====================================
# Detects people in close proximity in TCS HLS camera streams.
# Compatible with TCS streaming links (HLS format).
# """

# import sys
# import os
# sys.path.insert(0, os.path.dirname(__file__))

# import cv2
# import time
# import threading
# import pandas as pd
# import logging
# import numpy as np
# from detection_rate_limiter import get_rate_limiter
# from motion_detector import get_motion_detector
# from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
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
# from scripts.detection import close_proximity as proximity_core

# # Override save folder for TCS-specific results
# TCS_PROXIMITY_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/proximity_detection")
# os.makedirs(TCS_PROXIMITY_SAVE_FOLDER, exist_ok=True)
# proximity_core.SAVE_FOLDER = TCS_PROXIMITY_SAVE_FOLDER
# # Also override the detector instance's output_folder
# proximity_core.proximity_detector.output_folder = TCS_PROXIMITY_SAVE_FOLDER
# logger_proximity = logging.getLogger(__name__)
# logger_proximity.info(f"TCS Proximity save folder set to: {TCS_PROXIMITY_SAVE_FOLDER}")

# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# logger = logging.getLogger(__name__)

# EXCEL_FILE = os.path.join(PROJECT_ROOT, "/root/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_proximity.xlsx")
# proximity_counts = proximity_core.violation_counts if hasattr(proximity_core, "violation_counts") else {}
# SAMPLE_EVERY = get_sample_every("TCS_PROXIMITY_SAMPLE_EVERY", 5)  # CRITICAL: faster sampling for priority detection
# MAX_CONCURRENCY = get_max_concurrency("TCS_PROXIMITY_MAX_CONCURRENCY", None)
# MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_PROXIMITY_MAX_FRAMES_PER_RUN", None)
# USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
# POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
# POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
# df_lock = threading.Lock()

# # Rate limiter for 25 detections per minute - CRITICAL priority
# rate_limiter = get_rate_limiter('proximity', max_per_minute=25)

# def load_camera_config():
#     try:
#         df = pd.read_excel(EXCEL_FILE)
#         logger.info(f"Loaded Excel file: {EXCEL_FILE}")
        
#         # Priority: prefer 'Centre Name'/'Center Name' over 'TC Name' (TC Name is just a number)
#         center_column = None
#         priority_order = ['CENTRE NAME', 'CENTER NAME', 'CENTRE_NAME', 'CENTER_NAME', 'TC NAME', 'TC NAM']
#         col_map = {col.strip().upper(): col for col in df.columns}
#         logger.info(f"All Excel columns: {list(df.columns)}")
#         for key in priority_order:
#             if key in col_map:
#                 center_column = col_map[key]
#                 logger.info(f"Using column '{center_column}' as centre name")
#                 break
        
#         location_column = None
#         location_priority = ['CAMERA NAME', 'CAMERA LOCATION', 'CAMERA_NAME', 'CAMERA_LOCATION']
#         for key in location_priority:
#             if key in col_map:
#                 location_column = col_map[key]
#                 logger.info(f"Using column '{location_column}' as camera name")
#                 break
        
#         if not center_column or not location_column or 'CCTV URL' not in df.columns:
#             logger.error(f"Required columns not found. Available columns: {list(df.columns)}")
#             logger.error(f"Looking for: CCTV URL, TC NAME/Center Name, Camera Name/Camera Location")
#             return [], None
        
#         # Filter for Computer Lab scenes
#         if 'Scene Classification' in df.columns:
#             filtered_df = df[df['Scene Classification'].isin(['Computer Lab'])].copy()
#         else:
#             filtered_df = df.copy()
        
#         filtered_df = filtered_df.dropna(subset=['CCTV URL'])
        
#         camera_configs = []
#         for index, row in filtered_df.iterrows():
#             center_name = str(row.get(center_column, 'Unknown')).strip()
#             camera_location = str(row.get(location_column, 'Unknown')).strip()
#             # Sanitize camera_id by replacing slashes and spaces with underscores
#             safe_camera_id = f"{center_name}_{camera_location}".replace('/', '_').replace(' ', '_')
#             camera_configs.append({
#                 'initial_url': str(row['CCTV URL']).strip(),
#                 'center_name': center_name,
#                 'camera_location': camera_location,
#                 'camera_id': safe_camera_id,
#                 'index': index
#             })
        
#         logger.info(f"Loaded {len(camera_configs)} TCS camera configurations")
#         for config in camera_configs:
#             logger.info(f"  Centre: {config['center_name']}, Camera: {config['camera_location']}, ID: {config['camera_id']}")
#         return camera_configs, df
#     except Exception as e:
#         logger.error(f"Error reading Excel file: {e}")
#         return [], None

# def detect_proximity_in_frame(frame, camera_id="unknown", center_name="", camera_name=""):
#     """Detect proximity violations in a frame, passing center/camera name for filename"""
#     processed_frame, violation_detected, violation_count = proximity_core.detect_proximity_in_frame(
#         frame,
#         device_id=camera_id,
#         camera_no=camera_id,
#         center_name=center_name,
#         camera_name=camera_name
#     )
#     return processed_frame, violation_detected, violation_count

# def process_hls_stream(hls_url, camera_id, center_name="", camera_name="", max_frames=None):
#     cap = open_hls_stream(hls_url)
#     if not cap:
#         logger.error(f"[{camera_id}] Failed to open stream")
#         return False
    
#     fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
#     logger.info(f"[{camera_id}] 🔍 CRITICAL: Proximity monitoring started @ {fps} FPS")
#     logger.info(f"[{camera_id}] Centre: {center_name}, Camera: {camera_name}")
#     frame_count = 0
#     detection_count = 0
#     skipped_no_motion = 0
#     skipped_rate_limit = 0
#     motion_detector = get_motion_detector(camera_id, motion_threshold=800)
    
#     try:
#         while True:
#             ret, frame = cap.read()
#             if not ret:
#                 break
#             frame_count += 1
            
#             if frame_should_process(frame_count, SAMPLE_EVERY):
#                 # Pre-filter: Check for motion
#                 if not motion_detector.has_motion(frame):
#                     skipped_no_motion += 1
#                     continue
                
#                 # Run detection with center/camera name for proper file naming
#                 _, violation_detected, violation_count = detect_proximity_in_frame(
#                     frame, camera_id,
#                     center_name=center_name,
#                     camera_name=camera_name
#                 )
                
#                 # Check rate limiter before saving - CRITICAL alerts
#                 if violation_detected:
#                     should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
#                     if should_save:
#                         detection_count += 1
#                         logger.critical(f"[{camera_id}] 🚨 PROXIMITY VIOLATION: {violation_count} violations! (Alert {current_rate}/25 this minute)")
#                     else:
#                         skipped_rate_limit += 1
#                         logger.warning(f"[{camera_id}] Violation detected but rate limit reached ({current_rate}/25)")
                
#                 if frame_count % 100 == 0:
#                     stats = rate_limiter.get_stats()
#                     logger.info(f"[{camera_id}] Stats: {detection_count} alerts, {skipped_no_motion} no-motion | Rate: {stats['current_rate']}/25/min")
            
#             if max_frames and frame_count >= max_frames:
#                 break
#     except KeyboardInterrupt:
#         logger.info(f"[{camera_id}] Interrupted")
#     finally:
#         cap.release()
#         logger.info(f"[{camera_id}] Completed: {detection_count} alerts saved, {skipped_rate_limit} rate-limited")
#     return True

# def start_camera_detection(config, df, max_frames=None):
#     camera_id = config['camera_id']
#     center_name = config.get('center_name', '')
#     camera_name = config.get('camera_location', '')
#     try:
#         with camera_slot("proximity", MAX_CONCURRENCY):
#             hls_url = extract_hls_streaming_url(config['initial_url'])
#             if hls_url and test_hls_stream(hls_url):
#                 process_hls_stream(
#                     hls_url, camera_id,
#                     center_name=center_name,
#                     camera_name=camera_name,
#                     max_frames=max_frames
#                 )
#                 if df is not None:
#                     with df_lock:
#                         df.at[config['index'], 'Proximity Violations'] = proximity_counts.get(camera_id, 0)
#     except Exception as e:
#         logger.error(f"[{camera_id}] Error: {e}")

# def main():
#     logger.info("=== TCS Close Proximity Detection ===\n")
#     camera_configs, df = load_camera_config()
#     if not camera_configs:
#         return
    
#     if df is not None and 'Proximity Violations' not in df.columns:
#         df['Proximity Violations'] = 0
    
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



"""
Close Proximity Detection Script (HLS / TCS format)
=====================================================
Detects people in close proximity using HLS camera streams.
Reads CCTV URLs directly from Excel — no API authentication required.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
import threading
import pandas as pd
import logging
import numpy as np
from detection_rate_limiter import get_rate_limiter
from motion_detector import get_motion_detector
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
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
from scripts.detection import close_proximity as proximity_core

# === Save folder override ===
PROXIMITY_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/proximity_detection_results")
os.makedirs(PROXIMITY_SAVE_FOLDER, exist_ok=True)
proximity_core.SAVE_FOLDER = PROXIMITY_SAVE_FOLDER
proximity_core.proximity_detector.output_folder = PROXIMITY_SAVE_FOLDER

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# === Configuration ===
EXCEL_FILE = os.path.join(PROJECT_ROOT, "data/sheets/new_sheet6.xlsx")

# Env-driven tunables (with sensible defaults)
SAMPLE_EVERY       = get_sample_every("PROXIMITY_SAMPLE_EVERY", 5)
MAX_CONCURRENCY    = get_max_concurrency("PROXIMITY_MAX_CONCURRENCY", None)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("PROXIMITY_MAX_FRAMES_PER_RUN", None)
USE_POOL           = get_bool("PROXIMITY_USE_WORKER_POOL", False)
POOL_WORKERS       = get_max_concurrency("PROXIMITY_WORKER_COUNT", 8)
POOL_COOLDOWN      = get_positive_float("PROXIMITY_POOL_COOLDOWN_SEC", 0.5)

df_lock          = threading.Lock()
proximity_counts = proximity_core.violation_counts if hasattr(proximity_core, "violation_counts") else {}

# Rate limiter: max 25 detections per minute per camera
rate_limiter = get_rate_limiter('proximi
ty', max_per_minute=25)


# ─────────────────────────────────────────────
# 1. Excel config loader
# ─────────────────────────────────────────────
def load_camera_config():
    """
    Load camera rows from Excel.

    Expected columns (case-insensitive):
      CCTV URL            – HLS stream URL
      CENTRE NAME / CENTER NAME / TC NAME / TC NAM  – centre identifier
      CAMERA NAME / CAMERA LOCATION                 – camera identifier
      Scene Classification  – used to filter 'Computer Lab' rows (optional)
    """
    try:
        df = pd.read_excel(EXCEL_FILE)
        logger.info(f"Loaded Excel: {EXCEL_FILE}  ({len(df)} rows)")
        logger.info(f"Columns: {list(df.columns)}")

        col_map = {col.strip().upper(): col for col in df.columns}

        # Resolve centre-name column (prefer descriptive name over TC number)
        center_column = None
        for key in ['CENTRE NAME', 'CENTER NAME', 'CENTRE_NAME', 'CENTER_NAME', 'TC NAME', 'TC NAM']:
            if key in col_map:
                center_column = col_map[key]
                logger.info(f"Centre column: '{center_column}'")
                break

        # Resolve camera-location column
        location_column = None
        for key in ['CAMERA NAME', 'CAMERA LOCATION', 'CAMERA_NAME', 'CAMERA_LOCATION']:
            if key in col_map:
                location_column = col_map[key]
                logger.info(f"Camera column: '{location_column}'")
                break

        if not center_column or not location_column or 'CCTV URL' not in df.columns:
            logger.error("Required columns missing.")
            logger.error("Need: 'CCTV URL', a centre-name column, a camera-name column.")
            logger.error(f"Found: {list(df.columns)}")
            return [], None

        # Filter to Computer Lab rows only (if the classification column exists)
        if 'Scene Classification' in df.columns:
            filtered_df = df[df['Scene Classification'].isin(['Computer Lab'])].copy()
            logger.info(f"Filtered to 'Computer Lab': {len(filtered_df)} rows")
        else:
            filtered_df = df.copy()
            logger.info("No 'Scene Classification' column — using all rows")

        filtered_df = filtered_df.dropna(subset=['CCTV URL'])

        camera_configs = []
        for index, row in filtered_df.iterrows():
            center_name     = str(row.get(center_column,   'Unknown')).strip()
            camera_location = str(row.get(location_column, 'Unknown')).strip()
            # Build a filesystem-safe unique ID from centre + camera name
            safe_camera_id = (
                f"{center_name}_{camera_location}"
                .replace('/', '_').replace('\\', '_')
                .replace(' ', '_').replace(':', '-')
            )
            camera_configs.append({
                'initial_url':     str(row['CCTV URL']).strip(),
                'center_name':     center_name,
                'camera_location': camera_location,
                'camera_id':       safe_camera_id,
                'index':           index,
            })

        logger.info(f"Loaded {len(camera_configs)} camera configs")
        for cfg in camera_configs:
            logger.info(
                f"  [{cfg['camera_id']}]  "
                f"Centre: {cfg['center_name']}  |  Camera: {cfg['camera_location']}"
            )

        return camera_configs, df

    except FileNotFoundError:
        logger.error(f"Excel file not found: {EXCEL_FILE}")
        return [], None
    except Exception as e:
        logger.error(f"Error reading Excel: {e}")
        return [], None


# ─────────────────────────────────────────────
# 2. Single-frame detection wrapper
# ─────────────────────────────────────────────
def detect_proximity_in_frame(frame, camera_id="unknown",
                               center_name="", camera_name=""):
    """
    Thin wrapper around proximity_core so that centre/camera names
    flow through to the saved-image filename.
    """
    processed_frame, violation_detected, violation_count = (
        proximity_core.detect_proximity_in_frame(
            frame,
            device_id=camera_id,
            camera_no=camera_id,
            center_name=center_name,
            camera_name=camera_name,
        )
    )
    return processed_frame, violation_detected, violation_count


# ─────────────────────────────────────────────
# 3. HLS stream processor
# ─────────────────────────────────────────────
def process_hls_stream(hls_url, camera_id,
                        center_name="", camera_name="",
                        max_frames=None):
    """
    Read frames from an HLS stream and run proximity detection.

    Per-frame pipeline:
      1. Sample every SAMPLE_EVERY-th frame.
      2. Motion pre-filter  → skip if no movement detected.
      3. YOLO proximity detection.
      4. Rate-limiter gate  → log/save only if per-minute quota allows.
    """
    cap = open_hls_stream(hls_url)
    if not cap:
        logger.error(f"[{camera_id}] Failed to open HLS stream: {hls_url}")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    logger.info(f"[{camera_id}] Stream ready @ {fps:.1f} FPS")
    logger.info(f"[{camera_id}] Centre: {center_name}  |  Camera: {camera_name}")

    frame_count     = 0
    detection_count = 0
    skipped_motion  = 0
    skipped_rate    = 0
    motion_detector = get_motion_detector(camera_id, motion_threshold=800)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                # HLS segment boundary — a single empty read is normal; break cleanly
                logger.warning(f"[{camera_id}] Empty read — end of stream or segment gap")
                break

            frame_count += 1

            if not frame_should_process(frame_count, SAMPLE_EVERY):
                continue

            # ── Motion pre-filter ──────────────────────────────────────────
            if not motion_detector.has_motion(frame):
                skipped_motion += 1
                continue

            # ── Proximity detection ────────────────────────────────────────
            _, violation_detected, violation_count = detect_proximity_in_frame(
                frame,
                camera_id=camera_id,
                center_name=center_name,
                camera_name=camera_name,
            )

            # ── Rate-limiter gate ──────────────────────────────────────────
            if violation_detected:
                should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
                if should_save:
                    detection_count += 1
                    logger.critical(
                        f"[{camera_id}] PROXIMITY VIOLATION: {violation_count} pair(s)! "
                        f"(alert {current_rate}/25 this minute)"
                    )
                else:
                    skipped_rate += 1
                    logger.warning(
                        f"[{camera_id}] Violation detected but rate limit reached "
                        f"({current_rate}/25 per minute)"
                    )

            # ── Periodic heartbeat ─────────────────────────────────────────
            if frame_count % 100 == 0:
                stats = rate_limiter.get_stats()
                logger.info(
                    f"[{camera_id}] Frames: {frame_count} | "
                    f"Alerts: {detection_count} | "
                    f"No-motion skipped: {skipped_motion} | "
                    f"Rate: {stats['current_rate']}/25/min"
                )

            if max_frames and frame_count >= max_frames:
                logger.info(f"[{camera_id}] Reached max_frames={max_frames}, stopping")
                break

    except KeyboardInterrupt:
        logger.info(f"[{camera_id}] Interrupted by user")
    except Exception as e:
        logger.error(f"[{camera_id}] Unexpected error: {e}")
    finally:
        cap.release()
        logger.info(
            f"[{camera_id}] Done — "
            f"frames: {frame_count}, "
            f"alerts saved: {detection_count}, "
            f"rate-limited: {skipped_rate}, "
            f"no-motion skipped: {skipped_motion}"
        )

    return True


# ─────────────────────────────────────────────
# 4. Per-camera entry point (thread / pool target)
# ─────────────────────────────────────────────
def start_camera_detection(config, df, max_frames=None):
    camera_id   = config['camera_id']
    center_name = config.get('center_name', '')
    camera_name = config.get('camera_location', '')

    try:
        with camera_slot("proximity", MAX_CONCURRENCY):
            # Resolve the final playable HLS URL from the raw CCTV URL
            hls_url = extract_hls_streaming_url(config['initial_url'])
            if not hls_url:
                logger.error(
                    f"[{camera_id}] Could not resolve HLS URL from: {config['initial_url']}"
                )
                return

            # Quick connectivity test before committing a long-running thread
            if not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] HLS stream test failed: {hls_url}")
                return

            process_hls_stream(
                hls_url,
                camera_id,
                center_name=center_name,
                camera_name=camera_name,
                max_frames=max_frames,
            )

            # Write violation count back to the shared dataframe
            if df is not None:
                with df_lock:
                    df.at[config['index'], 'Proximity Violations'] = (
                        proximity_counts.get(camera_id, 0)
                    )

    except Exception as e:
        logger.error(f"[{camera_id}] Error in start_camera_detection: {e}")


# ─────────────────────────────────────────────
# 5. Main orchestrator
# ─────────────────────────────────────────────
def main():
    logger.info("=== Close Proximity Detection (HLS) ===\n")

    camera_configs, df = load_camera_config()
    if not camera_configs:
        logger.error("No camera configs found — check the Excel file and column names.")
        return

    # Ensure output column exists
    if df is not None and 'Proximity Violations' not in df.columns:
        df['Proximity Violations'] = 0

    # ── Worker-pool mode ──────────────────────────────────────────────────
    if USE_POOL:
        logger.info(f"Using worker pool: {POOL_WORKERS} workers, cooldown {POOL_COOLDOWN}s")
        pool = CameraWorkerPool(worker_count=POOL_WORKERS, cooldown_sec=POOL_COOLDOWN)
        pool.start()
        for config in camera_configs:
            pool.submit(start_camera_detection, config, df, MAX_FRAMES_PER_RUN)
        try:
            pool.wait_forever()
        except KeyboardInterrupt:
            logger.info("Interrupt received — stopping pool...")
        finally:
            pool.stop()

    # ── Thread-per-camera mode (default) ─────────────────────────────────
    else:
        logger.info(f"Starting {len(camera_configs)} threads (one per camera)...")
        threads = []
        for config in camera_configs:
            t = threading.Thread(
                target=start_camera_detection,
                args=(config, df, None),
                name=f"Proximity-{config['camera_id']}",
                daemon=True,
            )
            t.start()
            threads.append(t)
            time.sleep(1)   # stagger starts to avoid thundering-herd on the stream server

        try:
            for t in threads:
                t.join()
            logger.info("All camera threads completed")
        except KeyboardInterrupt:
            logger.info("Interrupt received — threads will finish their current frame...")

    # ── Persist results ───────────────────────────────────────────────────
    if df is not None:
        try:
            df.to_excel(EXCEL_FILE, index=False)
            logger.info(f"Results saved to: {EXCEL_FILE}")
        except Exception as e:
            logger.error(f"Error saving Excel: {e}")

    logger.info("Proximity detection complete.")


if __name__ == "__main__":
    main()