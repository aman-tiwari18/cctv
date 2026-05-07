# ---------------------------------------------------------------------------
# stdlib
# ---------------------------------------------------------------------------
import asyncio
import json
import logging
import multiprocessing
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from base64 import b64encode
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# third-party
# ---------------------------------------------------------------------------
import aiohttp
import cv2
import numpy as np
import pandas as pd
import requests
import time
import urllib3
from tqdm.asyncio import tqdm as atqdm

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ---------------------------------------------------------------------------
# internal — DB client
# ---------------------------------------------------------------------------
try:
    from utils.db_client import (
        get_hls_cameras,
        get_rtsp_cameras,
        update_hls_classification,
        update_rtsp_classification,
        update_hls_status,
        update_rtsp_status,
    )
except ImportError:
    sys.path.append(os.path.join(os.path.dirname(__file__), "utils"))
    from db_client import (
        get_hls_cameras,
        get_rtsp_cameras,
        update_hls_classification,
        update_rtsp_classification,
        update_hls_status,
        update_rtsp_status,
    )

# ===========================================================================
# Logging
# ===========================================================================
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
LOG_DIR      = os.path.join(PROJECT_ROOT, "logs/vision")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILENAME = os.path.join(
    LOG_DIR, f"vision_db_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler(LOG_FILENAME), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

# ===========================================================================
# Configuration
# ===========================================================================
_CPU_CORES = multiprocessing.cpu_count()

MAX_WORKERS_NETWORK: int = int(os.getenv("VISION_MAX_WORKERS_NETWORK", "64"))
MAX_WORKERS_VLM:     int = int(os.getenv("VISION_MAX_WORKERS_VLM",     "32"))
THREAD_POOL_SIZE:    int = int(os.getenv("VISION_THREAD_POOL",         str(min(_CPU_CORES * 2, 128))))

TIMEOUT_EXTRACT_URL: int = 3
TIMEOUT_TEST_STREAM: int = 3
TIMEOUT_OPENCV_MS:   int = 3_000
TIMEOUT_OPENCV_REAL: int = 6        # hard wall-clock thread join for OpenCV
TIMEOUT_FFMPEG:      int = 5
TIMEOUT_VLM:         int = int(os.getenv("VISION_TIMEOUT_VLM", "120"))
TIMEOUT_API:         int = int(os.getenv("VISION_TIMEOUT_API",  "10"))

OLLAMA_URL:     str = os.getenv("VISION_OLLAMA_URL",         "http://localhost:11434/api/generate")
OLLAMA_MODEL:   str = os.getenv("VISION_OLLAMA_MODEL",       "qwen3-vl:8b")
OLLAMA_NUM_CTX: int = int(os.getenv("VISION_OLLAMA_NUM_CTX", "2048"))

DEFAULT_EXAM_ID:   int = 2
DEFAULT_SHIFT_ID:  int = 7
DEFAULT_EXAM_DATE: str = datetime.now().strftime("%Y-%m-%d")

VISION_ASSIGNMENT_PAYLOAD: Optional[str] = os.getenv("VISION_ASSIGNMENT_PAYLOAD")

SAVE_FOLDER         = os.path.join(PROJECT_ROOT, "results/tcs_classification")
FRAMES_FOLDER       = os.path.join(PROJECT_ROOT, "results/classification_frames")
CHECKPOINT_FILE     = "checkpoint_progress.json"
CHECKPOINT_INTERVAL = 500
RESUME_FROM_CHECKPOINT = True
SCENE_COLUMN_TARGET = "Scene Classification"

os.makedirs(SAVE_FOLDER, exist_ok=True)
os.makedirs(FRAMES_FOLDER, exist_ok=True)

# One shared thread-pool for all blocking I/O (OpenCV, FFmpeg, HLS extract, Camview auth)
_THREAD_POOL = ThreadPoolExecutor(max_workers=THREAD_POOL_SIZE)

# ===========================================================================
# Camview DVR Authentication (for RTSP cameras)
# ===========================================================================
import hashlib as _hashlib
import socket as _socket

_CAMVIEW_AUTH_USER  = os.getenv("CAMVIEW_AUTH_USER",  "system")
_CAMVIEW_AUTH_PASS  = os.getenv("CAMVIEW_AUTH_PASS",  "Coreiseven@@")
_CAMVIEW_TOKEN_TTL  = int(os.getenv("CAMVIEW_TOKEN_TTL", "3600"))
_CAMVIEW_SKIP_PRIV  = os.getenv("CAMVIEW_SKIP_PRIVATE_IPS", "1") == "1"

_camview_tokens:     dict = {}
_camview_timestamps: dict = {}
_camview_lock             = threading.Lock()


def _camview_signature(user: str, password: str, realm: str, random_key: str) -> str:
    t = _hashlib.md5(password.encode()).hexdigest()
    t = _hashlib.md5((user + t).encode()).hexdigest()
    t = _hashlib.md5(t.encode()).hexdigest()
    t = _hashlib.md5((user + ":" + realm + ":" + t).encode()).hexdigest()
    return _hashlib.md5((t + ":" + random_key).encode()).hexdigest()


def _is_private_ip_url(url: str) -> bool:
    m = re.search(r'://(\d+\.\d+\.\d+\.\d+)', url)
    if not m:
        return False
    p = list(map(int, m.group(1).split('.')))
    return (p[0] == 10 or
            (p[0] == 172 and 16 <= p[1] <= 31) or
            (p[0] == 192 and p[1] == 168))


def _probe_tcp_port(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with _socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _sync_camview_authenticate(server: str) -> Optional[str]:
    """Blocking — 2-step Camview challenge/response auth. Returns token or None."""
    import requests as _req
    auth_url = f"https://{server}/admin/API/accounts/authorize"
    headers  = {"Content-Type": "application/json"}
    payload  = {"userName": _CAMVIEW_AUTH_USER, "ipAddress": "", "clientType": "WINPC_V1"}

    for attempt in range(1, 3):
        try:
            r1 = _req.post(auth_url, headers=headers, data=json.dumps(payload),
                           timeout=TIMEOUT_API, verify=False)
            if r1.status_code not in (200, 401):
                continue
            j1 = r1.json()
            realm      = j1.get("realm")
            random_key = j1.get("randomKey")
            public_key = j1.get("publickey") or j1.get("publicKey")
            cookie     = r1.headers.get("Set-Cookie", "")
            if not all([realm, random_key, public_key]):
                continue

            sig = _camview_signature(_CAMVIEW_AUTH_USER, _CAMVIEW_AUTH_PASS, realm, random_key)
            p2 = {"mac": "", "signature": sig, "userName": _CAMVIEW_AUTH_USER,
                  "randomKey": random_key, "publicKey": public_key,
                  "encryptType": "MD5", "ipAddress": "", "clientType": "WINPC_V1", "userType": "0"}
            r2 = _req.post(auth_url, headers={"Content-Type": "application/json", "Cookie": cookie},
                           data=json.dumps(p2), timeout=TIMEOUT_API, verify=False)
            j2 = r2.json()
            token = j2.get("token")
            if token:
                logger.info(f"[Camview] Authenticated: {server}")
                return token
        except Exception as e:
            logger.debug(f"[Camview] Auth attempt {attempt} failed for {server}: {e}")
        time.sleep(attempt)

    logger.warning(f"[Camview] Auth failed: {server}")
    return None


def _sync_camview_get_token(server: str) -> Optional[str]:
    """Returns cached token or authenticates fresh. Thread-safe."""
    with _camview_lock:
        elapsed = time.time() - _camview_timestamps.get(server, 0)
        if server in _camview_tokens and elapsed < _CAMVIEW_TOKEN_TTL:
            return _camview_tokens[server]
        token = _sync_camview_authenticate(server)
        if token:
            _camview_tokens[server]     = token
            _camview_timestamps[server] = time.time()
        return token


def _sync_camview_start_video(server: str, device_id: str, camera_no: str) -> Tuple[Optional[List[str]], Optional[str], bool]:
    """
    Blocking — calls Camview StartVideo API, returns (url_list, stream_token, success).
    url_list already filtered (no private IPs if _CAMVIEW_SKIP_PRIV).
    """
    import requests as _req
    token = _sync_camview_get_token(server)
    if not token:
        return None, None, False

    url     = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"
    headers = {"Content-Type": "application/json", "X-Subject-Token": token}
    payload = {
        "clientType": "WINPC_V1", "project": "PSDK",
        "method": "MTS.Video.StartVideo",
        "data": {
            "streamType": "1",
            "optional":   f"/admin/API/MTS/Video/StartVideo?token={token}",
            "channelId":  f"{device_id}$1$0${camera_no}",
            "dataType":   "2",
            "enableRtsps": "0",
        },
    }
    try:
        res = _req.post(url, headers=headers, data=json.dumps(payload),
                        timeout=TIMEOUT_API, verify=False)
        if res.status_code == 401:
            with _camview_lock:
                _camview_tokens.pop(server, None)
            return None, None, False
        if res.status_code != 200:
            return None, None, False

        data = res.json().get("data") or {}
        urls: List[str] = []
        for key in ("url", "url2"):
            raw = data.get(key)
            if not raw:
                continue
            urls.extend(p.strip() for p in raw.split("|") if p.strip())

        stream_token = data.get("token") or token
        if not urls:
            logger.debug(f"[Camview] No URLs in StartVideo response for {device_id}_{camera_no}")
            return None, None, False

        if _CAMVIEW_SKIP_PRIV:
            public = [u for u in urls if not _is_private_ip_url(u)]
            urls = public if public else urls

        # TCP port probe on first public URL
        first = urls[0]
        m = re.match(r'[a-z]+://([^/:]+)(?::(\d+))?', first)
        if m:
            host = m.group(1)
            port = int(m.group(2)) if m.group(2) else 554
            if not _probe_tcp_port(host, port):
                logger.warning(f"[Camview] Port {port} on {host} unreachable for {device_id}_{camera_no}")
                return None, None, False

        final = [f"{u}?token={stream_token}" for u in urls]
        return final, stream_token, True
    except Exception as e:
        logger.debug(f"[Camview] StartVideo error for {device_id}_{camera_no}: {e}")
        return None, None, False

logger.info("=" * 80)
logger.info("TCS Camera Classification — DB Mode | H200 Optimized")
logger.info(f"  CPU cores        : {_CPU_CORES}")
logger.info(f"  Network workers  : {MAX_WORKERS_NETWORK}")
logger.info(f"  VLM workers      : {MAX_WORKERS_VLM}")
logger.info(f"  Thread pool      : {THREAD_POOL_SIZE}")
logger.info(f"  VLM timeout      : {TIMEOUT_VLM}s")
logger.info(f"  Ollama model     : {OLLAMA_MODEL}")
logger.info(f"  Ollama num_ctx   : {OLLAMA_NUM_CTX}  (46GB → ~8GB VRAM fix)")
logger.info("=" * 80)

# ===========================================================================
# VLM prompt
# ===========================================================================
CATEGORIES = [
    "Server Room",
    "Outdoor Scene",
    "Outside Area",
    "Parking Lot",
    "Entry",
    "Computer Lab",
]

VLM_PROMPT = f"""You are an expert computer vision classifier.
Classify the given image into one of the following categories:

{', '.join(CATEGORIES)}.

Rules:
- "Server Room": small room with limited visibility with laptop or computers.
- "Computer Lab": large room with many computers, chairs, people or desks.
- "Outdoor Scene": nature, roads, gardens, sky, trees.
- "Outside Area": surroundings of a building, campus, boundary, hallway, outdoor environment.
- "Parking Lot": cars, bikes, open area with marked spaces or vehicles.
- "Entry": building entrances, gates, doors, signboards, or main access points.

If the image is grey, blank, heavily obstructed, or unclear, respond with "Uncertain".

Return **only** the JSON response:
{{"category": "<one of the above categories or Uncertain>", "reason": "<short explanation>"}}"""


# ===========================================================================
# Helpers
# ===========================================================================

def _parse_payload() -> dict:
    if not VISION_ASSIGNMENT_PAYLOAD:
        return {}
    try:
        return json.loads(VISION_ASSIGNMENT_PAYLOAD)
    except Exception as e:
        logger.error(f"Failed to parse VISION_ASSIGNMENT_PAYLOAD: {e}")
        return {}


def _get_runtime_config() -> dict:
    payload         = _parse_payload()
    assignment_id   = payload.get("assignment_id")
    exam_id         = payload.get("exam_id")
    shift_id        = payload.get("shift_id")
    assignment_date = payload.get("assignment_date")
    link_type       = str(payload.get("link_type") or "HLS").upper()

    if assignment_id is None:
        raise ValueError("VISION_ASSIGNMENT_PAYLOAD must include assignment_id")
    if exam_id is None:
        raise ValueError("VISION_ASSIGNMENT_PAYLOAD must include exam_id")
    if link_type not in {"HLS", "RTSP"}:
        raise ValueError("link_type must be HLS or RTSP")
    if link_type == "HLS" and (shift_id is None or assignment_date is None):
        raise ValueError("HLS link_type requires shift_id and assignment_date")

    return {
        "assignment_id":   int(assignment_id),
        "exam_id":         int(exam_id),
        "shift_id":        int(shift_id) if shift_id is not None else None,
        "assignment_date": str(assignment_date) if assignment_date else None,
        "link_type":       link_type,
    }


def _camera_id(camera: dict) -> str:
    """Always returns a unique string key for the camera.
    For RTSP: combines device_id + camera_no to avoid collisions across cameras on same device.
    For HLS: uses ch_code.
    """
    device_id = str(camera.get("device_id") or "").strip()
    if device_id:
        camera_no = str(camera.get("camera_no") or "").strip()
        return f"{device_id}_{camera_no}" if camera_no else device_id
    return str(camera.get("ch_code") or camera.get("camera_id") or "").strip()


def _add_timeout_config():
    """Return TIMEOUT_API — deferred so it can reference the config constant."""
    return TIMEOUT_API


def _make_connector() -> aiohttp.TCPConnector:
    return aiohttp.TCPConnector(
        limit=MAX_WORKERS_NETWORK + MAX_WORKERS_VLM + 64,
        limit_per_host=0,
        ttl_dns_cache=300,
        enable_cleanup_closed=True,
    )


# ===========================================================================
# HLS URL extraction — 3-method (ported from Excel script)
# ===========================================================================

def _sync_extract_hls_url(initial_url: str) -> Optional[str]:
    """
    Blocking — runs in thread-pool.
    Tries 3 methods to find a .m3u8 URL in the camera portal response.
    """
    if not initial_url:
        return None
    try:
        import requests as _req
        resp = _req.get(initial_url, timeout=TIMEOUT_EXTRACT_URL, allow_redirects=True)
        if resp.status_code != 200:
            return None
        text = resp.text

        # Method 1: bare .m3u8 in response body
        m = re.findall(r'https?://[^\s<>"]+?\.m3u8[^\s<>"]*', text)
        if m:
            return m[0]

        # Method 2: JSON response with known keys
        try:
            jdata = resp.json()
            if isinstance(jdata, dict):
                for key in ("url", "stream_url", "hls_url", "playback_url", "streaming_url"):
                    if jdata.get(key):
                        return str(jdata[key])
        except Exception:
            pass

        # Method 3: quoted .m3u8 URL
        if ".m3u8" in text:
            m = re.findall(r'(["\'])(https?://[^"\']+\.m3u8[^"\']*)(["\'])', text)
            if m:
                return m[0][1]

        return None
    except Exception as e:
        logger.debug(f"HLS extract error ({initial_url[:60]}): {e}")
        return None


async def _async_extract_hls_url(
    initial_url: str,
    session: aiohttp.ClientSession,
) -> Optional[str]:
    """
    Fully async — uses the shared aiohttp session so all 256 concurrent
    Pass-1 checks run in true async I/O without queuing for thread-pool
    workers.  The old run_in_executor path only had THREAD_POOL_SIZE (~48)
    slots; tasks waiting >4 s in the queue were killed by wait_for before
    they ever ran, producing 100 % "timeout" failures.
    """
    if not initial_url:
        return None
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_EXTRACT_URL)
        async with session.get(initial_url, timeout=timeout, allow_redirects=True) as resp:
            if resp.status != 200:
                return None
            text = await resp.text()

            # Method 1: bare .m3u8 URL in response body
            m = re.findall(r'https?://[^\s<>"]+?\.m3u8[^\s<>"]*', text)
            if m:
                return m[0]

            # Method 2: JSON response with known keys
            try:
                jdata = json.loads(text)
                if isinstance(jdata, dict):
                    for key in ("url", "stream_url", "hls_url", "playback_url", "streaming_url"):
                        if jdata.get(key):
                            return str(jdata[key])
            except Exception:
                pass

            # Method 3: quoted .m3u8 URL
            if ".m3u8" in text:
                m = re.findall(r'(["\'])(https?://[^"\']+\.m3u8[^"\']*)(["\'])', text)
                if m:
                    return m[0][1]

            return None
    except Exception as e:
        logger.debug(f"HLS extract error ({str(initial_url)[:60]}): {e}")
        return None


# ===========================================================================
# HLS stream test
# ===========================================================================

async def _async_test_hls_stream(
    hls_url: str,
    session: aiohttp.ClientSession,
) -> Tuple[bool, Optional[int]]:
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_TEST_STREAM)
        async with session.get(hls_url, timeout=timeout) as resp:
            return resp.status == 200, resp.status
    except Exception:
        return False, None


