# master_pipeline.py
"""
Master Detection Pipeline
=========================
Supports both RTSP (DSS-auth + ffmpeg pipe) and HLS (GPU-batch workers).
Camera configs loaded from DB via utils.camera_loader (env-var driven).

RTSP flow:
  rtsp_producer → multiprocessing.Queue → RTSP_WORKER_MAP[script](queue)

HLS flow:
  HLS_WORKER_MAP[script](all_camera_configs_list)  — worker manages own threads+GPU

Entry:
  EXAM_ID / SHIFT_ID / LINK_TYPE env vars  +  --analytics flag
  or fallback: API /executions/pending
"""

import multiprocessing as mp
import os
import sys
import time
import argparse
import logging
import signal
import requests
import hashlib
import urllib.parse
import subprocess
import numpy as np
import threading


# ================= PATH SETUP =================
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
sys.path.insert(0, PROJECT_ROOT)

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


import importlib

def get_worker(analytic_name, mode="rtsp"):
    """
    Lazily import the requested worker to prevent loading unused models.
    Returns the worker function for the given analytic and mode (rtsp/hls).
    """
    # Mapping: analytic -> (module_name, rtsp_function_name, hls_function_name)
    mapping = {
        "server":      ("server_room_worker",      "server_room_worker",      "server_room_worker_hls"),
        "crowd":       ("crowd_worker",            "crowd_worker",            "crowd_worker_hls"),
        "intruder":    ("intruder_worker",         "intruder_worker",         "intruder_worker_hls"),
        "entry_exit":  ("entry_exit_worker",       "entry_exit_worker",       "entry_exit_worker_hls"),
        "proximity":   ("close_proximity_worker",  "close_proximity_worker",  "close_proximity_worker_hls"),
        "phone":       ("phone_worker",            "phone_worker",            "phone_worker_hls"),
        "invigilator": ("invigilator_worker",      "invigilator_worker",      "invigilator_worker_hls"),
        "tamper":      ("camera_tampering_worker", "camera_tampering_worker", "camera_tampering_worker_hls"),
        "inversion":   ("camera_inversion_worker", "camera_inversion_worker", "camera_inversion_worker_hls"),
        "crowd_zero":  ("crowd_zero_det_worker",   "crowd_zero_worker",       "crowd_zero_det_worker_hls"),
        "crowd_five":  ("crowd_five_det_worker",   "crowd_five_worker",       "crowd_five_det_worker_hls"),
        "blind_spot":  ("blind_spot_worker",       "blind_spot_worker",       "blind_spot_worker_hls"),
    }
    
    if analytic_name not in mapping:
        logger.error(f"Unknown analytic requested: {analytic_name}")
        return None
        
    module_name, rtsp_fn, hls_fn = mapping[analytic_name]
    try:
        # Try importing as a package first
        try:
            module = importlib.import_module(f"workers.{module_name}")
        except (ImportError, ModuleNotFoundError):
            # Fallback if workers/ directory is already in sys.path
            module = importlib.import_module(module_name)

        fn_name = rtsp_fn if mode.lower() == "rtsp" else hls_fn
        return getattr(module, fn_name)
    except (ImportError, AttributeError, ModuleNotFoundError) as e:
        logger.error(f"Failed to load worker {analytic_name} ({mode}): {e}")
        return None


# ================= CAMERA LOADER (DB-driven) =================
from utils.camera_loader import load_all_pending_cameras, load_cameras_for_execution


# ================= CONFIG =================
QUEUE_SIZE     = 5
STOP           = False
MAX_CONCURRENT = 10          # max concurrent RTSP producers

DSS_USER = "system"
DSS_PASS = "Coreiseven@@"

# Dynamic worker loading enabled – mapping moved to get_worker() helper.


# ================= GRACEFUL SHUTDOWN =================
def handle_sigterm(sig, frame):
    global STOP
    STOP = True
    logger.warning("⛔ SIGTERM / SIGINT received — stopping pipeline...")
    # Signal all HLS worker _STOP_EVENTs so their threads exit cleanly
    for mod_name in [
        "workers.intruder_worker",
        "workers.close_proximity_worker",
        "workers.entry_exit_worker",
        "workers.invigilator_worker",
        "workers.server_room_worker",
        "workers.phone_worker",
        "workers.crowd_worker",
        "workers.crowd_zero_det_worker",
        "workers.crowd_five_det_worker",
        "workers.blind_spot_worker",
        "workers.camera_tampering_worker",
        "workers.camera_inversion_worker",
    ]:
        try:
            mod = sys.modules.get(mod_name)
            if mod and hasattr(mod, "_STOP_EVENT"):
                mod._STOP_EVENT.set()
        except Exception:
            pass

signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT,  handle_sigterm)


# ============================================================
# 🔐 DSS AUTH
# ============================================================
def generate_signature(userName, password, realm, randomKey):
    temp = hashlib.md5(password.encode()).hexdigest()
    temp = hashlib.md5((userName + temp).encode()).hexdigest()
    temp = hashlib.md5(temp.encode()).hexdigest()
    temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
    return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()


def authenticate_and_get_token(server):
    """Fetch a fresh DSS session token — never cached."""
    try:
        url     = f"https://{server}/admin/API/accounts/authorize"
        headers = {"Content-Type": "application/json;charset=UTF-8"}

        r1    = requests.post(url, headers=headers, json={
            "userName":   DSS_USER,
            "ipAddress":  "",
            "clientType": "WINPC_V1"
        }, timeout=10)
        data1 = r1.json()

        sig = generate_signature(DSS_USER, DSS_PASS, data1["realm"], data1["randomKey"])

        r2    = requests.post(url, headers=headers, json={
            "userName":    DSS_USER,
            "signature":   sig,
            "randomKey":   data1["randomKey"],
            "publicKey":   data1["publickey"],
            "encryptType": "MD5",
            "clientType":  "WINPC_V1",
            "userType":    "0"
        }, timeout=10)
        token = r2.json().get("token")

        if not token:
            logger.error(f"❌ DSS auth failed for {server}")
            return None

        logger.info(f"✅ DSS authenticated → {server}")
        return token

    except Exception as e:
        logger.error(f"❌ DSS auth error for {server}: {e}")
        return None


# ============================================================
# 🎥 RTSP HELPERS
# ============================================================
def add_token_to_url(rtsp_url, token):
    parsed = urllib.parse.urlparse(rtsp_url)
    query  = urllib.parse.parse_qs(parsed.query)
    query["token"] = [token]
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(query, doseq=True))
    )


def extract_rtsp_urls(api_data):
    urls = []
    for key in ("url", "url2"):
        raw = api_data.get(key)
        if not raw:
            continue
        urls.extend(p.strip() for p in raw.split("|") if p.strip())
    return urls


def get_rtsp_from_dss(device_id, camera_no, token, server):
    """Returns (urls_list, stream_token) or None."""
    try:
        url     = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"
        headers = {
            "Content-Type":    "application/json;charset=UTF-8",
            "X-Subject-Token": token
        }
        payload = {
            "clientType": "WINPC_V1",
            "project":    "PSDK",
            "method":     "MTS.Video.StartVideo",
            "data": {
                "streamType":  "1",
                "channelId":   f"{device_id}$1$0${camera_no}",
                "dataType":    "2",
                "enableRtsps": "0"
            }
        }
        r    = requests.post(url, headers=headers, json=payload, timeout=10)
        data = r.json()

        if "data" not in data:
            logger.warning(f"⚠️ No 'data' in DSS response for {device_id}_{camera_no}: {data}")
            return None

        urls = extract_rtsp_urls(data["data"])
        if not urls:
            logger.warning(f"⚠️ No RTSP URLs for {device_id}_{camera_no}")
            return None

        return urls, data["data"].get("token")

    except Exception as e:
        logger.error(f"❌ RTSP fetch error for {device_id}_{camera_no}: {e}")
        return None


def order_urls(urls):
    """Prefer public IPs over private 172.x subnets."""
    public  = [u for u in urls if not u.startswith("rtsp://172.")]
    private = [u for u in urls if u.startswith("rtsp://172.")]
    return public + private


# ============================================================
# 🔧 FFMPEG PIPE
# ============================================================
def start_ffmpeg_stream(rtsp_url, width=1920, height=1080):
    cmd = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-timeout",        "10000000",
        "-i",              rtsp_url,
        "-f",              "image2pipe",
        "-pix_fmt",        "bgr24",
        "-vcodec",         "rawvideo",
        "-s",              f"{width}x{height}",
        "-"
    ]
    return subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        bufsize=10 ** 8
    )


def read_frame_from_pipe(pipe, width=1920, height=1080):
    frame_size = width * height * 3
    raw = pipe.stdout.read(frame_size)
    if len(raw) != frame_size:
        return None
    return np.frombuffer(raw, np.uint8).reshape((height, width, 3))


