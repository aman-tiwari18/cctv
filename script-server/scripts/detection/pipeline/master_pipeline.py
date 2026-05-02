
# # master_pipeline.py
# """
# Master Detection Pipeline
# =========================
# Supports both RTSP (DSS-auth + ffmpeg pipe) and HLS (GPU-batch workers).
# Camera configs loaded from DB via utils.camera_loader (env-var driven).

# RTSP flow:
#   rtsp_producer → multiprocessing.Queue → RTSP_WORKER_MAP[script](queue)

# HLS flow:
#   HLS_WORKER_MAP[script](all_camera_configs_list)  — worker manages own threads+GPU

# Entry:
#   EXAM_ID / SHIFT_ID / LINK_TYPE env vars  +  --analytics flag
#   or fallback: API /executions/pending
# """

# import multiprocessing as mp
# import os
# import sys
# import time
# import argparse
# import logging
# import signal
# import requests
# import hashlib
# import urllib.parse
# import subprocess
# import numpy as np
# import threading
# import importlib
# import json
# import re
# import fcntl


# # ================= PATH SETUP =================
# BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
# WORKERS_DIR  = os.path.join(PROJECT_ROOT, "workers")
# sys.path.insert(0, PROJECT_ROOT)
# sys.path.insert(0, WORKERS_DIR)

# # ================= LOGGING =================
# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s - %(levelname)s - %(message)s"
# )
# logger = logging.getLogger(__name__)

# # Force RTSP over TCP for OpenCV — prevents UDP data loss behind QEMU/KVM NAT
# os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"


# def get_worker(analytic_name, mode="rtsp"):
#     """
#     Lazily import the requested worker to prevent loading unused models.
#     Returns the worker function for the given analytic and mode (rtsp/hls).
#     """
#     # Mapping: analytic -> (module_name, rtsp_function_name, hls_function_name)
#     mapping = {
#         "server":      ("server_room_worker",      "server_room_worker",      "server_room_worker_hls"),
#         "crowd":       ("crowd_worker",            "crowd_worker",            "crowd_worker_hls"),
#         "intruder":    ("intruder_worker",         "intruder_worker",         "intruder_worker_hls"),
#         "entry_exit":  ("entry_exit_worker",       "entry_exit_worker",       "entry_exit_worker_hls"),
#         "proximity":   ("close_proximity_worker",  "close_proximity_worker",  "close_proximity_worker_hls"),
#         "phone":       ("phone_worker",            "phone_worker",            "phone_worker_hls"),
#         "invigilator": ("invigilator_worker",      "invigilator_worker",      "invigilator_worker_hls"),
#         "tamper":      ("camera_tampering_worker", "camera_tampering_worker", "camera_tampering_worker_hls"),
#         "inversion":   ("camera_inversion_worker", "camera_inversion_worker", "camera_inversion_worker_hls"),
#         "crowd_zero":  ("crowd_zero_det_worker",   "crowd_zero_worker",       "crowd_zero_det_worker_hls"),
#         "crowd_five":  ("crowd_five_det_worker",   "crowd_five_worker",       "crowd_five_det_worker_hls"),
#         "blind_spot":  ("blind_spot_worker",       "blind_spot_worker",       "blind_spot_worker_hls"),
#         "strongroom":  ("strongroom_worker",       "strongroom_worker",       "strongroom_worker_hls"),
#         "qp_box":      ("qp_box_det_worker",       "qp_box_worker",           "qp_box_det_worker_hls"),
#     }
    
#     if analytic_name not in mapping:
#         logger.error(f"Unknown analytic requested: {analytic_name}")
#         return None
        
#     module_name, rtsp_fn, hls_fn = mapping[analytic_name]
#     try:
#         # Try direct import first (workers/ is in sys.path)
#         try:
#             module = importlib.import_module(module_name)
#         except (ImportError, ModuleNotFoundError):
#             # Fallback to package import
#             module = importlib.import_module(f"workers.{module_name}")

#         fn_name = rtsp_fn if mode.lower() == "rtsp" else hls_fn
#         return getattr(module, fn_name)
#     except (ImportError, AttributeError, ModuleNotFoundError) as e:
#         logger.error(f"Failed to load worker {analytic_name} ({mode}): {e}")
#         return None


# # ================= CAMERA LOADER (DB-driven) =================
# from utils.camera_loader import load_all_pending_cameras, load_cameras_for_execution


# # ================= CONFIG =================
# QUEUE_SIZE     = 5
# STOP           = False
# MAX_CONCURRENT = 64          # max concurrent RTSP producers

# DSS_USER = "system"
# DSS_PASS = "Sasd@12345"

# # Server tokens storage (cross-process safe)
# TOKEN_CACHE_FILE = os.path.join(PROJECT_ROOT, "server_tokens.json")
# TOKEN_EXPIRY_SECONDS = 3600  # Increased to 1 hour to match vision_multi behavior (long-lived)
# LOCKOUT_WAIT_SECONDS = 300   # Wait 5 minutes if account is locked

# server_tokens = {}
# server_token_timestamps = {}
# token_lock = threading.Lock()
# keepalive_threads = {}

# def load_token_cache():
#     """Load tokens from disk to share between different script executions"""
#     global server_tokens, server_token_timestamps
#     if not os.path.exists(TOKEN_CACHE_FILE):
#         return
#     try:
#         with open(TOKEN_CACHE_FILE, 'r') as f:
#             data = json.load(f)
#             server_tokens.update(data.get("tokens", {}))
#             server_token_timestamps.update(data.get("timestamps", {}))
#     except Exception as e:
#         logger.error(f"Failed to load token cache: {e}")

# def save_token_cache():
#     """Save tokens to disk"""
#     try:
#         with open(TOKEN_CACHE_FILE, 'w') as f:
#             json.dump({
#                 "tokens": dict(server_tokens),
#                 "timestamps": dict(server_token_timestamps)
#             }, f)
#     except Exception as e:
#         logger.error(f"Failed to save token cache: {e}")

# # Flow settings from vision_multi.py
# SKIP_PRIVATE_IPS = True
# TIMEOUT_OPENCV_REAL = 8    # Hard thread timeout for OpenCV (seconds)
# TIMEOUT_FFMPEG = 8         # FFmpeg timeout (seconds)


# # ================= GRACEFUL SHUTDOWN =================
# def handle_sigterm(sig, frame):
#     global STOP
#     STOP = True
#     logger.warning("⛔ SIGTERM / SIGINT received — stopping pipeline...")
    
#     # Stop all DSS keepalive threads
#     stop_all_keepalives()
    
#     # Signal all HLS worker _STOP_EVENTs so their threads exit cleanly
#     for mod_name in [
#         "workers.intruder_worker",
#         "workers.close_proximity_worker",
#         "workers.entry_exit_worker",
#         "workers.invigilator_worker",
#         "workers.server_room_worker",
#         "workers.phone_worker",
#         "workers.crowd_worker",
#         "workers.crowd_zero_det_worker",
#         "workers.crowd_five_det_worker",
#         "workers.blind_spot_worker",
#         "workers.camera_tampering_worker",
#         "workers.camera_inversion_worker",
#         "workers.strongroom_worker",
#         "workers.qp_box_det_worker",
#     ]:
#         try:
#             mod = sys.modules.get(mod_name)
#             if mod and hasattr(mod, "_STOP_EVENT"):
#                 mod._STOP_EVENT.set()
#         except Exception:
#             pass

