import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import gc
import time
import queue
import threading
import logging
import numpy as np
import torch

# 🔥 FIXED ERRORS
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from detection_rate_limiter import get_rate_limiter
from motion_detector import get_motion_detector
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import (
    frame_should_process,
    get_sample_every,
    get_max_frames_per_run,
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from scripts.detection.utils.db_client import get_hls_cameras, get_rtsp_cameras
from scripts.detection import close_proximity as proximity_core

# === Save folder override ===
PROXIMITY_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/proximity_detection")
os.makedirs(PROXIMITY_SAVE_FOLDER, exist_ok=True)

# Ensure proximity_core has its model path correctly set
MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10x.pt")
proximity_core.proximity_detector = proximity_core.ProximityDetector(MODEL_PATH)
proximity_core.proximity_detector.output_folder = PROXIMITY_SAVE_FOLDER

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# === Configuration ===
# 🔥 SCENE FILTER (case-insensitive)
TARGET_SCENES = ['classroom', 'computer lab', 'exam', 'lab']
SAMPLE_EVERY      = get_sample_every("PROXIMITY_SAMPLE_EVERY", 5)

# Startup stagger — stagger between each thread launch
THREAD_START_DELAY = float(os.environ.get("THREAD_START_DELAY_MS", "50")) / 1000.0

# GPU queue — frames waiting for YOLO inference
GPU_QUEUE_MAX_SIZE = int(os.environ.get("GPU_QUEUE_MAX_SIZE", "192"))

# How many frames per YOLO batch call
GPU_BATCH_SIZE     = int(os.environ.get("GPU_BATCH_SIZE", "48"))

# Cooldown — 90 seconds
COOLDOWN_TIME      = int(os.environ.get("PROXIMITY_COOLDOWN_SEC", "90"))

# Shared state
rate_limiter     = get_rate_limiter('proximity', max_per_minute=25)
df_lock          = threading.Lock()

# ── Shared GPU queue ───────────────────────────────────────────────────────────
gpu_queue = queue.Queue(maxsize=GPU_QUEUE_MAX_SIZE)
_STOP_EVENT = threading.Event()

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/close_proximity_results")
HLS_SAVE_FOLDER = PROXIMITY_SAVE_FOLDER
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)
os.makedirs(HLS_SAVE_FOLDER, exist_ok=True)

def _extract_rtsp_packet(packet, default_script_name="proximity"):
    """
    Unpack RTSP producer packet.
    Returns: (frame, device_id, camera_no, camera_id_pk)
    camera_id_pk = DB primary key (unique) — use for file naming.
    """
    if isinstance(packet, dict):
        return (
            packet.get("frame"),
            str(packet.get("device_id", "unknown")),
            str(packet.get("camera_no") or packet.get("ch_no") or "0"),
            str(packet.get("camera_id_pk", "")),
        )

    if len(packet) == 4:
        # New 4-tuple: (frame, device_id, camera_no, camera_id_pk)
        frame, device_id, camera_no, camera_id_pk = packet
    else:
        frame, device_id, camera_no = packet
        camera_id_pk = ""

    return frame, str(device_id), str(camera_no), str(camera_id_pk)


