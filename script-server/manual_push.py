import os
import sys
import shutil
import re
from datetime import datetime

# Ensure we can import from the detection folder
script_dir = os.path.dirname(os.path.abspath(__file__))
detect_path = os.path.join(script_dir, "scripts/detection")
if detect_path not in sys.path:
    sys.path.append(detect_path)

try:
    from crowd_zero_det import report_to_db_hls, SAVE_FOLDER
except ImportError as e:
    print(f"Error: Could not import reporting logic. {e}")
    sys.exit(1)

# ================= CONFIGURATION =================
# 1. Path to your already-formatted image in home folder
# Example: /home/samarth/crowd_zero_ch23749_20260413_111001.jpg
SOURCE_IMAGE_PATH = "/data/cctv_dev/cctv/crowd_zero_ch85721_20260413_111001.jpg"

# 2. Metadata for testing
os.environ["EXAM_ID"] = "7"
os.environ["SHIFT_ID"] = "67"
# =================================================

# 1. Prepare Paths
filename = os.path.basename(SOURCE_IMAGE_PATH)
dest_path = os.path.join(SAVE_FOLDER, filename)

# 2. Extract Channel Code from filename automatically
match = re.search(r'_ch(\d+)_', filename)
ch_code = match.group(1) if match else "unknown"

print(f"--- Manual Crowd Zero Detection Push ---")
print(f"Moving: {filename}")
print(f"To:     {SAVE_FOLDER}")
print(f"----------------------------------------")

try:
    # A. MOVE THE IMAGE (Picking up from home and saving to folder)
    if os.path.exists(SOURCE_IMAGE_PATH):
        # We use copy then optional remove to be safe
        shutil.copy(SOURCE_IMAGE_PATH, dest_path)
        print(f"✅ Image successfully moved to results folder.")
        
        # B. TRIGGER THE DATABASE WORK
        success = report_to_db_hls(ch_code=ch_code, image_name=filename, folder="zero_person_detection")
        
        if success:
            print(f"✅ SUCCESS: Record added to database for image info.")
        else:
            print(f"❌ FAILED DB: Check 'db_reports.log' for the reason.")
    else:
        print(f"❌ ERROR: Source image not found at {SOURCE_IMAGE_PATH}")

except Exception as e:
    print(f"❌ FATAL ERROR: {e}")