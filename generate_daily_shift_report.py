

#for jee exams
import os
import re
import sys
import json
from datetime import datetime, time
import openpyxl
from openpyxl.styles import Font

# ================= PATHS =================

CAMERA_FILE = "/data/cctv_dev/cctv/complete_results_20260405_050849.xlsx"
RESULTS_FOLDER = "/data/cctv_dev/cctv/script-server/scripts/detection/results/tcs_detections"

BASE_IMAGE_URL = "http://www.examscctvmonitoring.com/cctv/images/results/new_tcs_results"

if len(sys.argv) > 1:
    TARGET_DATE = sys.argv[1]
else:
    TARGET_DATE = datetime.now().strftime("%Y-%m-%d")

OUTPUT_FILE = os.path.join("/data/cctv_dev/cctv", TARGET_DATE + ".xlsx")
os.makedirs("/data/cctv_backup/cctv-analytics-system", exist_ok=True)

DEBUG_DEV = os.environ.get("DEBUG_DEV", "")

print(f"Generating report for date: {TARGET_DATE}")


# ================= SHIFT TIMES =================

SHIFT_TIMES = {
    "Shift1": (time(9, 0, 0), time(12, 0, 0)),
    "Shift2": (time(15, 0, 0), time(18, 0, 0))
}

# ================= NEW FILENAME FORMAT MAPPING =================
# prefix → detection type label
PREFIX_TO_DETECTION = {
    "crowd":      "Crowd",
    "EntryExit":  "Entry Exit",
    "phone":      "Phone",
    "violation":  "Proximity",
    "server":     "Server Room",
    "tampering":  "Camera Tampering",
    "Inversion":  "Camera Inversion",
    "lessthan5":  "Crowd Threshold",
    "zero":       "Zero Person",
    "blind":      "Blind Spot",
}
# =============================================================


def get_shift(image_time):
    for shift, (start, end) in SHIFT_TIMES.items():
        if start <= image_time <= end:
            return shift
    return None


def extract_time(filename):
    """
    New format: prefix_chXXXX_YYYYMMDD_HHMMSS_optional.jpg
    Old format: prefix_DEVICEID_CAMNAME_YYYYMMDD_HHMMSS.jpg
    Both handled by same regex.
    """
    match = re.search(r'(\d{8})_(\d{6})', filename)
    if match:
        try:
            dt = datetime.strptime(match.group(1) + match.group(2), "%Y%m%d%H%M%S")
            return dt
        except:
            return None
    return None


def get_detection_type_from_filename(filename):
    """New format: detect type from filename prefix."""
    name = os.path.basename(filename)
    for prefix, label in PREFIX_TO_DETECTION.items():
        if name.startswith(prefix + "_"):
            return label
    return "Unknown"


def extract_device_camera_new(filename):
    """
    New filename format: prefix_chXXXX_YYYYMMDD_HHMMSS_optional.jpg
    Extracts device_id (XXXX from chXXXX) and returns ch token as camera identifier.
    Returns: (device_id_str, ch_token_str) e.g. ("6334", "ch6334")
    """
    name = os.path.basename(filename)

    # Match: anything_chNNNN_YYYYMMDD_HHMMSS
    match = re.search(r'_ch(\d+)_(\d{8})_(\d{6})', name, re.IGNORECASE)
    if match:
        device_id = match.group(1)   # e.g. "6334"
        ch_token = "ch" + device_id  # e.g. "ch6334"
        return device_id, ch_token

    return None, None


def normalize_device_id(dev_str):
    dev_str = str(dev_str).strip()
    variants = {dev_str}
    if dev_str.isdigit():
        stripped = str(int(dev_str))
        variants.add(stripped)
        variants.add(stripped.zfill(5))
        variants.add(stripped.zfill(4))
    return variants


def normalize_org_abbreviations(name):
    result = re.sub(r'(?<![A-Za-z\d])([A-Za-z]\.){2,}', lambda m: m.group(0).replace('.', ''), name)
    result = re.sub(r'\b([A-Z]{2,})\.', r'\1', result)
    return result


