



#working_before_hls
#master_pipeline.py
# import multiprocessing as mp
# import os
# import sys
# import time
# import argparse
# import logging
# import signal
# import pandas as pd
# import requests
# import hashlib
# import urllib.parse
# import subprocess
# import numpy as np
# import threading


# # ================= PATH SETUP =================
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
# sys.path.insert(0, PROJECT_ROOT)

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )

# # ================= IMPORT WORKERS =================
# from workers.server_room_worker import server_room_worker
# from workers.crowd_worker import crowd_worker
# from workers.intruder_worker import intruder_worker
# from workers.entry_exit_worker import entry_exit_worker
# from workers.close_proximity_worker import close_proximity_worker
# from workers.phone_worker import phone_worker
# from workers.invigilator_worker import invigilator_worker

# # ================= CONFIG =================
# EXCEL_PATH = os.path.join(PROJECT_ROOT, "sheet", "2000+RTSP_links_of_centre_CR_&_NR_MTS-2026.xlsx")

# QUEUE_SIZE = 5
# STOP = False

# # Max cameras to run concurrently
# MAX_CONCURRENT = 10

# DSS_USER = "system"
# DSS_PASS  = "Coreiseven@@"

# WORKER_MAP = {
#     "server":     server_room_worker,
#     "crowd":      crowd_worker,
#     "intruder":   intruder_worker,
#     "entry_exit": entry_exit_worker,
#     "proximity":  close_proximity_worker,
#     "phone":      phone_worker,
#     "invigilator": invigilator_worker,
# }

# # ================= SIGNAL =================
# def handle_sigterm(sig, frame):
#     global STOP
#     STOP = True
#     logging.warning("⛔ SIGTERM received. Stopping pipeline...")

# signal.signal(signal.SIGTERM, handle_sigterm)
# signal.signal(signal.SIGINT, handle_sigterm)

# # ================= ARG PARSER =================
# def parse_args():
#     parser = argparse.ArgumentParser()
#     parser.add_argument("--analytics", nargs="+", required=True)
#     return parser.parse_args()


# # ============================================================
# # 🔐 DSS AUTH
# # ============================================================
# def generate_signature(userName, password, realm, randomKey):
#     temp = hashlib.md5(password.encode()).hexdigest()
#     temp = hashlib.md5((userName + temp).encode()).hexdigest()
#     temp = hashlib.md5(temp.encode()).hexdigest()
#     temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
#     return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()


# def authenticate_and_get_token(server):
#     """Always returns a fresh token. Never cached."""
#     try:
#         url = f"https://{server}/admin/API/accounts/authorize"
#         headers = {"Content-Type": "application/json;charset=UTF-8"}

#         payload = {
#             "userName": DSS_USER,
#             "ipAddress": "",
#             "clientType": "WINPC_V1"
#         }

#         r1 = requests.post(url, headers=headers, json=payload, timeout=10)
#         data1 = r1.json()

#         signature = generate_signature(
#             DSS_USER,
#             DSS_PASS,
#             data1["realm"],
#             data1["randomKey"]
#         )

#         payload2 = {
#             "userName": DSS_USER,
#             "signature": signature,
#             "randomKey": data1["randomKey"],
#             "publicKey": data1["publickey"],
#             "encryptType": "MD5",
#             "clientType": "WINPC_V1",
#             "userType": "0"
#         }

#         r2 = requests.post(url, headers=headers, json=payload2, timeout=10)
#         token = r2.json().get("token")

#         if not token:
#             logging.error(f"❌ DSS auth failed for {server}")
#             return None

#         logging.info(f"✅ DSS authenticated → {server}")
#         return token

#     except Exception as e:
#         logging.error(f"❌ DSS auth error for {server}: {e}")
#         return None


# # ============================================================
# # 🎥 RTSP HELPERS
# # ============================================================
# def add_token_to_url(rtsp_url, token):
#     parsed = urllib.parse.urlparse(rtsp_url)
#     query = urllib.parse.parse_qs(parsed.query)
#     query["token"] = [token]
#     return urllib.parse.urlunparse(
#         parsed._replace(query=urllib.parse.urlencode(query, doseq=True))
#     )


# def extract_rtsp_urls(api_data):
#     urls = []
#     for key in ("url", "url2"):
#         raw = api_data.get(key)
#         if not raw:
#             continue
#         parts = [part.strip() for part in raw.split("|") if part.strip()]
#         urls.extend(parts)
#     return urls


# def get_rtsp_from_dss(device_id, camera_no, token, server):
#     """
#     Returns (urls_list, stream_token) or None.
#     Does NOT add the token to URLs — caller is responsible.
#     """
#     try:
#         url = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"

#         payload = {
#             "clientType": "WINPC_V1",
#             "project": "PSDK",
#             "method": "MTS.Video.StartVideo",
#             "data": {
#                 "streamType": "1",
#                 "channelId": f"{device_id}$1$0${camera_no}",
#                 "dataType": "2",
#                 "enableRtsps": "0"
#             }
#         }

#         headers = {
#             "Content-Type": "application/json;charset=UTF-8",
#             "X-Subject-Token": token
#         }

#         r = requests.post(url, headers=headers, json=payload, timeout=10)
#         data = r.json()

#         if "data" not in data:
#             logging.warning(f"⚠️ No 'data' key in DSS response for {device_id}_{camera_no}: {data}")
#             return None

#         urls = extract_rtsp_urls(data["data"])
#         if not urls:
#             logging.warning(f"⚠️ No RTSP URLs extracted for {device_id}_{camera_no}")
#             return None

#         stream_token = data["data"].get("token")
#         return urls, stream_token

#     except Exception as e:
#         logging.error(f"❌ RTSP fetch error for {device_id}_{camera_no}: {e}")
#         return None


# def order_urls(urls):
#     """Prefer public IPs over private (172.x) subnets."""
#     public  = [u for u in urls if not u.startswith("rtsp://172.")]
#     private = [u for u in urls if u.startswith("rtsp://172.")]
#     return public + private


# # ============================================================
# # 🔧 FFMPEG PIPE
# # ============================================================
# def start_ffmpeg_stream(rtsp_url, width=1920, height=1080):
#     cmd = [
#         "ffmpeg",
#         "-rtsp_transport", "tcp",
#         "-timeout", "10000000",
#         "-i", rtsp_url,
#         "-f", "image2pipe",
#         "-pix_fmt", "bgr24",
#         "-vcodec", "rawvideo",
#         "-s", f"{width}x{height}",
#         "-"
#     ]
#     return subprocess.Popen(
#         cmd,
#         stdout=subprocess.PIPE,
#         stderr=subprocess.DEVNULL,
#         bufsize=10 ** 8
#     )


# def read_frame_from_pipe(pipe, width=1920, height=1080):
#     frame_size = width * height * 3
#     raw = pipe.stdout.read(frame_size)
#     if len(raw) != frame_size:
#         return None
#     return np.frombuffer(raw, np.uint8).reshape((height, width, 3))


# # ============================================================
# # 📡 RTSP PRODUCER  — fetches a fresh token on every reconnect
# # ============================================================
# def rtsp_producer(cam, queues):
#     """
#     Producer that re-authenticates and fetches a fresh RTSP URL
#     on every connection attempt.  This avoids the single-use token
#     problem where try_open_stream burns the session before streaming.
#     """
#     device_id = cam["device_id"]
#     camera_no = cam["camera_no"]
#     server    = cam["server_ip"]

#     label = f"{device_id}_{camera_no}"

#     while not STOP:
#         # ── 1. Fresh auth ──────────────────────────────────────────
#         token = authenticate_and_get_token(server)
#         if not token:
#             logging.error(f"❌ Auth failed for {label}, retrying in 10s")
#             time.sleep(10)
#             continue

#         # ── 2. Fresh RTSP URLs ────────────────────────────────────
#         result = get_rtsp_from_dss(device_id, camera_no, token, server)
#         if not result:
#             logging.warning(f"⚠️ No RTSP result for {label}, retrying in 10s")
#             time.sleep(10)
#             continue

#         urls, stream_token = result
#         ordered = order_urls(urls)

#         if not ordered:
#             logging.warning(f"⚠️ Empty URL list for {label}")
#             time.sleep(10)
#             continue

