"""
Camera Loader for CCTV Pipeline
=================================
Unified camera loading — replaces Excel-based approach.
Fetches pending executions → queries DB → returns camera list.
"""

import logging
from datetime import date

from utils.db_client import get_hls_cameras, get_rtsp_cameras
from utils.api_client import get_pending_executions

logger = logging.getLogger(__name__)


def load_cameras_for_execution(execution: dict) -> list:
    """
    Given a pending execution dict, query the appropriate DB table
    and return a list of camera config dicts ready for workers.

    Each returned dict contains:
        - cctv_url:       str   (streaming URL)
        - camera_id:      str   (ch_code for HLS, device_id for RTSP)
        - classification: str   (e.g. 'Computer Lab', 'Entry/Exit')
        - link_type:      str   ('HLS' or 'RTSP')
        - script_code:    str   (e.g. 'crowd', 'server', 'entry_exit')
        - camera_name:    str
        - centre_name:    str
    """
    script_code = execution.get("script_code", "unknown")
    link_type   = execution.get("link_type", "").upper()
    exam_id     = execution.get("exam_id")
    shift_id    = execution.get("shift_id")

    today = date.today().isoformat()

    cameras = []

    if link_type == "HLS":
        rows = get_hls_cameras(exam_id, shift_id, today)
        for row in rows:
            ch_code = str(row.get("ch_code", "")).strip()
            if not ch_code or not row.get("cctv_url"):
                continue

            cameras.append({
                "cctv_url":       row["cctv_url"],
                "camera_id":      ch_code,
                "ch_no":          ch_code,   # Added to ensure workers get the channel code
                "camera_id_pk":   str(row.get("id", "")),   # DB primary key — always unique
                "classification": str(row.get("classification", "")).strip(),
                "link_type":      "HLS",
                "script_code":    script_code,
                "camera_name":    str(row.get("camera_name", "")).strip(),
                "centre_name":    str(row.get("centre_name", "")).strip(),
                "tc_code":        str(row.get("tc_code", "")).strip(),
            })

    elif link_type == "RTSP":
        rows = get_rtsp_cameras(exam_id)
        for row in rows:
            device_id = str(row.get("device_id", "")).strip()
            if not device_id or not row.get("cctv_url"):
                continue

            # id is PRIMARY KEY — guaranteed unique per row
            db_id     = str(row.get("id", "")).strip()
            camera_no = str(row.get("camera_no", "")).strip() or device_id

            cameras.append({
                "cctv_url":       row["cctv_url"],
                "camera_id":      device_id,
                "camera_id_pk":   db_id,           # ← PRIMARY KEY (unique) — use for file naming
                "camera_no":      camera_no,
                "classification": str(row.get("classification", "")).strip(),
                "link_type":      "RTSP",
                "script_code":    script_code,
                "camera_name":    str(row.get("camera_name", "")).strip(),
                "centre_name":    str(row.get("centre_name", "")).strip(),
                "tc_code":        str(row.get("tc_code", "")).strip(),
            })
    else:
        logger.error(f"[CameraLoader] Unknown link_type: {link_type}")
        return []

    logger.info(
        f"[CameraLoader] Loaded {len(cameras)} cameras "
        f"(script={script_code}, link_type={link_type}, "
        f"exam_id={exam_id}, shift_id={shift_id})"
    )
    return cameras


def load_all_pending_cameras(api_url: str = None, token: str = None) -> list:
    """
    Convenience: fetch all pending executions and load cameras for each.

    Returns list of (execution_dict, cameras_list) tuples.
    """
    executions = get_pending_executions(api_url, token)
    results = []

    for ex in executions:
        cameras = load_cameras_for_execution(ex)
        if cameras:
            results.append((ex, cameras))
            logger.info(
                f"[CameraLoader] Execution '{ex['script_code']}' → "
                f"{len(cameras)} cameras ({ex['link_type']})"
            )
        else:
            logger.warning(
                f"[CameraLoader] No cameras for execution "
                f"'{ex['script_code']}' (exam_id={ex['exam_id']})"
            )

    return results


# ============================================================
# 🧪  STANDALONE TEST
# ============================================================
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    results = load_all_pending_cameras()
    for ex, cams in results:
        print(f"\n=== {ex['script_code']} ({ex['link_type']}) ===")
        for cam in cams[:3]:
            print(f"  camera_id={cam['camera_id']}  "
                  f"classification={cam['classification']}  "
                  f"url={str(cam['cctv_url'])[:50]}...")