# signal.signal(signal.SIGTERM, handle_sigterm)
# signal.signal(signal.SIGINT,  handle_sigterm)


# # ============================================================
# # 🔐 DSS AUTH
# # ============================================================

# def make_api_call(url, payload, headers, timeout=None):
#     """Make API call to camview.io server (treats 200 and 401 as success)"""
#     if timeout is None:
#         timeout = 10
    
#     try:
#         response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
#         # For authentication, both 200 and 401 contain valid JSON responses
#         if response.status_code in (200, 401):
#             return response
#         else:
#             return None
#     except Exception:
#         return None

# def parse_json_response(response, context):
#     """Parse JSON response from API call (handles both 200 and 401 responses)"""
#     if response is None:
#         return None
#     try:
#         return json.loads(response.content.decode("utf-8"))
#     except Exception:
#         return None

# def generate_signature(userName, password, realm, randomKey):
#     temp = hashlib.md5(password.encode()).hexdigest()
#     temp = hashlib.md5((userName + temp).encode()).hexdigest()
#     temp = hashlib.md5(temp.encode()).hexdigest()
#     temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
#     return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()

# def authenticate_server(server_address, max_attempts=3):
#     """Authenticate with a camview.io server and get access token"""
#     auth_url = f"https://{server_address}/admin/API/accounts/authorize"
#     logger.info(f"Authenticating with {server_address}...")
    
#     headers = {"Content-Type": "application/json"}
#     payload = {
#         "userName": DSS_USER,
#         "ipAddress": "",
#         "clientType": "WINPC_V1"
#     }
    
#     for attempt in range(1, max_attempts + 1):
#         # Step 1: Get realm and randomKey
#         try:
#             res = make_api_call(auth_url, payload, headers)
#             if res is None:
#                 time.sleep(1)
#                 continue
            
#             resp_json = parse_json_response(res, "initial authorization")
#             if resp_json is None:
#                 time.sleep(1)
#                 continue
            
#             if resp_json.get("code") not in (None, 1000, 0):
#                 logger.debug(f"Step 1 failed for {server_address}: {resp_json}")
#                 time.sleep(2)
#                 continue
            
#             # Extract auth parameters
#             realm = resp_json.get("realm")
#             randomKey = resp_json.get("randomKey")
#             publicKey = resp_json.get("publickey")
#             cookie = res.headers.get("Set-Cookie", "")
            
#             if not all([realm, randomKey, publicKey]):
#                 time.sleep(1)
#                 continue
            
#             # Step 2: Generate signature and get token
#             sig = generate_signature(DSS_USER, DSS_PASS, realm, randomKey)
            
#             payload2 = {
#                 "mac": "",
#                 "signature": sig,
#                 "userName": DSS_USER,
#                 "randomKey": randomKey,
#                 "publicKey": publicKey,
#                 "encryptType": "MD5",
#                 "ipAddress": "",
#                 "clientType": "WINPC_V1",
#                 "userType": "0"
#             }
            
#             headers2 = {"Content-Type": "application/json", "Cookie": cookie}
#             res2 = make_api_call(auth_url, payload2, headers2)
            
#             if res2 is None:
#                 time.sleep(1)
#                 continue
            
#             resp_json2 = parse_json_response(res2, "token exchange")
#             if resp_json2 is None:
#                 time.sleep(1)
#                 continue
            
#             # Log Step 2 failure reason
#             if resp_json2.get("code") not in (None, 1000, 0):
#                 err_code = resp_json2.get("code")
#                 err_desc = resp_json2.get("desc", "Unknown error")
#                 logger.error(f"❌ DSS auth Step 2 failed for {server_address}: {err_desc} (code: {err_code})")
                
#                 if err_code == 2002: # User locked
#                     logger.warning(f"⚠️ User '{DSS_USER}' is locked on {server_address}. Saving lock status and returning.")
#                     # Update cache with a dummy token and current timestamp so others see it as "locked"
#                     server_tokens[server_address] = "LOCKED"
#                     server_token_timestamps[server_address] = time.time()
#                     save_token_cache()
#                     return None
                
#                 time.sleep(2)
#                 continue
            
#             token = resp_json2.get("token")
#             if token:
#                 logger.info(f"✅ Authenticated with {server_address}")
#                 return token
#         except Exception as e:
#             logger.error(f"Error during authenticate_server for {server_address}: {e}")
#             time.sleep(1)
#             continue
            
#     logger.error(f"❌ Authentication failed for {server_address} after {max_attempts} attempts")
#     return None

# def get_server_token(server_address):
#     """Get valid token for a server with cross-process file locking to prevent user lockout."""
#     global server_tokens, server_token_timestamps
    
#     lock_file = f"{TOKEN_CACHE_FILE}.lock"
    
#     with token_lock:
#         # 1. First check: Is it already in memory and valid?
#         if server_address in server_tokens:
#             elapsed = time.time() - server_token_timestamps.get(server_address, 0)
#             token = server_tokens[server_address]
#             if token == "LOCKED" and elapsed < LOCKOUT_WAIT_SECONDS:
#                 logger.debug(f"Server {server_address} is currently locked (cached status)")
#                 return None
#             if token != "LOCKED" and elapsed < TOKEN_EXPIRY_SECONDS:
#                 return token
        
#         # 2. Cross-process check: Open lock file
#         f_lock = None
#         try:
#             # Use a separate file for the lock to avoid issues with reading/writing the JSON
#             f_lock = open(lock_file, "w")
#             # Acquire an exclusive lock (blocks if another script is authenticating)
#             fcntl.flock(f_lock, fcntl.LOCK_EX)
            
#             # Now that we have the lock, reload cache from disk (another script might have just saved it)
#             load_token_cache()
            
#             if server_address in server_tokens:
#                 elapsed = time.time() - server_token_timestamps.get(server_address, 0)
#                 token = server_tokens[server_address]
#                 if token == "LOCKED" and elapsed < LOCKOUT_WAIT_SECONDS:
#                     return None
#                 if token != "LOCKED" and elapsed < TOKEN_EXPIRY_SECONDS:
#                     return token
            
#             # 3. Authenticate if still no valid token
#             token = authenticate_server(server_address)
#             if token:
#                 server_tokens[server_address] = token
#                 server_token_timestamps[server_address] = time.time()
#                 save_token_cache()
#                 start_keepalive(server_address)
#             return token
            
#         except Exception as e:
#             logger.error(f"Error during locked authentication: {e}")
#             return None
#         finally:
#             # Release lock
#             if f_lock:
#                 try:
#                     fcntl.flock(f_lock, fcntl.LOCK_UN)
#                     f_lock.close()
#                 except Exception:
#                     pass