# ===========================================================================
# Frame capture — in-memory (zero disk I/O per frame)
# ===========================================================================

def _sync_opencv_capture(url: str) -> Optional[bytes]:
    """
    Blocking — runs in thread-pool.
    Uses a daemon thread with hard wall-clock timeout so a hung RTSP stream
    doesn't stall the thread-pool indefinitely.
    """
    result_box: List[Optional[bytes]] = [None]

    def _worker():
        try:
            cap = cv2.VideoCapture(url)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, TIMEOUT_OPENCV_MS)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC,  TIMEOUT_OPENCV_MS)
            if not cap.isOpened():
                return
            for _ in range(2):      # skip first frames (often incomplete)
                cap.read()
            ret, frame = cap.read()
            cap.release()
            if not ret or frame is None:
                return
            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if ok:
                result_box[0] = buf.tobytes()
        except Exception as e:
            logger.debug(f"OpenCV worker error: {e}")

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout=TIMEOUT_OPENCV_REAL)
    return result_box[0]


def _sync_ffmpeg_capture(url: str, is_rtsp: bool = False) -> Optional[bytes]:
    """Blocking — runs in thread-pool. FFmpeg writes to stdout pipe, not disk."""
    if not shutil.which("ffmpeg"):
        return None
    cmd = ["ffmpeg", "-y"]
    if is_rtsp:
        cmd += ["-rtsp_transport", "tcp",
                "-timeout", str(TIMEOUT_FFMPEG * 1_000_000)]
    else:
        cmd += ["-timeout", str(TIMEOUT_FFMPEG * 1_000_000)]
    cmd += [
        "-i", url,
        "-frames:v", "1",
        "-f", "image2",
        "-vcodec", "mjpeg",
        "-loglevel", "error",
        "pipe:1",
    ]
    try:
        res = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=TIMEOUT_FFMPEG + 3,
        )
        if res.returncode == 0 and res.stdout:
            stderr_txt = res.stderr.decode(errors="replace")
            if "401" in stderr_txt or "Unauthorized" in stderr_txt:
                logger.debug(f"FFmpeg 401 on {url[:60]}")
                return None
            return res.stdout
        return None
    except Exception as e:
        logger.debug(f"FFmpeg error: {e}")
        return None


