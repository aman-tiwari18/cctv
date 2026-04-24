"""
camera_id_verifier.py
═══════════════════════════════════════════════════════════════
Reads 1-lakh camera URLs from CSV/Excel, grabs one frame per
stream (HLS or RTSP), extracts the burned-in camera-ID text
from the bottom-left corner via Tesseract OCR, compares it to
the expected ID column, and writes a final Excel result file.

DEPENDENCIES
────────────
pip install pandas openpyxl aiohttp aiofiles opencv-python-headless \
            pytesseract numpy tqdm requests

System: apt install tesseract-ocr ffmpeg   (or brew install on Mac)

USAGE
─────
python camera_id_verifier.py \
       --input cameras.csv \
       --url-col  "Stream URL" \
       --id-col   "Camera ID" \
       --output   results.xlsx \
       --workers-net 300 \
       --workers-ocr 32

INPUT CSV/EXCEL required columns (names are configurable via CLI):
  • Stream URL  — HLS (.m3u8) or RTSP (rtsp://) URL
  • Camera ID   — expected ID to match (e.g. 11394_REG-D_C01)
═══════════════════════════════════════════════════════════════
"""

# ── stdlib ────────────────────────────────────────────────────────────────
import argparse
import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

# ── third-party ───────────────────────────────────────────────────────────
import aiohttp
import cv2
import numpy as np
import pandas as pd
import pytesseract
from tqdm import tqdm

# ══════════════════════════════════════════════════════════════════════════
# LOGGING
# ══════════════════════════════════════════════════════════════════════════
LOG_FILE = f"ocr_verify_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler()],
)
log = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════
# TUNABLES  (override via ENV or CLI)
# ══════════════════════════════════════════════════════════════════════════
MAX_WORKERS_NET: int = int(os.getenv("OCR_WORKERS_NET", "300"))   # concurrent stream fetches
MAX_WORKERS_OCR: int = int(os.getenv("OCR_WORKERS_OCR", "32"))    # concurrent Tesseract calls
THREAD_POOL_SZ:  int = int(os.getenv("OCR_THREAD_POOL", "64"))    # blocking I/O pool size

TIMEOUT_HLS_EXTRACT: int = 4    # seconds to resolve .m3u8 from portal URL
TIMEOUT_HLS_TEST:    int = 3    # seconds to HEAD-test the .m3u8
TIMEOUT_OPENCV_MS:   int = 4000 # ms for OpenCV cap open + read
TIMEOUT_FFMPEG:      int = 6    # seconds for FFmpeg fallback

CHECKPOINT_EVERY: int = 500     # save partial results every N cameras

# ROI: fraction of frame where the burned-in ID lives
# Defaults = bottom-left quadrant.  Tune for your streams.
ROI_Y1_FRAC = 0.82
ROI_Y2_FRAC = 0.97
ROI_X1_FRAC = 0.00
ROI_X2_FRAC = 0.40

# Tesseract config — single-line mode, only legal chars
TESS_CONFIG = (
    r"--oem 3 --psm 7 "
    r"-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-/\\ "
)

# ──────────────────────────────────────────────────────────────────────────
_POOL = ThreadPoolExecutor(max_workers=THREAD_POOL_SZ)
_lock = threading.Lock()

# ══════════════════════════════════════════════════════════════════════════
# INPUT LOADING
# ══════════════════════════════════════════════════════════════════════════

def load_input(path: str, url_col: str, id_col: str) -> pd.DataFrame:
    """Load CSV or Excel; normalise column names; validate."""
    p = Path(path)
    if p.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(path, dtype=str)
    else:
        df = pd.read_csv(path, dtype=str)

    df.columns = df.columns.str.strip()
    df.fillna("", inplace=True)

    missing = [c for c in [url_col, id_col] if c not in df.columns]
    if missing:
        log.error(f"Columns not found: {missing}. Available: {list(df.columns)}")
        sys.exit(1)

    df["_url"]      = df[url_col].str.strip()
    df["_expect"]   = df[id_col].str.strip().str.upper().str.replace(r"\s+", "", regex=True)
    df["_extracted"]  = ""
    df["_match"]      = ""
    df["_status"]     = ""
    df["_confidence"] = ""
    df["_row_id"]     = range(len(df))
    log.info(f"Loaded {len(df):,} cameras from {path}")
    return df