# def keepalive_loop(server_address, stop_event, interval=22):
#     """Background thread: sends PUT keepalive every ~22s to prevent session expiry."""
#     while not stop_event.wait(interval):
#         token = server_tokens.get(server_address)
#         if not token:
#             continue
#         try:
#             requests.put(
#                 f"https://{server_address}/admin/API/accounts/keepalive",
#                 headers={"Content-Type": "application/json", "X-Subject-Token": token},
#                 json={},
#                 timeout=5
#             )
#         except Exception:
#             pass

# def start_keepalive(server_address):
#     """Start a keepalive background thread for a server if not already running."""
#     if server_address not in keepalive_threads:
#         stop = threading.Event()
#         t = threading.Thread(target=keepalive_loop, args=(server_address, stop), daemon=True)
#         t.start()
#         keepalive_threads[server_address] = (t, stop)
#         logger.info(f"Keepalive thread started for {server_address}")

# def stop_all_keepalives():
#     for server, (t, stop) in keepalive_threads.items():
#         stop.set()


# def is_private_ip_url(url):
#     """Return True if the URL contains a private/LAN IP address."""
#     match = re.search(r'://(\d+\.\d+\.\d+\.\d+)', url)
#     if not match:
#         return False
#     ip = match.group(1)
#     parts = list(map(int, ip.split('.')))
#     return (
#         parts[0] == 10 or
#         (parts[0] == 172 and 16 <= parts[1] <= 31) or
#         (parts[0] == 192 and parts[1] == 168)
#     )


# def probe_tcp_port(host, port, timeout=2.0):
#     """Return True if TCP port is reachable within timeout seconds."""
#     import socket
#     try:
#         with socket.create_connection((host, port), timeout=timeout):
#             return True
#     except (socket.timeout, ConnectionRefusedError, OSError):
#         return False


# def extract_host_port(url):
#     """Extract (host, port) from rtsp:// or http:// URL. Returns (None, None) on failure."""
#     m = re.match(r'[a-z]+://([^/:]+)(?::(\d+))?', url)
#     if not m:
#         return None, None
#     host = m.group(1)
#     port = int(m.group(2)) if m.group(2) else (554 if url.startswith('rtsp') else 443)
#     return host, port


# def authenticate_and_get_token(server):
#     """Backwards compatibility wrapper."""
#     return get_server_token(server)


# # ============================================================
# # 🎥 RTSP HELPERS
# # ============================================================
# def add_token_to_url(rtsp_url, token):
#     """Append session token as ?token= query parameter."""
#     return f"{rtsp_url}?token={token}"


# def extract_rtsp_urls(api_data):
#     urls = []
#     for key in ("url", "url2"):
#         raw = api_data.get(key)
#         if not raw:
#             continue
#         urls.extend(p.strip() for p in raw.split("|") if p.strip())
#     return urls


# def get_rtsp_from_dss(device_id, camera_no, token, server):
#     """Returns (urls_list, stream_token) or None."""
#     try:
#         url     = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"
#         headers = {
#             "Content-Type":    "application/json;charset=UTF-8",
#             "X-Subject-Token": token
#         }
#         payload = {
#             "clientType": "WINPC_V1",
#             "project":    "PSDK",
#             "method":     "MTS.Video.StartVideo",
#             "data": {
#                 "streamType":  "1",
#                 "optional":    f"/admin/API/MTS/Video/StartVideo?token={token}",
#                 "channelId":   f"{device_id}$1$0${camera_no}",
#                 "dataType":    "2",
#                 "enableRtsps": "0"
#             }
#         }
        
#         logger.debug(f"Starting video: {server} - {device_id}_{camera_no}")
#         r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        
#         # Check if token expired (401 during StartVideo means token issue)
#         if r.status_code == 401:
#             logger.debug(f"Token expired for {server}, clearing cache")
#             with token_lock:
#                 server_tokens.pop(server, None)
#             return None

#         if r.status_code != 200:
#             logger.debug(f"StartVideo failed with status {r.status_code}")
#             return None

#         data = r.json()
#         if "data" not in data:
#             logger.warning(f"⚠️ No 'data' in DSS response for {device_id}_{camera_no}: {data}")
#             return None

#         api_data = data["data"]
#         urls = extract_rtsp_urls(api_data)
#         if not urls:
#             logger.warning(f"⚠️ No RTSP URLs for {device_id}_{camera_no}")
#             return None

#         # Extract stream token (use from data or fall back to session token)
#         stream_token = api_data.get("token") or token

#         # Fast TCP probe: if port is unreachable, skip the timeout entirely
#         h, p = extract_host_port(urls[0])
#         if h and p:
#             if not probe_tcp_port(h, p, timeout=2.0):
#                 logger.warning(f"Port {p} on {h} is BLOCKED/unreachable — skipping RTSP for {device_id}_{camera_no}. Check firewall rules for port {p}.")
#                 return None

#         return urls, stream_token

#     except Exception as e:
#         logger.error(f"❌ RTSP fetch error for {device_id}_{camera_no}: {e}")
#         return None


# def start_video_stream_hls(server_address, device_id, camera_no):
#     """
#     Request HLS (HTTP) stream URL instead of RTSP.
#     HLS uses HTTP/443 and bypasses port-9100 firewall blocks.
#     DSS API dataType "1" returns an HTTP/HLS URL.
#     """
#     token = get_server_token(server_address)
#     if not token:
#         return None, None, False

#     url = f"https://{server_address}/admin/API/MTS/Video/StartVideo?token={token}"
#     headers = {"Content-Type": "application/json", "X-Subject-Token": token}

#     payload = {
#         "clientType": "WINPC_V1",
#         "project": "PSDK",
#         "method": "MTS.Video.StartVideo",
#         "data": {
#             "streamType": "1",
#             "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
#             "channelId": f"{device_id}$1$0${camera_no}",
#             "dataType": "1",   # 1 = HLS/HTTP, 2 = RTSP
#             "enableRtsps": "0"
#         }
#     }

#     try:
#         res = make_api_call(url, payload, headers)
#         if res is None or res.status_code != 200:
#             return None, None, False

#         data = res.json().get("data") or {}
#         urls = []
#         for key in ("url", "url2"):
#             raw = data.get(key)
#             if not raw:
#                 continue
#             urls.extend([p.strip() for p in raw.split('|') if p.strip()])

#         stream_token = data.get("token") or token
#         if urls:
#             return urls, stream_token, True
#     except Exception as e:
#         logger.debug(f"HLS response parse error: {e}")

#     return None, None, False


# def order_urls(urls):
#     """Prefer public IPs over private 172.x subnets."""
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
#         "-timeout",        "10000000",
#         "-i",              rtsp_url,
#         "-f",              "image2pipe",
#         "-pix_fmt",        "bgr24",
#         "-vcodec",         "rawvideo",
#         "-s",              f"{width}x{height}",
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
# # 📡 RTSP PRODUCER
# # ============================================================
# def rtsp_producer(cam_configs, queues, shared_token_cache=None):
#     """
#     Reads frames from a DSS/RTSP camera and puts
#     (frame, device_id, camera_no) packets into all worker queues.
#     """
#     if shared_token_cache:
#         global server_tokens, server_token_timestamps, token_lock
#         server_tokens, server_token_timestamps, token_lock = shared_token_cache

