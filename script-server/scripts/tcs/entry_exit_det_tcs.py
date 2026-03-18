#working with camera name but cam location nhi h
# """
# TCS Entry/Exit Detection Script
# ================================
# Detects entry and exit events in TCS HLS camera streams.
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
# from scripts.detection import Entry_exit_det as entry_core

# from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# logger = logging.getLogger(__name__)

# # Override the save folder for TCS entry/exit detections
# TCS_ENTRY_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")
# os.makedirs(TCS_ENTRY_SAVE_FOLDER, exist_ok=True)
# entry_core.SAVE_FOLDER = TCS_ENTRY_SAVE_FOLDER
# logger.info(f"TCS Entry/Exit detections will be saved to: {TCS_ENTRY_SAVE_FOLDER}")

# EXCEL_FILE = os.path.join(PROJECT_ROOT, "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_entry.xlsx")

# # Reuse the original entry/exit detection logic and shared model
# COOLDOWN_TIME = entry_core.COOLDOWN_TIME
# entry_counts = entry_core.person_counts if hasattr(entry_core, "person_counts") else {}
# SAMPLE_EVERY = get_sample_every("TCS_ENTRY_SAMPLE_EVERY", 10)  # Optimized: process every 10th frame
# MAX_CONCURRENCY = get_max_concurrency("TCS_ENTRY_MAX_CONCURRENCY", None)
# MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_ENTRY_MAX_FRAMES_PER_RUN", None)
# USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
# POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
# POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
# df_lock = threading.Lock()

# # Rate limiter for 25 detections per minute
# rate_limiter = get_rate_limiter('entry_exit', max_per_minute=25)

# def load_camera_config():
#     try:
#         df = pd.read_excel(EXCEL_FILE)
#         logger.info(f"Loaded Excel file: {EXCEL_FILE}")
#         logger.info(f"Available columns: {df.columns.tolist()}")
        
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
        
#         url_column = 'CCTV URL'
        
#         if 'Scene Classification' in df.columns:
#             filtered_df = df[df['Scene Classification'].isin(['Entry', 'Outside area', 'Outside Area'])].copy()
#         else:
#             filtered_df = df.copy()
        
#         filtered_df = filtered_df.dropna(subset=[url_column])
        
#         camera_configs = []
#         for index, row in filtered_df.iterrows():
#             initial_url = str(row[url_column]).strip()
#             center_name = str(row.get(center_column, 'Unknown'))
#             camera_location = str(row.get(location_column, 'Unknown'))
            
#             camera_name = str(row[location_column]).replace('/', '_').replace(' ', '_')

#             camera_configs.append({
#                 'initial_url': initial_url,
#                 'center_name': center_name,
#                 'camera_location': camera_location,
#                 'camera_id': camera_name,
#                 'index': index
#             })
        
#         logger.info(f"Successfully loaded {len(camera_configs)} TCS camera configurations")
#         return camera_configs, df
        
#     except Exception as e:
#         logger.error(f"Error reading Excel file: {e}")
#         import traceback
#         logger.error(traceback.format_exc())
#         return [], None

# def detect_entry_exit(frame, camera_id):
#     # Use the original entry/exit detector logic (person presence + cooldown)
#     processed_frame, entry_exit_detected, person_count = entry_core.detect_persons_in_frame(
#         frame, device_id=camera_id, camera_no=camera_id,camera_name=camera_id
#     )
#     return processed_frame, entry_exit_detected, person_count

# def process_hls_stream(hls_url, camera_id, max_frames=None):
#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[{camera_id}] Failed to open HLS stream")
#         return False
    
#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0
    
#     logger.info(f"[{camera_id}] 🚪 Entry/Exit monitoring started @ {fps} FPS")
#     frame_count = 0
#     detection_count = 0
#     skipped_no_motion = 0
#     skipped_rate_limit = 0
#     start_time = time.time()
#     motion_detector = get_motion_detector(camera_id, motion_threshold=1500)
    
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
#                 _, detected, persons = detect_entry_exit(frame, camera_id)
                
#                 # Check rate limiter before saving
#                 if detected:
#                     should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
#                     if should_save:
#                         detection_count += 1
#                         logger.info(f"[{camera_id}] 🚪 Entry/Exit: {persons} person(s) (Alert {current_rate}/25 this minute)")
#                     else:
#                         skipped_rate_limit += 1
                