# ============================================================
# 📡 RTSP PRODUCER
# ============================================================
def rtsp_producer(cam_configs, queues):
    """
    Reads frames from a DSS/RTSP camera and puts
    (frame, device_id, camera_no) packets into all worker queues.

    Accepts list-of-configs or a single dict.
    Supports direct RTSP URL (no DSS) when server_ip is absent.
    Re-authenticates after 10 consecutive frame failures.
    """
    if isinstance(cam_configs, dict):
        cam_configs = [cam_configs]

    first         = cam_configs[0]
    device_id     = first.get("camera_id") or first.get("device_id", "")
    camera_no     = first.get("ch_no")     or first.get("camera_no", "1")
    camera_id_pk  = first.get("camera_id_pk", "")   # DB primary key — guaranteed unique
    server        = first.get("server_ip") or first.get("cctv_url", "")
    # Cleanup server: if it's a full URL, extract the host (e.g. D16.camview.io)
    if "://" in str(server):
        from urllib.parse import urlparse
        server = urlparse(str(server)).netloc

    direct_url    = first.get("cctv_url")  or first.get("stream_url", "")
    label         = f"{device_id}_{camera_no}"
    # Use DSS if server is provided and doesn't look like a direct RTSP URL
    use_dss       = bool(server and not str(direct_url).startswith("rtsp://"))

    while not STOP:
        # ── resolve RTSP URL ──────────────────────────────────
        if use_dss:
            token = authenticate_and_get_token(server)
            if not token:
                logger.error(f"❌ Auth failed → {label}, retry in 10s")
                time.sleep(10)
                continue

            result = get_rtsp_from_dss(device_id, camera_no, token, server)
            if not result:
                logger.warning(f"⚠️ No RTSP result → {label}, retry in 10s")
                time.sleep(10)
                continue

            urls, stream_token = result
            ordered = order_urls(urls)
            if not ordered:
                logger.warning(f"⚠️ Empty URL list → {label}")
                time.sleep(10)
                continue

            rtsp_url = add_token_to_url(ordered[0], stream_token)
        else:
            if not direct_url:
                logger.warning(f"⚠️ No server_ip or cctv_url for {label}. Skipping.")
                break
            rtsp_url = direct_url

        logger.info(f"🔥 Connecting → {label}  URL: {rtsp_url}")

        pipe       = start_ffmpeg_stream(rtsp_url)
        fail_count = 0

        while not STOP:
            frame = read_frame_from_pipe(pipe)

            if frame is None:
                fail_count += 1
                logger.warning(f"⚠️ Frame fail #{fail_count} → {label}")
                if fail_count >= 10:
                    logger.warning(f"🔄 Reconnecting → {label}")
                    break
                time.sleep(0.5)
                continue

            fail_count = 0
            # 4-tuple: workers unpack (frame, device_id, camera_no, camera_id_pk)
            # camera_id_pk is the DB primary key — use this for unique file naming
            packet = (frame, device_id, camera_no, camera_id_pk)
            for q in queues:
                if not q.full():
                    q.put(packet)

            time.sleep(0.04)   # ~25 FPS throttle

        try:
            pipe.kill()
            pipe.wait(timeout=3)
        except Exception:
            pass

    # send stop signal to all workers
    for q in queues:
        try:
            q.put(None)
        except Exception:
            pass

    logger.info(f"🔴 RTSP Producer stopped → {label}")