def _annotate_proximity_frame(frame, person_boxes, violations):
    annotated = frame.copy()

    for index, box in enumerate(person_boxes):
        x1, y1, x2, y2, conf = box
        in_violation = any(v['person1'] == index or v['person2'] == index for v in violations)
        color = (0, 0, 255) if in_violation else (0, 255, 0)
        cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
        cv2.putText(
            annotated,
            f"Person {index + 1}: {float(conf):.2f}",
            (int(x1), int(y1 - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            1,
        )

    for violation in violations:
        box1, box2 = violation['boxes']
        center1 = proximity_core.proximity_detector.get_box_bottom_center(box1)
        center2 = proximity_core.proximity_detector.get_box_bottom_center(box2)
        cv2.line(
            annotated,
            (int(center1[0]), int(center1[1])),
            (int(center2[0]), int(center2[1])),
            (0, 0, 255),
            3,
        )
        mid_x = int((center1[0] + center2[0]) / 2)
        mid_y = int((center1[1] + center2[1]) / 2)
        cv2.putText(
            annotated,
            f"{violation['distance']:.1f}px",
            (mid_x, mid_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 255),
            2,
        )

    return annotated


def _add_status_overlay(frame, violations, person_count, device_id, camera_no):
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, 10), (420, 120), (0, 0, 0), -1)
    cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)

    status_color = (0, 0, 255) if violations else (0, 255, 0)
    status_text = "PROXIMITY VIOLATION!" if violations else "All Clear"
    cv2.putText(frame, status_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
    cv2.putText(frame, f"Candidates Detected: {person_count}", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"Violations: {len(violations)}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"Device: {device_id}, Cam: {camera_no}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    return frame


def _save_violation_frame(frame, violations, device_id, camera_no, save_folder, camera_id_pk=""):
    if not violations:
        return None

    proximity_core.proximity_detector.frame_count += 1
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    if camera_id_pk:
        filename = f"proximity_{camera_id_pk}_{camera_no}_{timestamp}.jpg"
    else:
        filename = f"proximity_{device_id}_{camera_no}_{timestamp}.jpg"
    filepath = os.path.join(save_folder, filename)
    cv2.imwrite(filepath, frame)
    return filepath


def close_proximity_worker(frame_queue):
    logger.info("🟢 [CloseProximityWorker] RTSP worker started")

    while True:
        packet = frame_queue.get()
        if packet is None:
            logger.info("🔴 [CloseProximityWorker] RTSP worker stopping")
            break

        # 4th element is now camera_id_pk, not script_name
        frame, device_id, camera_no, camera_id_pk = _extract_rtsp_packet(packet)
        if frame is None:
            continue

        try:
            output = proximity_core.detect_proximity_batch([
                {
                    "frame": frame.copy(),
                    "camera_id": device_id,
                    "ch_no": camera_no,
                }
            ])[0]
            processed_frame, violation_detected, violation_count, person_boxes, violations = output

            if not violation_detected:
                continue

            annotated = _annotate_proximity_frame(processed_frame, person_boxes, violations)
            final_frame = _add_status_overlay(
                annotated,
                violations,
                len(person_boxes),
                device_id,
                camera_no,
            )
            saved_path = _save_violation_frame(
                final_frame,
                violations,
                device_id,
                camera_no,
                RTSP_SAVE_FOLDER,
                camera_id_pk=str(camera_id_pk),
            )
            logger.critical(
                f"[CloseProximityWorker][RTSP] 🚨 {device_id}:{camera_no} violations={violation_count} saved={saved_path}"
            )
        except Exception as exc:
            logger.error(f"[CloseProximityWorker][RTSP] Error processing frame: {exc}")


def close_proximity_worker_hls(camera_configs, stop_event=None):
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT
    
    # 🔥 SCENE FILTER (case-insensitive)
    valid_scenes = ['classroom', 'computer lab', 'exam', 'lab']
    filtered_configs = []
    for cfg in camera_configs:
        if not cfg.get('cctv_url'):
            continue
        cls_val = str(cfg.get('classification', '')).lower()
        if any(scene in cls_val for scene in valid_scenes):
            filtered_configs.append(cfg)
    
    if not filtered_configs:
        logger.debug(f"[CloseProximityWorker][HLS] No cameras matched Proximity scenes (looking for: {valid_scenes}). Skipping.")
        return
    
    camera_configs = filtered_configs

    logger.info(
        f"[CloseProximityWorker][HLS] Starting true GPU batching for {len(camera_configs)} camera(s); batch size={GPU_BATCH_SIZE}, queue={GPU_QUEUE_MAX_SIZE}"
    )

    gpu_thread = threading.Thread(
        target=gpu_batch_worker,
        args=(stop_event,),
        name="GPU-batch-worker",
        daemon=True,
    )
    gpu_thread.start()

    threads = []
    for config in camera_configs:
        t = threading.Thread(
            target=camera_reader_thread,
            args=(config, None, stop_event),
            name=f"Cam-{config.get('camera_id', 'unknown')}",
            daemon=True,
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_START_DELAY)

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()
    finally:
        stop_event.set()
        gpu_thread.join(timeout=5)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("[CloseProximityWorker][HLS] ✅ All cameras completed")

# ─────────────────────────────────────────────
# 1. DB config loader
# ─────────────────────────────────────────────
def load_camera_config():
    """Load camera configs from DB tables using assignment context env vars."""
    exam_id = str(os.environ.get("EXAM_ID", "")).strip()
    shift_id = str(os.environ.get("SHIFT_ID", "")).strip()
    assignment_date = str(os.environ.get("ASSIGNMENT_DATE", "")).strip() or time.strftime("%Y-%m-%d")
    link_type = str(os.environ.get("LINK_TYPE", "HLS")).strip().upper()

    if not exam_id:
        logger.error("EXAM_ID is required for DB camera loading")
        return []

    try:
        exam_id_int = int(exam_id)
        if link_type == "RTSP":
            rows = get_rtsp_cameras(exam_id_int)
        else:
            shift_id_int = int(shift_id) if shift_id else -1
            rows = get_hls_cameras(exam_id_int, shift_id_int, assignment_date)

        logger.info(f"Loaded {len(rows)} cameras from DB (link_type={link_type})")
        
        configs = []
        for row in rows:
            url = str(row.get("cctv_url") or "").strip()
            if not url:
                continue

            scene = str(row.get("classification") or "").lower()
            if scene and not any(target in scene for target in TARGET_SCENES):
                continue

            configs.append(row)
        return configs
    except Exception as exc:
        logger.error(f"Cannot read cameras from DB: {exc}")
        return []


def main():
    configs = load_camera_config()
    if not configs:
        logger.warning("No cameras found in DB for Proximity detection")
        return
    
    # close_proximity_worker_hls handles the thread orchestration
    close_proximity_worker_hls(configs)

# ─────────────────────────────────────────────
# 2. GPU batch worker — high performance
# ─────────────────────────────────────────────
def gpu_batch_worker(stop_event):
    """
    Unified GPU batch worker for proximity detection.
    Aggregates frames into batches of GPU_BATCH_SIZE for parallel inference.
    """
    logger.info(f"[GPU worker] Started — batch size: {GPU_BATCH_SIZE}")

    while not stop_event.is_set():
        batch = []
        try:
            first = gpu_queue.get(timeout=0.1)
            batch.append(first)
        except queue.Empty:
            continue

        while len(batch) < GPU_BATCH_SIZE:
            try:
                batch.append(gpu_queue.get_nowait())
            except queue.Empty:
                break

        try:
            # Use the new batch detection function in core
            outputs = proximity_core.detect_proximity_batch(batch)

            for item, output in zip(batch, outputs):
                # output = (frame, violation_detected, violation_count, person_boxes, violations)
                item['result_cb'](output[1], output[2], output[0], output[3], output[4], item['ch_no'])
                # Free frame buffer
                del item['frame']

        except Exception as e:
            logger.error(f"[GPU worker] Batch error: {e}")
            for item in batch:
                try:
                    item['result_cb'](False, 0, None, [], [], "0")
                except: pass

    logger.info("[GPU worker] Stopped.")

# ─────────────────────────────────────────────
# 3. Per-camera reader thread
# ─────────────────────────────────────────────
def camera_reader_thread(config, df, stop_event):
    camera_id   = config['camera_id']
    center_name = config.get('center_name', '')
    camera_name = config.get('camera_location') or config.get('camera_name', '')
    ch_no       = config.get('ch_no') or config.get('camera_id', '0')

    cap             = None
    motion_detector = None
    stats = {'frames': 0, 'detections': 0, 'rate_limited': 0, 'no_motion': 0, 'cooldown_skipped': 0}
    last_save_time = {'t': 0.0}

    def on_result(violation_detected, violation_count, frame, person_boxes, violations, ch_num):
        if not violation_detected:
            return

        now = time.time()
        if now - last_save_time['t'] < COOLDOWN_TIME:
            stats['cooldown_skipped'] += 1
            return

        should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
        if should_save:
            last_save_time['t'] = now
            stats['detections'] += 1

            # Draw and Save (CPU bound, done in camera thread)
            annotated = _annotate_proximity_frame(frame, person_boxes, violations)
            annotated = _add_status_overlay(
                annotated, violations, len(person_boxes), camera_id, ch_num
            )
            _save_violation_frame(
                annotated, violations, camera_id, ch_num, HLS_SAVE_FOLDER
            )
            logger.critical(f"[{camera_id}] 🚨 PROXIMITY VIOLATION: {violation_count} pair(s)!")
        else:
            stats['rate_limited'] += 1

    try:
        hls_url = extract_hls_streaming_url(config.get('initial_url') or config.get('cctv_url', ''))
        if not hls_url or not test_hls_stream(hls_url):
            return

        cap = open_hls_stream(hls_url)
        if not cap:
            return

        motion_detector = get_motion_detector(camera_id, motion_threshold=800)

        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret: break

            stats['frames'] += 1
            if not frame_should_process(stats['frames'], SAMPLE_EVERY):
                continue

            if not motion_detector.has_motion(frame):
                stats['no_motion'] += 1
                continue

            if time.time() - last_save_time['t'] < COOLDOWN_TIME:
                stats['cooldown_skipped'] += 1
                continue

            try:
                gpu_queue.put_nowait({
                    'frame': frame,
                    'camera_id': camera_id,
                    'center_name': center_name,
                    'camera_name': camera_name,
                    'ch_no': ch_no,
                    'result_cb': on_result,
                })
            except queue.Full:
                continue

    except Exception as e:
        logger.error(f"[{camera_id}] Error: {e}")
    finally:
        if cap: cap.release()

# ─────────────────────────────────────────────
# 4. Main orchestrator
# ─────────────────────────────────────────────
def main():
    logger.info("=== Close Proximity Detection (HLS — parallel + GPU batch) ===\n")
    
    camera_configs, df = load_camera_config()
    if not camera_configs:
        logger.error("No camera configs found.")
        return

    total = len(camera_configs)
    stop_event = threading.Event()

    # Start GPU batch worker
    gpu_thread = threading.Thread(
        target=gpu_batch_worker,
        args=(stop_event,),
        name="GPU-batch-worker",
        daemon=True,
    )
    gpu_thread.start()

    # Start camera reader threads with stagger
    threads = []
    for i, config in enumerate(camera_configs):
        t = threading.Thread(
            target=camera_reader_thread,
            args=(config, df, stop_event),
            name=f"Cam-{config['camera_id']}",
            daemon=True,
        )
        t.start()
        threads.append(t)
        time.sleep(THREAD_START_DELAY)

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()
    finally:
        stop_event.set()
        gpu_thread.join(timeout=5)
        logger.info("Proximity Detection stopped.")

if __name__ == "__main__":
    main()
