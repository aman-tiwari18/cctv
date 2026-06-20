"""
Camera Loader for CCTV Pipeline
=================================
Unified camera loading — replaces Excel-based approach.
Fetches pending executions → queries DB → returns camera list.

NOTE: This loader is used by DETECTION WORKERS and loads ONLY accessible cameras.
Vision classification scripts use get_hls_cameras() / get_rtsp_cameras() directly.
"""

import logging
from datetime import date

from utils.db_client import get_hls_cameras_accessible, get_rtsp_cameras_accessible
from utils.api_client import get_pending_executions

logger = logging.getLogger(__name__)


# ================= ANALYTIC -> CLASSIFICATION MAPPING =================
# This ensures each script only processes relevant cameras.
# Updated 2026-06-19 to the current DB classification values:
#   Inside Classroom · Entry/Exit · Strong Room · Biometric · Uncertain
# Matching is case-insensitive substring (see _camera_matches_script). Room
# names "Strong Room/Control Room/Principal Room" all carry the DB value
# "Strong Room". "Uncertain" cameras (room not confidently classified) are NOT
# routed to room-specific analytics — only the "all" scripts (tamper/inversion).
SCRIPT_CLASSIFICATION_MAP = {
    # 1. Intruder — Movement in strong room / control room / principal room
    "intruder":        ["strong room"],

    # 2/3. Crowd — >10 people at entry / frisking / biometric area
    "crowd":           ["entry/exit", "biometric"],
    "crowd_biometric": ["entry/exit", "biometric"],

    # 4. Invigilator not moving — inside classroom
    "invigilator":     ["inside classroom"],

    # 5. Two or more people in close proximity — inside classroom
    "proximity":       ["inside classroom"],

    # 6. Server / strong-room threshold
    "server":          ["strong room"],

    # 7. Mobile phone detection in classroom
    "phone":           ["inside classroom"],

    # 8. Movement at entry / exit during examination
    "entry_exit":      ["entry/exit"],

    # 9. Camera feed is inverted — all cameras
    "inversion":       ["all"],

    # 10. 0 candidates in a room — inside classroom
    "crowd_zero":      ["inside classroom"],

    # 11. Less than 5 candidates in a room — inside classroom
    "crowd_five":      ["inside classroom"],

    # 12. Blind spot detected — inside classroom
    "blind_spot":      ["inside classroom"],

    # Camera tampering — all cameras
    "tamper":          ["all"],

    # Strong room / QP-box not visible — strong room / control room / principal room
    "strongroom":      ["strong room"],
    "qp_box":          ["strong room"],
}

def _camera_matches_script(classification, script_code):
    """Check if a camera's classification matches the requested script_code"""
    if not classification:
        return True # Default to including if unknown
    
    allowed = SCRIPT_CLASSIFICATION_MAP.get(script_code, [])
    if "all" in allowed:
        return True
        
    cls_lower = classification.lower()
    return any(scene in cls_lower for scene in allowed)

def load_cameras_for_execution(execution: dict) -> list:
    """
    Given a pending execution dict, query the appropriate DB table
    and return a list of camera config dicts ready for workers.
    
    IMPORTANT: This function loads ONLY accessible cameras (status = 'Accessible').
    Vision classification scripts should use get_hls_cameras() / get_rtsp_cameras() directly.

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
        rows = get_hls_cameras_accessible(exam_id, shift_id, today)
        for row in rows:
            ch_code = str(row.get("ch_code", "")).strip()
            classification = str(row.get("classification", "")).strip()
            
            if not ch_code or not row.get("cctv_url"):
                continue
            
            if not _camera_matches_script(classification, script_code):
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
                "exam_id":        exam_id,      # ← ADD exam_id to camera config
                "shift_id":       shift_id,     # ← ADD shift_id to camera config
            })

    elif link_type == "RTSP":
        rows = get_rtsp_cameras_accessible(exam_id)
        for row in rows:
            device_id = str(row.get("device_id", "")).strip()
            classification = str(row.get("classification", "")).strip()
            
            if not device_id or not row.get("cctv_url"):
                continue

            if not _camera_matches_script(classification, script_code):
                continue

            # id is PRIMARY KEY — guaranteed unique per row
            db_id     = str(row.get("id", "")).strip()
            
            raw_cam_no = row.get("camera_no")
            if raw_cam_no is None or str(raw_cam_no).strip().lower() in ("none", "null", ""):
                camera_no = "1"
            else:
                camera_no = str(raw_cam_no).strip()

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
                "exam_id":        exam_id,      # ← ADD exam_id to camera config
                "shift_id":       shift_id,     # ← ADD shift_id to camera config
            })
    else:
        logger.error(f"[CameraLoader] Unknown link_type: {link_type}")
        return []

    logger.info(
        f"[CameraLoader] Loaded {len(cameras)} ACCESSIBLE cameras "
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