async def _capture_frame_bytes(url: str, is_rtsp: bool = False) -> Optional[bytes]:
    """Async wrapper — tries OpenCV (thread-safe hard timeout), falls back to FFmpeg."""
    loop = asyncio.get_event_loop()
    jpeg = await loop.run_in_executor(_THREAD_POOL, _sync_opencv_capture, url)
    if jpeg:
        return jpeg
    logger.debug("OpenCV failed → FFmpeg fallback")
    return await loop.run_in_executor(_THREAD_POOL, _sync_ffmpeg_capture, url, is_rtsp)


async def _capture_frame_with_save(
    url: str,
    cam_id: str,
    is_rtsp: bool = False,
    rtsp_url_list: Optional[List[str]] = None,
) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Capture a JPEG frame and persist it to FRAMES_FOLDER.
    For RTSP, tries each URL in rtsp_url_list (all have tokens).
    Returns (jpeg_bytes, saved_file_path) — path is None if save failed.
    """
    urls_to_try = (rtsp_url_list or []) if is_rtsp else [url]
    if not urls_to_try:
        urls_to_try = [url]

    jpeg: Optional[bytes] = None
    for try_url in urls_to_try:
        jpeg = await _capture_frame_bytes(try_url, is_rtsp=is_rtsp)
        if jpeg:
            break

    if not jpeg:
        return None, None

    # Save to disk
    safe_id  = re.sub(r'[^\w\-]', '_', cam_id)[:60]
    fname    = f"{safe_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    fpath    = os.path.join(FRAMES_FOLDER, fname)
    try:
        with open(fpath, "wb") as fh:
            fh.write(jpeg)
    except Exception as e:
        logger.debug(f"Frame save failed for {cam_id}: {e}")
        fpath = None

    return jpeg, fpath


# ===========================================================================
# Grey / obstruction check — in-memory numpy (no disk read)
# ===========================================================================

def _is_grey_or_obstructed(jpeg_bytes: bytes) -> Tuple[bool, str]:
    try:
        arr = np.frombuffer(jpeg_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return True, "Failed to decode frame"
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if gray.std() < 5:
            return True, "Uniform grey screen"
        mean = gray.mean()
        if mean < 10:
            return True, "Very dark / blocked camera"
        if mean > 245:
            return True, "Overexposed / white screen"
        if cv2.Laplacian(gray, cv2.CV_64F).var() < 10:
            return True, "Low detail / obstructed"
        return False, ""
    except Exception as e:
        logger.debug(f"Grey check error: {e}")
        return False, ""


# ===========================================================================
# VLM classification — async, concurrent, KV-cache capped
# ===========================================================================

async def _classify_with_vlm(
    jpeg_bytes: bytes,
    session: aiohttp.ClientSession,
) -> Tuple[str, str]:
    """
    Fully async VLM call via shared aiohttp session (connection pool).
    num_ctx=2048 per-request caps KV cache: 46GB → ~8GB VRAM.
    Model weights and output quality unchanged.
    Handles qwen3 <think>…</think> prefix before JSON.
    """
    loop = asyncio.get_event_loop()

    # Grey check in thread-pool
    is_bad, reason = await loop.run_in_executor(
        _THREAD_POOL, _is_grey_or_obstructed, jpeg_bytes
    )
    if is_bad:
        return "Uncertain/Obstructed", reason

    # Base64 in thread-pool (CPU work)
    image_b64 = await loop.run_in_executor(
        _THREAD_POOL, lambda: b64encode(jpeg_bytes).decode("utf-8")
    )

    payload = {
        "model":  OLLAMA_MODEL,
        "prompt": VLM_PROMPT,
        "images": [image_b64],
        "stream": False,
        "options": {
            "num_ctx":        OLLAMA_NUM_CTX,  # KEY VRAM fix
            "num_predict":    256,
            "temperature":    0.0,
            "repeat_penalty": 1.0,
        },
    }

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_VLM)
        async with session.post(OLLAMA_URL, json=payload, timeout=timeout) as resp:
            if resp.status != 200:
                return "Uncertain", f"VLM HTTP {resp.status}"

            data   = await resp.json(content_type=None)
            result = data.get("response", "").strip()
            if not result:
                return "Uncertain", "Empty VLM response"

            # Strip qwen3 chain-of-thought prefix if present
            result = re.sub(r"<think>.*?</think>", "", result, flags=re.DOTALL).strip()

            # Extract JSON block robustly
            start = result.find("{")
            end   = result.rfind("}") + 1
            if start == -1 or end == 0:
                return "Uncertain", "No JSON in VLM response"

            parsed   = json.loads(result[start:end])
            category = parsed.get("category", "Uncertain").strip()
            reason   = parsed.get("reason", "").strip()

            if "uncertain" in category.lower() or "unclear" in category.lower():
                return "Uncertain/Obstructed", reason

            return category, reason

    except asyncio.TimeoutError:
        return "Uncertain", "VLM timeout"
    except json.JSONDecodeError as e:
        logger.debug(f"VLM JSON parse error: {e}")
        return "Uncertain", "Invalid JSON from VLM"
    except Exception as e:
        logger.debug(f"VLM error: {e}")
        return "Uncertain", str(e)


# ===========================================================================
# Pass-1: accessibility check
#
# BUG FIX — camera_id extracted BEFORE any await
# -----------------------------------------------
# Previous version wrapped the entire coroutine in asyncio.wait_for(), so a
# TimeoutError fired before cam_id was extracted → camera_id="unknown", reason="".
# Fix: cam_id is set synchronously at the very top, before any network call.
# The timeout only wraps the awaitable network operations, not ID extraction.
# ===========================================================================

async def _check_hls_camera(
    camera: dict,
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
) -> dict:
    # ── Step 1: extract camera_id synchronously — cannot time out ─────────
    cam_id     = _camera_id(camera)          # always known from this line on
    source_url = str(camera.get("cctv_url") or "").strip()

    if not source_url:
        return {"camera_id": cam_id, "cam": camera,
                "accessible": False, "resolved_url": None, "reason": "missing_cctv_url"}

    # ── Step 2: network calls inside semaphore — can time out ────────────
    async with sem:
        try:
            hls_url = await asyncio.wait_for(
                _async_extract_hls_url(source_url, session),
                timeout=TIMEOUT_EXTRACT_URL + 1,
            )
            if not hls_url:
                return {"camera_id": cam_id, "cam": camera,
                        "accessible": False, "resolved_url": None, "reason": "hls_extract_failed"}

            is_ok, status_code = await asyncio.wait_for(
                _async_test_hls_stream(hls_url, session),
                timeout=TIMEOUT_TEST_STREAM + 1,
            )
            if not is_ok:
                return {"camera_id": cam_id, "cam": camera, "accessible": False,
                        "resolved_url": hls_url, "reason": f"http_{status_code or 'no_response'}"}

            return {"camera_id": cam_id, "cam": camera,
                    "accessible": True, "resolved_url": hls_url, "reason": "ok"}

        except asyncio.TimeoutError:
            # cam_id is still correct here — set before any await
            return {"camera_id": cam_id, "cam": camera,
                    "accessible": False, "resolved_url": None, "reason": "timeout"}
        except Exception as e:
            return {"camera_id": cam_id, "cam": camera,
                    "accessible": False, "resolved_url": None, "reason": str(e) or "error"}


async def _check_rtsp_camera(
    camera: dict,
    sem: asyncio.Semaphore,
) -> dict:
    """
    RTSP Pass-1: authenticate with Camview DVR and obtain token-authenticated URLs.
    cctv_url is treated as the Camview server address (e.g. d15.camview.io).
    Falls back to direct RTSP if cctv_url already looks like an rtsp:// URL.
    """
    cam_id    = _camera_id(camera)
    device_id = str(camera.get("device_id") or "").strip()
    camera_no = str(camera.get("camera_no") or "").strip()
    raw_url   = str(camera.get("cctv_url") or "").strip()

    if not raw_url:
        return {"camera_id": cam_id, "cam": camera,
                "accessible": False, "resolved_url": None,
                "rtsp_urls": None, "reason": "missing_cctv_url"}

    # If cctv_url is already a direct RTSP URL, use it as-is (no Camview auth needed)
    if raw_url.lower().startswith("rtsp://"):
        return {"camera_id": cam_id, "cam": camera,
                "accessible": True, "resolved_url": raw_url,
                "rtsp_urls": [raw_url], "reason": "direct_rtsp"}

    # Treat cctv_url as Camview server address
    if not device_id or not camera_no:
        return {"camera_id": cam_id, "cam": camera,
                "accessible": False, "resolved_url": None,
                "rtsp_urls": None, "reason": "missing_device_id_or_camera_no"}

    server = re.sub(r'^https?://', '', raw_url).rstrip('/').lower()

    async with sem:
        loop = asyncio.get_event_loop()
        try:
            rtsp_urls, stream_token, success = await asyncio.wait_for(
                loop.run_in_executor(
                    _THREAD_POOL, _sync_camview_start_video, server, device_id, camera_no
                ),
                timeout=TIMEOUT_API + 5,
            )
        except asyncio.TimeoutError:
            return {"camera_id": cam_id, "cam": camera,
                    "accessible": False, "resolved_url": None,
                    "rtsp_urls": None, "reason": "camview_api_timeout"}
        except Exception as e:
            return {"camera_id": cam_id, "cam": camera,
                    "accessible": False, "resolved_url": None,
                    "rtsp_urls": None, "reason": str(e)}

    if not success or not rtsp_urls:
        return {"camera_id": cam_id, "cam": camera,
                "accessible": False, "resolved_url": None,
                "rtsp_urls": None, "reason": "camview_api_failed"}

    return {"camera_id": cam_id, "cam": camera,
            "accessible": True, "resolved_url": rtsp_urls[0],
            "rtsp_urls": rtsp_urls, "reason": "ok"}


# ===========================================================================
# Pass-2: frame capture + VLM
# ===========================================================================

async def _process_camera(
    access_result: dict,
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    is_rtsp: bool = False,
) -> dict:
    """
    Semaphore limits concurrent Ollama requests to MAX_WORKERS_VLM.
    Frames are saved to FRAMES_FOLDER; frame_path is returned in the result.
    For RTSP: tries all token-authenticated URLs in rtsp_urls list.
    """
    cam_id    = access_result["camera_id"]
    cam       = access_result["cam"]
    url       = access_result["resolved_url"]
    rtsp_urls = access_result.get("rtsp_urls")  # list of token-auth'd URLs for RTSP

    async with sem:
        try:
            jpeg, frame_path = await _capture_frame_with_save(
                url, cam_id, is_rtsp=is_rtsp,
                rtsp_url_list=rtsp_urls if is_rtsp else None,
            )
            if not jpeg:
                return {
                    "camera_id":      cam_id,
                    "device_id":      str(cam.get("device_id") or ""),
                    "camera_no":      str(cam.get("camera_no") or ""),
                    "camera_name":    cam.get("camera_name"),
                    "classification": "Uncertain",
                    "status":         "Not Accessible",
                    "detail":         "frame_capture_failed",
                    "frame_path":     None,
                }

            label, reason = await _classify_with_vlm(jpeg, session)
            return {
                "camera_id":      cam_id,
                "device_id":      str(cam.get("device_id") or ""),
                "camera_no":      str(cam.get("camera_no") or ""),
                "camera_name":    cam.get("camera_name"),
                "classification": label,
                "status":         "Accessible",
                "detail":         reason or "classified",
                "frame_path":     frame_path,
            }

        except Exception as e:
            logger.error(f"Processing error for {cam_id}: {e}")
            return {
                "camera_id":      cam_id,
                "device_id":      str(cam.get("device_id") or ""),
                "camera_no":      str(cam.get("camera_no") or ""),
                "camera_name":    cam.get("camera_name"),
                "classification": "Uncertain",
                "status":         "Accessible",
                "detail":         str(e),
                "frame_path":     None,
            }


# ===========================================================================
# Bulk DB persist — one call after all tasks, not one per camera
# ===========================================================================

def _bulk_persist(runtime: dict, classifications: List[dict]) -> int:
    updated = 0
    for item in classifications:
        cam_id     = str(item.get("camera_id") or "").strip()
        label      = str(item.get("classification") or "").strip()
        status     = str(item.get("status") or "").strip() or None
        frame_path = str(item.get("frame_path") or "").strip() or None
        if not cam_id or not label:
            continue
        try:
            if runtime["link_type"] == "HLS":
                updated += update_hls_classification(
                    runtime["exam_id"], runtime["shift_id"],
                    runtime["assignment_date"], cam_id, label, status
                )
            else:
                # For RTSP use device_id + camera_no from item, fall back to splitting cam_id
                device_id = str(item.get("device_id") or "").strip()
                camera_no = str(item.get("camera_no") or "").strip()
                if not device_id:
                    parts     = cam_id.split("_", 1)
                    device_id = parts[0]
                    camera_no = parts[1] if len(parts) > 1 else ""
                updated += update_rtsp_classification(
                    runtime["exam_id"], device_id, camera_no, label, status, frame_path
                )
        except Exception as e:
            logger.error(f"DB persist failed for {cam_id}: {e}")
    logger.info(f"Bulk DB persist complete: {updated} rows updated")
    return updated


def _bulk_persist_status(runtime: dict, statuses: List[dict]) -> int:
    updated = 0
    for item in statuses:
        cam_id = str(item.get("camera_id") or "").strip()
        status = str(item.get("status") or "").strip()
        if not cam_id or not status:
            continue
        try:
            if runtime["link_type"] == "HLS":
                updated += update_hls_status(
                    runtime["exam_id"], runtime["shift_id"],
                    runtime["assignment_date"], cam_id, status
                )
            else:
                device_id = str(item.get("device_id") or "").strip()
                camera_no = str(item.get("camera_no") or "").strip()
                if not device_id:
                    parts     = cam_id.split("_", 1)
                    device_id = parts[0]
                    camera_no = parts[1] if len(parts) > 1 else ""
                updated += update_rtsp_status(
                    runtime["exam_id"], device_id, camera_no, status
                )
        except Exception as e:
            logger.error(f"DB status persist failed for {cam_id}: {e}")
    logger.info(f"Bulk DB status persist complete: {updated} rows updated")
    return updated


# ===========================================================================
# Checkpoint helpers
# ===========================================================================
_df_lock          = threading.Lock()
_checkpoint_count = 0
_df               = pd.DataFrame()


def _update_df(row_id: int, label: str, status: str, detail: str,
               frame_path: Optional[str] = None) -> None:
    global _checkpoint_count
    with _df_lock:
        mask = _df["Row_ID"] == row_id
        if mask.any():
            _df.loc[mask, SCENE_COLUMN_TARGET] = label
            _df.loc[mask, "Status"]            = status
            _df.loc[mask, "Status Detail"]     = detail
            if frame_path:
                _df.loc[mask, "Frame Path"]    = frame_path
            _checkpoint_count += 1
            if _checkpoint_count % CHECKPOINT_INTERVAL == 0:
                _save_checkpoint()


def _save_checkpoint() -> None:
    try:
        data = {
            "timestamp":      datetime.now().isoformat(),
            "processed_rows": int((_df["Status"] != "").sum()),
            "total_rows":     len(_df),
            "dataframe":      _df.to_dict("records"),
        }
        with open(CHECKPOINT_FILE, "w") as f:
            json.dump(data, f)
        logger.info(f"Checkpoint: {data['processed_rows']}/{data['total_rows']}")
    except Exception as e:
        logger.error(f"Checkpoint save failed: {e}")


def _load_checkpoint() -> bool:
    global _df
    if not os.path.exists(CHECKPOINT_FILE):
        return False
    try:
        with open(CHECKPOINT_FILE) as f:
            data = json.load(f)
        logger.info(f"Checkpoint found ({data['timestamp']}): "
                    f"{data['processed_rows']}/{data['total_rows']} done")
        restored = pd.DataFrame(data["dataframe"])
        if len(restored) == len(_df):
            _df = restored
            return True
        logger.warning("Checkpoint row count mismatch — starting fresh")
        return False
    except Exception as e:
        logger.error(f"Checkpoint load failed: {e}")
        return False


# ===========================================================================
# Results export
# ===========================================================================

def _save_results(df: pd.DataFrame) -> None:
    os.makedirs(SAVE_FOLDER, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    accessible_df = df[
        (df["Status"] == "Accessible") &
        (~df["Status Detail"].str.contains("Uncertain|Obstructed", na=False))
    ].copy()
    uncertain_df = df[
        (df["Status"] == "Accessible") &
        (df["Status Detail"].str.contains("Uncertain|Obstructed", na=False))
    ].copy()
    not_accessible_df = df[df["Status"] == "Not Accessible"].copy()

    for frame in [accessible_df, uncertain_df, not_accessible_df]:
        frame.drop(columns=["Row_ID", "cam_id_ref"], errors="ignore", inplace=True)

    complete_file = os.path.join(SAVE_FOLDER, f"complete_results_{ts}.xlsx")
    with pd.ExcelWriter(complete_file, engine="openpyxl") as writer:
        if len(accessible_df):
            accessible_df.to_excel(writer, sheet_name="Classified",     index=False)
        if len(uncertain_df):
            uncertain_df.to_excel(writer,  sheet_name="Uncertain",      index=False)
        if len(not_accessible_df):
            not_accessible_df.to_excel(writer, sheet_name="Not Accessible", index=False)
        export = df.copy()
        export.drop(columns=["Row_ID", "cam_id_ref"], errors="ignore", inplace=True)
        export.to_excel(writer, sheet_name="All Results", index=False)

    logger.info(f"Results → {complete_file}")
    print(f"\n📁 Results: {complete_file}")


# ===========================================================================
# Assignment mode  (VISION_ASSIGNMENT_PAYLOAD is set)
# ===========================================================================

async def run_assignment_mode() -> dict:
    runtime = _get_runtime_config()
    is_rtsp = runtime["link_type"] == "RTSP"

    # Fetch from DB — exactly once
    cameras = (
        get_rtsp_cameras(runtime["exam_id"])
        if is_rtsp else
        get_hls_cameras(runtime["exam_id"], runtime["shift_id"], runtime["assignment_date"])
    ) or []

    logger.info(
        f"Assignment | id={runtime['assignment_id']} "
        f"type={runtime['link_type']} cameras={len(cameras)}"
    )

    if not cameras:
        return {
            "assignment_id":                    runtime["assignment_id"],
            "link_type":                        runtime["link_type"],
            "processed":                        0,
            "failed":                           [],
            "classifications":                  [],
            "persisted_classification_updates": 0,
        }

    sem_net = asyncio.Semaphore(MAX_WORKERS_NETWORK)
    sem_vlm = asyncio.Semaphore(MAX_WORKERS_VLM)

    accessible: List[dict] = []
    failed:     List[dict] = []

    async with aiohttp.ClientSession(connector=_make_connector()) as session:

        # ── Pass-1 ────────────────────────────────────────────────────────
        logger.info(f"Pass-1 | {len(cameras)} cameras | {MAX_WORKERS_NETWORK} concurrent")
        p1_coros = (
            [_check_rtsp_camera(c, sem_net) for c in cameras]
            if is_rtsp else
            [_check_hls_camera(c, session, sem_net) for c in cameras]
        )
        p1_start = time.time()

        async for fut in atqdm(
            asyncio.as_completed(p1_coros),
            total=len(p1_coros),
            desc="Pass-1 accessibility",
        ):
            res = await fut
            if res["accessible"]:
                accessible.append(res)
            else:
                failed.append({"camera_id": res["camera_id"], "cam": res.get("cam", {}), "reason": res["reason"]})

        logger.info(
            f"Pass-1 done {time.time()-p1_start:.1f}s | "
            f"accessible={len(accessible)} failed={len(failed)}"
        )
        
        statuses_to_persist = []
        for x in accessible:
            statuses_to_persist.append({
                "camera_id": x["camera_id"],
                "device_id": str(x["cam"].get("device_id") or ""),
                "camera_no": str(x["cam"].get("camera_no") or ""),
                "status": "Accessible",
            })
        for x in failed:
            cam = x.get("cam", {})
            statuses_to_persist.append({
                "camera_id": x["camera_id"],
                "device_id": str(cam.get("device_id") or ""),
                "camera_no": str(cam.get("camera_no") or ""),
                "status": "Not Accessible",
            })
        _bulk_persist_status(runtime, statuses_to_persist)

        if not accessible:
            logger.warning("No accessible cameras — nothing to classify")
            return {
                "assignment_id":                    runtime["assignment_id"],
                "link_type":                        runtime["link_type"],
                "processed":                        0,
                "failed":                           failed,
                "classifications":                  [],
                "persisted_classification_updates": 0,
            }

        # ── Pass-2 ────────────────────────────────────────────────────────
        logger.info(
            f"Pass-2 | {len(accessible)} cameras | "
            f"{MAX_WORKERS_VLM} concurrent VLM | num_ctx={OLLAMA_NUM_CTX}"
        )
        p2_coros = [
            _process_camera(r, session, sem_vlm, is_rtsp=is_rtsp)
            for r in accessible
        ]
        classifications: List[dict] = []
        p2_start = time.time()

        async for fut in atqdm(
            asyncio.as_completed(p2_coros),
            total=len(p2_coros),
            desc="Pass-2 classifying",
        ):
            res = await fut
            classifications.append({
                "camera_id":      res["camera_id"],
                "device_id":      res.get("device_id", ""),
                "camera_no":      res.get("camera_no", ""),
                "camera_name":    res.get("camera_name"),
                "classification": res["classification"],
                "status":         res.get("status"),
                "frame_path":     res.get("frame_path"),
            })
            if res.get("status") != "Accessible":
                failed.append({"camera_id": res["camera_id"], "reason": res.get("detail")})

        logger.info(f"Pass-2 done {time.time()-p2_start:.1f}s")

    # Bulk persist — one round-trip at the end
    updated = _bulk_persist(runtime, classifications)

    return {
        "assignment_id":                    runtime["assignment_id"],
        "link_type":                        runtime["link_type"],
        "processed":                        len(classifications),
        "failed":                           failed,
        "classifications":                  classifications,
        "persisted_classification_updates": updated,
    }


# ===========================================================================
# Default mode  (no VISION_ASSIGNMENT_PAYLOAD)
# ===========================================================================

async def _default_pipeline(cameras: List[dict], runtime: dict) -> None:
    global _df
    is_rtsp = runtime["link_type"] == "RTSP"
    sem_net = asyncio.Semaphore(MAX_WORKERS_NETWORK)
    sem_vlm = asyncio.Semaphore(MAX_WORKERS_VLM)

    accessible: List[dict] = []

    async with aiohttp.ClientSession(connector=_make_connector()) as session:

        # Pass-1
        logger.info(f"Pass-1 | {len(cameras)} cameras | {MAX_WORKERS_NETWORK} concurrent")
        p1_coros = (
            [_check_rtsp_camera(c, sem_net) for c in cameras]
            if is_rtsp else
            [_check_hls_camera(c, session, sem_net) for c in cameras]
        )
        p1_start = time.time()

        async for fut in atqdm(
            asyncio.as_completed(p1_coros),
            total=len(p1_coros),
            desc="Pass-1",
        ):
            res = await fut
            row_match = _df[_df["cam_id_ref"] == res["camera_id"]]
            if row_match.empty:
                continue
            row_id = int(row_match.iloc[0]["Row_ID"])
            if res["accessible"]:
                accessible.append({**res, "row_id": row_id})
            else:
                _update_df(row_id, "Failed to Classify", "Not Accessible", res["reason"])

        logger.info(
            f"Pass-1 done {time.time()-p1_start:.1f}s | "
            f"accessible={len(accessible)} not_accessible={len(cameras)-len(accessible)}"
        )
        _save_checkpoint()

        if not accessible:
            logger.warning("No accessible cameras")
            return

        # Pass-2
        logger.info(
            f"Pass-2 | {len(accessible)} cameras | "
            f"{MAX_WORKERS_VLM} VLM workers | num_ctx={OLLAMA_NUM_CTX}"
        )
        p2_coros = [
            _process_camera(r, session, sem_vlm, is_rtsp=is_rtsp)
            for r in accessible
        ]
        p2_start = time.time()

        async for fut in atqdm(
            asyncio.as_completed(p2_coros),
            total=len(p2_coros),
            desc="Pass-2",
        ):
            res = await fut
            row_match = _df[_df["cam_id_ref"] == res["camera_id"]]
            if row_match.empty:
                continue
            row_id = int(row_match.iloc[0]["Row_ID"])
            _update_df(row_id, res["classification"], res["status"], res["detail"],
                       frame_path=res.get("frame_path"))

        logger.info(f"Pass-2 done {time.time()-p2_start:.1f}s")

    _save_checkpoint()


def main() -> None:
    global _df

    payload    = _parse_payload()
    exam_id    = payload.get("exam_id",         DEFAULT_EXAM_ID)
    shift_id   = payload.get("shift_id",        DEFAULT_SHIFT_ID)
    exam_date  = payload.get("assignment_date", DEFAULT_EXAM_DATE)
    link_type  = str(payload.get("link_type") or "HLS").upper()
    is_rtsp    = link_type == "RTSP"

    # Fetch from DB — exactly once
    logger.info(f"Loading cameras | exam={exam_id} shift={shift_id} date={exam_date}")
    cameras = (
        get_rtsp_cameras(exam_id)
        if is_rtsp else
        get_hls_cameras(exam_id, shift_id, exam_date)
    ) or []

    if not cameras:
        logger.warning("No cameras found — exiting")
        return

    logger.info(f"Loaded {len(cameras)} cameras from DB")

    # Build internal DataFrame for checkpoint + result tracking
    _df = pd.DataFrame(cameras)
    if "cctv_url"       in _df.columns: _df["CCTV URL"]          = _df["cctv_url"]
    if "classification" in _df.columns: _df[SCENE_COLUMN_TARGET] = _df["classification"]
    _df["Status"]        = ""
    _df["Status Detail"] = ""
    _df["Frame Path"]    = ""
    _df["Row_ID"]        = range(len(_df))
    _df["cam_id_ref"]    = _df.apply(lambda r: _camera_id(r.to_dict()), axis=1)
    _df.fillna("", inplace=True)

    if RESUME_FROM_CHECKPOINT and _load_checkpoint():
        remaining = int((_df["Status"] == "").sum())
        if remaining == 0:
            logger.info("All cameras already processed")
            _save_results(_df)
            return
        logger.info(f"Resuming — {remaining} cameras remaining")

    runtime = {
        "exam_id":         exam_id,
        "shift_id":        shift_id,
        "assignment_date": exam_date,
        "link_type":       link_type,
    }

    start = time.time()
    asyncio.run(_default_pipeline(cameras, runtime))

    # Bulk DB persist — include device_id / camera_no / frame_path for RTSP
    classifications = []
    for _, row in _df[_df["Status"] == "Accessible"].iterrows():
        classifications.append({
            "camera_id":      row["cam_id_ref"],
            "device_id":      str(row.get("device_id") or ""),
            "camera_no":      str(row.get("camera_no") or ""),
            "classification": row[SCENE_COLUMN_TARGET],
            "frame_path":     str(row.get("frame_path") or "") or None,
        })
    _bulk_persist(runtime, classifications)

    total      = time.time() - start
    accessible = int((_df["Status"] == "Accessible").sum())
    not_acc    = int((_df["Status"] == "Not Accessible").sum())
    uncertain  = int(_df["Status Detail"].str.contains("Uncertain|Obstructed", na=False).sum())

    summary = f"""
{'='*80}
FINAL SUMMARY
{'='*80}
Total Cameras            : {len(_df)}
Classified (clean)       : {accessible - uncertain}
Accessible but Uncertain : {uncertain}
Not Accessible           : {not_acc}
Total Time               : {int(total//60)}m {int(total%60)}s
Success Rate             : {accessible / max(len(_df), 1) * 100:.1f}%
{'='*80}"""
    print(summary)
    logger.info(summary)

    _save_results(_df)
    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)


# ===========================================================================
# Entry point
# ===========================================================================
if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("TCS Camera Classification — starting")
    logger.info("=" * 80)
    try:
        if VISION_ASSIGNMENT_PAYLOAD:
            result = asyncio.run(run_assignment_mode())
            print(json.dumps(result, indent=2))
        else:
            main()
        logger.info(f"Done. Log: {LOG_FILENAME}")
    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)