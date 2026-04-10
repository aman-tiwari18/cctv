import queue
import sys
import os
import cv2
import time
import threading
import signal
import logging
import torch
from datetime import datetime

# ================= PATH SETUP =================
# Ensure detection root is on path for imports
_DETECTION_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _DETECTION_ROOT not in sys.path:
    sys.path.insert(0, _DETECTION_ROOT)

_PROJECT_ROOT = os.path.abspath(os.path.join(_DETECTION_ROOT, "../.."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# Import local TCS utils + core detection
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process, get_sample_every
from detection_rate_limiter import get_rate_limiter
from scripts.detection.utils.db_client import get_hls_cameras, get_rtsp_cameras
from scripts.detection import close_proximity as proximity_core

# 🔥 FIX MKL / oneDNN thread-safety issues
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

# ================= CONFIG =================
TARGET_SCENES = ['classroom', 'computer lab', 'exam', 'lab']
SAMPLE_EVERY = get_sample_every("PROXIMITY_SAMPLE_EVERY", 5)

SAVE_FOLDER_HLS = os.path.join(_DETECTION_ROOT, "results/tcs_detections/proximity_detection")
SAVE_FOLDER_RTSP = os.path.join(_DETECTION_ROOT, "results/close_proximity_results")

os.makedirs(SAVE_FOLDER_HLS, exist_ok=True)
os.makedirs(SAVE_FOLDER_RTSP, exist_ok=True)

# Important logic settings
COOLDOWN_TIME = 90
GPU_BATCH_SIZE = 64
GPU_QUEUE_SIZE = 128
BATCH_WAIT_TIMEOUT = 0.2
THREAD_DELAY = 0.1

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# ================= SHARED STATE ============
gpu_queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter('proximity', max_per_minute=25)
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT,  _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)


# ================= ANNOTATION HELPERS =================
def _annotate_proximity_frame(frame, person_boxes, violations):
    annotated = frame.copy()
    det_obj = proximity_core.get_proximity_detector()
    
    for index, box in enumerate(person_boxes):
        x1, y1, x2, y2, conf = box
        in_violation = any(v['person1'] == index or v['person2'] == index for v in violations)
        color = (0, 0, 255) if in_violation else (0, 255, 0)
        cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
        cv2.putText(annotated, f"P{index+1}", (int(x1), int(y1-5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

    for v in violations:
        box1, box2 = v['boxes']
        c1 = det_obj.get_box_bottom_center(box1)
        c2 = det_obj.get_box_bottom_center(box2)
        cv2.line(annotated, (int(c1[0]), int(c1[1])), (int(c2[0]), int(c2[1])), (0, 0, 255), 2)
    
    return annotated

def _add_status_overlay(frame, violations, person_count, camera_id, ch_no):
    cv2.rectangle(frame, (5, 5), (350, 100), (0, 0, 0), -1)
    status_text = "PROXIMITY VIOLATION!" if violations else "Secure"
    status_color = (0, 0, 255) if violations else (0, 255, 0)
    cv2.putText(frame, status_text, (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
    cv2.putText(frame, f"Candidates: {person_count}", (15, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"Pairs: {len(violations)}", (15, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"ID: {camera_id} | CH: {ch_no}", (15, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    return frame


# ================= GPU BATCH WORKER =================
def gpu_worker(stop_event):
    logger.info("\ud83d\ude80 [ProximityWorker] GPU batch worker started")
    proximity_core.get_proximity_detector()
    
    cam_state = {}

    while not stop_event.is_set():
        batch = []
        try:
            batch.append(gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + BATCH_WAIT_TIMEOUT
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        try:
            batch_results = proximity_core.detect_proximity_batch(batch)
            
            for item, (res_frame, detected, v_count, p_boxes, violations) in zip(batch, batch_results):
                if not detected:
                    continue
                
                camera_id = item['camera_id']
                ch_no = item['ch_no']
                source_type = item.get("source_type", "HLS")
                
                now = time.time()
                if now - cam_state.get(camera_id, 0) < COOLDOWN_TIME:
                    continue

                should_save, _, _ = rate_limiter.should_save_detection(camera_id)
                if not should_save:
                    continue

                cam_state[camera_id] = now
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                
                # Draw annotations
                final_frame = _annotate_proximity_frame(res_frame, p_boxes, violations)
                final_frame = _add_status_overlay(final_frame, violations, len(p_boxes), camera_id, ch_no)
                
                if source_type == "HLS":
                    filename = os.path.join(SAVE_FOLDER_HLS, f"proximity_ch{ch_no}_{timestamp}.jpg")
                else:
                    dev_id = item.get("device_id") or camera_id
                    filename = os.path.join(SAVE_FOLDER_RTSP, f"proximity_{dev_id}_{ch_no}_{timestamp}.jpg")
                
                cv2.imwrite(filename, final_frame)
                logger.warning(f"\ud83d\udeb5 [ProximityWorker] SAVED violation ({v_count} pairs) at {camera_id} \u2192 {os.path.basename(filename)}")
                del final_frame
                
                if 'frame' in item: del item['frame']
            
            del batch
        except Exception as e:
            logger.error(f"[ProximityWorker][GPU] Batch error: {e}")
            for item in batch:
                if 'frame' in item: del item['frame']
            del batch

    logger.info("\ud83d\udd34 [ProximityWorker] GPU worker stopped")


# ================= CAMERA THREAD =================
def camera_thread(cfg, stop_event):
    from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
    camera_id = cfg.get('camera_id', 'unknown')
    ch_no = cfg.get('ch_code') or cfg.get('ch_no') or '0'
    raw_url = cfg.get('cctv_url') or cfg.get('stream_url', '')

    hls = extract_hls_streaming_url(raw_url)
    if not hls or not test_hls_stream(hls):
        return

    cap = open_hls_stream(hls)
    if not cap:
        return

    frame_count = 0
    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret: break
        
        frame_count += 1
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            gpu_queue.put({
                "frame":       frame,
                "camera_id":   camera_id,
                "ch_no":       ch_no,
                "source_type": "HLS",
            }, timeout=0.1)
        except queue.Full:
            del frame
            continue
        del frame
    cap.release()


# ================= WORKER ENTRY POINTS =================
def close_proximity_worker(frame_queue):
    """ RTSP Entry Point """
    import torch
    logger.info("\ud83d\udfe2 [ProximityWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    gpu_t = threading.Thread(target=gpu_worker, args=(stop_event,), daemon=True)
    gpu_t.start()

    try:
        while True:
            data = frame_queue.get()
            if data is None: break

            if isinstance(data, dict):
                frame        = data.get("frame")
                device_id    = str(data.get("device_id", "unknown"))
                camera_no    = str(data.get("camera_no") or data.get("ch_no") or "0")
                camera_id_pk = str(data.get("camera_id_pk", ""))
            elif len(data) == 4:
                frame, device_id, camera_no, camera_id_pk = data
            else:
                frame, device_id, camera_no = data
                camera_id_pk = ""

            if frame is None: continue

            try:
                gpu_queue.put({
                    "frame":        frame.copy(),
                    "device_id":    str(device_id),
                    "camera_no":    str(camera_no),
                    "ch_no":        str(camera_no),
                    "camera_id_pk": str(camera_id_pk),
                    "camera_id":    f"{device_id}_{camera_no}",
                    "source_type":  "RTSP",
                }, timeout=0.1)
            except queue.Full: pass
            del frame
    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available(): torch.cuda.empty_cache()


def close_proximity_worker_hls(camera_configs, stop_event=None):
    """ HLS Entry Point """
    import torch
    cv2.setNumThreads(0)
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]
    if stop_event is None:
        stop_event = _STOP_EVENT

    # Filter
    valid = []
    for cfg in camera_configs:
        cls_val = str(cfg.get('classification', '')).lower()
        if any(scene in cls_val for scene in TARGET_SCENES) or not cls_val:
            valid.append(cfg)
            
    if not valid:
        logger.warning("[ProximityWorker][HLS] No valid cameras found after filter. Skipping.")
        return

    gpu_t = threading.Thread(target=gpu_worker, args=(stop_event,), daemon=True)
    gpu_t.start()

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in valid:
            if 'camera_id' not in cfg:
                name = str(cfg.get("camera_name") or "camera")
                ch = str(cfg.get("ch_code") or "0")
                cfg['camera_id'] = f"{name}_{ch}"
            
            executor.submit(camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    logger.info(f"[ProximityWorker][HLS] Started {len(valid)} cameras + GPU batch worker")
    stop_event.wait()
    stop_event.set()
    if torch.cuda.is_available(): torch.cuda.empty_cache()

def main():
    exam_id = str(os.environ.get("EXAM_ID", "")).strip()
    if not exam_id: return
    
    from scripts.detection.utils.db_client import get_hls_cameras
    rows = get_hls_cameras(int(exam_id), -1, time.strftime("%Y-%m-%d"))
    close_proximity_worker_hls(rows)

if __name__ == "__main__":
    main()