import os
import sys
import shutil
import re

# ================= DB REPORTING =================
# Import centralized reporter from utils/db_client (single source of truth)
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", "detection", "utils")
if _utils_path not in sys.path:
    sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402

# ================= CONFIGURATION =================
# 1. Full path to your pre-formatted image file on this machine
SOURCE_IMAGE_PATH = "/data/cctv_dev/cctv/proximity_ch85721_20260415_111001.jpg"

# 2. Detection type folder — used in DB image URL and detection_type column
DETECTION_FOLDER = "proximity_detection"

# 3. Destination save folder on this server
SAVE_FOLDER = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "scripts", "detection", "results", "tcs_detections", "proximity_detection"
)

# 4. Exam metadata — set via environment or edit defaults here for testing
os.environ.setdefault("EXAM_ID", "7")
os.environ.setdefault("SHIFT_ID", "67")
# ==================================================

os.makedirs(SAVE_FOLDER, exist_ok=True)

filename  = os.path.basename(SOURCE_IMAGE_PATH)
dest_path = os.path.join(SAVE_FOLDER, filename)

match   = re.search(r"_ch(\d+)_", filename)
ch_code = match.group(1) if match else "unknown"

print("--- Manual Proximity Detection Push ---")
print(f"Moving : {filename}")
print(f"To     : {SAVE_FOLDER}")
print("----------------------------------------")

try:
    if os.path.exists(SOURCE_IMAGE_PATH):
        shutil.copy(SOURCE_IMAGE_PATH, dest_path)
        print("Image successfully copied to results folder.")

        success = report_to_db_hls(ch_code=ch_code, image_name=filename, folder=DETECTION_FOLDER)

        if success:
            print("SUCCESS: Record added to database.")
        else:
            print("FAILED DB: Check db_reports.log for details.")
    else:
        print(f"ERROR: Source image not found at {SOURCE_IMAGE_PATH}")

except Exception as e:
    print(f"FATAL ERROR: {e}")
