import pandas as pd

INPUT_FILE = "/home/umartheboss/Desktop/fix_path/combined_neet_results(3).xlsx"
OUTPUT_FILE = "/home/umartheboss/Desktop/fix_path/combined_neet_results(3)_fixed.xlsx"
BASE_URL = "http://www.examscctvmonitoring.com"

EXPECTED_HEADERS = [
    "Device ID", "Camera No", "TC Code", "Camera Name", "Center Name",
    "City", "State", "Server Address", "Expected Category", "VLM Category",
    "OCR TC Code", "OCR Camera Label", "OCR Text Side", "TC Match",
    "Name Match", "Confidence", "VLM Reason", "Frame Path", "Notes"
]

def fix_frame_path(path):
    if pd.isna(path) or str(path).strip() == "":
        return path
    path = str(path).strip()
    if path.startswith("http://") or path.startswith("https://"):
        return path
    # Extract from "classification_frames/" onwards and build correct URL
    marker = "classification_frames/"
    idx = path.find(marker)
    if idx != -1:
        return BASE_URL + "/cctv_dev/serve-rtsp-detection-images/" + path[idx:]
    return BASE_URL + "/" + path.lstrip("/")

xl = pd.read_excel(INPUT_FILE, sheet_name=None)
print(f"Found {len(xl)} sheets: {list(xl.keys())}")

fixed_sheets = {}
for sheet_name, df in xl.items():
    print(f"\nProcessing sheet: '{sheet_name}'")

    missing = [h for h in EXPECTED_HEADERS if h not in df.columns]
    if missing:
        print(f"  WARNING: Missing columns: {missing}")
    else:
        print(f"  All expected headers found.")

    if "Frame Path" in df.columns:
        before = df["Frame Path"].dropna().iloc[0] if not df["Frame Path"].dropna().empty else "N/A"
        df["Frame Path"] = df["Frame Path"].apply(fix_frame_path)
        after = df["Frame Path"].dropna().iloc[0] if not df["Frame Path"].dropna().empty else "N/A"
        print(f"  Before: {before}")
        print(f"  After : {after}")
    else:
        print(f"  'Frame Path' column NOT found, skipping.")

    fixed_sheets[sheet_name] = df

with pd.ExcelWriter(OUTPUT_FILE, engine="openpyxl") as writer:
    for sheet_name, df in fixed_sheets.items():
        df.to_excel(writer, sheet_name=sheet_name, index=False)

print(f"\nDone! Fixed file saved to:\n{OUTPUT_FILE}")