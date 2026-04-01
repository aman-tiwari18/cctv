import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import time
import queue
import threading
import pandas as pd
import logging
import torch
from datetime import datetime

# 🔥 FIX ERRORS
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from scripts.detection import Crowd_det_complete as crowd_core

# ================= CONFIG =================
EXCEL_FILE = os.path.join(PROJECT_ROOT, "results/tcs_classification/accessible_cameras_crowd.xlsx")

SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/crowd_detection")
os.makedirs(SAVE_FOLDER, exist_ok=True)
crowd_core.SAVE_FOLDER = SAVE_FOLDER

COOLDOWN_TIME = 30
MIN_PERSONS = 5
GPU_BATCH_SIZE = 64
GPU_QUEUE_SIZE = 1024
THREAD_DELAY = 0.05

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

gpu_queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter('crowd', max_per_minute=25)
_STOP_EVENT = threading.Event()

RTSP_SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/crowd_detection_results")
HLS_SAVE_FOLDER = SAVE_FOLDER
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)

def load_camera_config():
    if not os.path.exists(EXCEL_FILE):
        return []
    df = pd.read_excel(EXCEL_FILE)
    return df.to_dict('records')


def crowd_worker(frame_queue):
    logger.info("🟢 [CrowdWorker] RTSP worker started")
    crowd_core.SAVE_FOLDER = RTSP_SAVE_FOLDER

    while True:
        packet = frame_queue.get()
        if packet is None:
            logger.info("🔴 [CrowdWorker] RTSP worker stopping")
            break

        if isinstance(packet, dict):
            frame = packet.get("frame")
            device_id = str(packet.get("device_id", "unknown"))
            camera_no = str(packet.get("camera_no") or packet.get("ch_no") or "0")
            configs = packet.get("configs") or []
            script_name = packet.get("script_name", "crowd")
            if configs and isinstance(configs, list):
                script_name = configs[0].get("script_code", script_name)
        elif len(packet) == 4:
            frame, device_id, camera_no, script_name = packet
        else:
            frame, device_id, camera_no = packet
            script_name = "crowd"

        try:
            _, is_detected, count = crowd_core.detect_persons_in_frame(
                frame.copy(),
                device_id=str(device_id),
                camera_no=str(camera_no),
                script_name=script_name,
            )
            logger.debug(
                f"[CrowdWorker][RTSP] {device_id}:{camera_no} -> detected={is_detected}, count={count}"
            )
        except Exception as exc:
            logger.error(f"[CrowdWorker][RTSP] Error processing frame: {exc}")


def crowd_worker_hls(camera_configs, stop_event=None):
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT
    
    # 🔥 SCENE FILTER (case-insensitive) - crowds can be in any public/exam area
    valid_scenes = ['classroom', 'computer lab', 'exam', 'crowd', 'lab', 'centre']
    filtered_configs = []
    for cfg in camera_configs:
        if not cfg.get('cctv_url'):
            continue
        cls_val = str(cfg.get('classification', '')).lower()
        if any(scene in cls_val for scene in valid_scenes):
            filtered_configs.append(cfg)
    
    if not filtered_configs:
        logger.warning(f"[CrowdWorker][HLS] No cameras matched Crowd detection scenes. Skipping.")
        return
    
    camera_configs = filtered_configs

    crowd_core.SAVE_FOLDER = HLS_SAVE_FOLDER

    t_gpu = threading.Thread(target=gpu_worker, args=(stop_event,), daemon=True)
    t_gpu.start()

    threads = []
    for cfg in camera_configs:
        t = threading.Thread(target=camera_thread, args=(cfg, stop_event), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    logger.info(
        f"[CrowdWorker][HLS] Started {len(threads)} camera threads + 1 GPU worker"
    )

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

    stop_event.set()

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    logger.info("[CrowdWorker][HLS] ✅ All HLS cameras completed")

def gpu_worker(stop_event):
    logger.info("🟢 GPU Worker started")
    while not stop_event.is_set():
        batch_items = []
        try:
            batch_items.append(gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + 0.2
        while len(batch_items) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch_items.append(gpu_queue.get_nowait())
            except queue.Empty:
                break
        
        if not batch_items:
            continue

        try:
            # Call batch detection
            results = crowd_core.detect_persons_batch(batch_items)
            for item, (res_frame, is_detected, count) in zip(batch_items, results):
                camera_id = item['camera_id']
                ch_no = item['ch_no']
                state = item['state']

                if is_detected:
                    now = time.time()
                    if now - state.get('last_save', 0) > COOLDOWN_TIME:
                        should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
                        if should_save:
                            state['last_save'] = now
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            filename = os.path.join(SAVE_FOLDER, f"crowd_ch{ch_no}_{timestamp}.jpg")
                            cv2.imwrite(filename, res_frame)
                            logger.info(f"🚨 ALERT: CROWD at {camera_id} (count={count})")
        except Exception as e:
            logger.error(f"Error in GPU Worker: {e}")

def camera_thread(cfg, stop_event):
    camera_id = cfg.get('camera_id', 'unknown')
    ch_no = cfg.get('ch_no', 'unknown')
    raw_url = cfg.get('cctv_url', '')

    hls_url = extract_hls_streaming_url(raw_url)
    if not hls_url or not test_hls_stream(hls_url):
        return

    cap = open_hls_stream(hls_url)
    if not cap:
        return

    frame_count = 0
    state = {'last_save': 0}
    
    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        if not frame_should_process(frame_count, 10):
            continue

        try:
            gpu_queue.put({
                'frame': frame.copy(),
                'camera_id': camera_id,
                'ch_no': ch_no,
                'state': state
            }, timeout=0.1)
        except queue.Full:
            continue
    cap.release()

def main():
    configs = load_camera_config()
    # Filter by classification if needed
    allowed = ['Outdoor Scene', 'Outside area', 'Parking Lot', 'Entry', 'Outside', 'Entry/Exit']
    filtered = [c for c in configs if str(c.get('classification', '')) in allowed]

    stop_event = _STOP_EVENT
    t_gpu = threading.Thread(target=gpu_worker, args=(stop_event,), daemon=True)
    t_gpu.start()

    threads = []
    for cfg in filtered:
        t = threading.Thread(target=camera_thread, args=(cfg, stop_event), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(THREAD_DELAY)

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        stop_event.set()

if __name__ == "__main__":
    main()