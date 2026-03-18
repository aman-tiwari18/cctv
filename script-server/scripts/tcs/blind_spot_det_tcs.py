"""
TCS Blind Spot Detection Script
=================================
Detects blind spots in camera feeds based on:
1. Partial seats/candidates visible in frame
2. Camera placement issues or obstructions
3. Lack of movement detection in inside lab cameras

Compatible with TCS streaming links (HLS format).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import numpy as np
import time
from datetime import datetime
import threading
import pandas as pd
import logging
from collections import deque
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

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

# Import YOLO for person and object detection
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logging.warning("YOLO not available. Person detection will be disabled.")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create blind spot detection results folder
BLIND_SPOT_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/blind_spot_detection")
os.makedirs(BLIND_SPOT_SAVE_FOLDER, exist_ok=True)
logger.info(f"Blind spot detections will be saved to: {BLIND_SPOT_SAVE_FOLDER}")

# Configuration
EXCEL_FILE = os.path.join(PROJECT_ROOT, "cctv_classfication/results/tcs_classification/accessible_cameras_blind_spot.xlsx")
MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")

# Detection thresholds
EDGE_OBSTRUCTION_THRESHOLD = 0.15  # % of frame edges that should be clear
PARTIAL_DETECTION_THRESHOLD = 0.3  # Minimum visibility for a person to not be "partial"
MIN_MOVEMENT_PIXELS = 500  # Minimum movement to consider activity
MOVEMENT_HISTORY_FRAMES = 100  # Number of frames to track movement
STATIC_THRESHOLD = 10  # Consecutive frames with no movement to flag as static
CONFIDENCE_THRESHOLD = 0.4  # YOLO confidence threshold

# Sampling and concurrency
SAMPLE_EVERY = get_sample_every("TCS_BLINDSPOT_SAMPLE_EVERY", 3)
MAX_CONCURRENCY = get_max_concurrency("TCS_BLINDSPOT_MAX_CONCURRENCY", None)
MAX_FRAMES_PER_RUN = get_max_frames_per_run("TCS_BLINDSPOT_MAX_FRAMES_PER_RUN", None)
USE_POOL = get_bool("TCS_USE_WORKER_POOL", False)
POOL_WORKERS = get_max_concurrency("TCS_WORKER_COUNT", 8)
POOL_COOLDOWN = get_positive_float("TCS_POOL_COOLDOWN_SEC", 0.5)

# Thread-safe dataframe lock
df_lock = threading.Lock()

# Global YOLO model
yolo_model = None

def get_yolo_model():
    """Load YOLO model once and reuse"""
    global yolo_model
    if yolo_model is None and YOLO_AVAILABLE:
        logger.info("Loading YOLO model...")
        yolo_model = YOLO(MODEL_PATH)
        logger.info("YOLO model loaded successfully")
    return yolo_model


class BlindSpotDetector:
    """Detects various blind spot issues in camera feeds"""
    
    def __init__(self, camera_id):
        self.camera_id = camera_id
        self.movement_history = deque(maxlen=MOVEMENT_HISTORY_FRAMES)
        self.static_frame_count = 0
        self.previous_frame_gray = None
        self.model = get_yolo_model()
        self.last_detection_time = 0  # Track last detection timestamp
        self.detection_cooldown = 600  # 10 minutes cooldown in seconds
        
        # Detection results
        self.issues = {
            'edge_obstruction': False,
            'partial_persons': False,
            'no_movement': False,
            'obstruction_detected': False
        }
        self.issue_counts = {
            'edge_obstruction': 0,
            'partial_persons': 0,
            'no_movement': 0,
            'obstruction_detected': 0
        }
        self.detections_log = []
    
    def detect_edge_obstruction(self, frame):
        """
        Detect if camera has obstructions at edges (dark/blurred regions)
        Returns: (has_obstruction, obstruction_percentage, annotated_frame)
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Define edge regions (top, bottom, left, right)
        edge_size = int(min(h, w) * 0.1)  # 10% of smaller dimension
        
        edges = {
            'top': gray[0:edge_size, :],
            'bottom': gray[h-edge_size:h, :],
            'left': gray[:, 0:edge_size],
            'right': gray[:, w-edge_size:w]
        }
        
        obstruction_info = {}
        total_obstruction = 0
        
        for edge_name, edge_region in edges.items():
            # Check for darkness (mean intensity)
            mean_intensity = np.mean(edge_region)
            # Check for blur/uniformity (standard deviation)
            std_intensity = np.std(edge_region)
            
            # Consider it obstructed if very dark or very uniform
            is_dark = mean_intensity < 30
            is_uniform = std_intensity < 15
            
            if is_dark or is_uniform:
                obstruction_info[edge_name] = {
                    'obstructed': True,
                    'mean': mean_intensity,
                    'std': std_intensity
                }
                total_obstruction += 0.25  # Each edge is 25%
            else:
                obstruction_info[edge_name] = {
                    'obstructed': False,
                    'mean': mean_intensity,
                    'std': std_intensity
                }
        
        has_obstruction = total_obstruction >= EDGE_OBSTRUCTION_THRESHOLD
        
        # Annotate frame with green markers for blind spots
        annotated = frame.copy()
        y_pos = 30
        color = (0, 255, 0)  # Green for blind spot markers
        cv2.putText(annotated, f"Blind Spot Area: {total_obstruction*100:.1f}%", 
                    (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        # Draw green rectangles/circles for blind spot areas
        if obstruction_info['top']['obstructed']:
            cv2.rectangle(annotated, (0, 0), (w, edge_size), (0, 255, 0), 3)
        if obstruction_info['bottom']['obstructed']:
            cv2.rectangle(annotated, (0, h-edge_size), (w, h), (0, 255, 0), 3)
        if obstruction_info['left']['obstructed']:
            cv2.rectangle(annotated, (0, 0), (edge_size, h), (0, 255, 0), 3)
        if obstruction_info['right']['obstructed']:
            cv2.rectangle(annotated, (w-edge_size, 0), (w, h), (0, 255, 0), 3)
        
        return has_obstruction, total_obstruction, annotated, obstruction_info
    
    def detect_partial_persons(self, frame):
        """
        Detect if persons are partially visible (cut off at edges)
        Returns: (has_partial, partial_count, total_persons, annotated_frame)
        """
        if not YOLO_AVAILABLE or self.model is None:
            return False, 0, 0, frame
        
        h, w = frame.shape[:2]
        results = self.model(frame, conf=CONFIDENCE_THRESHOLD, verbose=False)[0]
        
        # Get person detections (class 0 is person in COCO)
        person_boxes = [box for box in results.boxes if int(box.cls[0]) == 0]
        
        partial_persons = []
        full_persons = []
        
        # Edge margin (consider person partial if within 5% of edge)
        margin = int(min(h, w) * 0.05)
        
        for box in person_boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            
            # Check if person is cut off at edges
            at_left_edge = x1 <= margin
            at_right_edge = x2 >= (w - margin)
            at_top_edge = y1 <= margin
            at_bottom_edge = y2 >= (h - margin)
            
            # Check if box is incomplete (very narrow or very short relative to expected)
            box_width = x2 - x1
            box_height = y2 - y1
            aspect_ratio = box_height / max(box_width, 1)
            
            # Typical person aspect ratio is 1.5-2.5
            is_partial = (at_left_edge or at_right_edge or at_top_edge or at_bottom_edge)
            
            if is_partial:
                partial_persons.append({
                    'box': (x1, y1, x2, y2),
                    'conf': conf,
                    'edges': {
                        'left': at_left_edge,
                        'right': at_right_edge,
                        'top': at_top_edge,
                        'bottom': at_bottom_edge
                    }
                })
            else:
                full_persons.append({
                    'box': (x1, y1, x2, y2),
                    'conf': conf
                })
        
        # Annotate frame - highlight partial areas with green rectangles
        annotated = frame.copy()
        rectangle_color = (0, 255, 0)
        for person in partial_persons:
            x1, y1, x2, y2 = person['box']
            pad_w = int((x2 - x1) * 0.1)
            pad_h = int((y2 - y1) * 0.1)
            cv2.rectangle(
                annotated,
                (max(0, x1 - pad_w), max(0, y1 - pad_h)),
                (min(w, x2 + pad_w), min(h, y2 + pad_h)),
                rectangle_color,
                3
            )
        
        total_persons = len(person_boxes)
        partial_count = len(partial_persons)
        has_partial = partial_count > 0
        
        # Add summary text only
        y_pos = 60
        color = (0, 0, 255) if has_partial else (0, 255, 0)
        cv2.putText(annotated, f"Partial: {partial_count}/{total_persons}", 
                    (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        return has_partial, partial_count, total_persons, annotated
    
    def detect_no_movement(self, frame):
        """
        Detect if there's no movement in the frame (for inside lab cameras)
        Returns: (is_static, movement_score, annotated_frame)
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if self.previous_frame_gray is None:
            self.previous_frame_gray = gray
            return False, 0, frame
        
        # Calculate frame difference
        frame_diff = cv2.absdiff(self.previous_frame_gray, gray)
        _, thresh = cv2.threshold(frame_diff, 25, 255, cv2.THRESH_BINARY)
        
        # Count non-zero pixels (movement)
        movement_pixels = np.count_nonzero(thresh)
        
        # Update movement history
        self.movement_history.append(movement_pixels)
        
        # Check if movement is below threshold
        is_moving = movement_pixels > MIN_MOVEMENT_PIXELS
        
        if not is_moving:
            self.static_frame_count += 1
        else:
            self.static_frame_count = 0
        
        is_static = self.static_frame_count >= STATIC_THRESHOLD
        
        # Calculate average movement over history
        avg_movement = np.mean(self.movement_history) if self.movement_history else 0
        
        # Annotate frame
        annotated = frame.copy()
        y_pos = 90
        color = (0, 0, 255) if is_static else (0, 255, 0)
        cv2.putText(annotated, f"Movement: {movement_pixels} px (Avg: {avg_movement:.0f})", 
                    (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        if is_static:
            cv2.putText(annotated, f"WARNING: NO MOVEMENT ({self.static_frame_count} frames)", 
                       (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        
        self.previous_frame_gray = gray
        
        return is_static, movement_pixels, annotated
    
    def detect_obstruction_patterns(self, frame):
        """
        Detect unusual patterns that might indicate physical obstructions
        Returns: (has_obstruction, obstruction_type, annotated_frame)
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Check for very dark regions (>30% of frame)
        dark_pixels = np.sum(gray < 30)
        total_pixels = gray.size
        dark_ratio = dark_pixels / total_pixels
        
        # Check for very bright/washed out regions
        bright_pixels = np.sum(gray > 220)
        bright_ratio = bright_pixels / total_pixels
        
        # Check for unusual uniformity (lack of texture)
        std_dev = np.std(gray)
        is_uniform = std_dev < 20
        
        obstruction_type = []
        if dark_ratio > 0.3:
            obstruction_type.append("Dark/Covered")
        if bright_ratio > 0.3:
            obstruction_type.append("Overexposed/Washed")
        if is_uniform:
            obstruction_type.append("Uniform/No-Texture")
        
        has_obstruction = len(obstruction_type) > 0
        
        # Annotate frame
        annotated = frame.copy()
        if has_obstruction:
            y_pos = 150
            for obs_type in obstruction_type:
                cv2.putText(annotated, f"OBSTRUCTION: {obs_type}", 
                           (10, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                y_pos += 30
        
        return has_obstruction, obstruction_type, annotated
    
    def analyze_frame(self, frame, is_inside_lab=False):
        """
        Comprehensive blind spot analysis
        Returns: (annotated_frame, issues_dict)
        """
        issues = {}
        
        # 1. Check edge obstruction
        edge_obst, edge_pct, frame_annotated, edge_info = self.detect_edge_obstruction(frame)
        issues['edge_obstruction'] = {
            'detected': edge_obst,
            'percentage': edge_pct,
            'details': edge_info
        }
        if edge_obst:
            self.issue_counts['edge_obstruction'] += 1
        
        # 2. Check for partial persons
        has_partial, partial_cnt, total_cnt, frame_annotated = self.detect_partial_persons(frame_annotated)
        issues['partial_persons'] = {
            'detected': has_partial,
            'partial_count': partial_cnt,
            'total_count': total_cnt
        }
        if has_partial:
            self.issue_counts['partial_persons'] += 1
        
        # 3. Check movement (only for inside lab cameras)
        if is_inside_lab:
            is_static, movement, frame_annotated = self.detect_no_movement(frame_annotated)
            issues['no_movement'] = {
                'detected': is_static,
                'movement_pixels': movement,
                'static_frames': self.static_frame_count
            }
            if is_static:
                self.issue_counts['no_movement'] += 1
        
        # 4. Check for obstruction patterns
        has_obst, obst_types, frame_annotated = self.detect_obstruction_patterns(frame_annotated)
        issues['obstruction_patterns'] = {
            'detected': has_obst,
            'types': obst_types
        }
        if has_obst:
            self.issue_counts['obstruction_detected'] += 1
        
        # Add camera info
        cv2.putText(frame_annotated, f"Camera: {self.camera_id}", 
                   (10, frame_annotated.shape[0] - 10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        return frame_annotated, issues
    
    def save_detection(self, frame, issues):
        """Save detection results to disk (only if persons are detected)"""
        # Check cooldown period
        current_time = time.time()
        if current_time - self.last_detection_time < self.detection_cooldown:
            # Still in cooldown period, skip saving
            return None
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Check if any persons are detected - skip empty labs
        total_persons = issues.get('partial_persons', {}).get('total_count', 0)
        if total_persons == 0:
            # Skip detection if no persons in frame (empty lab)
            return None
        
        # Determine severity
        issue_types = []
        if issues.get('edge_obstruction', {}).get('detected'):
            issue_types.append('edge_obst')
        if issues.get('partial_persons', {}).get('detected'):
            issue_types.append('partial')
        if issues.get('no_movement', {}).get('detected'):
            issue_types.append('static')
        if issues.get('obstruction_patterns', {}).get('detected'):
            issue_types.append('obstructed')
        
        if issue_types:
            issue_str = '_'.join(issue_types)
            filename = f"{BLIND_SPOT_SAVE_FOLDER}/{self.camera_id}_{timestamp}_{issue_str}.jpg"
            cv2.imwrite(filename, frame)
            logger.warning(f"[{self.camera_id}] Blind spot issue detected ({total_persons} persons) - saved: {filename}")
            
            # Update last detection time
            self.last_detection_time = current_time
            
            # Log detection
            self.detections_log.append({
                'timestamp': timestamp,
                'issues': issue_types,
                'details': issues,
                'persons_count': total_persons
            })
            
            return filename
        return None


def load_camera_config():
    """Load camera configuration from Excel file"""
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
        
        # Filter for Computer Lab cameras only
        if 'Scene Classification' in df.columns:
            # Only analyze Computer Lab cameras for blind spot detection
            filtered_df = df[
                df['Scene Classification'].str.contains('Computer Lab', case=False, na=False)
            ].copy()
            logger.info(f"Filtered to {len(filtered_df)} Computer Lab cameras out of {len(df)} total cameras")
        else:
            logger.warning("Scene Classification column not found. Using all cameras.")
            filtered_df = df.copy()
        
        filtered_df = filtered_df.dropna(subset=['CCTV URL'])
        
        camera_configs = []
        for index, row in filtered_df.iterrows():
            initial_url = str(row['CCTV URL']).strip()
            center_name = str(row.get(center_column, 'Unknown'))
            camera_location = str(row.get(location_column, 'Unknown'))
            scene_class = str(row.get('Scene Classification', 'Unknown'))
            
            # Sanitize camera_id
            safe_camera_id = f"{center_name}_{camera_location}".replace('/', '_').replace(' ', '_')
            
            # Determine if it's an inside lab camera
            is_inside_lab = 'lab' in scene_class.lower() or 'inside' in camera_location.lower()
            
            camera_configs.append({
                'initial_url': initial_url,
                'center_name': center_name,
                'camera_location': camera_location,
                'camera_id': safe_camera_id,
                'scene_classification': scene_class,
                'is_inside_lab': is_inside_lab,
                'index': index
            })
        
        logger.info(f"Successfully loaded {len(camera_configs)} camera configurations")
        return camera_configs, df
        
    except Exception as e:
        logger.error(f"Error reading Excel file: {e}")
        return [], None


def process_hls_stream(hls_url, camera_id, is_inside_lab=False, max_frames=None):
    """Process HLS stream for blind spot detection"""
    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error(f"[{camera_id}] Failed to open HLS stream")
        return False
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 60:
        fps = 25.0
    
    logger.info(f"[{camera_id}] Blind spot detection started @ {fps} FPS (Inside Lab: {is_inside_lab})")
    
    detector = BlindSpotDetector(camera_id)
    frame_count = 0
    start_time = time.time()
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            
            if frame_should_process(frame_count, SAMPLE_EVERY):
                # Analyze frame
                annotated_frame, issues = detector.analyze_frame(frame, is_inside_lab)
                
                # Save if issues detected
                detector.save_detection(annotated_frame, issues)
                
                # Log periodically
                if frame_count % 100 == 0:
                    logger.info(f"[{camera_id}] Processed {frame_count} frames. "
                              f"Issues: Edge={detector.issue_counts['edge_obstruction']}, "
                              f"Partial={detector.issue_counts['partial_persons']}, "
                              f"Static={detector.issue_counts['no_movement']}, "
                              f"Obstructed={detector.issue_counts['obstruction_detected']}")
            
            if max_frames and frame_count >= max_frames:
                break
                
    except KeyboardInterrupt:
        logger.info(f"[{camera_id}] Interrupted")
    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}", exc_info=True)
    finally:
        if cap:
            cap.release()
        cv2.destroyAllWindows()
    
    # Log summary
    logger.info(f"[{camera_id}] Summary - Total frames: {frame_count}, "
              f"Edge obstructions: {detector.issue_counts['edge_obstruction']}, "
              f"Partial persons: {detector.issue_counts['partial_persons']}, "
              f"Static detections: {detector.issue_counts['no_movement']}, "
              f"Obstructions: {detector.issue_counts['obstruction_detected']}")
    
    return detector.issue_counts


def start_camera_detection(config, df, max_frames=None):
    """Start blind spot detection for a camera"""
    camera_id = config['camera_id']
    is_inside_lab = config['is_inside_lab']
    
    try:
        with camera_slot("blind_spot", MAX_CONCURRENCY):
            hls_url = extract_hls_streaming_url(config['initial_url'])
            if not hls_url or not test_hls_stream(hls_url):
                logger.error(f"[{camera_id}] Failed to get HLS stream")
                return
            
            issue_counts = process_hls_stream(hls_url, camera_id, is_inside_lab, max_frames=max_frames)
            
            # Update Excel with results
            if df is not None and issue_counts:
                with df_lock:
                    df.at[config['index'], 'Blind Spot - Edge Obstruction'] = issue_counts.get('edge_obstruction', 0)
                    df.at[config['index'], 'Blind Spot - Partial Persons'] = issue_counts.get('partial_persons', 0)
                    df.at[config['index'], 'Blind Spot - No Movement'] = issue_counts.get('no_movement', 0)
                    df.at[config['index'], 'Blind Spot - Obstructions'] = issue_counts.get('obstruction_detected', 0)
                    
    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}", exc_info=True)


def main():
    """Main execution function"""
    logger.info("=== TCS Blind Spot Detection System ===\n")
    
    if not YOLO_AVAILABLE:
        logger.error("YOLO is not available. Please install ultralytics: pip install ultralytics")
        return
    
    camera_configs, df = load_camera_config()
    if not camera_configs:
        logger.warning("No cameras found for blind spot detection")
        return
    
    # Add blind spot columns to DataFrame
    if df is not None:
        for col in ['Blind Spot - Edge Obstruction', 'Blind Spot - Partial Persons', 
                    'Blind Spot - No Movement', 'Blind Spot - Obstructions']:
            if col not in df.columns:
                df[col] = 0
    
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
            t = threading.Thread(target=start_camera_detection, args=(config, df, MAX_FRAMES_PER_RUN))
            t.start()
            threads.append(t)
            time.sleep(1)  # Stagger starts
        
        try:
            for t in threads:
                t.join()
        except KeyboardInterrupt:
            logger.info("\nStopping...")
    
    # Save updated Excel file
    if df is not None:
        try:
            output_file = EXCEL_FILE.replace('.xlsx', '_blind_spot_results.xlsx')
            df.to_excel(output_file, index=False)
            logger.info(f"Results saved to: {output_file}")
        except Exception as e:
            logger.error(f"Error saving results: {e}")


if __name__ == "__main__":
    main()