#                 if frame_count % 100 == 0:
#                     stats = rate_limiter.get_stats()
#                     logger.info(f"[{camera_id}] Stats: {detection_count} alerts, {skipped_no_motion} no-motion | Rate: {stats['current_rate']}/25/min")
            
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
#         logger.info(f"[{camera_id}] Completed: {detection_count} alerts saved, {skipped_rate_limit} rate-limited")
    
#     return True

# def start_camera_detection(config, df, max_frames=None):
#     camera_id = config['camera_id']
#     try:
#         with camera_slot("entry_exit", MAX_CONCURRENCY):
#             hls_url = extract_hls_streaming_url(config['initial_url'])
#             if not hls_url or not test_hls_stream(hls_url):
#                 logger.error(f"[{camera_id}] Failed to get HLS stream")
#                 return
            
#             process_hls_stream(hls_url, camera_id, max_frames=max_frames)
#             if df is not None:
#                 with df_lock:
#                     df.at[config['index'], 'Entries Detected'] = entry_counts.get(camera_id, 0)
#                     df.at[config['index'], 'Exits Detected'] = entry_counts.get(camera_id, 0)
#     except Exception as e:
#         logger.error(f"[{camera_id}] Error: {e}")

# def main():
#     logger.info("=== TCS Entry/Exit Detection ===\n")
#     camera_configs, df = load_camera_config()
#     if not camera_configs:
#         return
    
#     if df is not None:
#         if 'Entries Detected' not in df.columns:
#             df['Entries Detected'] = 0
#         if 'Exits Detected' not in df.columns:
#             df['Exits Detected'] = 0
    
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
# from scripts.detection import Entry_exit_det as entry_core

# from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# logger = logging.getLogger(__name__)

# # Override the save folder for TCS entry/exit detections
# TCS_ENTRY_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")
# os.makedirs(TCS_ENTRY_SAVE_FOLDER, exist_ok=True)
# entry_core.SAVE_FOLDER = TCS_ENTRY_SAVE_FOLDER
# logger.info(f"TCS Entry/Exit detections will be saved to: {TCS_ENTRY_SAVE_FOLDER}")

# EXCEL_FILE = os.path.join(PROJECT_ROOT, "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_entry.xlsx")

# # Reuse the original entry/exit detection logic and shared model
# COOLDOWN_TIME = entry_core.COOLDOWN_TIME
# entry_counts = entry_core.person_counts if hasattr(entry_core, "person_counts") else {}
# SAMPLE_EVERY = get_sample_every("TCS_ENTRY_SAMPLE_EVERY", 10)  # Optimized: process every 10th frame
# MAX_CONCURRENCY = get_max_concurrency("TCS_ENTRY_MAX_CONCURRENCY", None)
# MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_ENTRY_MAX_FRAMES_PER_RUN", None)
# USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
# POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
# POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
# df_lock = threading.Lock()

# # Rate limiter for 25 detections per minute
# rate_limiter = get_rate_limiter('entry_exit', max_per_minute=25)

# def load_camera_config():
#     try:
#         df = pd.read_excel(EXCEL_FILE)
#         logger.info(f"Loaded Excel file: {EXCEL_FILE}")
#         logger.info(f"Available columns: {df.columns.tolist()}")
        
#         # Support both old and new column names (case-insensitive)
#         center_column = None
#         for col in df.columns:
#             if col.upper() in ['TC NAME', 'TC NAM', 'CENTER NAME', 'CENTRE NAME']:
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
        
#         url_column = 'CCTV URL'
        
#         if 'Scene Classification' in df.columns:
#             filtered_df = df[df['Scene Classification'].isin(['Entry', 'Outside area', 'Outside Area'])].copy()
#         else:
#             filtered_df = df.copy()
        
#         filtered_df = filtered_df.dropna(subset=[url_column])
        
#         camera_configs = []
#         for index, row in filtered_df.iterrows():
#             initial_url = str(row[url_column]).strip()
#             center_name = str(row.get(center_column, 'Unknown'))
#             camera_location = str(row.get(location_column, 'Unknown'))
            
#             camera_name = str(row[location_column]).strip()

#             camera_configs.append({
#                 'initial_url': initial_url,
#                 'center_name': center_name,
#                 'camera_name': camera_name,
#                 'camera_id': f"{center_name}_{camera_name}",
#                 'index': index
#             })
        
#         logger.info(f"Successfully loaded {len(camera_configs)} TCS camera configurations")
#         return camera_configs, df
        