def extract_s_number_from_camera_no(camera_no_str):
    if not camera_no_str:
        return None
    s = str(camera_no_str).strip()
    sc_match = re.search(r'[/_\-\s]([SC])(\d+)\s*$', s, re.IGNORECASE)
    if sc_match:
        return sc_match.group(1).upper() + sc_match.group(2)
    num_match = re.search(r'[/\-_](\d+)\s*$', s)
    if num_match:
        num = num_match.group(1)
        if len(num) <= 3:
            return num
    return None


def extract_s_number(camera_name):
    if not camera_name:
        return None
    direct = re.fullmatch(r'([SC])(\d+)', camera_name.strip(), re.IGNORECASE)
    if direct:
        return direct.group(1).upper() + direct.group(2)
    suffix = re.search(r'[_\-]([SC])(\d+)$', camera_name, re.IGNORECASE)
    if suffix:
        return suffix.group(1).upper() + suffix.group(2)
    return None


def all_s_number_variants(sn):
    if not sn:
        return set()
    variants = {sn}
    m = re.fullmatch(r'([SC])(\d+)', sn, re.IGNORECASE)
    if m:
        prefix = m.group(1).upper()
        digits = m.group(2)
        num = int(digits)
        variants.add(prefix + str(num))
        variants.add(prefix + str(num).zfill(2))
        variants.add(prefix + str(num).zfill(3))
        variants.add(prefix + digits)
    else:
        try:
            num = int(sn)
            variants.add(str(num))
            variants.add(str(num).zfill(2))
            variants.add(str(num).zfill(3))
        except:
            pass
    return variants


# ================= STATUS NORMALIZATION =================

def normalize_status(raw_status):
    if raw_status is None or str(raw_status).strip() == '':
        return "Online"
    val = str(raw_status).strip().lower()
    if val == "accessible":
        return "Online"
    elif val == "not accessible":
        return "Offline"
    elif "accessible" in val and "not" not in val:
        return "Online"
    else:
        return "Offline"

# ==========================================================


def load_camera_data():
    wb = openpyxl.load_workbook(CAMERA_FILE)

    if "All Results" in wb.sheetnames:
        ws = wb["All Results"]
        print("  Using sheet: 'All Results'")
    else:
        ws = wb.active
        print(f"  'All Results' sheet nahi mili, using active sheet: '{ws.title}'")

    header_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
    col_map = {}
    for i, h in enumerate(header_row):
        if h is not None:
            col_map[str(h).strip().lower()] = i

    print(f"  Columns found: {list(col_map.keys())}")

    STATUS_COL_NAMES = ["status", "camera status", "cam status", "accessibility"]
    status_col_idx = None
    for name in STATUS_COL_NAMES:
        if name in col_map:
            status_col_idx = col_map[name]
            print(f"  Status column found at index {status_col_idx} (header: '{name}')")
            break

    if status_col_idx is None:
        print("  ⚠️  Status column nahi mila! Default 'Online' use hoga.")
        status_col_idx = 12

    camera_rows = []
    debug_shown = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[1] is None:
            continue

        device_id_raw = str(row[9]).strip()
        camera_name_raw = str(row[7]).strip() if row[7] is not None else None

        s_number = extract_s_number_from_camera_no(camera_name_raw)

        dev_variants = normalize_device_id(device_id_raw)
        if DEBUG_DEV and (DEBUG_DEV in dev_variants):
            if debug_shown < 40:
                print(f"  Excel: device={device_id_raw!r:8} | camera_no={str(camera_name_raw)!r:35} | s_number={s_number!r}")
                debug_shown += 1

        cam_type_raw = row[10]
        cam_type_clean = cam_type_raw
        if isinstance(cam_type_raw, str) and "category" in cam_type_raw:
            try:
                cleaned = cam_type_raw.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(cleaned)
                cam_type_clean = parsed.get("category", cam_type_raw)
            except:
                cam_type_clean = cam_type_raw

        raw_status = row[status_col_idx] if status_col_idx < len(row) else None
        camera_status = normalize_status(raw_status)

        camera_rows.append({
            "device_id": device_id_raw,
            "camera_no": camera_name_raw,
            "s_number": s_number,
            "City": row[3],
            "Center": row[2],
            "Cam ID": f"{device_id_raw}_{s_number or camera_name_raw}",
            "Camera Name": camera_name_raw,
            "Cam Type": cam_type_clean,
            "TC Code": row[1],
            "Status": camera_status,
            "RawStatus": raw_status,
        })

    wb.close()

    online_count = sum(1 for c in camera_rows if c["Status"] == "Online")
    offline_count = sum(1 for c in camera_rows if c["Status"] == "Offline")
    print(f"  Loaded {len(camera_rows)} cameras → Online: {online_count}, Offline: {offline_count}")

    return camera_rows