#     if isinstance(cam_configs, dict):
#         cam_configs = [cam_configs]

#     first         = cam_configs[0]
#     device_id     = first.get("camera_id") or first.get("device_id", "")
#     camera_no     = first.get("ch_no")     or first.get("camera_no", "1")
#     camera_id_pk  = first.get("camera_id_pk", "")   
#     server        = first.get("server_ip") or first.get("cctv_url", "")
    
#     if "://" in str(server):
#         from urllib.parse import urlparse
#         server = urlparse(str(server)).netloc

#     direct_url    = first.get("cctv_url")  or first.get("stream_url", "")
#     label         = f"{device_id}_{camera_no}"
#     use_dss       = bool(server and not str(direct_url).startswith("rtsp://"))

#     while not STOP:
#         if use_dss:
#             token = get_server_token(server)
#             if not token:
#                 # If we couldn't get a token (likely locked), wait longer before retrying
#                 logger.error(f"❌ Auth failed (server might be locked) → {label}, retry in 30s")
#                 time.sleep(30)
#                 continue

#             result = get_rtsp_from_dss(device_id, camera_no, token, server)
#             if not result:
#                 # Try HLS fallback if RTSP fails to fetch
#                 logger.info(f"⏭️  RTSP fetch failed for {label}, trying HLS fallback...")
#                 result = start_video_stream_hls(server, device_id, camera_no)
                
#             if not result:
#                 logger.warning(f"⚠️ No RTSP/HLS result → {label}, retry in 10s")
#                 time.sleep(10)
#                 continue

#             urls, stream_token = result
#             ordered = order_urls(urls)
#             if not ordered:
#                 logger.warning(f"⚠️ Empty URL list → {label}")
#                 time.sleep(10)
#                 continue

#             rtsp_urls = [add_token_to_url(url, stream_token) for url in ordered]
#         else:
#             if not direct_url:
#                 logger.warning(f"⚠️ No server_ip or cctv_url for {label}. Skipping.")
#                 break
#             rtsp_urls = [direct_url]

#         connected = False
#         for url_index, rtsp_url in enumerate(rtsp_urls):
#             if SKIP_PRIVATE_IPS and is_private_ip_url(rtsp_url):
#                 logger.debug(f"⏭️ Skipping private IP URL: {rtsp_url[:50]}...")
#                 continue

#             h, p = extract_host_port(rtsp_url)
#             if h and p:
#                 if not probe_tcp_port(h, p, timeout=2.0):
#                     logger.warning(f"Port {p} on {h} is BLOCKED/unreachable — skipping URL for {label}")
#                     continue

#             logger.info(f"🔥 Connecting → {label}  URL #{url_index+1}/{len(rtsp_urls)}")

#             pipe       = start_ffmpeg_stream(rtsp_url)
#             fail_count = 0

#             while not STOP:
#                 frame = read_frame_from_pipe(pipe)

#                 if frame is None:
#                     fail_count += 1
#                     logger.warning(f"⚠️ Frame fail #{fail_count} → {label}")
#                     if fail_count >= 10:
#                         break
#                     time.sleep(0.5)
#                     continue

#                 if not connected:
#                     logger.info(f"✅ Connected successfully → {label}")
#                     connected = True
                
#                 fail_count = 0
#                 packet = (frame, device_id, camera_no, camera_id_pk)
#                 for q in queues:
#                     if not q.full():
#                         q.put(packet)

#                 time.sleep(0.04)

#             try:
#                 pipe.kill()
#                 pipe.wait(timeout=3)
#             except Exception:
#                 pass
            
#             if connected or STOP:
#                 break
            
#             if url_index < len(rtsp_urls) - 1:
#                 logger.info(f"⏭️  Trying next URL for {label}")
#             else:
#                 logger.warning(f"❌ All URLs failed → {label}, retry in 10s")
#                 time.sleep(10)

#     for q in queues:
#         try: q.put(None)
#         except Exception: pass

#     logger.info(f"🔴 RTSP Producer stopped → {label}")


# # ============================================================
# # 🚀 RTSP PIPELINE RUNNER
# # ============================================================
# def run_rtsp_pipeline(camera_group, max_concurrent=MAX_CONCURRENT, shared_token_cache=None):
#     """
#     Optimized RTSP Pipeline Runner:
#     - Starts ONE worker process per unique analytic type.
#     - All camera producers for that analytic feed into the same shared queue.
#     - Prevents GPU VRAM exhaustion by not loading multiple copies of the same model.
#     """
#     tokens, timestamps, lock = shared_token_cache
    
#     # 1. Identify all unique analytics needed
#     unique_scripts = set()
#     for c in camera_group:
#         script = c.get("script_code")
#         if script:
#             unique_scripts.add(script)

#     # 2. Start worker processes and create shared queues
#     worker_processes = []
#     script_queues = {} # script_code -> mp.Queue

#     for script in unique_scripts:
#         worker_fn = get_worker(script, mode="rtsp")
#         if not worker_fn:
#             logger.error(f"❌ Could not find worker for {script}")
#             continue
        
#         q = mp.Queue(maxsize=QUEUE_SIZE * 2) # Slightly larger shared queue
#         script_queues[script] = q
        
#         p = mp.Process(target=worker_fn, args=(q,), name=f"Worker-{script}", daemon=True)
#         p.start()
#         worker_processes.append(p)
#         logger.info(f"👷 Started shared worker for: {script}")

#     # 3. Group cameras by label for producers
#     grouped = {}
#     for c in camera_group:
#         label = f"{c['camera_id']}_{c.get('ch_no') or c.get('camera_no', '1')}"
#         grouped.setdefault(label, []).append(c)

#     # 4. Start producers with access to the shared queues
#     sem = threading.Semaphore(max_concurrent)

#     def start_producer(label, configs):
#         with sem:
#             if STOP: return
            
#             # Map of queues this producer needs to feed
#             producer_queues = []
#             for cfg in configs:
#                 script = cfg.get("script_code")
#                 if script in script_queues:
#                     producer_queues.append(script_queues[script])

#             if not producer_queues:
#                 return

#             # Note: rtsp_producer expects a list of queues
#             # It will put the same frame into all of them.
#             producer_proc = mp.Process(
#                 target=rtsp_producer, 
#                 args=(configs, producer_queues, (tokens, timestamps, lock)),
#                 name=f"Producer-{label}",
#                 daemon=True
#             )
#             producer_proc.start()
#             producer_proc.join()

#     threads = []
#     for label, configs in grouped.items():
#         if STOP: break
#         t = threading.Thread(target=start_producer, args=(label, configs), daemon=True)
#         t.start()
#         threads.append(t)
#         time.sleep(0.2) # Stagger producer starts

#     # Wait for all producers to finish
#     for t in threads:
#         t.join()

#     # 5. Clean up workers
#     logger.info("🛑 All producers finished. Stopping workers...")
#     for script, q in script_queues.items():
#         try:
#             q.put(None) # Signal worker to stop
#         except Exception:
#             pass

#     for p in worker_processes:
#         if p.is_alive():
#             p.join(timeout=5)
#             if p.is_alive():
#                 p.terminate()


