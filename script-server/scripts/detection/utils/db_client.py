"""
Database Client for CCTV Pipeline
===================================
Connects to MySQL and queries camera_links_hls / camera_links_rtsp tables.
"""

import os
import logging
import pymysql

logger = logging.getLogger(__name__)

# ================= DB CONFIG =================
DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "localhost"),
    "port":     int(os.environ.get("DB_PORT", 3306)),
    "user":     os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", "rootpassword123"),
    "database": os.environ.get("DB_NAME", "cctv_monitoring"),
    "charset":  "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}


def _get_connection():
    """Create a new MySQL connection."""
    return pymysql.connect(**DB_CONFIG)


# ============================================================
# 🎥  HLS CAMERAS
# ============================================================
def get_hls_cameras(exam_id: int, shift_id: int, exam_date: str) -> list:
    """
    Query camera_links_hls for cameras matching exam_id, shift_id,
    and exam_date (YYYY-MM-DD).

    Returns list of dicts with keys:
        cctv_url, ch_code, classification, camera_name,
        centre_name, city, state, tc_code, camera_category
    """
    sql = """
        SELECT
            id, exam_id, shift_id, centre_name, city, state,
            camera_name, ch_code, tc_code, cctv_url,
            camera_category, classification, is_active, exam_date
        FROM camera_links_hls
        WHERE exam_id   = %s
          AND (shift_id = %s OR shift_id IS NULL)
          AND (exam_date = %s OR exam_date IS NULL)
          AND is_active = 1
    """
    params = [exam_id, shift_id, exam_date]

    try:
        conn = _get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                rows = cur.fetchall()
                logger.info(
                    f"[DB] Loaded {len(rows)} HLS cameras "
                    f"(exam_id={exam_id}, shift_id={shift_id}, date={exam_date})"
                )
                return rows
    except Exception as e:
        logger.error(f"[DB] Error querying camera_links_hls: {e}")
        return []


def update_hls_classification(exam_id: int, shift_id: int, exam_date: str, ch_code: str, classification: str) -> int:
    """Update classification in camera_links_hls for one camera, scoped by exam/shift/date."""
    sql = """
        UPDATE camera_links_hls
        SET classification = %s
        WHERE exam_id = %s
          AND ch_code = %s
          AND is_active = 1
          AND (shift_id = %s OR shift_id IS NULL)
          AND (exam_date = %s OR exam_date IS NULL)
    """
    try:
        conn = _get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (classification, exam_id, ch_code, shift_id, exam_date))
                conn.commit()
                return cur.rowcount
    except Exception as e:
        logger.error(f"[DB] Error updating camera_links_hls classification (ch_code={ch_code}): {e}")
        return 0


# ============================================================
# 📡  RTSP CAMERAS
# ============================================================
def get_rtsp_cameras(exam_id: int) -> list:
    """
    Query camera_links_rtsp for cameras matching exam_id.

    Returns list of dicts with keys:
        cctv_url, device_id, classification, camera_name,
        centre_name, city, state, tc_code
    """
    sql = """
        SELECT
            id, device_id, exam_id, centre_name, tc_code,
            camera_name, camera_no, city, state, cctv_url,
            is_active, classification
        FROM camera_links_rtsp
        WHERE exam_id  = %s
          AND is_active = 1
    """
    try:
        conn = _get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (exam_id,))
                rows = cur.fetchall()
                logger.info(
                    f"[DB] Loaded {len(rows)} RTSP cameras "
                    f"(exam_id={exam_id})"
                )
                return rows
    except Exception as e:
        logger.error(f"[DB] Error querying camera_links_rtsp: {e}")
        return []

def get_rtsp_camera_by_id(camera_id_pk: int) -> dict:
    """Fetch one active RTSP camera row by its primary key ID."""
    if not camera_id_pk:
        return {}

    sql = """
        SELECT
            id, device_id, exam_id, centre_name, tc_code,
            camera_name, camera_no, city, state, cctv_url,
            is_active, classification
        FROM camera_links_rtsp
        WHERE id = %s
          AND is_active = 1
        LIMIT 1
    """
    try:
        conn = _get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (camera_id_pk,))
                row = cur.fetchone()
                return row or {}
    except Exception as e:
        logger.error(f"[DB] Error fetching camera_links_rtsp by ID ({camera_id_pk}): {e}")
        return {}

def update_rtsp_classification(exam_id: int, device_id: str, classification: str) -> int:
    """Update classification in camera_links_rtsp for one camera."""
    sql = """
        UPDATE camera_links_rtsp
        SET classification = %s
        WHERE exam_id = %s
          AND device_id = %s
          AND is_active = 1
    """
    try:
        conn = _get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, (classification, exam_id, device_id))
                conn.commit()
                return cur.rowcount
    except Exception as e:
        logger.error(f"[DB] Error updating camera_links_rtsp classification (device_id={device_id}): {e}")
        return 0


def get_hls_camera_by_ch_code(ch_code: str, exam_date: str = None) -> dict:
    """Fetch one active HLS camera row by ch_code, optionally preferring a specific exam_date."""
    if not ch_code:
        return {}

    sql_with_date = """
        SELECT
            id, exam_id, shift_id, centre_name, city, state,
            camera_name, ch_code, tc_code, cctv_url,
            camera_category, classification, is_active, exam_date
        FROM camera_links_hls
        WHERE ch_code = %s
          AND is_active = 1
        ORDER BY
          CASE WHEN exam_date = %s THEN 0 ELSE 1 END,
          exam_date DESC,
          id DESC
        LIMIT 1
    """

    sql_without_date = """
        SELECT
            id, exam_id, shift_id, centre_name, city, state,
            camera_name, ch_code, tc_code, cctv_url,
            camera_category, classification, is_active, exam_date
        FROM camera_links_hls
        WHERE ch_code = %s
          AND is_active = 1
        ORDER BY exam_date DESC, id DESC
        LIMIT 1
    """

    try:
        conn = _get_connection()
        with conn:
            with conn.cursor() as cur:
                if exam_date:
                    cur.execute(sql_with_date, (ch_code, exam_date))
                else:
                    cur.execute(sql_without_date, (ch_code,))
                row = cur.fetchone()
                if not row:
                    return {}
                return row
    except Exception as e:
        logger.error(f"[DB] Error querying camera_links_hls by ch_code ({ch_code}): {e}")
        return {}


# ============================================================
# 🧪  STANDALONE TEST
# ============================================================
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from datetime import date

    today = date.today().isoformat()
    print(f"\n=== Testing HLS cameras (exam_id=2, shift_id=7, date={today}) ===")
    hls = get_hls_cameras(2, 7, today)
    for cam in hls[:3]:
        print(f"  ch_code={cam['ch_code']}  url={str(cam['cctv_url'])[:60]}...")

    print(f"\n=== Testing RTSP cameras (exam_id=2) ===")
    rtsp = get_rtsp_cameras(2)
    for cam in rtsp[:3]:
        print(f"  device_id={cam['device_id']}  url={str(cam['cctv_url'])[:60]}...")