#         rtsp_url = add_token_to_url(ordered[0], stream_token)
#         logging.info(f"🔥 Connecting → {label}  URL: {rtsp_url}")

#         # ── 3. Start ffmpeg pipe ──────────────────────────────────
#         pipe = start_ffmpeg_stream(rtsp_url)
#         fail_count = 0

#         while not STOP:
#             frame = read_frame_from_pipe(pipe)

#             if frame is None:
#                 fail_count += 1
#                 logging.warning(f"⚠️ Frame fail #{fail_count} → {label}")

#                 if fail_count >= 10:
#                     logging.warning(f"🔄 Re-authenticating for {label}")
#                     break  # break inner → loop back, get fresh token

#                 time.sleep(0.5)
#                 continue

#             fail_count = 0
#             packet = (frame, device_id, camera_no)

#             for q in queues:
#                 if not q.full():
#                     q.put(packet)

#             time.sleep(0.04)   # ~25 FPS throttle

#         # ── 4. Clean up pipe ──────────────────────────────────────
#         try:
#             pipe.kill()
#             pipe.wait(timeout=3)
#         except Exception:
#             pass

#     # Signal workers to stop
#     for q in queues:
#         try:
#             q.put(None)
#         except Exception:
#             pass

#     logging.info(f"🔴 Producer stopped → {label}")


# # ============================================================
# # 📄 EXCEL LOADER
# # ============================================================
# def load_cameras():
#     df = pd.read_excel(EXCEL_PATH)
#     cameras = []
#     for _, row in df.iterrows():
#         cameras.append({
#             "device_id": str(row["device_id"]).strip(),
#             "camera_no": str(int(row["no"])),
#             "server_ip": str(row["Server Address"]).strip().lower(),
#         })
#     logging.info(f"✅ Loaded {len(cameras)} cameras")
#     return cameras


# # ============================================================
# # 🚀 CAMERA PIPELINE  — one call per camera, run in a thread
# # ============================================================
# def run_camera_pipeline(cam, analytics):
#     """Spawns workers + producer for a single camera and waits."""
#     queues  = []
#     workers = []

#     for name in analytics:
#         worker_fn = WORKER_MAP[name]
#         q = mp.Queue(maxsize=QUEUE_SIZE)
#         queues.append(q)

#         p = mp.Process(
#             target=worker_fn,
#             args=(q,),
#             name=f"{name}_{cam['camera_no']}",
#             daemon=True
#         )
#         workers.append(p)

#     producer = mp.Process(
#         target=rtsp_producer,
#         args=(cam, queues),
#         name=f"producer_{cam['device_id']}_{cam['camera_no']}",
#         daemon=True
#     )

#     for w in workers:
#         w.start()
#     producer.start()

#     producer.join()

#     for w in workers:
#         if w.is_alive():
#             w.terminate()
#             w.join(timeout=3)


# # ============================================================
# # 🚀 MAIN
# # ============================================================
# def main():
#     args     = parse_args()
#     analytics = args.analytics

#     cameras  = load_cameras()

#     # Semaphore to cap concurrent cameras
#     sem = threading.Semaphore(MAX_CONCURRENT)

#     def launch(cam):
#         with sem:
#             if not STOP:
#                 run_camera_pipeline(cam, analytics)

#     threads = []
#     for cam in cameras:
#         if STOP:
#             break

#         t = threading.Thread(target=launch, args=(cam,), daemon=True)
#         t.start()
#         threads.append(t)

#         # Small stagger to avoid hammering DSS auth endpoint
#         time.sleep(0.5)

#     for t in threads:
#         t.join()

#     logging.info("✅ MASTER PIPELINE COMPLETED")
#     os._exit(0)


# # ================= ENTRY =================
# if __name__ == "__main__":
#     mp.set_start_method("spawn", force=True)
#     main()





























#working for rtsp+hls ,but hls flow is not correct
# master_pipeline.py
import multiprocessing as mp
import os
import sys
import time
import argparse
import logging
import signal
import pandas as pd
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

# ================= IMPORT WORKERS =================
from workers.server_room_worker    import server_room_worker, server_room_worker_hls
from workers.crowd_worker          import crowd_worker, crowd_worker_hls
from workers.intruder_worker       import intruder_worker, intruder_worker_hls
from workers.entry_exit_worker     import entry_exit_worker, entry_exit_worker_hls
from workers.close_proximity_worker import close_proximity_worker, close_proximity_worker_hls
from workers.phone_worker          import phone_worker, phone_worker_hls
from workers.invigilator_worker    import invigilator_worker, invigilator_worker_hls

# ================= STREAM UTILS =================
from utils.stream_utils import detect_stream_type, extract_hls_streaming_url

# ================= CONFIG =================
EXCEL_PATH = os.path.join(
    PROJECT_ROOT,
    "sheet", "complete_results_20260327_135752.xlsx"
)

QUEUE_SIZE      = 5
STOP            = False
MAX_CONCURRENT  = 10          # max cameras running at once

DSS_USER = "system"
DSS_PASS = "Coreiseven@@"

WORKER_MAP = {
    "server":      server_room_worker,
    "crowd":       crowd_worker,
    "intruder":    intruder_worker,      # RTSP path (queue-based)
    "entry_exit":  entry_exit_worker,
    "proximity":   close_proximity_worker,
    "phone":       phone_worker,
    "invigilator": invigilator_worker,
}

# ================= SIGNAL =================
def handle_sigterm(sig, frame):
    global STOP
    STOP = True
    logger.warning("⛔ SIGTERM received. Stopping pipeline...")
    # Also stop all HLS worker threads
    try:
        from workers.intruder_worker import _STOP_EVENT as _IE
        _IE.set()
    except Exception:
        pass
    try:
        from workers.close_proximity_worker import _STOP_EVENT as _PE
        _PE.set()
    except Exception:
        pass
    try:
        from workers.entry_exit_worker import _STOP_EVENT as _EE
        _EE.set()
    except Exception:
        pass
    try:
        from workers.invigilator_worker import _STOP_EVENT as _IV
        _IV.set()
    except Exception:
        pass
    try:
        from workers.server_room_worker import _STOP_EVENT as _SR
        _SR.set()
    except Exception:
        pass
    try:
        from workers.phone_worker import _STOP_EVENT as _PH
        _PH.set()
    except Exception:
        pass
    try:
        from workers.crowd_worker import _STOP_EVENT as _CW
        _CW.set()
    except Exception:
        pass
    try:
        from workers.blind_spot_worker import _STOP_EVENT as _BS
        _BS.set()
    except Exception:
        pass
    try:
        from workers.crowd_zero_det_worker import _STOP_EVENT as _CZ
        _CZ.set()
    except Exception:
        pass
    try:
        from workers.crowd_five_det_worker import _STOP_EVENT as _CF
        _CF.set()
    except Exception:
        pass

signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT,  handle_sigterm)