def build_camera_lookup(camera_rows):
    exact_lookup = {}
    device_lookup = {}
    normed_lookup = {}

    for cam in camera_rows:
        dev_variants = normalize_device_id(cam["device_id"])

        for dev in dev_variants:
            device_lookup.setdefault(dev, [])
            if cam not in device_lookup[dev]:
                device_lookup[dev].append(cam)

            if cam["s_number"]:
                for sn in all_s_number_variants(cam["s_number"]):
                    exact_lookup.setdefault((dev, sn), cam)

            if cam["camera_no"]:
                normed = re.sub(r'[\s/\-\.]+', '_', str(cam["camera_no"])).lower().strip('_')
                normed_lookup.setdefault((dev, normed), cam)

                for d in dev_variants:
                    stripped = re.sub(r'^0*' + re.escape(d) + r'[_\-]?', '', normed, flags=re.IGNORECASE)
                    if stripped and stripped != normed:
                        normed_lookup.setdefault((dev, stripped), cam)

    return exact_lookup, device_lookup, normed_lookup


def match_camera(device_id, camera_name, exact_lookup, device_lookup, normed_lookup):
    if not device_id:
        return None

    dev_variants = normalize_device_id(device_id)
    is_debug = DEBUG_DEV and (DEBUG_DEV in dev_variants)

    # New format: camera_name is "chXXXX" — try device_id direct lookup first
    # Agar sirf ek hi camera us device pe hai toh wahi return karo
    for dev in dev_variants:
        cams = device_lookup.get(dev, [])
        if len(cams) == 1:
            if is_debug:
                print(f"  [DEBUG] Single camera match for device {dev}")
            return cams[0]

    if not camera_name:
        return None

    s_num = extract_s_number(camera_name)
    if s_num:
        for dev in dev_variants:
            for sn in all_s_number_variants(s_num):
                key = (dev, sn)
                if is_debug:
                    print(f"  [DEBUG] S lookup key={key} → {'HIT' if key in exact_lookup else 'miss'}")
                if key in exact_lookup:
                    return exact_lookup[key]

    num_tail = re.search(r'_(\d+)$', camera_name)
    if num_tail:
        for dev in dev_variants:
            for nv in all_s_number_variants(num_tail.group(1)):
                key = (dev, nv)
                if key in exact_lookup:
                    return exact_lookup[key]

    cam_normed = re.sub(r'[\s/\-\.]+', '_', camera_name).lower().strip('_')
    for dev in dev_variants:
        key = (dev, cam_normed)
        if is_debug:
            print(f"  [DEBUG] Normed lookup key={key} → {'HIT' if key in normed_lookup else 'miss'}")
        if key in normed_lookup:
            return normed_lookup[key]

    cam_tokens = set(re.split(r'[_\-\s/\.]+', camera_name.upper()))
    best_match = None
    best_score = 0
    for dev in dev_variants:
        for cam in device_lookup.get(dev, []):
            excel_tokens = set(re.split(r'[_\-\s/\.]+', str(cam["camera_no"]).upper()))
            overlap = cam_tokens & excel_tokens
            meaningful = {t for t in overlap if len(t) > 2 and not t.isdigit()}
            if len(meaningful) > best_score:
                best_score = len(meaningful)
                best_match = cam

    if is_debug and best_match:
        print(f"  [DEBUG] Token overlap: score={best_score} → {best_match['camera_no']!r}")

    if best_score >= 2:
        return best_match

    # Last resort: agar device match ho toh pehla camera return karo
    for dev in dev_variants:
        cams = device_lookup.get(dev, [])
        if cams:
            if is_debug:
                print(f"  [DEBUG] Fallback: returning first camera for device {dev}")
            return cams[0]

    return None


