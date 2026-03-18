"""
TCS Invigilator Tracking Script
================================
Tracks invigilator movement and presence in exam halls.
Compatible with TCS streaming links (HLS format).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
import threading
import pandas as pd
import logging
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

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
sys.path.insert(0, PROJECT_ROOT)
from scripts.detection import invigilator_tracking as inv_core

EXCEL_FILE = os.path.join(PROJECT_ROOT, "/root/cctv/cctv-analytics-system/results/tcs_classification/accessible_cameras_invigilator.xlsx")
MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
RESULTS_DIR = os.path.join(PROJECT_ROOT, "results/tcs_detections/invigilator_detection")
os.makedirs(RESULTS_DIR, exist_ok=True)
DETECTION_THRESHOLD = 0.5
MIN_HEIGHT = 250
SAMPLE_EVERY = get_sample_every("TCS_INVIGILATOR_SAMPLE_EVERY", 2)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_INVIGILATOR_MAX_FRAMES_PER_RUN", None)
USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)
df_lock = threading.Lock()
MAX_CONCURRENCY = get_max_concurrency("TCS_INVIGILATOR_MAX_CONCURRENCY", None)

logger.info("Loading shared YOLO model for invigilator tracking...")
inv_model = inv_core.YOLO(MODEL_PATH)
trackers = {}
invigilator_stats = {}

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
            filtered_df = df[df['Scene Classification'] == 'Computer Lab'].copy()
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

def _get_tracker(camera_id):
    if camera_id not in trackers:
        trackers[camera_id] = inv_core.SimplifiedTracker(
            stream_id=camera_id,
            cam_name=camera_id,
            base_dir=RESULTS_DIR,
            static_threshold=35,
            history_length=10,
        )
        invigilator_stats[camera_id] = {'static_alerts': 0, 'total_tracked': 0}
    return trackers[camera_id]


def track_invigilators(frame, camera_id="unknown"):
    tracker = _get_tracker(camera_id)
    results = inv_model(frame, verbose=False)
    display_frame = frame.copy()
    current_visible_ids = set()
    detections_count = 0

    for result in results:
        detections = []
        boxes = result.boxes.data.tolist()
        for r in boxes:
            x1, y1, x2, y2, score, class_id = r
            x1, x2, y1, y2 = map(int, (x1, x2, y1, y2))
            class_id = int(class_id)
            if score > DETECTION_THRESHOLD and class_id == 0:
                height = y2 - y1
                if height >= MIN_HEIGHT:
                    detections.append([x1, y1, x2, y2, score, height])
                    detections_count += 1

        tracker.update(display_frame, detections, MIN_HEIGHT)

        for track in tracker.tracks:
            track_id = track.track_id
            current_visible_ids.add(track_id)
            tracker.mark_visible(track_id)
            tracker.update_track_status(track_id, track.bbox)
            tracker.check_and_save_static_frames(display_frame, frame, track_id)

            bbox = track.bbox
            color = (0, 0, 255) if tracker.is_static(track_id) else (0, 255, 0)
            cv2.rectangle(display_frame, (int(bbox[0]), int(bbox[1])), (int(bbox[2]), int(bbox[3])), color, 2)

    tracks_to_remove = set(tracker.visibility_status.keys()) - current_visible_ids
    for track_id in tracks_to_remove:
        tracker.mark_invisible(track_id)

    tracker.check_and_save_invisible_frames(display_frame)
    tracker.draw_notifications(display_frame)

    invigilator_stats[camera_id]['total_tracked'] = detections_count
    invigilator_stats[camera_id]['static_alerts'] = len(tracker.static_events_saved)

    static_detected = any(tracker.is_static(tid) for tid in current_visible_ids)
    return display_frame, static_detected, detections_count

def process_hls_stream(hls_url, camera_id, max_frames=None):
    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Failed to open HLS stream")
        return False
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    
    logger.info(f"[{camera_id}] Invigilator tracking started @ {fps} FPS")
    frame_count = 0
    start_time = time.time()
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            if frame_should_process(frame_count, SAMPLE_EVERY):
                _, has_static, total = track_invigilators(frame, camera_id)
                if frame_count % 60 == 0:
                    status = f"Static detected!" if has_static else f"Tracking {total} people"
                    logger.info(f"[{camera_id}] {status}")
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
        with camera_slot("invigilator", MAX_CONCURRENCY):
            hls_url = extract_hls_streaming_url(config['initial_url'])
            if not hls_url or not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] Failed to get HLS stream")
                return
            
            process_hls_stream(hls_url, camera_id, max_frames=max_frames)
            if df is not None and camera_id in invigilator_stats:
                with df_lock:
                    df.at[config['index'], 'Static Alerts'] = invigilator_stats[camera_id]['static_alerts']
                    df.at[config['index'], 'People Tracked'] = invigilator_stats[camera_id]['total_tracked']
    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")

def main():
    logger.info("=== TCS Invigilator Tracking ===\n")
    camera_configs, df = load_camera_config()
    if not camera_configs:
        logger.warning("No computer lab cameras found")
        return
    
    if df is not None:
        if 'Static Alerts' not in df.columns:
            df['Static Alerts'] = 0
        if 'People Tracked' not in df.columns:
            df['People Tracked'] = 0
    
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