# # ============================================================
# # 🚀 HLS PIPELINE RUNNER
# # ============================================================
# def run_hls_pipeline(camera_group):
#     grouped = {}
#     for c in camera_group:
#         grouped.setdefault(c.get("script_code", ""), []).append(c)

#     threads = []
#     for script_code, configs in grouped.items():
#         worker_fn = get_worker(script_code, mode="hls")
#         if not worker_fn: continue
#         t = threading.Thread(target=worker_fn, args=(configs,), daemon=True)
#         t.start()
#         threads.append(t)

#     for t in threads: t.join()


# # ============================================================
# # 🚀 MAIN
# # ============================================================
# def main():
#     global server_tokens, server_token_timestamps, token_lock
    
#     # Initialize shared manager for cross-process token cache
#     manager = mp.Manager()
#     server_tokens = manager.dict()
#     server_token_timestamps = manager.dict()
#     token_lock = manager.Lock()

#     exam_id   = os.environ.get("EXAM_ID",  "").strip()
#     shift_id  = os.environ.get("SHIFT_ID", "").strip()
#     link_type = os.environ.get("LINK_TYPE", "").strip().upper()

#     if exam_id and shift_id and link_type:
#         parser = argparse.ArgumentParser()
#         parser.add_argument("--analytics", nargs="+", default=[])
#         args, _ = parser.parse_known_args()
#         script_codes = args.analytics

#         if not script_codes:
#             logger.error("❌ --analytics flag missing")
#             os._exit(1)

#         results = []
#         for script_code in script_codes:
#             execution = {
#                 "exam_id":     exam_id,
#                 "shift_id":    shift_id,
#                 "link_type":   link_type,
#                 "script_code": script_code,
#             }
#             cameras = load_cameras_for_execution(execution)
#             if cameras: results.append((execution, cameras))
#     else:
#         results = load_all_pending_cameras()

#     if not results:
#         logger.info("✅ No cameras to process.")
#         os._exit(0)

#     all_rtsp_cameras = []
#     all_hls_cameras  = []

#     for ex, cams in results:
#         lt = ex.get("link_type", "").upper()
#         if lt == "RTSP": all_rtsp_cameras.extend(cams)
#         elif lt == "HLS": all_hls_cameras.extend(cams)

#     pipeline_threads = []
#     if all_rtsp_cameras:
#         t = threading.Thread(
#             target=run_rtsp_pipeline, 
#             args=(all_rtsp_cameras, MAX_CONCURRENT, (server_tokens, server_token_timestamps, token_lock)), 
#             name="RTSP-pipeline"
#         )
#         t.start(); pipeline_threads.append(t)

#     if all_hls_cameras:
#         t = threading.Thread(target=run_hls_pipeline, args=(all_hls_cameras,), name="HLS-pipeline")
#         t.start(); pipeline_threads.append(t)

#     for t in pipeline_threads: t.join()
#     logger.info("✅ MASTER PIPELINE COMPLETED")
#     os._exit(0)


# if __name__ == "__main__":
#     mp.set_start_method("spawn", force=True)
#     main()