# ============================================================
# 🚀 RTSP PIPELINE RUNNER
# ============================================================
def run_rtsp_pipeline(camera_group, max_concurrent=MAX_CONCURRENT):
    """
    Groups cameras by (camera_id + ch_no) so each physical camera
    gets one producer feeding multiple analytics workers.
    """
    grouped = {}
    for c in camera_group:
        label = f"{c['camera_id']}_{c.get('ch_no') or c.get('camera_no', '1')}"
        grouped.setdefault(label, []).append(c)

    sem = threading.Semaphore(max_concurrent)

    def start_producer(label, configs):
        with sem:
            if STOP:
                return

            queues       = []
            workers      = []
            scripts_seen = set()

            for cfg in configs:
                script = cfg.get("script_code", "")
                if script in scripts_seen:
                    continue
                scripts_seen.add(script)

                worker_fn = get_worker(script, mode="rtsp")
                if not worker_fn:
                    logger.warning(f"⚠️ RTSP Worker '{script}' not found — skipping")
                    continue

                q = mp.Queue(maxsize=QUEUE_SIZE)
                queues.append(q)
                p = mp.Process(
                    target=worker_fn,
                    args=(q,),
                    name=f"{script}_{label}",
                    daemon=True
                )
                workers.append(p)

            if not workers:
                return

            producer = mp.Process(
                target=rtsp_producer,
                args=(configs, queues),
                name=f"prod_{label}",
                daemon=True
            )

            for w in workers:
                w.start()
            producer.start()
            producer.join()        # wait for this camera to finish

            for w in workers:
                if w.is_alive():
                    w.terminate()
                    w.join(timeout=3)

    threads = []
    for label, configs in grouped.items():
        if STOP:
            break
        t = threading.Thread(target=start_producer, args=(label, configs), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(0.5)   # stagger DSS auth

    for t in threads:
        t.join()


# ============================================================
# 🚀 HLS PIPELINE RUNNER
# ============================================================
def run_hls_pipeline(camera_group):
    """
    Groups HLS cameras by script_code and passes the FULL list
    to each HLS worker.  Workers manage their own GPU queue + threads.
    """
    grouped = {}
    for c in camera_group:
        grouped.setdefault(c.get("script_code", ""), []).append(c)

    threads = []
    for script_code, configs in grouped.items():
        worker_fn = get_worker(script_code, mode="hls")
        if not worker_fn:
            logger.warning(f"⚠️ HLS Worker '{script_code}' not found — skipping {len(configs)} cameras")
            continue
        t = threading.Thread(
            target=worker_fn,
            args=(configs,),
            name=f"HLS_{script_code}",
            daemon=True
        )
        t.start()
        threads.append(t)

    for t in threads:
        t.join()


# ============================================================
# 🚀 MAIN
# ============================================================
def main():
    """
    When launched by script-server the assignment is already RUNNING,
    so /executions/pending returns nothing.  Use env vars injected by
    script_runner.py instead; fall back to the API only for standalone runs.
    """
    exam_id   = os.environ.get("EXAM_ID",  "").strip()
    shift_id  = os.environ.get("SHIFT_ID", "").strip()
    link_type = os.environ.get("LINK_TYPE", "").strip().upper()

    if exam_id and shift_id and link_type:
        parser = argparse.ArgumentParser()
        parser.add_argument("--analytics", nargs="+", default=[])
        args, _ = parser.parse_known_args()
        script_codes = args.analytics

        if not script_codes:
            logger.error("❌ --analytics flag missing — specify which analytics to run")
            os._exit(1)

        logger.info(
            f"🔄 Loading cameras from DB "
            f"(exam_id={exam_id}, shift_id={shift_id}, "
            f"link_type={link_type}, analytics={script_codes})..."
        )

        results = []
        for script_code in script_codes:
            execution = {
                "exam_id":     exam_id,
                "shift_id":    shift_id,
                "link_type":   link_type,
                "script_code": script_code,
            }
            cameras = load_cameras_for_execution(execution)
            if cameras:
                results.append((execution, cameras))
            else:
                logger.warning(
                    f"⚠️ No cameras found for '{script_code}' "
                    f"(exam={exam_id}, shift={shift_id}, type={link_type})"
                )
    else:
        logger.info("🔄 Fetching pending executions from API...")
        results = load_all_pending_cameras()

    if not results:
        logger.info("✅ No cameras to process. Exiting.")
        os._exit(0)

    # Separate by link_type
    all_rtsp_cameras = []
    all_hls_cameras  = []

    for ex, cams in results:
        lt = ex.get("link_type", "").upper()
        if lt == "RTSP":
            all_rtsp_cameras.extend(cams)
        elif lt == "HLS":
            all_hls_cameras.extend(cams)
        else:
            logger.warning(f"⚠️ Unknown link_type '{lt}' — skipping {len(cams)} cameras")

    pipeline_threads = []

    if all_rtsp_cameras:
        logger.info(f"📡 Starting RTSP pipeline for {len(all_rtsp_cameras)} cameras...")
        t = threading.Thread(
            target=run_rtsp_pipeline,
            args=(all_rtsp_cameras,),
            name="RTSP-pipeline"
        )
        t.start()
        pipeline_threads.append(t)

    if all_hls_cameras:
        logger.info(f"🌐 Starting HLS pipeline for {len(all_hls_cameras)} cameras...")
        t = threading.Thread(
            target=run_hls_pipeline,
            args=(all_hls_cameras,),
            name="HLS-pipeline"
        )
        t.start()
        pipeline_threads.append(t)

    for t in pipeline_threads:
        t.join()

    logger.info("✅ MASTER PIPELINE COMPLETED")
    os._exit(0)


# ================= ENTRY POINT =================
if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)
    main()