# ================= ARG PARSER =================
def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--analytics", nargs="+", required=True)
    return parser.parse_args()


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
    """Always returns a fresh DSS token. Never cached."""
    try:
        url     = f"https://{server}/admin/API/accounts/authorize"
        headers = {"Content-Type": "application/json;charset=UTF-8"}

        r1   = requests.post(url, headers=headers, json={
            "userName":   DSS_USER,
            "ipAddress":  "",
            "clientType": "WINPC_V1"
        }, timeout=10)
        data1 = r1.json()

        signature = generate_signature(
            DSS_USER, DSS_PASS,
            data1["realm"], data1["randomKey"]
        )

        r2    = requests.post(url, headers=headers, json={
            "userName":   DSS_USER,
            "signature":  signature,
            "randomKey":  data1["randomKey"],
            "publicKey":  data1["publickey"],
            "encryptType": "MD5",
            "clientType": "WINPC_V1",
            "userType":   "0"
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
        parts = [p.strip() for p in raw.split("|") if p.strip()]
        urls.extend(parts)
    return urls


def get_rtsp_from_dss(device_id, camera_no, token, server):
    """Returns (urls_list, stream_token) or None."""
    try:
        url     = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"
        headers = {
            "Content-Type":  "application/json;charset=UTF-8",
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

        stream_token = data["data"].get("token")
        return urls, stream_token

    except Exception as e:
        logger.error(f"❌ RTSP fetch error for {device_id}_{camera_no}: {e}")
        return None


def order_urls(urls):
    """Prefer public IPs over private 172.x subnets."""
    public  = [u for u in urls if not u.startswith("rtsp://172.")]
    private = [u for u in urls if u.startswith("rtsp://172.")]
    return public + private


# ============================================================
# 🔧 FFMPEG PIPE  (RTSP only)
# ============================================================
def start_ffmpeg_stream(rtsp_url, width=1920, height=1080):
    cmd = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-timeout", "10000000",
        "-i", rtsp_url,
        "-f", "image2pipe",
        "-pix_fmt", "bgr24",
        "-vcodec", "rawvideo",
        "-s", f"{width}x{height}",
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
# 📡 RTSP PRODUCER  — re-authenticates on every reconnect
# ============================================================
def rtsp_producer(cam, queues):
    device_id = cam["device_id"]
    camera_no = cam["camera_no"]
    server    = cam["server_ip"]
    label     = f"{device_id}_{camera_no}"

    while not STOP:
        token = authenticate_and_get_token(server)
        if not token:
            logger.error(f"❌ Auth failed for {label}, retrying in 10s")
            time.sleep(10)
            continue

        result = get_rtsp_from_dss(device_id, camera_no, token, server)
        if not result:
            logger.warning(f"⚠️ No RTSP result for {label}, retrying in 10s")
            time.sleep(10)
            continue

        urls, stream_token = result
        ordered = order_urls(urls)
        if not ordered:
            logger.warning(f"⚠️ Empty URL list for {label}")
            time.sleep(10)
            continue

        rtsp_url = add_token_to_url(ordered[0], stream_token)
        logger.info(f"🔥 Connecting → {label}  URL: {rtsp_url}")

        pipe       = start_ffmpeg_stream(rtsp_url)
        fail_count = 0

        while not STOP:
            frame = read_frame_from_pipe(pipe)

            if frame is None:
                fail_count += 1
                logger.warning(f"⚠️ Frame fail #{fail_count} → {label}")
                if fail_count >= 10:
                    logger.warning(f"🔄 Re-authenticating for {label}")
                    break
                time.sleep(0.5)
                continue

            fail_count = 0
            packet     = (frame, device_id, camera_no)
            for q in queues:
                if not q.full():
                    q.put(packet)

            time.sleep(0.04)   # ~25 FPS throttle

        try:
            pipe.kill()
            pipe.wait(timeout=3)
        except Exception:
            pass

    for q in queues:
        try:
            q.put(None)
        except Exception:
            pass

    logger.info(f"🔴 RTSP Producer stopped → {label}")


# ============================================================
# 📄 EXCEL LOADER
# ============================================================
def load_cameras():
    """
    Load cameras from runtime context.

    Priority:
      1) Single-camera env payload (CAMERA_ID + STREAM_URL)
      2) DB lookup via utils.db_client using EXAM_ID/SHIFT_ID/ASSIGNMENT_DATE/LINK_TYPE
      3) Optional Excel fallback (only if ENABLE_EXCEL_CAMERA_LOADER=1)

    This keeps script-server DB-driven and avoids spreadsheet coupling.
    """
    env_camera_id = str(os.environ.get("CAMERA_ID", "")).strip()
    env_stream_url = str(os.environ.get("STREAM_URL", "")).strip()

    if env_camera_id and env_stream_url:
        stype = detect_stream_type(env_stream_url)
        if stype == "unknown":
            stype = "hls" if env_stream_url.lower().startswith(("http://", "https://")) else "rtsp"
        logger.info(f"✅ Loaded 1 camera from env payload ({stype.upper()})")
        return [{
            "device_id": env_camera_id,
            "camera_no": env_camera_id,
            "server_ip": "",
            "stream_url": env_stream_url,
            "stream_type": stype,
            "camera_name": str(os.environ.get("CAMERA_NAME", "")).replace("/", "_").replace(" ", "_"),
            "classification": str(os.environ.get("CAMERA_CLASSIFICATION", "")),
        }]

    exam_id = str(os.environ.get("EXAM_ID", "")).strip()
    shift_id = str(os.environ.get("SHIFT_ID", "")).strip()
    assignment_date = str(os.environ.get("ASSIGNMENT_DATE", "")).strip() or time.strftime("%Y-%m-%d")
    link_type = str(os.environ.get("LINK_TYPE", "")).strip().upper()

    if exam_id:
        try:
            from utils.db_client import get_hls_cameras, get_rtsp_cameras
            exam_id_int = int(exam_id)
            cameras = []

            if link_type == "HLS":
                shift_id_int = int(shift_id) if shift_id else -1
                rows = get_hls_cameras(exam_id_int, shift_id_int, assignment_date)
                for row in rows:
                    camera_id = str(row.get("ch_code") or row.get("id") or "").strip()
                    cctv_url = str(row.get("cctv_url") or "").strip()
                    if not camera_id or not cctv_url:
                        continue
                    cameras.append({
                        "device_id": camera_id,
                        "camera_no": camera_id,
                        "server_ip": "",
                        "stream_url": cctv_url,
                        "stream_type": "hls",
                        "camera_name": str(row.get("camera_name") or "").replace("/", "_").replace(" ", "_"),
                        "classification": str(row.get("classification") or ""),
                    })
            else:
                rows = get_rtsp_cameras(exam_id_int)
                for row in rows:
                    camera_id = str(row.get("device_id") or "").strip()
                    cctv_url = str(row.get("cctv_url") or "").strip()
                    if not camera_id:
                        continue
                    stype = detect_stream_type(cctv_url) if cctv_url else "rtsp"
                    if stype == "unknown":
                        stype = "rtsp"
                    cameras.append({
                        "device_id": camera_id,
                        "camera_no": camera_id,
                        "server_ip": "",
                        "stream_url": cctv_url,
                        "stream_type": stype,
                        "camera_name": str(row.get("camera_name") or "").replace("/", "_").replace(" ", "_"),
                        "classification": str(row.get("classification") or ""),
                    })

            if cameras:
                rtsp_count = sum(1 for c in cameras if c["stream_type"] == "rtsp")
                hls_count = sum(1 for c in cameras if c["stream_type"] == "hls")
                logger.info(
                    f"✅ Loaded {len(cameras)} cameras from DB "
                    f"(RTSP: {rtsp_count} | HLS: {hls_count})"
                )
                return cameras
            logger.warning("DB lookup returned no cameras for current assignment context")
        except Exception as e:
            logger.error(f"DB camera lookup failed: {e}")

    if os.environ.get("ENABLE_EXCEL_CAMERA_LOADER", "0") != "1":
        logger.error(
            "No env/DB camera context available and Excel loader is disabled. "
            "Set CAMERA_ID/STREAM_URL or EXAM_ID context."
        )
        return []

    df      = pd.read_excel(EXCEL_PATH)
    cameras = []
    cols    = list(df.columns)
    logger.info(f"📋 Excel columns: {cols}")

    # ── Detect which sheet format we have ──────────────────────
    is_tcs_sheet = "CCTV URL" in cols and "device_id" not in cols

    for _, row in df.iterrows():

        if is_tcs_sheet:
            # TCS sheet — build synthetic device_id from TC Code + ch_no
            tc_code    = str(row.get("TC Code", "")).strip()
            ch_no      = str(row.get("ch_no(unique key value)", "")).strip()
            cam_name   = str(row.get("Camera Name", "")).strip()
            scene_cls  = str(row.get("Scene Classification", "")).strip()

            # Skip rows with no URL
            cctv_url = str(row.get("CCTV URL", "")).strip()
            if cctv_url.lower() in ("nan", "none", ""):
                continue

            # Use TC Code as device_id, ch_no as camera_no
            # Fall back to row index if either is missing
            device_id = tc_code  if tc_code  not in ("nan", "")  else f"dev_{_}"
            camera_no = ch_no    if ch_no    not in ("nan", "")  else str(_)
            server_ip = ""       # TCS cameras don't use DSS

        else:
            # DSS/RTSP sheet
            cctv_url  = ""
            raw_url   = str(row.get("CCTV URL", "")).strip() if "CCTV URL" in cols else ""
            if raw_url.lower() not in ("nan", "none", ""):
                cctv_url = raw_url

            device_id = str(row["device_id"]).strip()
            camera_no = str(int(row["no"]))
            server_ip = str(row["Server Address"]).strip().lower()
            scene_cls = str(row.get("Scene Classification", "")).strip() if "Scene Classification" in cols else ""

        # ── Detect stream type ──────────────────────────────────
        stype = detect_stream_type(cctv_url) if cctv_url else "rtsp"
        if stype == "unknown":
            stype = "rtsp"

        # Sanitize camera_name for filenames (replace / and spaces)
        if is_tcs_sheet:
            safe_cam_name = cam_name.replace("/", "_").replace(" ", "_")
        else:
            safe_cam_name = ""

        cameras.append({
            "device_id":     device_id,
            "camera_no":     camera_no,
            "server_ip":     server_ip,
            "stream_url":    cctv_url,
            "stream_type":   stype,
            "camera_name":   safe_cam_name,   # e.g. "11365_ENTRY_S39"
            "classification": scene_cls,      # Scene Classification from Excel
        })

    rtsp_count = sum(1 for c in cameras if c["stream_type"] == "rtsp")
    hls_count  = sum(1 for c in cameras if c["stream_type"] == "hls")
    logger.info(
        f"✅ Loaded {len(cameras)} cameras  "
        f"(RTSP/DSS: {rtsp_count}  |  HLS/TCS: {hls_count})"
    )
    return cameras


# ============================================================
# 🚀 CAMERA PIPELINE  — RTSP path (queue-based workers)
# ============================================================
def run_rtsp_pipeline(cam, analytics):
    """Spawns queue-based workers + ffmpeg producer for an RTSP camera."""
    queues  = []
    workers = []

    for name in analytics:
        if name not in WORKER_MAP:
            logger.warning(
                f"⚠️ Worker '{name}' has no RTSP implementation yet — "
                f"skipping for {cam['device_id']}_{cam['camera_no']}"
            )
            continue
        worker_fn = WORKER_MAP[name]
        q = mp.Queue(maxsize=QUEUE_SIZE)
        queues.append(q)

        p = mp.Process(
            target=worker_fn,
            args=(q,),
            name=f"{name}_{cam['camera_no']}",
            daemon=True
        )
        workers.append(p)

    if not queues:
        logger.warning(
            f"⚠️ No RTSP-capable workers requested for "
            f"{cam['device_id']}_{cam['camera_no']} — skipping RTSP producer"
        )
        return

    producer = mp.Process(
        target=rtsp_producer,
        args=(cam, queues),
        name=f"producer_{cam['device_id']}_{cam['camera_no']}",
        daemon=True
    )

    for w in workers:
        w.start()
    producer.start()
    producer.join()

    for w in workers:
        if w.is_alive():
            w.terminate()
            w.join(timeout=3)


# ============================================================
# 🚀 CAMERA PIPELINE  — HLS path (direct OpenCV reader)
# ============================================================
def run_hls_pipeline(cam, analytics):
    """
    For HLS cameras each analytic that supports HLS gets its own
    direct reader thread.  Currently only 'intruder' has an HLS
    worker; others log a warning and are skipped.
    """
    camera_config = {
        "camera_id":      f"{cam['device_id']}_{cam['camera_no']}",
        "stream_url":     cam["stream_url"],
        "cctv_url":       cam.get("stream_url", ""),      # alias — workers use cctv_url
        "ch_no":          cam.get("camera_no", ""),       # ch_no equals camera_no for TCS
        "camera_name":    cam.get("camera_name", ""),    # e.g. "11365_ENTRY_S39"
        "classification": cam.get("classification", ""), # Scene Classification
    }

    hls_worker_map = {
        "intruder":    intruder_worker_hls,
        "proximity":   close_proximity_worker_hls,
        "entry_exit":  entry_exit_worker_hls,
        "invigilator": invigilator_worker_hls,
        "server":      server_room_worker_hls,
        "phone":       phone_worker_hls,
        "crowd":       crowd_worker_hls,
    }

    dynamic_hls_workers = {
        "tamper": ("workers.camera_tampering_worker", "camera_tampering_worker_hls"),
        "inversion": ("workers.camera_inversion_worker", "camera_inversion_worker_hls"),
        "blind_spot": ("workers.blind_spot_worker", "blind_spot_worker_hls"),
        "crowd_zero": ("workers.crowd_zero_det_worker", "crowd_zero_det_worker_hls"),
        "crowd_five": ("workers.crowd_five_det_worker", "crowd_five_det_worker_hls"),
    }

    threads = []
    for name in analytics:
        worker_fn = None

        if name in hls_worker_map:
            worker_fn = hls_worker_map[name]
        elif name in dynamic_hls_workers:
            mod_name, fn_name = dynamic_hls_workers[name]
            try:
                mod = __import__(mod_name, fromlist=[fn_name])
                worker_fn = getattr(mod, fn_name)
            except Exception as e:
                logger.error(
                    f"❌ Failed loading HLS worker '{name}' for {camera_config['camera_id']}: {e}"
                )

        if worker_fn is not None:
            t = threading.Thread(
                target=worker_fn,
                args=(camera_config,),
                name=f"hls_{name}_{cam['camera_no']}",
                daemon=True
            )
            t.start()
            threads.append(t)
        else:
            logger.warning(
                f"⚠️ Worker '{name}' has no HLS implementation yet — "
                f"skipping for {camera_config['camera_id']}"
            )

    for t in threads:
        t.join()


# ============================================================
# 🚀 UNIFIED CAMERA PIPELINE  — routes by stream type
# ============================================================
def run_camera_pipeline(cam, analytics):
    """Entry point for a single camera — routes to RTSP or HLS path."""
    if cam["stream_type"] == "hls":
        logger.info(
            f"🌐 [HLS] Starting pipeline → "
            f"{cam['device_id']}_{cam['camera_no']}"
        )
        run_hls_pipeline(cam, analytics)
    else:
        logger.info(
            f"📡 [RTSP] Starting pipeline → "
            f"{cam['device_id']}_{cam['camera_no']}"
        )
        run_rtsp_pipeline(cam, analytics)


# ============================================================
# 🚀 MAIN
# ============================================================
def main():
    args      = parse_args()
    analytics = args.analytics

    cameras = load_cameras()

    sem = threading.Semaphore(MAX_CONCURRENT)

    def launch(cam):
        with sem:
            if not STOP:
                run_camera_pipeline(cam, analytics)

    threads = []
    for cam in cameras:
        if STOP:
            break

        t = threading.Thread(target=launch, args=(cam,), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(0.5)   # stagger DSS auth requests

    for t in threads:
        t.join()

    logger.info("✅ MASTER PIPELINE COMPLETED")
    os._exit(0)


# ================= OLD ENTRY (disabled — new entry at bottom) =================
# if __name__ == "__main__":
#     mp.set_start_method("spawn", force=True)
#     main()

































#test
# master_pipeline.py
# import multiprocessing as mp
# import os
# import sys
# import time
# import argparse
# import logging
# import signal
# import pandas as pd
# import requests
# import hashlib
# import urllib.parse
# import subprocess
# import numpy as np
# import threading


# # ================= PATH SETUP =================
# BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
# sys.path.insert(0, PROJECT_ROOT)

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # ================= IMPORT WORKERS =================
# from workers.server_room_worker    import server_room_worker, detect_persons_in_frame as server_detect
# from workers.crowd_worker          import crowd_worker, detect_crowd as crowd_detect
# from workers.intruder_worker       import intruder_worker, detect_intruder as intruder_detect
# from workers.entry_exit_worker     import entry_exit_worker, detect_entry_exit as entry_exit_detect
# from workers.close_proximity_worker import close_proximity_worker, detect_close_proximity as proximity_detect
# from workers.phone_worker          import phone_worker, detect_phone as phone_detect
# from workers.invigilator_worker    import invigilator_worker, track_invigilator as invigilator_detect

# # ================= STREAM UTILS =================
# from utils.stream_utils import detect_stream_type, extract_hls_streaming_url

# # ================= CONFIG =================
# EXCEL_PATH = os.path.join(
#     PROJECT_ROOT,
#     "/home/umar/Desktop/cctv2/sheet/complete_results_20260313_160604.xlsx"
# )

# QUEUE_SIZE      = 5
# STOP            = False
# MAX_CONCURRENT  = 10          # max cameras running at once

# DSS_USER = "system"
# DSS_PASS = "Coreiseven@@"

# WORKER_MAP = {
#     "server":      server_room_worker,
#     "crowd":       crowd_worker,
#     "intruder":    intruder_worker,
#     "entry_exit":  entry_exit_worker,
#     "proximity":   close_proximity_worker,
#     "phone":       phone_worker,
#     "invigilator": invigilator_worker,
# }

# # HLS detect functions — same as WORKER_MAP but for HLS queue-based path
# # Each function signature: detect_xxx(frame, device_id, camera_no, save_folder)
# # invigilator is special: track_invigilator(frame, device_id, camera_no, base_dir)
# HLS_DETECT_MAP = {
#     "server":      (server_detect,      "results/tcs_detections/server_room_detection"),
#     "crowd":       (crowd_detect,        "results/tcs_detections/crowd_detection"),
#     "intruder":    (intruder_detect,     "results/tcs_detections/intruder_detection"),
#     "entry_exit":  (entry_exit_detect,   "results/tcs_detections/entry_exit_detection"),
#     "proximity":   (proximity_detect,    "results/tcs_detections/proximity_detection"),
#     "phone":       (phone_detect,        "results/tcs_detections/phone_detection"),
#     "invigilator": (invigilator_detect,  "results/tcs_detections/invigilator_detection"),
# }

# # ================= SIGNAL =================
# def handle_sigterm(sig, frame):
#     global STOP
#     STOP = True
#     logger.warning("⛔ SIGTERM received. Stopping pipeline...")
#     # HLS producer checks master STOP flag directly — no separate events needed

# signal.signal(signal.SIGTERM, handle_sigterm)
# signal.signal(signal.SIGINT,  handle_sigterm)

# # ================= ARG PARSER =================
# def parse_args():
#     parser = argparse.ArgumentParser()
#     parser.add_argument("--analytics", nargs="+", required=True)
#     return parser.parse_args()


# # ============================================================
# # 🔐 DSS AUTH
# # ============================================================
# def generate_signature(userName, password, realm, randomKey):
#     temp = hashlib.md5(password.encode()).hexdigest()
#     temp = hashlib.md5((userName + temp).encode()).hexdigest()
#     temp = hashlib.md5(temp.encode()).hexdigest()
#     temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
#     return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()


# def authenticate_and_get_token(server):
#     """Always returns a fresh DSS token. Never cached."""
#     try:
#         url     = f"https://{server}/admin/API/accounts/authorize"
#         headers = {"Content-Type": "application/json;charset=UTF-8"}

#         r1   = requests.post(url, headers=headers, json={
#             "userName":   DSS_USER,
#             "ipAddress":  "",
#             "clientType": "WINPC_V1"
#         }, timeout=10)
#         data1 = r1.json()

#         signature = generate_signature(
#             DSS_USER, DSS_PASS,
#             data1["realm"], data1["randomKey"]
#         )

#         r2    = requests.post(url, headers=headers, json={
#             "userName":   DSS_USER,
#             "signature":  signature,
#             "randomKey":  data1["randomKey"],
#             "publicKey":  data1["publickey"],
#             "encryptType": "MD5",
#             "clientType": "WINPC_V1",
#             "userType":   "0"
#         }, timeout=10)
#         token = r2.json().get("token")

#         if not token:
#             logger.error(f"❌ DSS auth failed for {server}")
#             return None

#         logger.info(f"✅ DSS authenticated → {server}")
#         return token

#     except Exception as e:
#         logger.error(f"❌ DSS auth error for {server}: {e}")
#         return None


# # ============================================================
# # 🎥 RTSP HELPERS
# # ============================================================
# def add_token_to_url(rtsp_url, token):
#     parsed = urllib.parse.urlparse(rtsp_url)
#     query  = urllib.parse.parse_qs(parsed.query)
#     query["token"] = [token]
#     return urllib.parse.urlunparse(
#         parsed._replace(query=urllib.parse.urlencode(query, doseq=True))
#     )


# def extract_rtsp_urls(api_data):
#     urls = []
#     for key in ("url", "url2"):
#         raw = api_data.get(key)
#         if not raw:
#             continue
#         parts = [p.strip() for p in raw.split("|") if p.strip()]
#         urls.extend(parts)
#     return urls


# def get_rtsp_from_dss(device_id, camera_no, token, server):
#     """Returns (urls_list, stream_token) or None."""
#     try:
#         url     = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"
#         headers = {
#             "Content-Type":  "application/json;charset=UTF-8",
#             "X-Subject-Token": token
#         }
#         payload = {
#             "clientType": "WINPC_V1",
#             "project":    "PSDK",
#             "method":     "MTS.Video.StartVideo",
#             "data": {
#                 "streamType":  "1",
#                 "channelId":   f"{device_id}$1$0${camera_no}",
#                 "dataType":    "2",
#                 "enableRtsps": "0"
#             }
#         }

#         r    = requests.post(url, headers=headers, json=payload, timeout=10)
#         data = r.json()

#         if "data" not in data:
#             logger.warning(f"⚠️ No 'data' in DSS response for {device_id}_{camera_no}: {data}")
#             return None

#         urls = extract_rtsp_urls(data["data"])
#         if not urls:
#             logger.warning(f"⚠️ No RTSP URLs for {device_id}_{camera_no}")
#             return None

#         stream_token = data["data"].get("token")
#         return urls, stream_token

#     except Exception as e:
#         logger.error(f"❌ RTSP fetch error for {device_id}_{camera_no}: {e}")
#         return None


# def order_urls(urls):
#     """Prefer public IPs over private 172.x subnets."""
#     public  = [u for u in urls if not u.startswith("rtsp://172.")]
#     private = [u for u in urls if u.startswith("rtsp://172.")]
#     return public + private


# # ============================================================
# # 🔧 FFMPEG PIPE  (RTSP only)
# # ============================================================
# def start_ffmpeg_stream(rtsp_url, width=1920, height=1080):
#     cmd = [
#         "ffmpeg",
#         "-rtsp_transport", "tcp",
#         "-timeout", "10000000",
#         "-i", rtsp_url,
#         "-f", "image2pipe",
#         "-pix_fmt", "bgr24",
#         "-vcodec", "rawvideo",
#         "-s", f"{width}x{height}",
#         "-"
#     ]
#     return subprocess.Popen(
#         cmd,
#         stdout=subprocess.PIPE,
#         stderr=subprocess.DEVNULL,
#         bufsize=10 ** 8
#     )


# def read_frame_from_pipe(pipe, width=1920, height=1080):
#     frame_size = width * height * 3
#     raw = pipe.stdout.read(frame_size)
#     if len(raw) != frame_size:
#         return None
#     return np.frombuffer(raw, np.uint8).reshape((height, width, 3))


# # ============================================================
# # 📡 RTSP PRODUCER  — re-authenticates on every reconnect
# # ============================================================
# def rtsp_producer(cam, queues):
#     device_id = cam["device_id"]
#     camera_no = cam["camera_no"]
#     server    = cam["server_ip"]
#     label     = f"{device_id}_{camera_no}"

#     while not STOP:
#         token = authenticate_and_get_token(server)
#         if not token:
#             logger.error(f"❌ Auth failed for {label}, retrying in 10s")
#             time.sleep(10)
#             continue

#         result = get_rtsp_from_dss(device_id, camera_no, token, server)
#         if not result:
#             logger.warning(f"⚠️ No RTSP result for {label}, retrying in 10s")
#             time.sleep(10)
#             continue

#         urls, stream_token = result
#         ordered = order_urls(urls)
#         if not ordered:
#             logger.warning(f"⚠️ Empty URL list for {label}")
#             time.sleep(10)
#             continue

#         rtsp_url = add_token_to_url(ordered[0], stream_token)
#         logger.info(f"🔥 Connecting → {label}  URL: {rtsp_url}")

#         pipe       = start_ffmpeg_stream(rtsp_url)
#         fail_count = 0

#         while not STOP:
#             frame = read_frame_from_pipe(pipe)

#             if frame is None:
#                 fail_count += 1
#                 logger.warning(f"⚠️ Frame fail #{fail_count} → {label}")
#                 if fail_count >= 10:
#                     logger.warning(f"🔄 Re-authenticating for {label}")
#                     break
#                 time.sleep(0.5)
#                 continue

#             fail_count = 0
#             packet     = (frame, device_id, camera_no)
#             for q in queues:
#                 if not q.full():
#                     q.put(packet)

#             time.sleep(0.04)   # ~25 FPS throttle

#         try:
#             pipe.kill()
#             pipe.wait(timeout=3)
#         except Exception:
#             pass

#     for q in queues:
#         try:
#             q.put(None)
#         except Exception:
#             pass

#     logger.info(f"🔴 RTSP Producer stopped → {label}")


# # ============================================================
# # 📄 EXCEL LOADER
# # ============================================================
# def load_cameras():
#     """
#     Load cameras from Excel — supports both sheet formats:

#     DSS/RTSP sheet:  device_id | no | Server Address
#     TCS/HLS  sheet:  S.No. | TC Code | Centre Name | City | State |
#                      LAN and Lab Name | Camera Name | CCTV URL |
#                      ch_no(unique key value) | Scene Classification | ...

#     Stream type is auto-detected from the URL value:
#       - 'CCTV URL' is http/https/m3u8  → HLS  (TCS cameras)
#       - 'CCTV URL' is rtsp://          → RTSP (direct RTSP)
#       - 'CCTV URL' absent/blank        → RTSP via DSS (uses server_ip)
#     """
#     df      = pd.read_excel(EXCEL_PATH)
#     cameras = []
#     cols    = list(df.columns)
#     logger.info(f"📋 Excel columns: {cols}")

#     # ── Detect which sheet format we have ──────────────────────
#     is_tcs_sheet = "CCTV URL" in cols and "device_id" not in cols

#     for _, row in df.iterrows():

#         if is_tcs_sheet:
#             # TCS sheet — build synthetic device_id from TC Code + ch_no
#             tc_code    = str(row.get("TC Code", "")).strip()
#             ch_no      = str(row.get("ch_no(unique key value)", "")).strip()
#             cam_name   = str(row.get("Camera Name", "")).strip()

#             # Skip rows with no URL
#             cctv_url = str(row.get("CCTV URL", "")).strip()
#             if cctv_url.lower() in ("nan", "none", ""):
#                 continue

#             # Use TC Code as device_id, ch_no as camera_no
#             # Fall back to row index if either is missing
#             device_id = tc_code  if tc_code  not in ("nan", "")  else f"dev_{_}"
#             camera_no = ch_no    if ch_no    not in ("nan", "")  else str(_)
#             server_ip = ""       # TCS cameras don't use DSS

#         else:
#             # DSS/RTSP sheet
#             cctv_url  = ""
#             raw_url   = str(row.get("CCTV URL", "")).strip() if "CCTV URL" in cols else ""
#             if raw_url.lower() not in ("nan", "none", ""):
#                 cctv_url = raw_url

#             device_id = str(row["device_id"]).strip()
#             camera_no = str(int(row["no"]))
#             server_ip = str(row["Server Address"]).strip().lower()

#         # ── Detect stream type ──────────────────────────────────
#         stype = detect_stream_type(cctv_url) if cctv_url else "rtsp"
#         if stype == "unknown":
#             stype = "rtsp"

#         # Sanitize camera_name for filenames (replace / and spaces)
#         if is_tcs_sheet:
#             safe_cam_name = cam_name.replace("/", "_").replace(" ", "_")
#         else:
#             safe_cam_name = ""

#         cameras.append({
#             "device_id":   device_id,
#             "camera_no":   camera_no,
#             "server_ip":   server_ip,
#             "stream_url":  cctv_url,
#             "stream_type": stype,
#             "camera_name": safe_cam_name,   # e.g. "11365_ENTRY_S39"
#         })

#     rtsp_count = sum(1 for c in cameras if c["stream_type"] == "rtsp")
#     hls_count  = sum(1 for c in cameras if c["stream_type"] == "hls")
#     logger.info(
#         f"✅ Loaded {len(cameras)} cameras  "
#         f"(RTSP/DSS: {rtsp_count}  |  HLS/TCS: {hls_count})"
#     )
#     return cameras


# # ============================================================
# # 🚀 CAMERA PIPELINE  — RTSP path (queue-based workers)
# # ============================================================
# def run_rtsp_pipeline(cam, analytics):
#     """Spawns queue-based workers + ffmpeg producer for an RTSP camera."""
#     queues  = []
#     workers = []

#     for name in analytics:
#         worker_fn = WORKER_MAP[name]
#         q = mp.Queue(maxsize=QUEUE_SIZE)
#         queues.append(q)

#         p = mp.Process(
#             target=worker_fn,
#             args=(q,),
#             name=f"{name}_{cam['camera_no']}",
#             daemon=True
#         )
#         workers.append(p)

#     producer = mp.Process(
#         target=rtsp_producer,
#         args=(cam, queues),
#         name=f"producer_{cam['device_id']}_{cam['camera_no']}",
#         daemon=True
#     )

#     for w in workers:
#         w.start()
#     producer.start()
#     producer.join()

#     for w in workers:
#         if w.is_alive():
#             w.terminate()
#             w.join(timeout=3)


# # ============================================================
# # 📡 HLS PRODUCER  — reads frames from m3u8, puts in queues
# # ============================================================
# def hls_producer(cam, queues):
#     """
#     HLS equivalent of rtsp_producer.
#     Opens the m3u8 stream with OpenCV and pushes frames into queues.
#     Workers receive (frame, device_id, camera_no) — same as RTSP.
#     """
#     from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

#     device_id = cam["device_id"]
#     camera_no = cam["camera_no"]
#     label     = f"{device_id}_{camera_no}"

#     # Resolve m3u8 URL from TCS page URL
#     hls_url = extract_hls_streaming_url(cam["stream_url"])
#     if not hls_url:
#         logger.error(f"[HLS Producer] ❌ Could not resolve URL for {label}")
#         for q in queues:
#             try: q.put(None)
#             except: pass
#         return

#     if not test_hls_stream(hls_url):
#         logger.error(f"[HLS Producer] ❌ Stream not accessible for {label}")
#         for q in queues:
#             try: q.put(None)
#             except: pass
#         return

#     logger.info(f"[HLS Producer] ▶ Starting → {label}  URL: {hls_url}")

#     while not STOP:
#         cap = open_hls_stream(hls_url)
#         if cap is None or not cap.isOpened():
#             logger.error(f"[HLS Producer] ❌ Could not open stream for {label}, retrying in 10s")
#             time.sleep(10)
#             continue

#         fps = cap.get(cv2.CAP_PROP_FPS)
#         if fps <= 0 or fps > 60:
#             fps = 25.0
#         logger.info(f"[HLS Producer] 🟢 {label} @ {fps:.1f} FPS")

#         fail_count = 0

#         while not STOP:
#             ret, frame = cap.read()

#             if not ret or frame is None:
#                 fail_count += 1
#                 logger.warning(f"[HLS Producer] ⚠️ Frame fail #{fail_count} → {label}")
#                 if fail_count >= 10:
#                     logger.warning(f"[HLS Producer] 🔄 Reconnecting → {label}")
#                     break
#                 time.sleep(0.5)
#                 continue

#             fail_count = 0
#             packet = (frame, device_id, camera_no)

#             for q in queues:
#                 if not q.full():
#                     q.put(packet)

#             time.sleep(0.04)  # ~25 FPS throttle

#         try:
#             cap.release()
#         except Exception:
#             pass

#     # Signal workers to stop
#     for q in queues:
#         try: q.put(None)
#         except: pass

#     logger.info(f"[HLS Producer] 🔴 Stopped → {label}")


# # ============================================================
# # 🔧 HLS WORKER WRAPPER  — picklable top-level class
# # ============================================================
# class HLSWorker:
#     """
#     Picklable wrapper so mp.Process can spawn HLS detect workers.
#     mp.Process requires target to be picklable — local functions are not.
#     """
#     def __init__(self, analytic_name: str, save_folder: str):
#         self.analytic_name = analytic_name
#         self.save_folder   = save_folder

#     def __call__(self, frame_queue):
#         # Import detect map inside subprocess (spawn context)
#         from workers.server_room_worker     import detect_persons_in_frame as server_detect
#         from workers.crowd_worker           import detect_crowd             as crowd_detect
#         from workers.intruder_worker        import detect_intruder          as intruder_detect
#         from workers.entry_exit_worker      import detect_entry_exit        as entry_exit_detect
#         from workers.close_proximity_worker import detect_close_proximity   as proximity_detect
#         from workers.phone_worker           import detect_phone             as phone_detect
#         from workers.invigilator_worker     import track_invigilator        as invigilator_detect

#         detect_map = {
#             "server":      server_detect,
#             "crowd":       crowd_detect,
#             "intruder":    intruder_detect,
#             "entry_exit":  entry_exit_detect,
#             "proximity":   proximity_detect,
#             "phone":       phone_detect,
#             "invigilator": invigilator_detect,
#         }

#         detect_fn = detect_map[self.analytic_name]
#         folder    = self.save_folder
#         import os; os.makedirs(folder, exist_ok=True)

#         import logging
#         log = logging.getLogger(__name__)
#         log.info(f"🟢 [HLS Worker] {self.analytic_name} started")

#         while True:
#             data = frame_queue.get()
#             if data is None:
#                 log.info(f"🔴 [HLS Worker] {self.analytic_name} stopping")
#                 break
#             frame, dev_id, cam_no = data
#             try:
#                 detect_fn(frame.copy(), dev_id, cam_no, folder)
#             except TypeError:
#                 # invigilator: track_invigilator(frame, device_id, camera_no, base_dir)
#                 detect_fn(frame.copy(), dev_id, cam_no, base_dir=folder)


# # ============================================================
# # 🚀 CAMERA PIPELINE  — HLS path (queue-based, same as RTSP)
# # ============================================================
# def run_hls_pipeline(cam, analytics):
#     """
#     HLS cameras use same queue-based pattern as RTSP.
#     hls_producer reads frames → queue → HLSWorker detects.
#     """
#     queues  = []
#     workers = []

#     for name in analytics:
#         if name not in HLS_DETECT_MAP:
#             logger.warning(f"⚠️ No HLS detect function for '{name}' — skipping")
#             continue

#         _, save_subfolder = HLS_DETECT_MAP[name]
#         save_folder = os.path.join(PROJECT_ROOT, save_subfolder)
#         os.makedirs(save_folder, exist_ok=True)

#         q = mp.Queue(maxsize=QUEUE_SIZE)
#         queues.append(q)

#         # HLSWorker is a top-level class — fully picklable
#         p = mp.Process(
#             target=HLSWorker(name, save_folder),
#             args=(q,),
#             name=f"hls_{name}_{cam['camera_no']}",
#             daemon=True
#         )
#         workers.append(p)

#     if not queues:
#         logger.warning(f"⚠️ No valid analytics for HLS camera {cam['device_id']}_{cam['camera_no']}")
#         return

#     producer = mp.Process(
#         target=hls_producer,
#         args=(cam, queues),
#         name=f"hls_producer_{cam['device_id']}_{cam['camera_no']}",
#         daemon=True
#     )

#     for w in workers:
#         w.start()
#     producer.start()
#     producer.join()

#     for w in workers:
#         if w.is_alive():
#             w.terminate()
#             w.join(timeout=3)


# # ============================================================
# # 🚀 UNIFIED CAMERA PIPELINE  — routes by stream type
# # ============================================================
# def run_camera_pipeline(cam, analytics):
#     """Entry point for a single camera — routes to RTSP or HLS path."""
#     if cam["stream_type"] == "hls":
#         logger.info(
#             f"🌐 [HLS] Starting pipeline → "
#             f"{cam['device_id']}_{cam['camera_no']}"
#         )
#         run_hls_pipeline(cam, analytics)
#     else:
#         logger.info(
#             f"📡 [RTSP] Starting pipeline → "
#             f"{cam['device_id']}_{cam['camera_no']}"
#         )
#         run_rtsp_pipeline(cam, analytics)


# # ============================================================
# # 🚀 MAIN
# # ============================================================
# def main():
#     args      = parse_args()
#     analytics = args.analytics

#     cameras = load_cameras()

#     sem = threading.Semaphore(MAX_CONCURRENT)

#     def launch(cam):
#         with sem:
#             if not STOP:
#                 run_camera_pipeline(cam, analytics)

#     threads = []
#     for cam in cameras:
#         if STOP:
#             break

#         t = threading.Thread(target=launch, args=(cam,), daemon=True)
#         t.start()
#         threads.append(t)
#         time.sleep(0.5)   # stagger DSS auth requests

#     for t in threads:
#         t.join()

#     logger.info("✅ MASTER PIPELINE COMPLETED")
#     os._exit(0)


# # ================= ENTRY =================
# if __name__ == "__main__":
#     mp.set_start_method("spawn", force=True)
#     main()






# added by samarth

# master_pipeline.py
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

# ================= IMPORT WORKERS =================
from workers.server_room_worker      import server_room_worker, server_room_worker_hls
from workers.crowd_worker            import crowd_worker, crowd_worker_hls
from workers.intruder_worker         import intruder_worker, intruder_worker_hls
from workers.entry_exit_worker       import entry_exit_worker, entry_exit_worker_hls
from workers.close_proximity_worker  import close_proximity_worker, close_proximity_worker_hls
from workers.phone_worker            import phone_worker, phone_worker_hls
from workers.invigilator_worker      import invigilator_worker, invigilator_worker_hls

# New workers (both HLS and RTSP)
from workers.camera_tampering_worker import camera_tampering_worker_hls, camera_tampering_worker
from workers.camera_inversion_worker import camera_inversion_worker_hls, camera_inversion_worker

# ================= NEW LOADERS =================
from utils.camera_loader import load_all_pending_cameras, load_cameras_for_execution

# ================= CONFIG =================
QUEUE_SIZE      = 5
STOP            = False
MAX_CONCURRENT  = 10          # max RTSP producers running at once

DSS_USER = "system"
DSS_PASS = "Coreiseven@@"

RTSP_WORKER_MAP = {
    "server":      server_room_worker,
    "crowd":       crowd_worker,
    "intruder":    intruder_worker,
    "entry_exit":  entry_exit_worker,
    "proximity":   close_proximity_worker,
    "phone":       phone_worker,
    "invigilator": invigilator_worker,
    "tamper":      camera_tampering_worker,
    "inversion":   camera_inversion_worker,
}

HLS_WORKER_MAP = {
    "server":      server_room_worker_hls,
    "crowd":       crowd_worker_hls,
    "intruder":    intruder_worker_hls,
    "entry_exit":  entry_exit_worker_hls,
    "proximity":   close_proximity_worker_hls,
    "phone":       phone_worker_hls,
    "invigilator": invigilator_worker_hls,
    "tamper":      camera_tampering_worker_hls,
    "inversion":   camera_inversion_worker_hls,
}


# ================= SIGNAL =================
def handle_sigterm(sig, frame):
    global STOP
    STOP = True
    logger.warning("⛔ SIGTERM received. Stopping pipeline...")
    # Stop HLS worker threads
    for name in ["intruder", "close_proximity", "entry_exit", "invigilator",
                 "server_room", "phone", "crowd", "camera_tampering", "camera_inversion"]:
        try:
            mod = __import__(f"workers.{name}_worker", fromlist=["_STOP_EVENT"])
            if hasattr(mod, "_STOP_EVENT"):
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
    """Always returns a fresh DSS token. Never cached."""
    try:
        url     = f"https://{server}/admin/API/accounts/authorize"
        headers = {"Content-Type": "application/json;charset=UTF-8"}

        r1   = requests.post(url, headers=headers, json={
            "userName":   DSS_USER,
            "ipAddress":  "",
            "clientType": "WINPC_V1"
        }, timeout=10)
        data1 = r1.json()

        signature = generate_signature(
            DSS_USER, DSS_PASS,
            data1["realm"], data1["randomKey"]
        )

        r2    = requests.post(url, headers=headers, json={
            "userName":   DSS_USER,
            "signature":  signature,
            "randomKey":  data1["randomKey"],
            "publicKey":  data1["publickey"],
            "encryptType": "MD5",
            "clientType": "WINPC_V1",
            "userType":   "0"
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
        parts = [p.strip() for p in raw.split("|") if p.strip()]
        urls.extend(parts)
    return urls


def get_rtsp_from_dss(device_id, camera_no, token, server):
    """Returns (urls_list, stream_token) or None."""
    try:
        url     = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"
        headers = {
            "Content-Type":  "application/json;charset=UTF-8",
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

        stream_token = data["data"].get("token")
        return urls, stream_token

    except Exception as e:
        logger.error(f"❌ RTSP fetch error for {device_id}_{camera_no}: {e}")
        return None


def order_urls(urls):
    """Prefer public IPs over private 172.x subnets."""
    public  = [u for u in urls if not u.startswith("rtsp://172.")]
    private = [u for u in urls if u.startswith("rtsp://172.")]
    return public + private


# ============================================================
# 🔧 FFMPEG PIPE  (RTSP only)
# ============================================================
def start_ffmpeg_stream(rtsp_url, width=1920, height=1080):
    cmd = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-timeout", "10000000",
        "-i", rtsp_url,
        "-f", "image2pipe",
        "-pix_fmt", "bgr24",
        "-vcodec", "rawvideo",
        "-s", f"{width}x{height}",
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
# 📡 RTSP PRODUCER  — re-authenticates on every reconnect
# ============================================================
def rtsp_producer(cam_configs, queues):
    """
    RTSP producer for a single DSS camera_no (grouping multiple analytics if triggered).
    """
    # Safety: accept both a single dict (old flow) and a list (new flow)
    if isinstance(cam_configs, dict):
        cam_configs = [cam_configs]
    first     = cam_configs[0]
    device_id = first.get("camera_id") or first.get("device_id", "")
    camera_no = first.get("ch_no") or first.get("camera_no", "1")
    server    = first.get("server_ip", "")
    direct_url = first.get("cctv_url") or first.get("stream_url", "")
    label     = f"{device_id}_{camera_no}"

    use_dss = bool(server)

    while not STOP:
        if use_dss:
            # DSS auth flow
            token = authenticate_and_get_token(server)
            if not token:
                logger.error(f"❌ Auth failed for {label}, retrying in 10s")
                time.sleep(10)
                continue

            result = get_rtsp_from_dss(device_id, camera_no, token, server)
            if not result:
                logger.warning(f"⚠️ No RTSP result for {label}, retrying in 10s")
                time.sleep(10)
                continue

            urls, stream_token = result
            ordered = order_urls(urls)
            if not ordered:
                logger.warning(f"⚠️ Empty URL list for {label}")
                time.sleep(10)
                continue

            rtsp_url = add_token_to_url(ordered[0], stream_token)
        else:
            # Direct URL flow (no DSS auth needed)
            if not direct_url:
                logger.warning(f"⚠️ No server_ip or cctv_url for camera {label}. Cannot start.")
                return
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
                    logger.warning(f"🔄 Re-authenticating for {label}")
                    break
                time.sleep(0.5)
                continue

            fail_count = 0
            
            packet = (frame, device_id, camera_no)
            
            for q in queues:
                if not q.full():
                    q.put(packet)

            time.sleep(0.04)   # ~25 FPS throttle

        try:
            pipe.kill()
            pipe.wait(timeout=3)
        except Exception:
            pass

    for q in queues:
        try:
            q.put(None)
        except Exception:
            pass

    logger.info(f"🔴 RTSP Producer stopped → {label}")


# ============================================================
# 🚀 PIPELINE RUNNERS  — APIs instead of CLI/Excel
# ============================================================
def run_rtsp_pipeline(camera_group, max_concurrent=MAX_CONCURRENT):
    """
    Groups RTSP cameras by (device_id, ch_no) to avoid running multiple
    producers for the same camera if multiple analytics are triggered on it.
    """
    # Group by label
    grouped = {}
    for c in camera_group:
        label = f"{c['camera_id']}_{c.get('ch_no') or c.get('camera_no', '1')}"
        if label not in grouped:
            grouped[label] = []
        grouped[label].append(c)

    sem = threading.Semaphore(max_concurrent)
    producers = []

    def start_producer(label, configs):
        with sem:
            if not STOP:
                queues  = []
                workers = []
                
                # Deduplicate by script_code
                scripts_seen = set()
                
                for cfg in configs:
                    script = cfg["script_code"]
                    if script in scripts_seen:
                        continue
                    scripts_seen.add(script)
                    
                    if script not in RTSP_WORKER_MAP:
                        logger.warning(f"⚠️ RTSP Worker '{script}' not found. Skipping.")
                        continue
                        
                    worker_fn = RTSP_WORKER_MAP[script]
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
                producer.join()

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
        time.sleep(0.5)

    for t in threads:
        t.join()


def run_hls_pipeline(camera_group):
    """
    HLS pipeline now passes the ENTIRE LIST of cameras to the appropriate worker.
    The worker is responsible for spanning threads and managing GPU queues.
    Groups cameras by script_code.
    """
    # Group by script_code
    grouped = {}
    for c in camera_group:
        script = c["script_code"]
        if script not in grouped:
            grouped[script] = []
        grouped[script].append(c)

    threads = []
    for script_code, configs in grouped.items():
        if script_code not in HLS_WORKER_MAP:
            logger.warning(f"⚠️ HLS Worker '{script_code}' not found. Skipping {len(configs)} cameras.")
            continue
            
        worker_fn = HLS_WORKER_MAP[script_code]
        t = threading.Thread(
            target=worker_fn,
            args=(configs,),
            name=f"HLS_Master_{script_code}",
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
    # When launched by script-server the assignment is already marked RUNNING,
    # so /executions/pending returns 0 results.  Use the env vars that
    # script_runner.py injects instead, falling back to the API only when
    # running standalone (e.g. for testing).
    exam_id   = os.environ.get("EXAM_ID",  "").strip()
    shift_id  = os.environ.get("SHIFT_ID", "").strip()
    link_type = os.environ.get("LINK_TYPE", "").strip().upper()

    if exam_id and shift_id and link_type:
        parser = argparse.ArgumentParser()
        parser.add_argument("--analytics", nargs="+", default=[])
        args, _ = parser.parse_known_args()
        script_codes = args.analytics

        if not script_codes:
            logger.error("❌ --analytics argument missing. Cannot determine which script to run.")
            os._exit(1)

        logger.info(
            f"🔄 Loading cameras from DB (exam_id={exam_id}, shift_id={shift_id}, "
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
                    f"⚠️ No cameras found for script='{script_code}' "
                    f"(exam_id={exam_id}, shift_id={shift_id}, link_type={link_type})"
                )
    else:
        logger.info("🔄 Fetching pending executions from API...")
        results = load_all_pending_cameras()

    if not results:
        logger.info("✅ No cameras to process. Exiting.")
        os._exit(0)

    # Flatten the camera configs
    all_rtsp_cameras = []
    all_hls_cameras  = []

    for ex, cams in results:
        if ex["link_type"] == "RTSP":
            all_rtsp_cameras.extend(cams)
        elif ex["link_type"] == "HLS":
            all_hls_cameras.extend(cams)
        else:
            logger.warning(f"⚠️ Unknown link type: {ex['link_type']}")

    threads = []

    if all_rtsp_cameras:
        logger.info(f"📡 Starting RTSP pipeline for {len(all_rtsp_cameras)} cameras...")
        t = threading.Thread(target=run_rtsp_pipeline, args=(all_rtsp_cameras,))
        t.start()
        threads.append(t)

    if all_hls_cameras:
        logger.info(f"🌐 Starting HLS pipeline for {len(all_hls_cameras)} cameras...")
        t = threading.Thread(target=run_hls_pipeline, args=(all_hls_cameras,))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    logger.info("✅ MASTER PIPELINE COMPLETED")
    os._exit(0)


# ================= ENTRY =================
if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)
    main()



