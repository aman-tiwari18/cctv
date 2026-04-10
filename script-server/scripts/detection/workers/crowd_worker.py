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
from tcs_scheduler import frame_should_process
from detection_rate_limiter import get_rate_limiter
from scripts.detection.utils.db_client import get_hls_cameras, get_rtsp_cameras
from scripts.detection import Crowd_det_complete as crowd_core

# 🔥 FIX MKL / oneDNN thread-safety issues
torch.backends.mkldnn.enabled = False
torch.set_num_threads(1)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

# ================= CONFIG =================
# Scene filter (case-insensitive) - crowds can be in any public/exam area
TARGET_SCENES = ['classroom', 'computer lab', 'exam', 'crowd', 'lab', 'centre', 'entry', 'exit', 'outdoor', 'outside area']

SAVE_FOLDER = os.path.join(_DETECTION_ROOT, "results/tcs_detections/crowd_detection")
RTSP_SAVE_FOLDER = os.path.join(_DETECTION_ROOT, "results/crowd_detection_results")

os.makedirs(SAVE_FOLDER, exist_ok=True)
os.makedirs(RTSP_SAVE_FOLDER, exist_ok=True)

# Important logic settings
COOLDOWN_TIME = 90
MIN_PERSONS   = 5
GPU_BATCH_SIZE = 64
GPU_QUEUE_SIZE = 128
THREAD_DELAY = 0.1
SAMPLE_EVERY = 10

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# ================= SHARED STATE ============
gpu_queue = queue.Queue(maxsize=GPU_QUEUE_SIZE)
rate_limiter = get_rate_limiter('crowd', max_per_minute=25)
_STOP_EVENT = threading.Event()

def _handle_stop(sig, frame):
    _STOP_EVENT.set()

if threading.current_thread() is threading.main_thread():
    signal.signal(signal.SIGINT,  _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)


# ================= GPU BATCH WORKER =================
def gpu_worker(stop_event):
    logger.info("\ud83d\ude80 [CrowdWorker] GPU batch worker started (TRUE BATCH MODE)")

    # Model warmup
    crowd_core.get_yolo_model()

    while not stop_event.is_set():
        batch = []
        try:
            batch.append(gpu_queue.get(timeout=0.1))
        except queue.Empty:
            continue

        deadline = time.time() + 0.2
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                batch.append(gpu_queue.get_nowait())
            except queue.Empty:
                time.sleep(0.002)

        # Build inference items
        inference_items = [
            {
                'frame':     item['frame'],
                'ch_no':     item['ch_no'],
                'camera_id': item['camera_id'],
            }
            # Note: item contents passed to core; threshold passed explicitly below
            for item in batch
        ]

        try:
            # 🔥 Pass MIN_PERSONS explicitly to overwrite core's hardcoded 12
            batch_results = crowd_core.detect_persons_batch(inference_items, min_persons=MIN_PERSONS)
            
            for item, (res_frame, is_detected, count) in zip(batch, batch_results):
                camera_id = item['camera_id']
                ch_no = item['ch_no']
                state = item['state']
                source_type = item.get("source_type", "HLS")

                if is_detected:
                    now = time.time()
                    if now - state.get('last_save', 0) > COOLDOWN_TIME:
                        should_save, current_rate, _ = rate_limiter.should_save_detection(camera_id)
                        if should_save:
                            state['last_save'] = now
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            
                            # ── Source-Aware Naming Format ──────────────
                            if source_type == "HLS":
                                filename = os.path.join(SAVE_FOLDER, f"crowd_ch{ch_no}_{timestamp}.jpg")
                            else:
                                dev_id = item.get("device_id") or camera_id
                                filename = os.path.join(RTSP_SAVE_FOLDER, f"crowd_{dev_id}_{ch_no}_{timestamp}.jpg")
                            
                            cv2.imwrite(filename, res_frame)
                            logger.warning(f"\ud83d\udea8 [CrowdWorker] SAVED at {camera_id} (count={count}) \u2192 {os.path.basename(filename)}")
                            del res_frame
                
                # Cleanup
                if 'frame' in item: del item['frame']
            
            del batch
        except Exception as e:
            logger.error(f"[CrowdWorker][GPU] Batch error: {e}")
            for item in batch:
                if 'frame' in item: del item['frame']
            del batch

    logger.info("\ud83d\udd34 [CrowdWorker] GPU worker stopped")