def collect_data(camera_rows):
    exact_lookup, device_lookup, normed_lookup = build_camera_lookup(camera_rows)

    shift_counts = {s: {} for s in SHIFT_TIMES}
    detections_list = []

    # ── New format folders ──
    NEW_FORMAT_FOLDERS = [
        "crowd_detection_results",
        "entry_exit_detection_results",
        "phone_detection_results",
        "proximity_detection_results",
        "server_room_detection_results",
        "camera_tampering_detection_results",
        "camera_inversion_detection_results",
        "crowd_detection_threshold",
        "zero_person_detection",
        "blind_spot_detection_results",
    ]

    matched = 0
    unmatched = 0
    unmatched_samples = []
    unmatched_by_dev = {}

    for folder in NEW_FORMAT_FOLDERS:
        folder_path = os.path.join(RESULTS_FOLDER, folder)
        if not os.path.exists(folder_path):
            continue

        print(f"Processing folder: {folder}")

        for root, dirs, files in os.walk(folder_path):
            if "false_positives" in root.lower():
                continue

            for file in files:
                if not file.lower().endswith((".jpg", ".jpeg", ".png")):
                    continue

                dt = extract_time(file)
                if not dt:
                    continue

                if dt.strftime("%Y-%m-%d") != TARGET_DATE:
                    continue

                shift = get_shift(dt.time())
                if not shift:
                    continue

                # ── New format: extract device_id from chXXXX ──
                dev, ch_token = extract_device_camera_new(file)

                if not dev:
                    unmatched += 1
                    if len(unmatched_samples) < 10:
                        unmatched_samples.append(f"parse_fail | file={file}")
                    continue

                cam_data = match_camera(dev, ch_token, exact_lookup, device_lookup, normed_lookup)

                if not cam_data:
                    unmatched += 1
                    unmatched_by_dev[dev] = unmatched_by_dev.get(dev, 0) + 1
                    if len(unmatched_samples) < 10:
                        unmatched_samples.append(f"dev={dev} ch={ch_token} | file={file}")
                    continue

                matched += 1
                key = (cam_data["device_id"], cam_data["camera_no"])
                shift_counts[shift].setdefault(key, 0)
                shift_counts[shift][key] += 1

                detection_type = get_detection_type_from_filename(file)

                detections_list.append([
                    shift,
                    cam_data["device_id"],
                    cam_data["camera_no"],
                    cam_data["Cam ID"],
                    cam_data["Camera Name"],
                    cam_data["Center"],
                    cam_data["City"],
                    detection_type,
                    dt.strftime("%Y-%m-%d %H:%M:%S"),
                    BASE_IMAGE_URL + "/" + folder + "/" + file,
                    "View"
                ])

    print(f"\n✅ Matched detections   : {matched}")
    print(f"❌ Unmatched detections : {unmatched}")
    if unmatched_samples:
        print("   Unmatched samples:")
        for s in unmatched_samples:
            print("   ", s)

    if unmatched > 0:
        print("\n📊 Unmatched by device_id (top 10):")
        for dev, cnt in sorted(unmatched_by_dev.items(), key=lambda x: -x[1])[:10]:
            all_variants = normalize_device_id(dev)
            excel_devs = {str(cam["device_id"]) for cam in camera_rows}
            in_excel = bool(all_variants & excel_devs)
            matched_as = [v for v in all_variants if v in excel_devs]
            tag = f"✅ in Excel as {matched_as}" if in_excel else "❌ NOT in Excel"
            print(f"   {dev}: {cnt} files  [{tag}]")

    return shift_counts, detections_list


def auto_width(ws, max_width=35):
    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_len + 2, max_width)