# ══════════════════════════════════════════════════════════════════════════
# STREAM TYPE DETECTION
# ══════════════════════════════════════════════════════════════════════════

def _is_rtsp(url: str) -> bool:
    return url.lower().startswith("rtsp://")

def _is_direct_hls(url: str) -> bool:
    return ".m3u8" in url.lower()


# ══════════════════════════════════════════════════════════════════════════
# HLS URL EXTRACTION  (portal URL → .m3u8)
# ══════════════════════════════════════════════════════════════════════════

async def _resolve_hls(url: str, session: aiohttp.ClientSession) -> Optional[str]:
    """If url is already .m3u8 return as-is; else scrape portal for .m3u8 link."""
    if _is_direct_hls(url):
        return url
    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_HLS_EXTRACT)
        async with session.get(url, timeout=timeout, allow_redirects=True) as r:
            if r.status != 200:
                return None
            text = await r.text()

        # Method 1: bare .m3u8 URL
        m = re.findall(r'https?://[^\s<>"]+?\.m3u8[^\s<>"]*', text)
        if m:
            return m[0]

        # Method 2: JSON key
        try:
            jd = json.loads(text)
            for k in ("url", "stream_url", "hls_url", "playback_url"):
                if jd.get(k):
                    return str(jd[k])
        except Exception:
            pass

        # Method 3: quoted .m3u8
        if ".m3u8" in text:
            m = re.findall(r'["\']( https?://[^"\']+\.m3u8[^"\']*)["\']', text)
            if m:
                return m[0]
    except Exception as e:
        log.debug(f"HLS resolve failed ({url[:60]}): {e}")
    return None


# ══════════════════════════════════════════════════════════════════════════
# FRAME CAPTURE — OpenCV → FFmpeg fallback, all in-memory
# ══════════════════════════════════════════════════════════════════════════

def _opencv_capture(url: str) -> Optional[bytes]:
    try:
        cap = cv2.VideoCapture(url)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, TIMEOUT_OPENCV_MS)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC,  TIMEOUT_OPENCV_MS)
        if not cap.isOpened():
            return None
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return None
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
        return buf.tobytes() if ok else None
    except Exception as e:
        log.debug(f"OpenCV error: {e}")
        return None


def _ffmpeg_capture(url: str, is_rtsp: bool = False) -> Optional[bytes]:
    if not shutil.which("ffmpeg"):
        return None
    cmd = ["ffmpeg", "-y"]
    if is_rtsp:
        cmd += ["-rtsp_transport", "tcp"]
    cmd += [
        "-timeout", str(TIMEOUT_FFMPEG * 1_000_000),
        "-i", url,
        "-frames:v", "1",
        "-f", "image2",
        "-vcodec", "mjpeg",
        "-loglevel", "error",
        "pipe:1",
    ]
    try:
        r = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=TIMEOUT_FFMPEG
        )
        return r.stdout if r.returncode == 0 and r.stdout else None
    except Exception as e:
        log.debug(f"FFmpeg error: {e}")
        return None


async def _capture_frame(url: str, is_rtsp: bool) -> Optional[bytes]:
    loop = asyncio.get_event_loop()
    jpeg = await loop.run_in_executor(_POOL, _opencv_capture, url)
    if jpeg:
        return jpeg
    return await loop.run_in_executor(_POOL, _ffmpeg_capture, url, is_rtsp)


# ══════════════════════════════════════════════════════════════════════════
# OCR — Tesseract on ROI crop
# ══════════════════════════════════════════════════════════════════════════