#     except Exception as e:
#         logger.error(f"Error reading Excel file: {e}")
#         import traceback
#         logger.error(traceback.format_exc())
#         return [], None

# def detect_entry_exit(frame, camera_id, center_name, camera_name):

#     safe_center = center_name.replace(" ", "_")
#     safe_camera = camera_name.replace("/", "_").replace(" ", "_")

#     full_camera_name = f"{safe_center}_{safe_camera}"

#     processed_frame, entry_exit_detected, person_count = entry_core.detect_persons_in_frame(
#         frame,
#         device_id=camera_id,
#         camera_no=camera_id,
#         camera_name=full_camera_name
#     )

#     return processed_frame, entry_exit_detected, person_count

# def process_hls_stream(hls_url, camera_id, center_name, camera_name, max_frames=None):
#     cap = open_hls_stream(hls_url)
#     if cap is None or not cap.isOpened():
#         logger.error(f"[{camera_id}] Failed to open HLS stream")
#         return False
    
#     fps = cap.get(cv2.CAP_PROP_FPS)
#     if fps <= 0 or fps > 60:
#         fps = 25.0
    
#     logger.info(f"[{camera_id}] 🚪 Entry/Exit monitoring started @ {fps} FPS")
#     frame_count = 0
#     detection_count = 0
#     skipped_no_motion = 0
#     skipped_rate_limit = 0
#     start_time = time.time()
#     motion_detector = get_motion_detector(camera_id, motion_threshold=1500)
    
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
#                 _, detected, persons = detect_entry_exit(
#                     frame,
#                     camera_id,
#                     center_name,
#                     camera_name
#                 )
                
#                 # Check rate limiter before saving
#                 if detected:
#                     should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
#                     if should_save:
#                         detection_count += 1
#                         logger.info(f"[{camera_id}] 🚪 Entry/Exit: {persons} person(s) (Alert {current_rate}/25 this minute)")
#                     else:
#                         skipped_rate_limit += 1
                
#                 if frame_count % 100 == 0:
#                     stats = rate_limiter.get_stats()
#                     logger.info(f"[{camera_id}] Stats: {detection_count} alerts, {skipped_no_motion} no-motion | Rate: {stats['current_rate']}/25/min")
            
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
#         logger.info(f"[{camera_id}] Completed: {detection_count} alerts saved, {skipped_rate_limit} rate-limited")
    
#     return True

# def start_camera_detection(config, df, max_frames=None):
#     camera_id = config['camera_id']
#     try:
#         with camera_slot("entry_exit", MAX_CONCURRENCY):
#             hls_url = extract_hls_streaming_url(config['initial_url'])
#             if not hls_url or not test_hls_stream(hls_url):
#                 logger.error(f"[{camera_id}] Failed to get HLS stream")
#                 return
            
#             process_hls_stream(
#                 hls_url,
#                 camera_id,
#                 config['center_name'],
#                 config['camera_name'],
#                 max_frames=max_frames
#             )
#             if df is not None:
#                 with df_lock:
#                     df.at[config['index'], 'Entries Detected'] = entry_counts.get(camera_id, 0)
#                     df.at[config['index'], 'Exits Detected'] = entry_counts.get(camera_id, 0)
#     except Exception as e:
#         logger.error(f"[{camera_id}] Error: {e}")

# def main():
#     logger.info("=== TCS Entry/Exit Detection ===\n")
#     camera_configs, df = load_camera_config()
#     if not camera_configs:
#         return
    
#     if df is not None:
#         if 'Entries Detected' not in df.columns:
#             df['Entries Detected'] = 0
#         if 'Exits Detected' not in df.columns:
#             df['Exits Detected'] = 0
    
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




#claude
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# VM/GPU allocator hardening (must be set before torch is imported in entry_core)
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True,max_split_size_mb:128")
os.environ.setdefault("OMP_NUM_THREADS", "1")

# cuDNN sublibrary loading fails on some virtualized GPU stacks.
# Default to CPU for stability; set TCS_ENTRY_FORCE_CPU=0 to try GPU.
_force_cpu = str(os.getenv("TCS_ENTRY_FORCE_CPU", "1")).strip().lower() in {"1", "true", "yes", "on"}
if _force_cpu:
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
    os.environ.setdefault("ONEDNN_MAX_CPU_ISA", "SSE41")
    os.environ.setdefault("DNNL_MAX_CPU_ISA", "SSE41")

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
from scripts.detection import Entry_exit_det as entry_core

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Keep OpenCV from creating many CPU worker threads in virtualized environments
try:
    cv2.setNumThreads(1)