# ================= CAMERA THREAD =================
def camera_thread(cfg, stop_event):
    camera_id = cfg.get('camera_id', 'unknown')
    # ch_no can be ch_code (HLS) or device_id (RTSP)
    ch_no = cfg.get('ch_no') or cfg.get('ch_code') or '0'
    raw_url = cfg.get('cctv_url') or cfg.get('stream_url') or cfg.get('url', '')

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
        if not frame_should_process(frame_count, SAMPLE_EVERY):
            continue

        try:
            gpu_queue.put({
                'frame':       frame,
                'camera_id':   camera_id,
                'ch_no':       ch_no,
                'source_type': 'HLS',
                'state':       state
            }, timeout=0.1)
        except queue.Full:
            del frame
            continue
        del frame
    cap.release()


# ================= WORKER ENTRY POINTS =================
def crowd_worker(frame_queue):
    """
    RTSP Worker Entry Point
    """
    import torch
    logger.info("\ud83d\udfe2 [CrowdWorker] RTSP batch-worker started")
    stop_event = threading.Event()

    gpu_t = threading.Thread(target=gpu_worker, args=(stop_event,), daemon=True)
    gpu_t.start()

    try:
        while True:
            packet = frame_queue.get()
            if packet is None: break

            if isinstance(packet, dict):
                frame        = packet.get("frame")
                device_id    = str(packet.get("device_id", "unknown"))
                camera_no    = str(packet.get("camera_no") or packet.get("ch_no") or "0")
                camera_id_pk = str(packet.get("camera_id_pk", ""))
            elif len(packet) == 4:
                frame, device_id, camera_no, camera_id_pk = packet
            else:
                frame, device_id, camera_no = packet
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
                    "state":        {"last_save": 0},
                }, timeout=0.1)
            except queue.Full: pass
            del frame
    finally:
        stop_event.set()
        gpu_t.join(timeout=5)
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        logger.info("\ud83d\udd34 [CrowdWorker] GPU worker shut down")


def crowd_worker_hls(camera_configs, stop_event=None):
    """
    HLS Worker Entry Point
    """
    import torch
    cv2.setNumThreads(0)
    if isinstance(camera_configs, dict):
        camera_configs = [camera_configs]

    if stop_event is None:
        stop_event = _STOP_EVENT
    
    # Filter
    valid_scenes = ['classroom', 'computer lab', 'exam', 'crowd', 'lab', 'centre']
    filtered = []
    for cfg in camera_configs:
        stream_url = cfg.get('cctv_url') or cfg.get('stream_url')
        if not stream_url: continue
        
        cls_val = str(cfg.get('classification', '')).lower()
        if any(scene in cls_val for scene in valid_scenes) or not cls_val:
            filtered.append(cfg)
    
    if not filtered:
        logger.warning(f"[CrowdWorker][HLS] No cameras matched Crowd scenes. Skipping.")
        return

    gpu_t = threading.Thread(target=gpu_worker, args=(stop_event,), daemon=True)
    gpu_t.start()

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=64) as executor:
        for cfg in filtered:
            # Populate camera_id if missing
            if 'camera_id' not in cfg:
                cam_name = str(cfg.get("camera_name") or "camera")
                ch = str(cfg.get("ch_code") or "0")
                cfg['camera_id'] = f"{cam_name}_{ch}"
            
            executor.submit(camera_thread, cfg, stop_event)
            time.sleep(THREAD_DELAY)

    logger.info(f"[CrowdWorker][HLS] Started {len(filtered)} camera threads + 1 GPU worker")
    stop_event.wait()
    stop_event.set()
    if torch.cuda.is_available(): torch.cuda.empty_cache()


def load_camera_config_db():
    exam_id = str(os.environ.get("EXAM_ID", "")).strip()
    shift_id = str(os.environ.get("SHIFT_ID", "")).strip()
    assignment_date = str(os.environ.get("ASSIGNMENT_DATE", "")).strip() or time.strftime("%Y-%m-%d")
    link_type = str(os.environ.get("LINK_TYPE", "HLS")).strip().upper()

    if not exam_id: return []

    try:
        exam_id_int = int(exam_id)
        if link_type == "RTSP":
            rows = get_rtsp_cameras(exam_id_int)
        else:
            shift_id_int = int(shift_id) if shift_id else -1
            rows = get_hls_cameras(exam_id_int, shift_id_int, assignment_date)
        return rows
    except Exception as exc:
        logger.error(f"DB load error: {exc}")
        return []

def main():
    rows = load_camera_config_db()
    if not rows: return
    crowd_worker_hls(rows)

if __name__ == "__main__":
    main()