def _ocr_camera_id(jpeg_bytes: bytes) -> Tuple[str, float]:
    """
    Returns (extracted_text, confidence_0_to_100).
    Crops bottom-left ROI, thresholds white text, scales 2×, runs Tesseract.
    """
    try:
        arr = np.frombuffer(jpeg_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return "", 0.0

        h, w = img.shape[:2]
        y1 = int(h * ROI_Y1_FRAC)
        y2 = int(h * ROI_Y2_FRAC)
        x1 = int(w * ROI_X1_FRAC)
        x2 = int(w * ROI_X2_FRAC)
        roi = img[y1:y2, x1:x2]

        # Convert to grayscale
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        # White text on dark BG → binary threshold
        _, thresh = cv2.threshold(gray, 160, 255, cv2.THRESH_BINARY)

        # Small morphological cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        # Scale up 2× — critical for Tesseract accuracy on small text
        scaled = cv2.resize(thresh, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

        # Tesseract with confidence data
        data = pytesseract.image_to_data(
            scaled, config=TESS_CONFIG,
            output_type=pytesseract.Output.DICT
        )

        texts = []
        confs = []
        for i, conf in enumerate(data["conf"]):
            try:
                c = float(conf)
            except (ValueError, TypeError):
                continue
            t = str(data["text"][i]).strip()
            if c > 0 and t:
                texts.append(t)
                confs.append(c)

        if not texts:
            return "", 0.0

        combined = "".join(texts).upper().replace(" ", "")
        avg_conf  = sum(confs) / len(confs)
        return combined, round(avg_conf, 1)

    except Exception as e:
        log.debug(f"OCR error: {e}")
        return "", 0.0


async def _ocr_async(jpeg_bytes: bytes) -> Tuple[str, float]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_POOL, _ocr_camera_id, jpeg_bytes)


# ══════════════════════════════════════════════════════════════════════════
# PER-CAMERA PIPELINE
# ══════════════════════════════════════════════════════════════════════════

async def _process_one(
    row: dict,
    session: aiohttp.ClientSession,
    sem_net: asyncio.Semaphore,
    sem_ocr: asyncio.Semaphore,
) -> dict:
    """Full pipeline for one camera row."""
    url     = row["_url"]
    expect  = row["_expect"]
    row_id  = row["_row_id"]

    base = {
        "row_id":      row_id,
        "extracted":   "",
        "match":       "NO",
        "status":      "FAILED",
        "confidence":  0.0,
    }

    if not url:
        base["status"] = "MISSING_URL"
        return base

    is_rtsp = _is_rtsp(url)

    # ── Step 1: Resolve stream URL ─────────────────────────────────────
    async with sem_net:
        try:
            if is_rtsp:
                resolved = url           # RTSP: use directly
            else:
                resolved = await asyncio.wait_for(
                    _resolve_hls(url, session),
                    timeout=TIMEOUT_HLS_EXTRACT + 1,
                )
            if not resolved:
                base["status"] = "HLS_RESOLVE_FAILED"
                return base
        except asyncio.TimeoutError:
            base["status"] = "HLS_TIMEOUT"
            return base
        except Exception as e:
            base["status"] = f"RESOLVE_ERR:{e}"
            return base

    # ── Step 2: Capture frame ──────────────────────────────────────────
    try:
        jpeg = await asyncio.wait_for(
            _capture_frame(resolved, is_rtsp),
            timeout=TIMEOUT_OPENCV_MS / 1000 + TIMEOUT_FFMPEG + 2,
        )
        if not jpeg:
            base["status"] = "FRAME_CAPTURE_FAILED"
            return base
    except asyncio.TimeoutError:
        base["status"] = "FRAME_TIMEOUT"
        return base

    # ── Step 3: OCR ────────────────────────────────────────────────────
    async with sem_ocr:
        extracted, conf = await _ocr_async(jpeg)

    if not extracted:
        base["status"]     = "OCR_EMPTY"
        base["confidence"] = conf
        return base

    # ── Step 4: Compare ────────────────────────────────────────────────
    match = extracted == expect

    return {
        "row_id":     row_id,
        "extracted":  extracted,
        "match":      "YES" if match else "NO",
        "status":     "OK",
        "confidence": conf,
    }


# ══════════════════════════════════════════════════════════════════════════
# CHECKPOINT
# ══════════════════════════════════════════════════════════════════════════

def _save_checkpoint(df: pd.DataFrame, checkpoint_path: str) -> None:
    try:
        df.to_json(checkpoint_path, orient="records", force_ascii=False)
    except Exception as e:
        log.error(f"Checkpoint save failed: {e}")


def _load_checkpoint(df: pd.DataFrame, checkpoint_path: str) -> pd.DataFrame:
    if not os.path.exists(checkpoint_path):
        return df
    try:
        saved = pd.read_json(checkpoint_path, orient="records", dtype=str)
        saved.fillna("", inplace=True)
        done_mask = saved["_status"] != ""
        done_rows = saved[done_mask]
        log.info(f"Resuming checkpoint: {done_mask.sum():,} already done")
        for _, row in done_rows.iterrows():
            rid = int(row["_row_id"])
            df.loc[df["_row_id"] == rid, "_extracted"]  = row.get("_extracted",  "")
            df.loc[df["_row_id"] == rid, "_match"]      = row.get("_match",      "")
            df.loc[df["_row_id"] == rid, "_status"]     = row.get("_status",     "")
            df.loc[df["_row_id"] == rid, "_confidence"] = row.get("_confidence", "")
        return df
    except Exception as e:
        log.warning(f"Checkpoint load failed ({e}) — starting fresh")
        return df


# ══════════════════════════════════════════════════════════════════════════
# RESULTS EXPORT
# ══════════════════════════════════════════════════════════════════════════

def _export_results(df: pd.DataFrame, output_path: str) -> None:
    # Drop internal helper columns
    export = df.drop(columns=["_url", "_expect", "_row_id"], errors="ignore").copy()

    export.rename(columns={
        "_extracted":  "Extracted ID",
        "_match":      "Match",
        "_status":     "Status",
        "_confidence": "OCR Confidence %",
    }, inplace=True)

    matched     = export[export["Match"] == "YES"]
    mismatched  = export[export["Match"] == "NO"]
    failed      = export[export["Status"] != "OK"]

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        export.to_excel(writer,    sheet_name="All Results",  index=False)
        matched.to_excel(writer,   sheet_name="Matched",      index=False)
        mismatched.to_excel(writer, sheet_name="Mismatched",  index=False)
        failed.to_excel(writer,    sheet_name="Failed",       index=False)

    log.info(f"Results saved → {output_path}")
    print(f"\n📁 Results: {output_path}")
    print(f"   ✅ Matched     : {len(matched):,}")
    print(f"   ❌ Mismatched  : {len(mismatched[mismatched['Status']=='OK']):,}")
    print(f"   ⚠️  Failed      : {len(failed):,}")


# ══════════════════════════════════════════════════════════════════════════
# ASYNC MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════

async def _run_pipeline(df: pd.DataFrame, workers_net: int, workers_ocr: int) -> pd.DataFrame:
    sem_net = asyncio.Semaphore(workers_net)
    sem_ocr = asyncio.Semaphore(workers_ocr)

    # Only process rows not yet done
    pending = df[df["_status"] == ""].to_dict("records")
    log.info(
        f"Pipeline start | total={len(df):,} | pending={len(pending):,} | "
        f"net_workers={workers_net} | ocr_workers={workers_ocr}"
    )

    connector = aiohttp.TCPConnector(
        limit=workers_net + 64,
        limit_per_host=0,
        ttl_dns_cache=300,
        enable_cleanup_closed=True,
    )

    done_count    = 0
    checkpoint_p  = "checkpoint_ocr.json"
    t_start       = time.time()

    async with aiohttp.ClientSession(connector=connector) as session:
        coros = [
            _process_one(row, session, sem_net, sem_ocr)
            for row in pending
        ]

        with tqdm(total=len(coros), desc="Verifying cameras", unit="cam") as pbar:
            for fut in asyncio.as_completed(coros):
                res = await fut

                # Write result back into df
                rid = res["row_id"]
                with _lock:
                    df.loc[df["_row_id"] == rid, "_extracted"]  = res["extracted"]
                    df.loc[df["_row_id"] == rid, "_match"]      = res["match"]
                    df.loc[df["_row_id"] == rid, "_status"]     = res["status"]
                    df.loc[df["_row_id"] == rid, "_confidence"] = str(res["confidence"])

                done_count += 1
                pbar.update(1)

                # Live ETA in progress bar
                elapsed = time.time() - t_start
                rate    = done_count / elapsed if elapsed > 0 else 0
                remaining = len(coros) - done_count
                eta_s   = int(remaining / rate) if rate > 0 else 0
                pbar.set_postfix({
                    "rate": f"{rate:.0f}/s",
                    "ETA":  f"{eta_s//3600}h{(eta_s%3600)//60}m",
                })

                # Periodic checkpoint
                if done_count % CHECKPOINT_EVERY == 0:
                    _save_checkpoint(df, checkpoint_p)

    # Final checkpoint cleanup
    _save_checkpoint(df, checkpoint_p)
    total_time = time.time() - t_start

    matched   = int((df["_match"] == "YES").sum())
    mismatch  = int((df["_match"] == "NO" ) & (df["_status"] == "OK")).sum()
    failed_c  = int((df["_status"] != "OK").sum())

    print(f"""
{'═'*60}
  FINAL SUMMARY
{'═'*60}
  Total cameras      : {len(df):,}
  ✅ Matched          : {matched:,}
  ❌ Mismatched       : {mismatch:,}
  ⚠️  Failed/Skipped   : {failed_c:,}
  Total time         : {int(total_time//3600)}h {int((total_time%3600)//60)}m {int(total_time%60)}s
  Throughput         : {len(df)/total_time:.1f} cameras/sec
{'═'*60}""")

    # Clean up checkpoint file
    if os.path.exists("checkpoint_ocr.json"):
        os.remove("checkpoint_ocr.json")

    return df


# ══════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════

def parse_args():
    p = argparse.ArgumentParser(
        description="Verify burned-in camera IDs via OCR at scale (1-lakh cameras)"
    )
    p.add_argument("--input",       required=True,  help="Input CSV or Excel file")
    p.add_argument("--url-col",     default="Stream URL",  help="Column name for stream URL")
    p.add_argument("--id-col",      default="Camera ID",   help="Column name for expected ID")
    p.add_argument("--output",      default="ocr_results.xlsx", help="Output Excel file")
    p.add_argument("--workers-net", type=int, default=MAX_WORKERS_NET,
                   help=f"Concurrent stream fetches (default {MAX_WORKERS_NET})")
    p.add_argument("--workers-ocr", type=int, default=MAX_WORKERS_OCR,
                   help=f"Concurrent Tesseract jobs (default {MAX_WORKERS_OCR})")
    p.add_argument("--resume",      action="store_true",
                   help="Resume from checkpoint if it exists")
    p.add_argument("--roi-y1",  type=float, default=ROI_Y1_FRAC, help="ROI top    (0-1 fraction)")
    p.add_argument("--roi-y2",  type=float, default=ROI_Y2_FRAC, help="ROI bottom (0-1 fraction)")
    p.add_argument("--roi-x1",  type=float, default=ROI_X1_FRAC, help="ROI left   (0-1 fraction)")
    p.add_argument("--roi-x2",  type=float, default=ROI_X2_FRAC, help="ROI right  (0-1 fraction)")
    return p.parse_args()


def main():
    args = parse_args()

    # Apply CLI ROI overrides to globals
    global ROI_Y1_FRAC, ROI_Y2_FRAC, ROI_X1_FRAC, ROI_X2_FRAC
    ROI_Y1_FRAC = args.roi_y1
    ROI_Y2_FRAC = args.roi_y2
    ROI_X1_FRAC = args.roi_x1
    ROI_X2_FRAC = args.roi_x2

    log.info("═" * 60)
    log.info("Camera ID OCR Verifier — 1-Lakh Scale")
    log.info(f"  Input           : {args.input}")
    log.info(f"  URL column      : {args.url_col}")
    log.info(f"  Expected ID col : {args.id_col}")
    log.info(f"  Net workers     : {args.workers_net}")
    log.info(f"  OCR workers     : {args.workers_ocr}")
    log.info(f"  ROI             : y=[{ROI_Y1_FRAC},{ROI_Y2_FRAC}] x=[{ROI_X1_FRAC},{ROI_X2_FRAC}]")
    log.info("═" * 60)

    df = load_input(args.input, args.url_col, args.id_col)

    if args.resume:
        df = _load_checkpoint(df, "checkpoint_ocr.json")

    df = asyncio.run(_run_pipeline(df, args.workers_net, args.workers_ocr))
    _export_results(df, args.output)
    log.info(f"Log file: {LOG_FILE}")


if __name__ == "__main__":
    main()



# python camera_id_verifier.py \
#     --input cameras.csv \
#     --url-col "Stream URL" \
#     --id-col  "Camera ID" \
#     --output  results.xlsx

# # Resume after crash
# python camera_id_verifier.py --input cameras.csv --resume