"""
Master Detection Pipeline
=========================
Supports both RTSP (DSS-auth + ffmpeg pipe) and HLS (GPU-batch workers).
Camera configs loaded from DB via utils.camera_loader (env-var driven).

FIXED: Cross-worker auth race condition. Now uses pure fcntl file locking
with disk cache shared across all worker processes.
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
import importlib
import json
import re
import fcntl


# ================= PATH SETUP =================
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
WORKERS_DIR  = os.path.join(PROJECT_ROOT, "workers")
sys.path.insert(0, PROJECT_ROOT)
sys.path.insert(0, WORKERS_DIR)

# ================= LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Force RTSP over TCP for OpenCV — prevents UDP data loss behind QEMU/KVM NAT
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"


def get_worker(analytic_name, mode="rtsp"):
    """
    Lazily import the requested worker to prevent loading unused models.
    Returns the worker function for the given analytic and mode (rtsp/hls).
    """
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
        "crowd_zero":  ("crowd_zero_det_worker",   "crowd_zero_det_worker",   "crowd_zero_det_worker_hls"),
        "crowd_five":  ("crowd_five_det_worker",   "crowd_five_det_worker",   "crowd_five_det_worker_hls"),
        "blind_spot":  ("blind_spot_worker",       "blind_spot_worker",       "blind_spot_worker_hls"),
        "strongroom":  ("strongroom_worker",       "strongroom_worker",       "strongroom_worker_hls"),
        "qp_box":      ("qp_box_det_worker",       "qp_box_det_worker",       "qp_box_det_worker_hls"),
    }
    
    if analytic_name not in mapping:
        logger.error(f"Unknown analytic requested: {analytic_name}")
        return None
        
    module_name, rtsp_fn, hls_fn = mapping[analytic_name]
    try:
        try:
            module = importlib.import_module(module_name)
        except (ImportError, ModuleNotFoundError):
            module = importlib.import_module(f"workers.{module_name}")

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
MAX_CONCURRENT = 64

DSS_USER = "system"
DSS_PASS = "Sasd@12345"

# ================= CRITICAL FIX: Shared disk-based token cache =================
# All 4 workers share this file via fcntl.flock. No mp.Manager() — it doesn't
# work across separate worker processes/systems.
TOKEN_CACHE_FILE = os.path.join(PROJECT_ROOT, "server_tokens.json")
TOKEN_LOCK_FILE = f"{TOKEN_CACHE_FILE}.lock"

# FIXED: Reduced from 3600 to 300 seconds. DSS tokens expire ~5-10 min.
# Using 5 min ensures we refresh before expiry, preventing stale-token 401s
# that trigger re-auth storms and user lockouts.
TOKEN_EXPIRY_SECONDS = 300

# Wait 5 min if account is locked
LOCKOUT_WAIT_SECONDS = 300

# Module-level in-memory cache (per-process only, but refreshed from disk)
_server_tokens_local = {}
_server_token_timestamps_local = {}
_local_lock = threading.Lock()


def _load_token_cache():
    """Load tokens from disk. Thread-safe but NOT process-safe — caller must hold file lock."""
    global _server_tokens_local, _server_token_timestamps_local
    if not os.path.exists(TOKEN_CACHE_FILE):
        return
    try:
        with open(TOKEN_CACHE_FILE, 'r') as f:
            data = json.load(f)
            _server_tokens_local = data.get("tokens", {})
            _server_token_timestamps_local = data.get("timestamps", {})
    except Exception as e:
        logger.error(f"Failed to load token cache: {e}")


def _save_token_cache():
    """Save tokens to disk. Thread-safe but NOT process-safe — caller must hold file lock."""
    try:
        with open(TOKEN_CACHE_FILE, 'w') as f:
            json.dump({
                "tokens": _server_tokens_local,
                "timestamps": _server_token_timestamps_local
            }, f)
    except Exception as e:
        logger.error(f"Failed to save token cache: {e}")


# ================= GRACEFUL SHUTDOWN =================
def handle_sigterm(sig, frame):
    global STOP
    STOP = True
    logger.warning("SIGTERM / SIGINT received — stopping pipeline...")
    
    stop_all_keepalives()
    
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
        "workers.strongroom_worker",
        "workers.qp_box_det_worker",
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
# DSS AUTH — FIXED: Pure file-lock based, no mp.Manager()
# ============================================================

def make_api_call(url, payload, headers, timeout=10):
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
        if response.status_code in (200, 401):
            return response
        return None
    except Exception:
        return None


def parse_json_response(response, context):
    if response is None:
        return None
    try:
        return json.loads(response.content.decode("utf-8"))
    except Exception:
        return None


def generate_signature(userName, password, realm, randomKey):
    temp = hashlib.md5(password.encode()).hexdigest()
    temp = hashlib.md5((userName + temp).encode()).hexdigest()
    temp = hashlib.md5(temp.encode()).hexdigest()
    temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
    return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()


def authenticate_server(server_address, max_attempts=2):
    """
    Authenticate with DSS server. 
    CRITICAL: Only call this while holding the file lock!
    """
    auth_url = f"https://{server_address}/admin/API/accounts/authorize"
    logger.info(f"Authenticating with {server_address}...")
    
    headers = {"Content-Type": "application/json"}
    payload = {
        "userName": DSS_USER,
        "ipAddress": "",
        "clientType": "WINPC_V1"
    }
    
    for attempt in range(1, max_attempts + 1):
        # Step 1: Get realm and randomKey
        res = make_api_call(auth_url, payload, headers)
        if res is None:
            time.sleep(0.5)
            continue
        
        resp_json = parse_json_response(res, "initial authorization")
        if resp_json is None:
            time.sleep(0.5)
            continue
        
        code = resp_json.get("code")
        if code not in (None, 1000, 0):
            logger.debug(f"Step 1 failed for {server_address}: code={code}")
            time.sleep(1)
            continue
        
        realm = resp_json.get("realm")
        randomKey = resp_json.get("randomKey")
        publicKey = resp_json.get("publickey")
        cookie = res.headers.get("Set-Cookie", "")
        
        if not all([realm, randomKey, publicKey]):
            time.sleep(0.5)
            continue
        
        # Step 2: Generate signature and get token
        sig = generate_signature(DSS_USER, DSS_PASS, realm, randomKey)
        
        payload2 = {
            "mac": "",
            "signature": sig,
            "userName": DSS_USER,
            "randomKey": randomKey,
            "publicKey": publicKey,
            "encryptType": "MD5",
            "ipAddress": "",
            "clientType": "WINPC_V1",
            "userType": "0"
        }
        
        headers2 = {"Content-Type": "application/json", "Cookie": cookie}
        res2 = make_api_call(auth_url, payload2, headers2)
        
        if res2 is None:
            time.sleep(0.5)
            continue
        
        resp_json2 = parse_json_response(res2, "token exchange")
        if resp_json2 is None:
            time.sleep(0.5)
            continue
        
        code2 = resp_json2.get("code")
        if code2 not in (None, 1000, 0):
            err_desc = resp_json2.get("desc", "Unknown error")
            logger.error(f"DSS auth Step 2 failed for {server_address}: {err_desc} (code: {code2})")
            
            if code2 == 2002:  # User locked
                logger.warning(f"User '{DSS_USER}' is locked on {server_address}.")
                _server_tokens_local[server_address] = "LOCKED"
                _server_token_timestamps_local[server_address] = time.time()
                _save_token_cache()
                return None
            
            time.sleep(1)
            continue
        
        token = resp_json2.get("token")
        if token:
            logger.info(f"Authenticated with {server_address}")
            return token
            
    logger.error(f"Authentication failed for {server_address} after {max_attempts} attempts")
    return None


def get_server_token(server_address):
    """
    FIXED: Pure file-lock based token management. 
    No mp.Manager() — it doesn't work across your 4 separate workers.
    
    Uses fcntl.flock on a shared file. All 4 workers serialize through this.
    """
    global _server_tokens_local, _server_token_timestamps_local
    
    # Fast path: check local memory (no lock needed, may be stale but will be refreshed)
    with _local_lock:
        if server_address in _server_tokens_local:
            elapsed = time.time() - _server_token_timestamps_local.get(server_address, 0)
            token = _server_tokens_local[server_address]
            if token == "LOCKED" and elapsed < LOCKOUT_WAIT_SECONDS:
                logger.debug(f"Server {server_address} locked (local cache)")
                return None
            if token != "LOCKED" and elapsed < TOKEN_EXPIRY_SECONDS:
                return token
    
    # Slow path: acquire file lock, reload from disk, auth if needed
    f_lock = None
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(TOKEN_LOCK_FILE) or ".", exist_ok=True)
        
        f_lock = open(TOKEN_LOCK_FILE, "w")
        # BLOCKING exclusive lock — all 4 workers serialize here
        fcntl.flock(f_lock, fcntl.LOCK_EX)
        
        # CRITICAL: Reload from disk to see what other workers have done
        _load_token_cache()
        
        # Check again after loading fresh data
        if server_address in _server_tokens_local:
            elapsed = time.time() - _server_token_timestamps_local.get(server_address, 0)
            token = _server_tokens_local[server_address]
            if token == "LOCKED" and elapsed < LOCKOUT_WAIT_SECONDS:
                logger.debug(f"Server {server_address} locked (disk cache)")
                return None
            if token != "LOCKED" and elapsed < TOKEN_EXPIRY_SECONDS:
                # Token valid — update local cache and return
                with _local_lock:
                    _server_tokens_local[server_address] = token
                    _server_token_timestamps_local[server_address] = time.time()
                return token
        
        # Need to authenticate — we're the only process doing this right now
        token = authenticate_server(server_address)
        if token:
            _server_tokens_local[server_address] = token
            _server_token_timestamps_local[server_address] = time.time()
            _save_token_cache()
            start_keepalive(server_address)
        
        return token
        
    except Exception as e:
        logger.error(f"Error in get_server_token: {e}")
        return None
    finally:
        if f_lock:
            try:
                fcntl.flock(f_lock, fcntl.LOCK_UN)
                f_lock.close()
            except Exception:
                pass


def keepalive_loop(server_address, stop_event, interval=22):
    """Background thread: sends PUT keepalive every ~22s."""
    while not stop_event.wait(interval):
        token = None
        with _local_lock:
            token = _server_tokens_local.get(server_address)
        
        if not token or token == "LOCKED":
            continue
        
        try:
            requests.put(
                f"https://{server_address}/admin/API/accounts/keepalive",
                headers={"Content-Type": "application/json", "X-Subject-Token": token},
                json={},
                timeout=5
            )
            logger.debug(f"Keepalive sent for {server_address}")
        except Exception:
            pass


keepalive_threads = {}

def start_keepalive(server_address):
    """Start a keepalive background thread for a server if not already running."""
    if server_address not in keepalive_threads:
        stop = threading.Event()
        t = threading.Thread(target=keepalive_loop, args=(server_address, stop), daemon=True)
        t.start()
        keepalive_threads[server_address] = (t, stop)
        logger.info(f"Keepalive thread started for {server_address}")


def stop_all_keepalives():
    for server, (t, stop) in keepalive_threads.items():
        stop.set()


def is_private_ip_url(url):
    match = re.search(r'://(\d+\.\d+\.\d+\.\d+)', url)
    if not match:
        return False
    ip = match.group(1)
    parts = list(map(int, ip.split('.')))
    return (
        parts[0] == 10 or
        (parts[0] == 172 and 16 <= parts[1] <= 31) or
        (parts[0] == 192 and parts[1] == 168)
    )


def probe_tcp_port(host, port, timeout=2.0):
    import socket
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def extract_host_port(url):
    m = re.match(r'[a-z]+://([^/:]+)(?::(\d+))?', url)
    if not m:
        return None, None
    host = m.group(1)
    port = int(m.group(2)) if m.group(2) else (554 if url.startswith('rtsp') else 443)
    return host, port


def authenticate_and_get_token(server):
    """Backwards compatibility wrapper."""
    return get_server_token(server)


# ============================================================
# RTSP HELPERS
# ============================================================
def add_token_to_url(rtsp_url, token):
    return f"{rtsp_url}?token={token}"


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
                "optional":    f"/admin/API/MTS/Video/StartVideo?token={token}",
                "channelId":   f"{device_id}$1$0${camera_no}",
                "dataType":    "2",
                "enableRtsps": "0"
            }
        }
        
        logger.debug(f"Starting video: {server} - {device_id}_{camera_no}")
        r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        
        if r.status_code == 401:
            logger.debug(f"Token expired for {server}, clearing cache")
            with _local_lock:
                _server_tokens_local.pop(server, None)
            return None

        if r.status_code != 200:
            logger.debug(f"StartVideo failed with status {r.status_code}")
            return None

        data = r.json()
        if "data" not in data:
            logger.warning(f"No 'data' in DSS response for {device_id}_{camera_no}: {data}")
            return None

        api_data = data["data"]
        urls = extract_rtsp_urls(api_data)
        if not urls:
            logger.warning(f"No RTSP URLs for {device_id}_{camera_no}")
            return None

        stream_token = api_data.get("token") or token

        h, p = extract_host_port(urls[0])
        if h and p:
            if not probe_tcp_port(h, p, timeout=2.0):
                logger.warning(f"Port {p} on {h} is BLOCKED — skipping RTSP for {device_id}_{camera_no}")
                return None

        return urls, stream_token

    except Exception as e:
        logger.error(f"RTSP fetch error for {device_id}_{camera_no}: {e}")
        return None


def start_video_stream_hls(server_address, device_id, camera_no):
    token = get_server_token(server_address)
    if not token:
        return None, None, False

    url = f"https://{server_address}/admin/API/MTS/Video/StartVideo?token={token}"
    headers = {"Content-Type": "application/json", "X-Subject-Token": token}

    payload = {
        "clientType": "WINPC_V1",
        "project": "PSDK",
        "method": "MTS.Video.StartVideo",
        "data": {
            "streamType": "1",
            "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
            "channelId": f"{device_id}$1$0${camera_no}",
            "dataType": "1",
            "enableRtsps": "0"
        }
    }

    try:
        res = make_api_call(url, payload, headers)
        if res is None or res.status_code != 200:
            return None, None, False

        data = res.json().get("data") or {}
        urls = []
        for key in ("url", "url2"):
            raw = data.get(key)
            if not raw:
                continue
            urls.extend([p.strip() for p in raw.split('|') if p.strip()])

        stream_token = data.get("token") or token
        if urls:
            return urls, stream_token, True
    except Exception as e:
        logger.debug(f"HLS response parse error: {e}")

    return None, None, False


def order_urls(urls):
    public  = [u for u in urls if not u.startswith("rtsp://172.")]
    private = [u for u in urls if u.startswith("rtsp://172.")]
    return public + private


# ============================================================
# FFMPEG PIPE
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
# RTSP PRODUCER — FIXED: Accepts pre-authed token, no shared_token_cache
# ============================================================
def rtsp_producer(cam_configs, queues, pre_fetched_token=None):
    """
    Reads frames from a DSS/RTSP camera and puts packets into worker queues.
    
    FIXED: If pre_fetched_token is provided, uses it directly instead of auth.
    This prevents auth storms when multiple cameras share the same server.
    """
    if isinstance(cam_configs, dict):
        cam_configs = [cam_configs]

    first         = cam_configs[0]
    device_id     = first.get("camera_id") or first.get("device_id", "")
    camera_no     = first.get("ch_no")     or first.get("camera_no", "1")
    camera_id_pk  = first.get("camera_id_pk", "")
    exam_id       = first.get("exam_id", "0")
    server        = first.get("server_ip") or first.get("cctv_url", "")
    
    if "://" in str(server):
        from urllib.parse import urlparse
        server = urlparse(str(server)).netloc

    direct_url    = first.get("cctv_url")  or first.get("stream_url", "")
    label         = f"{device_id}_{camera_no}"
    use_dss       = bool(server and not str(direct_url).startswith("rtsp://"))

    while not STOP:
        if use_dss:
            # FIXED: Use pre-fetched token if available (avoids re-auth per camera)
            if pre_fetched_token:
                token = pre_fetched_token
                logger.debug(f"Using pre-fetched token for {label}")
            else:
                token = get_server_token(server)
            
            if not token:
                logger.error(f"Auth failed (server might be locked) → {label}, retry in 30s")
                time.sleep(30)
                continue

            result = get_rtsp_from_dss(device_id, camera_no, token, server)
            if not result:
                logger.info(f"RTSP fetch failed for {label}, trying HLS fallback...")
                result = start_video_stream_hls(server, device_id, camera_no)
                
            if not result:
                logger.warning(f"No RTSP/HLS result → {label}, retry in 10s")
                time.sleep(10)
                continue

            # urls, stream_token = result
            urls, stream_token, _ = result
            ordered = order_urls(urls)
            if not ordered:
                logger.warning(f"Empty URL list → {label}")
                time.sleep(10)
                continue

            rtsp_urls = [add_token_to_url(url, stream_token) for url in ordered]
        else:
            if not direct_url:
                logger.warning(f"No server_ip or cctv_url for {label}. Skipping.")
                break
            rtsp_urls = [direct_url]

        connected = False
        for url_index, rtsp_url in enumerate(rtsp_urls):
            if is_private_ip_url(rtsp_url):
                logger.debug(f"Skipping private IP URL: {rtsp_url[:50]}...")
                continue

            h, p = extract_host_port(rtsp_url)
            if h and p:
                if not probe_tcp_port(h, p, timeout=2.0):
                    logger.warning(f"Port {p} on {h} is BLOCKED — skipping URL for {label}")
                    continue

            logger.info(f"Connecting → {label}  URL #{url_index+1}/{len(rtsp_urls)}")

            pipe       = start_ffmpeg_stream(rtsp_url)
            fail_count = 0

            while not STOP:
                frame = read_frame_from_pipe(pipe)

                if frame is None:
                    fail_count += 1
                    logger.warning(f"Frame fail #{fail_count} → {label}")
                    if fail_count >= 10:
                        break
                    time.sleep(0.5)
                    continue

                if not connected:
                    logger.info(f"Connected successfully → {label}")
                    connected = True
                
                fail_count = 0
                packet = (frame, device_id, camera_no, camera_id_pk, exam_id)
                for q in queues:
                    if not q.full():
                        q.put(packet)

                time.sleep(0.04)

            try:
                pipe.kill()
                pipe.wait(timeout=3)
            except Exception:
                pass
            
            if connected or STOP:
                break
            
            if url_index < len(rtsp_urls) - 1:
                logger.info(f"Trying next URL for {label}")
            else:
                logger.warning(f"All URLs failed → {label}, retry in 10s")
                time.sleep(10)

    for q in queues:
        try: q.put(None)
        except Exception: pass

    logger.info(f"RTSP Producer stopped → {label}")


# ============================================================
# RTSP PIPELINE RUNNER — FIXED: Pre-auth per server, pass token to producers
# ============================================================
def run_rtsp_pipeline(camera_group, max_concurrent=MAX_CONCURRENT):
    """
    FIXED: Pre-authenticates per unique server ONCE in the parent process,
    then passes the token to all child producers for that server.
    This eliminates the auth-per-camera race condition entirely.
    """
    
    # 1. Identify unique servers and pre-auth for each
    unique_servers = set()
    for c in camera_group:
        server = c.get("server_ip") or c.get("cctv_url", "")
        if "://" in str(server):
            from urllib.parse import urlparse
            server = urlparse(str(server)).netloc
        if server and not str(c.get("cctv_url", "")).startswith("rtsp://"):
            unique_servers.add(server)
    
    # Pre-auth for all unique servers (serialized via file lock in get_server_token)
    server_tokens_map = {}
    for server in unique_servers:
        if STOP:
            break
        token = get_server_token(server)
        if token:
            server_tokens_map[server] = token
            logger.info(f"Pre-authenticated for server {server}")
        else:
            logger.error(f"Failed to pre-authenticate for server {server} — all its cameras will be skipped")
    
    # 2. Identify all unique analytics needed
    unique_scripts = set()
    for c in camera_group:
        script = c.get("script_code")
        if script:
            unique_scripts.add(script)

    # 3. Start worker processes and create shared queues
    worker_processes = []
    script_queues = {}

    for script in unique_scripts:
        worker_fn = get_worker(script, mode="rtsp")
        if not worker_fn:
            logger.error(f"Could not find worker for {script}")
            continue
        
        q = mp.Queue(maxsize=QUEUE_SIZE * 2)
        script_queues[script] = q
        
        p = mp.Process(target=worker_fn, args=(q,), name=f"Worker-{script}", daemon=True)
        p.start()
        worker_processes.append(p)
        logger.info(f"Started shared worker for: {script}")

    # 4. Group cameras by label for producers
    grouped = {}
    for c in camera_group:
        label = f"{c['camera_id']}_{c.get('ch_no') or c.get('camera_no', '1')}"
        grouped.setdefault(label, []).append(c)

    # 5. Start producers with pre-fetched tokens
    sem = threading.Semaphore(max_concurrent)

    def start_producer(label, configs):
        with sem:
            if STOP: return
            
            # Get the pre-fetched token for this camera's server
            first = configs[0]
            server = first.get("server_ip") or first.get("cctv_url", "")
            if "://" in str(server):
                from urllib.parse import urlparse
                server = urlparse(str(server)).netloc
            pre_token = server_tokens_map.get(server) if server else None
            
            producer_queues = []
            for cfg in configs:
                script = cfg.get("script_code")
                if script in script_queues:
                    producer_queues.append(script_queues[script])

            if not producer_queues:
                return

            # FIXED: Pass pre-fetched token to avoid per-process re-auth
            producer_proc = mp.Process(
                target=rtsp_producer, 
                args=(configs, producer_queues, pre_token),
                name=f"Producer-{label}",
                daemon=True
            )
            producer_proc.start()
            producer_proc.join()

    threads = []
    for label, configs in grouped.items():
        if STOP: break
        t = threading.Thread(target=start_producer, args=(label, configs), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(0.5)  # Slightly increased stagger

    for t in threads:
        t.join()

    # 6. Clean up workers
    logger.info("All producers finished. Stopping workers...")
    for script, q in script_queues.items():
        try:
            q.put(None)
        except Exception:
            pass

    for p in worker_processes:
        if p.is_alive():
            p.join(timeout=5)
            if p.is_alive():
                p.terminate()


# ============================================================
# HLS PIPELINE RUNNER
# ============================================================
def run_hls_pipeline(camera_group):
    grouped = {}
    for c in camera_group:
        grouped.setdefault(c.get("script_code", ""), []).append(c)

    threads = []
    for script_code, configs in grouped.items():
        worker_fn = get_worker(script_code, mode="hls")
        if not worker_fn: continue
        t = threading.Thread(target=worker_fn, args=(configs,), daemon=True)
        t.start()
        threads.append(t)

    for t in threads: t.join()


# ============================================================
# MAIN — FIXED: No mp.Manager() for tokens
# ============================================================
def main():
    # FIXED: Removed mp.Manager() for token cache — it doesn't work across
    # separate worker systems. Using pure file-based locking instead.
    
    exam_id   = os.environ.get("EXAM_ID",  "").strip()
    shift_id  = os.environ.get("SHIFT_ID", "").strip()
    link_type = os.environ.get("LINK_TYPE", "").strip().upper()

    if exam_id and shift_id and link_type:
        parser = argparse.ArgumentParser()
        parser.add_argument("--analytics", nargs="+", default=[])
        args, _ = parser.parse_known_args()
        script_codes = args.analytics

        if not script_codes:
            logger.error("--analytics flag missing")
            os._exit(1)

        results = []
        for script_code in script_codes:
            execution = {
                "exam_id":     exam_id,
                "shift_id":    shift_id,
                "link_type":   link_type,
                "script_code": script_code,
            }
            cameras = load_cameras_for_execution(execution)
            if cameras: results.append((execution, cameras))
    else:
        results = load_all_pending_cameras()

    if not results:
        logger.info("No cameras to process.")
        os._exit(0)

    all_rtsp_cameras = []
    all_hls_cameras  = []

    for ex, cams in results:
        lt = ex.get("link_type", "").upper()
        if lt == "RTSP": all_rtsp_cameras.extend(cams)
        elif lt == "HLS": all_hls_cameras.extend(cams)

    pipeline_threads = []
    if all_rtsp_cameras:
        t = threading.Thread(
            target=run_rtsp_pipeline, 
            args=(all_rtsp_cameras, MAX_CONCURRENT), 
            name="RTSP-pipeline"
        )
        t.start(); pipeline_threads.append(t)

    if all_hls_cameras:
        t = threading.Thread(target=run_hls_pipeline, args=(all_hls_cameras,), name="HLS-pipeline")
        t.start(); pipeline_threads.append(t)

    for t in pipeline_threads: t.join()
    logger.info("MASTER PIPELINE COMPLETED")
    os._exit(0)


if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)
    main()