except Exception:
    pass

if _force_cpu:
    logger.warning("TCS_ENTRY_FORCE_CPU is enabled; running Entry/Exit on CPU to avoid cuDNN load failures")
    try:
        if hasattr(entry_core, "torch"):
            entry_core.torch.backends.mkldnn.enabled = False
            entry_core.torch.set_num_threads(1)
            entry_core.torch.set_num_interop_threads(1)
            logger.warning("Disabled MKLDNN/oneDNN acceleration for CPU stability on virtualized CPUs")
    except Exception as _cpu_tune_err:
        logger.warning(f"Could not apply CPU stability tuning: {_cpu_tune_err}")

# Override the save folder for TCS entry/exit detections
TCS_ENTRY_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/entry_exit_detection")
os.makedirs(TCS_ENTRY_SAVE_FOLDER, exist_ok=True)
entry_core.SAVE_FOLDER = TCS_ENTRY_SAVE_FOLDER
logger.info(f"TCS Entry/Exit detections will be saved to: {TCS_ENTRY_SAVE_FOLDER}")

EXCEL_FILE = os.path.join(PROJECT_ROOT, "/root/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_entry.xlsx")

# Reuse the original entry/exit detection logic and shared model
COOLDOWN_TIME = entry_core.COOLDOWN_TIME
entry_counts = entry_core.person_counts if hasattr(entry_core, "person_counts") else {}

# ✅ CUDA OOM Fix:
# - SAMPLE_EVERY=30  → process 1 frame every 30 (reduces GPU calls by 3x)
# - MAX_CONCURRENCY  → limits how many cameras are ACTIVE simultaneously
#   Even though all threads run, camera_slot() ensures only N cameras process frames at once
# - The GPU inference lock in Entry_exit_det.py ensures only 1 thread runs YOLO at a time
SAMPLE_EVERY = get_sample_every("TCS_ENTRY_SAMPLE_EVERY", 45)
MAX_CONCURRENCY = get_max_concurrency("TCS_ENTRY_MAX_CONCURRENCY", 1)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_ENTRY_MAX_FRAMES_PER_RUN", None)
USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 2)
POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
MAX_FRAME_WIDTH = get_max_concurrency("TCS_ENTRY_MAX_FRAME_WIDTH", 960)
df_lock = threading.Lock()

# Rate limiter for 25 detections per minute
rate_limiter = get_rate_limiter('entry_exit', max_per_minute=25)