def create_shift_sheets(wb, camera_rows, shift_counts):
    headers = [
        "City", "Center", "Cam ID", "Camera Name",
        "Cam Type", "TC Code",
        "Events(Excluding Rejected Events)", "Rejected Events", "Camera Status"
    ]
    for shift in SHIFT_TIMES:
        ws = wb.create_sheet(shift)
        ws.append(headers)
        for col in range(1, len(headers) + 1):
            ws.cell(row=1, column=col).font = Font(bold=True)

        for cam in camera_rows:
            key = (cam["device_id"], cam["camera_no"])
            count = shift_counts[shift].get(key, 0)
            status = cam["Status"]

            ws.append([
                cam["City"], cam["Center"], cam["Cam ID"], cam["Camera Name"],
                cam["Cam Type"], cam["TC Code"], count, 0, status
            ])
        auto_width(ws)


def create_detections_sheet(wb, detections_list):
    ws = wb.create_sheet("Detections List")
    headers = [
        "Shift", "Device ID", "Camera No", "Cam ID",
        "Camera Name", "Center Name", "City",
        "Detection Type", "Detection Time", "Image URL", "View"
    ]
    ws.append(headers)
    for col in range(1, len(headers) + 1):
        ws.cell(row=1, column=col).font = Font(bold=True)
    for row in detections_list:
        ws.append(row)
    auto_width(ws)


def create_analysis_sheet(wb, shift_counts, camera_rows):
    ws = wb.create_sheet("Analysis")
    camera_lookup = {(cam["device_id"], cam["camera_no"]): cam for cam in camera_rows}

    row = 1
    total_all = 0
    unique_online = set()

    for shift in SHIFT_TIMES:
        ws[f"A{row}"] = f"{shift} ANALYSIS"
        ws[f"A{row}"].font = Font(bold=True)
        row += 1

        total_cameras = len(camera_rows)
        total_detections = sum(shift_counts[shift].values())

        online_cameras = sum(1 for cam in camera_rows if cam["Status"] == "Online")
        offline_cameras = total_cameras - online_cameras
        online_rate = (online_cameras / total_cameras) * 100 if total_cameras else 0

        total_all += total_detections
        unique_online.update(shift_counts[shift].keys())

        for label, value in [
            ("Total Cameras Monitored", total_cameras),
            ("Online Cameras", online_cameras),
            ("Offline Cameras", offline_cameras),
            ("Total Detections", total_detections),
            ("Online Rate", f"{online_rate:.2f}%"),
        ]:
            ws[f"A{row}"] = label
            ws[f"B{row}"] = value
            row += 1

        row += 1
        ws[f"A{row}"] = f"Top 5 Most Active Cameras ({shift})"
        ws[f"A{row}"].font = Font(bold=True)
        row += 1

        for i, (key, count) in enumerate(
            sorted(shift_counts[shift].items(), key=lambda x: -x[1])[:5], 1
        ):
            cam = camera_lookup.get(key)
            if cam:
                ws[f"A{row}"] = f"{i}. {cam['Cam ID']} ({cam['Camera Name']})"
                ws[f"B{row}"] = f"{count} detections"
                row += 1

        row += 2

    ws[f"A{row}"] = "OVERALL SUMMARY"
    ws[f"A{row}"].font = Font(bold=True)
    row += 1
    ws[f"A{row}"] = "Total Unique Cameras Online Today"
    ws[f"B{row}"] = len(unique_online)
    row += 1
    ws[f"A{row}"] = "Total Detections (All Shifts)"
    ws[f"B{row}"] = total_all
    row += 1
    ws[f"A{row}"] = "Total Shift Duration"
    ws[f"B{row}"] = "6 hours (2 shifts × 3 hours)"
    auto_width(ws)


def main():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    camera_rows = load_camera_data()
    shift_counts, detections_list = collect_data(camera_rows)
    create_shift_sheets(wb, camera_rows, shift_counts)
    create_detections_sheet(wb, detections_list)
    create_analysis_sheet(wb, shift_counts, camera_rows)
    wb.save(OUTPUT_FILE)
    print(f"\n✅ FULL REPORT GENERATED: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()