def load_camera_config():
    try:
        df = pd.read_excel(EXCEL_FILE,engine="openpyxl")
        logger.info(f"Loaded Excel file: {EXCEL_FILE}")
        logger.info(f"Available columns: {df.columns.tolist()}")

        # --- Detect ACTUAL centre name column (e.g. 'Centre Name' with full name like 'iON Digital Zone...') ---
        # Priority: 'Centre Name' / 'Center Name' FIRST, then fallback to 'TC NAME' (which is usually just a number)
        center_column = None
        for col in df.columns:
            if col.strip().upper() in ['CENTRE NAME', 'CENTER NAME']:
                center_column = col
                break
        # Fallback to TC NAME only if no Centre Name column found
        if not center_column:
            for col in df.columns:
                if col.strip().upper() in ['TC NAME', 'TC NAM']:
                    center_column = col
                    break

        # --- Detect camera location/name column ---
        location_column = None
        for col in df.columns:
            if col.strip().upper() in ['CAMERA NAME', 'CAMERA LOCATION']:
                location_column = col
                break

        logger.info(f"Using center_column='{center_column}', location_column='{location_column}'")

        if not center_column or not location_column or 'CCTV URL' not in df.columns:
            logger.error(f"Required columns not found. Available columns: {list(df.columns)}")
            logger.error(f"Looking for: CCTV URL, Centre Name/Center Name, Camera Name/Camera Location")
            return [], None

        url_column = 'CCTV URL'

        if 'Scene Classification' in df.columns:
            filtered_df = df[df['Scene Classification'].isin(['Entry', 'Outside area', 'Outside Area'])].copy()
        else:
            filtered_df = df.copy()

        filtered_df = filtered_df.dropna(subset=[url_column])

        camera_configs = []
        for index, row in filtered_df.iterrows():
            initial_url = str(row[url_column]).strip()
            center_name = str(row.get(center_column, 'Unknown')).strip()
            camera_name = str(row[location_column]).strip()
            # Safe versions for use in camera_id (no slashes)
            safe_center = center_name.replace('/', '_').replace(' ', '_').replace('\\', '_')
            safe_camera = camera_name.replace('/', '_').replace(' ', '_').replace('\\', '_')

            camera_configs.append({
                'initial_url': initial_url,
                'center_name': center_name,    # original (for display & image filename)
                'camera_name': camera_name,    # original (for display & image filename)
                'camera_id': f"{safe_center}_{safe_camera}",  # safe version (no slashes)
                'index': index
            })

        logger.info(f"Successfully loaded {len(camera_configs)} TCS camera configurations")
        return camera_configs, df

    except Exception as e:
        logger.error(f"Error reading Excel file: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return [], None


def detect_entry_exit(frame, camera_id, center_name, camera_name):
    safe_center = center_name.replace(" ", "_").replace("/", "_").replace("\\", "_")
    safe_camera = camera_name.replace("/", "_").replace(" ", "_").replace("\\", "_")

    full_camera_name = f"{safe_center}_{safe_camera}"

    processed_frame, entry_exit_detected, person_count = entry_core.detect_persons_in_frame(
        frame,
        device_id=camera_id,
        camera_no=camera_id,
        camera_name=full_camera_name,
        center_name=center_name  # ✅ Pass center_name so it appears in saved image filename
    )

    return processed_frame, entry_exit_detected, person_count


def process_hls_stream(hls_url, camera_id, center_name, camera_name, max_frames=None):
    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Failed to open HLS stream")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0

    logger.info(f"[{camera_id}] 🚪 Entry/Exit monitoring started @ {fps} FPS")
    frame_count = 0
    detection_count = 0
    skipped_no_motion = 0
    skipped_rate_limit = 0
    start_time = time.time()
    motion_detector = get_motion_detector(camera_id, motion_threshold=1500)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            if frame_should_process(frame_count, SAMPLE_EVERY):
                if MAX_FRAME_WIDTH and frame.shape[1] > MAX_FRAME_WIDTH:
                    scale = MAX_FRAME_WIDTH / float(frame.shape[1])
                    new_h = int(frame.shape[0] * scale)
                    frame = cv2.resize(frame, (MAX_FRAME_WIDTH, new_h), interpolation=cv2.INTER_AREA)

                # Pre-filter: Check for motion
                if not motion_detector.has_motion(frame):
                    skipped_no_motion += 1
                    continue

                # Run detection (center_name is passed through detect_entry_exit -> entry_core)
                _, detected, persons = detect_entry_exit(
                    frame,
                    camera_id,
                    center_name,
                    camera_name
                )

                # Check rate limiter before counting
                if detected:
                    should_save, current_rate, suggested_cooldown = rate_limiter.should_save_detection(camera_id)
                    if should_save:
                        detection_count += 1
                        logger.info(f"[{camera_id}] 🚪 Entry/Exit: {persons} person(s) (Alert {current_rate}/25 this minute)")
                    else:
                        skipped_rate_limit += 1

                if frame_count % 100 == 0:
                    stats = rate_limiter.get_stats()
                    logger.info(f"[{camera_id}] Stats: {detection_count} alerts, {skipped_no_motion} no-motion | Rate: {stats['current_rate']}/25/min")

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
        logger.info(f"[{camera_id}] Completed: {detection_count} alerts saved, {skipped_rate_limit} rate-limited")

    return True


def start_camera_detection(config, df, max_frames=None):
    camera_id = config['camera_id']
    try:
        with camera_slot("entry_exit", MAX_CONCURRENCY):
            hls_url = extract_hls_streaming_url(config['initial_url'])
            if not hls_url or not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] Failed to get HLS stream")
                return

            process_hls_stream(
                hls_url,
                camera_id,
                config['center_name'],
                config['camera_name'],
                max_frames=max_frames
            )

            if df is not None:
                with df_lock:
                    df.at[config['index'], 'Entries Detected'] = entry_counts.get(camera_id, 0)
                    df.at[config['index'], 'Exits Detected'] = entry_counts.get(camera_id, 0)

    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")


def main():
    logger.info("=== TCS Entry/Exit Detection ===\n")
    camera_configs, df = load_camera_config()
    if not camera_configs:
        return

    if df is not None:
        if 'Entries Detected' not in df.columns:
            df['Entries Detected'] = 0
        if 'Exits Detected' not in df.columns:
            df['Exits Detected'] = 0

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