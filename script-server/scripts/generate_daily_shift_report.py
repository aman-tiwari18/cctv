

#working


# import os
# import re
# from datetime import datetime, time
# import openpyxl
# from openpyxl.styles import Font

# # ================= PATHS =================

# # CAMERA_FILE = "/home/ubuntu/Desktop/aman/cctv-analytics-system/cctv_classfication/camera_list/master_classified.xlsx"
# CAMERA_FILE = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/complete_results_20260310_155335.xlsx"
# # RESULTS_FOLDER = "/home/ubuntu/Desktop/aman/cctv-analytics-system/results"
# RESULTS_FOLDER = "/home/ubuntu/Desktop/aman/cctv-analytics-system/results"

# BASE_IMAGE_URL = "http://103.42.50.241/cctv/images/results/"

# OUTPUT_FILE = datetime.now().strftime("%Y-%m-%d") + ".xlsx"

# # ================= SHIFT TIMES =================

# SHIFT_TIMES = {
#     "Shift1": (time(9, 0, 0), time(10, 30, 0)),
#     "Shift2": (time(13, 0, 0), time(14, 30, 0)),
#     "Shift3": (time(16, 30, 0), time(18, 0, 0))
# }

# # ==============================================


# def get_shift(image_time):
#     for shift, (start, end) in SHIFT_TIMES.items():
#         if start <= image_time <= end:
#             return shift
#     return None


# def extract_time(filename):
#     match = re.search(r'_(\d{8})_(\d{6})_', filename)
#     if match:
#         dt = datetime.strptime(match.group(1)+match.group(2), "%Y%m%d%H%M%S")
#         return dt
#     return None


# def extract_device_camera(filename):
#     parts = filename.split("_")
#     if len(parts) >= 2:
#         return parts[0], parts[1]
#     return None, None


# def normalize(text):
#     return re.sub(r'\s+', '', str(text)).lower()


# def load_camera_data():
#     wb = openpyxl.load_workbook(CAMERA_FILE)
#     ws = wb.active

#     camera_rows = []

#     print("Excel total data rows:", ws.max_row - 1)

#     for row in ws.iter_rows(min_row=2, values_only=True):

#         device_id = str(row[1]).strip() if row[1] is not None else None
#         camera_no = str(row[2]).strip() if row[2] is not None else None

#         # 🔥 Clean Cam Type (Extract category from JSON if present)
#         cam_type_raw = row[11]
#         cam_type_clean = cam_type_raw

#         if isinstance(cam_type_raw, str) and "category" in cam_type_raw:
#             try:
#                 import json
#                 cleaned = cam_type_raw.replace("```json", "").replace("```", "").strip()
#                 parsed = json.loads(cleaned)
#                 cam_type_clean = parsed.get("category", cam_type_raw)
#             except:
#                 cam_type_clean = cam_type_raw

#         camera_rows.append({
#             "device_id": device_id,
#             "camera_no": camera_no,
#             "City": row[6],
#             "Center": row[5],
#             "Cam ID": f"{device_id}_{camera_no}",
#             "Camera Name": row[4],
#             "Cam Type": cam_type_clean,
#             "TC Code": row[3],
#             "Status": row[12],   # 👈 ADD THIS
#         })



#     wb.close()
#     return camera_rows


# def collect_data(camera_keys, camera_rows):
#         # 🔥 Create lookup dictionary
#     camera_lookup = {
#         (cam["device_id"], cam["camera_no"]): cam
#         for cam in camera_rows
#     }

#     shift_counts = {s: {} for s in SHIFT_TIMES}
#     detections_list = []

#     for root, dirs, files in os.walk(RESULTS_FOLDER):

#         if "false_positives" in root.lower():
#             continue

#         for file in files:
#             if not file.lower().endswith(".jpg"):
#                 continue

#             dt = extract_time(file)
#             if not dt:
#                 continue

#             shift = get_shift(dt.time())
#             if not shift:
#                 continue

#             dev, cam = extract_device_camera(file)
#             key = (dev, cam)

#             if key not in camera_keys:
#                 continue

#             shift_counts[shift].setdefault(key, 0)
#             shift_counts[shift][key] += 1

#             cam_data = camera_lookup.get(key)

#             if cam_data:
#                 detections_list.append([
#                     shift,
#                     dev,
#                     cam,
#                     cam_data["Cam ID"],
#                     cam_data["Camera Name"],
#                     cam_data["Center"],
#                     cam_data["City"],
#                     "Detection",
#                     dt.strftime("%Y-%m-%d %H:%M:%S"),
#                     BASE_IMAGE_URL + file,
#                     "View"
#                 ])


#     return shift_counts, detections_list





# def auto_width(ws, max_width=35):
#     for col in ws.columns:
#         max_len = 0
#         col_letter = col[0].column_letter

#         for cell in col:
#             if cell.value:
#                 max_len = max(max_len, len(str(cell.value)))

#         adjusted_width = min(max_len + 2, max_width)  # 🔥 limit width
#         ws.column_dimensions[col_letter].width = adjusted_width




# def create_shift_sheets(wb, camera_rows, shift_counts):

#     headers = [
#         "City","Center","Cam ID","Camera Name",
#         "Cam Type","TC Code",
#         "Events(Excluding Rejected Events)","Rejected Events","Camera Status"
#     ]

#     for shift in SHIFT_TIMES:

#         ws = wb.create_sheet(shift)
#         ws.append(headers)

#         for col in range(1,len(headers)+1):
#             ws.cell(row=1,column=col).font = Font(bold=True)

#         # 🔥 iterate ALL excel rows (not dictionary keys)
#         for cam in camera_rows:

#             key = (cam["device_id"], cam["camera_no"])
#             count = shift_counts[shift].get(key, 0)

#             status = "Online" if cam["Status"] == "Accessible" else "Offline"

#             ws.append([
#                 cam["City"],
#                 cam["Center"],
#                 cam["Cam ID"],
#                 cam["Camera Name"],
#                 cam["Cam Type"],
#                 cam["TC Code"],
#                 count,
#                 0,
#                 status
#             ])

#         auto_width(ws)


# def create_detections_sheet(wb, detections_list):

#     ws = wb.create_sheet("Detections List")

#     headers = [
#         "Shift","Device ID","Camera No","Cam ID",
#         "Camera Name","Center Name","City",
#         "Detection Type","Detection Time","Image URL","View"
#     ]

#     ws.append(headers)

#     for col in range(1,len(headers)+1):
#         ws.cell(row=1,column=col).font = Font(bold=True)

#     for row in detections_list:
#         ws.append(row)

#     auto_width(ws)



# def create_analysis_sheet(wb, shift_counts, camera_rows):

#     ws = wb.create_sheet("Analysis")

#     # 🔥 create lookup dictionary from camera_rows
#     camera_lookup = {
#         (cam["device_id"], cam["camera_no"]): cam
#         for cam in camera_rows
#     }

#     row = 1
#     total_all = 0
#     unique_online = set()

#     for shift in SHIFT_TIMES:

#         ws[f"A{row}"] = f"{shift} ANALYSIS"
#         ws[f"A{row}"].font = Font(bold=True)
#         row += 1

#         total_cameras = len(camera_rows)
#         total_detections = sum(shift_counts[shift].values())

#         # 🔥 Accessible based calculation
#         online_cameras = sum(1 for cam in camera_rows if cam["Status"] == "Accessible")
#         offline_cameras = total_cameras - online_cameras

#         online_rate = (online_cameras / total_cameras) * 100 if total_cameras else 0


#         total_all += total_detections
#         unique_online.update(shift_counts[shift].keys())

#         data = [
#             ("Total Cameras Monitored", total_cameras),
#             ("Online Cameras", online_cameras),
#             ("Offline Cameras", offline_cameras),
#             ("Total Detections", total_detections),
#             ("Online Rate", f"{online_rate:.2f}%")
#         ]

#         for label, value in data:
#             ws[f"A{row}"] = label
#             ws[f"B{row}"] = value
#             row += 1

#         row += 1

#         ws[f"A{row}"] = f"Top 5 Most Active Cameras ({shift})"
#         ws[f"A{row}"].font = Font(bold=True)
#         row += 1

#         top5 = sorted(
#             shift_counts[shift].items(),
#             key=lambda x: x[1],
#             reverse=True
#         )[:5]

#         for i, (key, count) in enumerate(top5, 1):

#             cam = camera_lookup.get(key)

#             if cam:
#                 ws[f"A{row}"] = f"{i}. {cam['Cam ID']} ({cam['Camera Name']})"
#                 ws[f"B{row}"] = f"{count} detections"
#                 row += 1

#         row += 2

#     ws[f"A{row}"] = "OVERALL SUMMARY"
#     ws[f"A{row}"].font = Font(bold=True)
#     row += 1

#     ws[f"A{row}"] = "Total Unique Cameras Online Today"
#     ws[f"B{row}"] = len(unique_online)
#     row += 1

#     ws[f"A{row}"] = "Total Detections (All Shifts)"
#     ws[f"B{row}"] = total_all
#     row += 1

#     ws[f"A{row}"] = "Total Shift Duration"
#     ws[f"B{row}"] = "4.5 hours (3 shifts × 1.5 hours)"

#     auto_width(ws)



# def main():
#     wb = openpyxl.Workbook()
#     wb.remove(wb.active)

#     camera_rows = load_camera_data()

#     # create detection key set from rows
#     camera_keys = set(
#         (cam["device_id"], cam["camera_no"])
#         for cam in camera_rows
#     )

#     shift_counts, detections_list = collect_data(camera_keys, camera_rows)


#     create_shift_sheets(wb, camera_rows, shift_counts)
#     create_detections_sheet(wb, detections_list)
#     create_analysis_sheet(wb, shift_counts, camera_rows)

#     wb.save(OUTPUT_FILE)
#     print(f"\n✅ FULL REPORT GENERATED: {OUTPUT_FILE}")



# if __name__ == "__main__":
#     main()
























#test

# import os
# import re
# import sys
# from datetime import datetime, time
# import openpyxl
# from openpyxl.styles import Font

# # ================= PATHS =================

# # CAMERA_FILE = "/home/ubuntu/Desktop/aman/cctv-analytics-system/cctv_classfication/camera_list/master_classified.xlsx"
# CAMERA_FILE = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/complete_results_20260310_155335.xlsx"
# # RESULTS_FOLDER = "/home/ubuntu/Desktop/aman/cctv-analytics-system/results"
# RESULTS_FOLDER = "/home/ubuntu/Desktop/aman/cctv-analytics-system/results"

# BASE_IMAGE_URL = "http://103.42.50.241/cctv/images/results/"

# if len(sys.argv) > 1:
#     TARGET_DATE = sys.argv[1]
# else:
#     TARGET_DATE = datetime.now().strftime("%Y-%m-%d")

# OUTPUT_FILE = TARGET_DATE + ".xlsx"

# print(f"Generating report for date: {TARGET_DATE}")



# # ================= SHIFT TIMES =================

# SHIFT_TIMES = {
#     "Shift1": (time(9, 0, 0), time(10, 30, 0)),
#     "Shift2": (time(12, 30, 0), time(14, 00, 0)),
#     "Shift3": (time(16, 0, 0), time(17, 30, 0))
# }

# # ==============================================


# def get_shift(image_time):
#     for shift, (start, end) in SHIFT_TIMES.items():
#         if start <= image_time <= end:
#             return shift
#     return None


# def extract_time(filename):
#     match = re.search(r'_(\d{8})_(\d{6})_', filename)
#     if match:
#         dt = datetime.strptime(match.group(1)+match.group(2), "%Y%m%d%H%M%S")
#         return dt
#     return None


# # def extract_device_camera(filename):
# #     parts = filename.split("_")
# #     if len(parts) >= 2:
# #         return parts[0], parts[1]
# #     return None, None


# def extract_device_camera(filename):

#     # device id (first number)
#     dev_match = re.search(r'^(\d+)', filename)

#     # date part
#     cam_match = re.search(r'_(\d{8})_', filename)

#     if dev_match and cam_match:

#         device_id = dev_match.group(1)

#         # camera name is everything between device_id and date
#         parts = filename.split("_" + cam_match.group(1))
#         prefix = parts[0]

#         camera_name = prefix.split("_")[-1]

#         return device_id, camera_name

#     return None, None
    


# def normalize(text):
#     return re.sub(r'\s+', '', str(text)).lower()


# def load_camera_data():
#     wb = openpyxl.load_workbook(CAMERA_FILE)
#     ws = wb.active

#     camera_rows = []

#     print("Excel total data rows:", ws.max_row - 1)

#     for row in ws.iter_rows(min_row=2, values_only=True):

#         device_id = str(row[1]).strip() if row[1] is not None else None
#         camera_no = str(row[2]).strip() if row[2] is not None else None

#         # 🔥 Clean Cam Type (Extract category from JSON if present)
#         cam_type_raw = row[11]
#         cam_type_clean = cam_type_raw

#         if isinstance(cam_type_raw, str) and "category" in cam_type_raw:
#             try:
#                 import json
#                 cleaned = cam_type_raw.replace("```json", "").replace("```", "").strip()
#                 parsed = json.loads(cleaned)
#                 cam_type_clean = parsed.get("category", cam_type_raw)
#             except:
#                 cam_type_clean = cam_type_raw

#         camera_rows.append({
#             "device_id": device_id,
#             "camera_no": camera_no,
#             "City": row[6],
#             "Center": row[5],
#             "Cam ID": f"{device_id}_{camera_no}",
#             "Camera Name": row[4],
#             "Cam Type": cam_type_clean,
#             "TC Code": row[3],
#             "Status": row[12],   # 👈 ADD THIS
#         })



#     wb.close()
#     return camera_rows


# def collect_data(camera_keys, camera_rows):

#     # 🔥 Create lookup dictionary
#     camera_lookup = {
#         (cam["device_id"], cam["camera_no"]): cam
#         for cam in camera_rows
#     }

#     shift_counts = {s: {} for s in SHIFT_TIMES}
#     detections_list = []

#     # 🔥 Only scan these TCS detection folders
#     TCS_DETECTION_FOLDERS = [
#         "crowd_detection",
#         "entry_exit_detection",
#         "intruder_detection",
#         "invigilator_detection",
#         "phone_detection",
#         "proximity_detection",
#         "server_room_detection"
#     ]

#     for folder in TCS_DETECTION_FOLDERS:

#         folder_path = os.path.join(RESULTS_FOLDER, "tcs_detections", folder)

#         if not os.path.exists(folder_path):
#             continue

#         for root, dirs, files in os.walk(folder_path):

#             # 🔥 Skip false positive folders
#             if "false_positives" in root.lower():
#                 continue

#             for file in files:

#                 # 🔥 Only jpg images
#                 if not file.lower().endswith(".jpg"):
#                     continue

#                 dt = extract_time(file)
#                 if not dt:
#                     continue

#                 # date filter
#                 if dt.strftime("%Y-%m-%d") != TARGET_DATE:
#                     continue

#                 shift = get_shift(dt.time())
#                 if not shift:
#                     continue

#                 dev, cam = extract_device_camera(file)
#                 key = (dev, cam)

#                 if key not in camera_keys:
#                     continue

#                 shift_counts[shift].setdefault(key, 0)
#                 shift_counts[shift][key] += 1

#                 cam_data = camera_lookup.get(key)

#                 if cam_data:
#                     detections_list.append([
#                         shift,
#                         dev,
#                         cam,
#                         cam_data["Cam ID"],
#                         cam_data["Camera Name"],
#                         cam_data["Center"],
#                         cam_data["City"],
#                         "Detection",
#                         dt.strftime("%Y-%m-%d %H:%M:%S"),
#                         BASE_IMAGE_URL + file,
#                         "View"
#                     ])

#     return shift_counts, detections_list



# def auto_width(ws, max_width=35):
#     for col in ws.columns:
#         max_len = 0
#         col_letter = col[0].column_letter

#         for cell in col:
#             if cell.value:
#                 max_len = max(max_len, len(str(cell.value)))

#         adjusted_width = min(max_len + 2, max_width)  # 🔥 limit width
#         ws.column_dimensions[col_letter].width = adjusted_width




# def create_shift_sheets(wb, camera_rows, shift_counts):

#     headers = [
#         "City","Center","Cam ID","Camera Name",
#         "Cam Type","TC Code",
#         "Events(Excluding Rejected Events)","Rejected Events","Camera Status"
#     ]

#     for shift in SHIFT_TIMES:

#         ws = wb.create_sheet(shift)
#         ws.append(headers)

#         for col in range(1,len(headers)+1):
#             ws.cell(row=1,column=col).font = Font(bold=True)

#         # 🔥 iterate ALL excel rows (not dictionary keys)
#         for cam in camera_rows:

#             key = (cam["device_id"], cam["camera_no"])
#             count = shift_counts[shift].get(key, 0)

#             status = "Online" if cam["Status"] == "Accessible" else "Offline"

#             ws.append([
#                 cam["City"],
#                 cam["Center"],
#                 cam["Cam ID"],
#                 cam["Camera Name"],
#                 cam["Cam Type"],
#                 cam["TC Code"],
#                 count,
#                 0,
#                 status
#             ])

#         auto_width(ws)


# def create_detections_sheet(wb, detections_list):

#     ws = wb.create_sheet("Detections List")

#     headers = [
#         "Shift","Device ID","Camera No","Cam ID",
#         "Camera Name","Center Name","City",
#         "Detection Type","Detection Time","Image URL","View"
#     ]

#     ws.append(headers)

#     for col in range(1,len(headers)+1):
#         ws.cell(row=1,column=col).font = Font(bold=True)

#     for row in detections_list:
#         ws.append(row)

#     auto_width(ws)



# def create_analysis_sheet(wb, shift_counts, camera_rows):

#     ws = wb.create_sheet("Analysis")

#     # 🔥 create lookup dictionary from camera_rows
#     camera_lookup = {
#         (cam["device_id"], cam["camera_no"]): cam
#         for cam in camera_rows
#     }

#     row = 1
#     total_all = 0
#     unique_online = set()

#     for shift in SHIFT_TIMES:

#         ws[f"A{row}"] = f"{shift} ANALYSIS"
#         ws[f"A{row}"].font = Font(bold=True)
#         row += 1

#         total_cameras = len(camera_rows)
#         total_detections = sum(shift_counts[shift].values())

#         # 🔥 Accessible based calculation
#         online_cameras = sum(1 for cam in camera_rows if cam["Status"] == "Accessible")
#         offline_cameras = total_cameras - online_cameras

#         online_rate = (online_cameras / total_cameras) * 100 if total_cameras else 0


#         total_all += total_detections
#         unique_online.update(shift_counts[shift].keys())

#         data = [
#             ("Total Cameras Monitored", total_cameras),
#             ("Online Cameras", online_cameras),
#             ("Offline Cameras", offline_cameras),
#             ("Total Detections", total_detections),
#             ("Online Rate", f"{online_rate:.2f}%")
#         ]

#         for label, value in data:
#             ws[f"A{row}"] = label
#             ws[f"B{row}"] = value
#             row += 1

#         row += 1

#         ws[f"A{row}"] = f"Top 5 Most Active Cameras ({shift})"
#         ws[f"A{row}"].font = Font(bold=True)
#         row += 1

#         top5 = sorted(
#             shift_counts[shift].items(),
#             key=lambda x: x[1],
#             reverse=True
#         )[:5]

#         for i, (key, count) in enumerate(top5, 1):

#             cam = camera_lookup.get(key)

#             if cam:
#                 ws[f"A{row}"] = f"{i}. {cam['Cam ID']} ({cam['Camera Name']})"
#                 ws[f"B{row}"] = f"{count} detections"
#                 row += 1

#         row += 2

#     ws[f"A{row}"] = "OVERALL SUMMARY"
#     ws[f"A{row}"].font = Font(bold=True)
#     row += 1

#     ws[f"A{row}"] = "Total Unique Cameras Online Today"
#     ws[f"B{row}"] = len(unique_online)
#     row += 1

#     ws[f"A{row}"] = "Total Detections (All Shifts)"
#     ws[f"B{row}"] = total_all
#     row += 1

#     ws[f"A{row}"] = "Total Shift Duration"
#     ws[f"B{row}"] = "4.5 hours (3 shifts × 1.5 hours)"

#     auto_width(ws)



# def main():
#     wb = openpyxl.Workbook()
#     wb.remove(wb.active)

#     camera_rows = load_camera_data()

#     # create detection key set from rows
#     camera_keys = set(
#         (cam["device_id"], cam["camera_no"])
#         for cam in camera_rows
#     )

#     shift_counts, detections_list = collect_data(camera_keys, camera_rows)


#     create_shift_sheets(wb, camera_rows, shift_counts)
#     create_detections_sheet(wb, detections_list)
#     create_analysis_sheet(wb, shift_counts, camera_rows)

#     wb.save(OUTPUT_FILE)
#     print(f"\n✅ FULL REPORT GENERATED: {OUTPUT_FILE}")



# if __name__ == "__main__":
#     main()





















#working but detection shi nhi aa rhe
# import os
# import re
# import sys
# import json
# from datetime import datetime, time
# import openpyxl
# from openpyxl.styles import Font

# # ================= PATHS =================

# CAMERA_FILE = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/complete_results_20260311_115500.xlsx"
# RESULTS_FOLDER = "/home/suvam/projects/cctv/cctv-analytics-system/results"

# BASE_IMAGE_URL = "http://103.42.50.241/cctv/images/results/"

# if len(sys.argv) > 1:
#     TARGET_DATE = sys.argv[1]
# else:
#     TARGET_DATE = datetime.now().strftime("%Y-%m-%d")

# OUTPUT_FILE = TARGET_DATE + ".xlsx"

# print(f"Generating report for date: {TARGET_DATE}")


# # ================= SHIFT TIMES =================

# SHIFT_TIMES = {
#     "Shift1": (time(9, 0, 0), time(10, 30, 0)),
#     "Shift2": (time(12, 30, 0), time(14, 00, 0)),
#     "Shift3": (time(16, 0, 0), time(17, 30, 0))
# }

# # ==============================================


# def get_shift(image_time):
#     for shift, (start, end) in SHIFT_TIMES.items():
#         if start <= image_time <= end:
#             return shift
#     return None


# def extract_time(filename):
#     """Extract datetime from filename - looks for _YYYYMMDD_HHMMSS_ pattern"""
#     match = re.search(r'_(\d{8})_(\d{6})(?:_|\.)', filename)
#     if match:
#         try:
#             dt = datetime.strptime(match.group(1) + match.group(2), "%Y%m%d%H%M%S")
#             return dt
#         except:
#             return None
#     return None


# def extract_device_camera(filename):
#     """
#     Extract (device_id, camera_name) from various filename patterns.

#     Supported patterns:
#       1. violation_1074_1074_LAB1CAM2_1074_1074_LAB1CAM2_20260105_092822_001703.jpg
#          → device=1074, cam=LAB1CAM2

#       2. phone_detected_1270-Modern_..._1270_UPSRM_S29_1270-..._1270_UPSRM_S29_20260309_131852.jpg
#          → device=1270, cam=UPSRM_S29

#       3. 1270-Modern_..._1270_LAB-18-A_no_targets_20260306_133943.jpg
#          → device=1270, cam=LAB-18-A

#       4. 195-Sri_..._195_SERVER_ROOM_195-Sri_..._195_SERVER_ROOM_20260123_151325_persons5_conf0.80.jpg
#          → device=195, cam=SERVER_ROOM

#     Strategy:
#       - Find the date block _YYYYMMDD_ to know where metadata ends
#       - Extract the last numeric device_id just before the date block
#       - Camera name = the token immediately before device_id in that segment
#     """

#     # Find position of date pattern
#     date_match = re.search(r'_(\d{8})_\d{6}', filename)
#     if not date_match:
#         return None, None

#     # Work only with the part before the date
#     prefix = filename[:date_match.start()]

#     # Split by underscore
#     parts = prefix.split("_")

#     # Find last pure numeric part → that's device_id
#     device_id = None
#     device_idx = None
#     for i in range(len(parts) - 1, -1, -1):
#         if re.fullmatch(r'\d+', parts[i]):
#             device_id = parts[i]
#             device_idx = i
#             break

#     if device_id is None or device_idx is None:
#         return None, None

#     # Camera name: collect tokens AFTER the device_id until end of prefix
#     # But handle hyphenated cam names like LAB-18-A, SERVER_ROOM, UPSRM_S29
#     cam_parts = parts[device_idx + 1:]

#     if not cam_parts:
#         # Fallback: try token just before device_id
#         cam_parts = parts[device_idx - 1: device_idx] if device_idx > 0 else []

#     camera_name = "_".join(cam_parts).strip("_") if cam_parts else None

#     # Clean up any trailing detection-type suffixes like _no_targets, _annotated, _static_person
#     SUBFOLDER_SUFFIXES = ["no_targets", "annotated", "static_person", "false_positives"]
#     if camera_name:
#         for suffix in SUBFOLDER_SUFFIXES:
#             if camera_name.lower().endswith(suffix):
#                 camera_name = camera_name[: -len(suffix)].strip("_")
#                 break

#     if not camera_name:
#         return None, None

#     return device_id, camera_name


# def normalize(text):
#     return re.sub(r'\s+', '', str(text)).lower()


# def load_camera_data():
#     wb = openpyxl.load_workbook(CAMERA_FILE)
#     ws = wb.active

#     camera_rows = []

#     print("Excel total data rows:", ws.max_row - 1)

#     for row in ws.iter_rows(min_row=2, values_only=True):

#         device_id = str(row[1]).strip() if row[1] is not None else None
#         camera_no = str(row[2]).strip() if row[2] is not None else None

#         # Clean Cam Type (Extract category from JSON if present)
#         cam_type_raw = row[11]
#         cam_type_clean = cam_type_raw

#         if isinstance(cam_type_raw, str) and "category" in cam_type_raw:
#             try:
#                 cleaned = cam_type_raw.replace("```json", "").replace("```", "").strip()
#                 parsed = json.loads(cleaned)
#                 cam_type_clean = parsed.get("category", cam_type_raw)
#             except:
#                 cam_type_clean = cam_type_raw

#         camera_rows.append({
#             "device_id": device_id,
#             "camera_no": camera_no,
#             "City": row[6],
#             "Center": row[5],
#             "Cam ID": f"{device_id}_{camera_no}",
#             "Camera Name": row[4],
#             "Cam Type": cam_type_clean,
#             "TC Code": row[3],
#             "Status": row[12],
#         })

#     wb.close()
#     return camera_rows


# def build_camera_lookup(camera_rows):
#     """
#     Build lookup: (device_id, camera_no_normalized) → cam_data

#     Also builds a secondary lookup by device_id only (for partial matches)
#     """
#     exact_lookup = {}
#     device_lookup = {}  # device_id → list of cams

#     for cam in camera_rows:
#         dev = str(cam["device_id"]).strip()
#         cam_no = normalize(str(cam["camera_no"]))

#         exact_lookup[(dev, cam_no)] = cam

#         device_lookup.setdefault(dev, []).append(cam)

#     return exact_lookup, device_lookup


# def match_camera(device_id, camera_name, exact_lookup, device_lookup):
#     """
#     Try to find matching camera row.
#     1. Exact match: (device_id, normalize(camera_name))
#     2. Partial match: camera_name is substring of cam_no or vice versa (same device)
#     """
#     if not device_id or not camera_name:
#         return None

#     cam_norm = normalize(camera_name)

#     # 1. Exact match
#     key = (device_id, cam_norm)
#     if key in exact_lookup:
#         return exact_lookup[key]

#     # 2. Partial match within same device
#     candidates = device_lookup.get(device_id, [])
#     for cam in candidates:
#         cam_no_norm = normalize(str(cam["camera_no"]))
#         if cam_norm in cam_no_norm or cam_no_norm in cam_norm:
#             return cam

#     return None


# def collect_data(camera_rows):

#     exact_lookup, device_lookup = build_camera_lookup(camera_rows)

#     shift_counts = {s: {} for s in SHIFT_TIMES}
#     detections_list = []

#     # All valid camera keys (device_id, camera_no normalized)
#     camera_keys = set(
#         (cam["device_id"], normalize(str(cam["camera_no"])))
#         for cam in camera_rows
#     )

#     TCS_DETECTION_FOLDERS = [
#         "crowd_detection",
#         "entry_exit_detection",
#         "intruder_detection",
#         "invigilator_detection",
#         "phone_detection",
#         "proximity_detection",
#         "server_room_detection"
#     ]

#     matched = 0
#     unmatched = 0
#     unmatched_samples = []

#     for folder in TCS_DETECTION_FOLDERS:

#         folder_path = os.path.join(RESULTS_FOLDER, "tcs_detections", folder)

#         if not os.path.exists(folder_path):
#             continue

#         # os.walk covers both direct files AND subfolders (annotated/no_targets/etc.)
#         for root, dirs, files in os.walk(folder_path):

#             # Skip false positive folders
#             if "false_positives" in root.lower():
#                 continue

#             for file in files:

#                 if not file.lower().endswith(".jpg"):
#                     continue

#                 dt = extract_time(file)
#                 if not dt:
#                     continue

#                 # Date filter
#                 if dt.strftime("%Y-%m-%d") != TARGET_DATE:
#                     continue

#                 shift = get_shift(dt.time())
#                 if not shift:
#                     continue

#                 dev, cam = extract_device_camera(file)

#                 cam_data = match_camera(dev, cam, exact_lookup, device_lookup)

#                 if not cam_data:
#                     unmatched += 1
#                     if len(unmatched_samples) < 10:
#                         unmatched_samples.append(f"dev={dev} cam={cam} | file={file}")
#                     continue

#                 matched += 1
#                 key = (cam_data["device_id"], cam_data["camera_no"])

#                 shift_counts[shift].setdefault(key, 0)
#                 shift_counts[shift][key] += 1

#                 detections_list.append([
#                     shift,
#                     cam_data["device_id"],
#                     cam_data["camera_no"],
#                     cam_data["Cam ID"],
#                     cam_data["Camera Name"],
#                     cam_data["Center"],
#                     cam_data["City"],
#                     folder.replace("_detection", "").replace("_", " ").title(),
#                     dt.strftime("%Y-%m-%d %H:%M:%S"),
#                     BASE_IMAGE_URL + file,
#                     "View"
#                 ])

#     print(f"\n✅ Matched detections   : {matched}")
#     print(f"❌ Unmatched detections : {unmatched}")
#     if unmatched_samples:
#         print("   Unmatched samples:")
#         for s in unmatched_samples:
#             print("   ", s)

#     return shift_counts, detections_list


# def auto_width(ws, max_width=35):
#     for col in ws.columns:
#         max_len = 0
#         col_letter = col[0].column_letter
#         for cell in col:
#             if cell.value:
#                 max_len = max(max_len, len(str(cell.value)))
#         ws.column_dimensions[col_letter].width = min(max_len + 2, max_width)


# def create_shift_sheets(wb, camera_rows, shift_counts):

#     headers = [
#         "City", "Center", "Cam ID", "Camera Name",
#         "Cam Type", "TC Code",
#         "Events(Excluding Rejected Events)", "Rejected Events", "Camera Status"
#     ]

#     for shift in SHIFT_TIMES:

#         ws = wb.create_sheet(shift)
#         ws.append(headers)

#         for col in range(1, len(headers) + 1):
#             ws.cell(row=1, column=col).font = Font(bold=True)

#         for cam in camera_rows:
#             key = (cam["device_id"], cam["camera_no"])
#             count = shift_counts[shift].get(key, 0)
#             status = "Online" if cam["Status"] == "Accessible" else "Offline"

#             ws.append([
#                 cam["City"],
#                 cam["Center"],
#                 cam["Cam ID"],
#                 cam["Camera Name"],
#                 cam["Cam Type"],
#                 cam["TC Code"],
#                 count,
#                 0,
#                 status
#             ])

#         auto_width(ws)


# def create_detections_sheet(wb, detections_list):

#     ws = wb.create_sheet("Detections List")

#     headers = [
#         "Shift", "Device ID", "Camera No", "Cam ID",
#         "Camera Name", "Center Name", "City",
#         "Detection Type", "Detection Time", "Image URL", "View"
#     ]

#     ws.append(headers)

#     for col in range(1, len(headers) + 1):
#         ws.cell(row=1, column=col).font = Font(bold=True)

#     for row in detections_list:
#         ws.append(row)

#     auto_width(ws)


# def create_analysis_sheet(wb, shift_counts, camera_rows):

#     ws = wb.create_sheet("Analysis")

#     camera_lookup = {
#         (cam["device_id"], cam["camera_no"]): cam
#         for cam in camera_rows
#     }

#     row = 1
#     total_all = 0
#     unique_online = set()

#     for shift in SHIFT_TIMES:

#         ws[f"A{row}"] = f"{shift} ANALYSIS"
#         ws[f"A{row}"].font = Font(bold=True)
#         row += 1

#         total_cameras = len(camera_rows)
#         total_detections = sum(shift_counts[shift].values())

#         online_cameras = sum(1 for cam in camera_rows if cam["Status"] == "Accessible")
#         offline_cameras = total_cameras - online_cameras
#         online_rate = (online_cameras / total_cameras) * 100 if total_cameras else 0

#         total_all += total_detections
#         unique_online.update(shift_counts[shift].keys())

#         data = [
#             ("Total Cameras Monitored", total_cameras),
#             ("Online Cameras", online_cameras),
#             ("Offline Cameras", offline_cameras),
#             ("Total Detections", total_detections),
#             ("Online Rate", f"{online_rate:.2f}%")
#         ]

#         for label, value in data:
#             ws[f"A{row}"] = label
#             ws[f"B{row}"] = value
#             row += 1

#         row += 1

#         ws[f"A{row}"] = f"Top 5 Most Active Cameras ({shift})"
#         ws[f"A{row}"].font = Font(bold=True)
#         row += 1

#         top5 = sorted(
#             shift_counts[shift].items(),
#             key=lambda x: x[1],
#             reverse=True
#         )[:5]

#         for i, (key, count) in enumerate(top5, 1):
#             cam = camera_lookup.get(key)
#             if cam:
#                 ws[f"A{row}"] = f"{i}. {cam['Cam ID']} ({cam['Camera Name']})"
#                 ws[f"B{row}"] = f"{count} detections"
#                 row += 1

#         row += 2

#     ws[f"A{row}"] = "OVERALL SUMMARY"
#     ws[f"A{row}"].font = Font(bold=True)
#     row += 1

#     ws[f"A{row}"] = "Total Unique Cameras Online Today"
#     ws[f"B{row}"] = len(unique_online)
#     row += 1

#     ws[f"A{row}"] = "Total Detections (All Shifts)"
#     ws[f"B{row}"] = total_all
#     row += 1

#     ws[f"A{row}"] = "Total Shift Duration"
#     ws[f"B{row}"] = "4.5 hours (3 shifts × 1.5 hours)"

#     auto_width(ws)


# def main():
#     wb = openpyxl.Workbook()
#     wb.remove(wb.active)

#     camera_rows = load_camera_data()

#     shift_counts, detections_list = collect_data(camera_rows)

#     create_shift_sheets(wb, camera_rows, shift_counts)
#     create_detections_sheet(wb, detections_list)
#     create_analysis_sheet(wb, shift_counts, camera_rows)

#     wb.save(OUTPUT_FILE)
#     print(f"\n✅ FULL REPORT GENERATED: {OUTPUT_FILE}")


# if __name__ == "__main__":
#     main()



























#test
import os
import re
import sys
import json
from datetime import datetime, time
import openpyxl
from openpyxl.styles import Font

# ================= PATHS =================

CAMERA_FILE = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/complete_results_20260312_113406.xlsx"
RESULTS_FOLDER = "/home/suvam/projects/cctv/cctv-analytics-system/results"

BASE_IMAGE_URL = "http://103.42.50.241/cctv/images/results/"

if len(sys.argv) > 1:
    TARGET_DATE = sys.argv[1]
else:
    TARGET_DATE = datetime.now().strftime("%Y-%m-%d")

OUTPUT_FILE = TARGET_DATE + ".xlsx"

print(f"Generating report for date: {TARGET_DATE}")


# ================= SHIFT TIMES =================

SHIFT_TIMES = {
    "Shift1": (time(9, 0, 0), time(10, 30, 0)),
    "Shift2": (time(12, 30, 0), time(14, 00, 0)),
    "Shift3": (time(16, 0, 0), time(17, 30, 0))
}

# ==============================================


def get_shift(image_time):
    for shift, (start, end) in SHIFT_TIMES.items():
        if start <= image_time <= end:
            return shift
    return None


def extract_time(filename):
    """Extract datetime from filename - looks for _YYYYMMDD_HHMMSS_ pattern"""
    match = re.search(r'_(\d{8})_(\d{6})(?:_|\.)', filename)
    if match:
        try:
            dt = datetime.strptime(match.group(1) + match.group(2), "%Y%m%d%H%M%S")
            return dt
        except:
            return None
    return None


def extract_device_camera(filename):
    """
    Improved extraction that handles all observed patterns.
    Strategy:
    - Find date block _YYYYMMDD_ 
    - In prefix, find last occurrence of a repeated pattern: device_id appears twice
    - Known suffixes to strip from end: static_person_N, annotated, no_targets, persons\d, conf\d
    """
    
    # Strip known trailing suffixes before date
    # e.g. _static_person_0, _persons1_conf0.59, _000145, etc.
    date_match = re.search(r'(_\d{8}_\d{6})', filename)
    if not date_match:
        return None, None

    prefix = filename[:date_match.start()]
    
    # Remove known suffix noise at end of prefix
    prefix = re.sub(r'_(static_person_\d+|annotated|no_targets|false_positives)$', '', prefix, flags=re.IGNORECASE)

    parts = prefix.split("_")

    # Find the LAST pure numeric token of length >= 3 (real device IDs are 4+ digits)
    # Avoid matching single digits like _0_ from static_person_0
    device_id = None
    device_idx = None
    for i in range(len(parts) - 1, -1, -1):
        if re.fullmatch(r'\d{3,}', parts[i]):  # at least 3 digits
            device_id = parts[i]
            device_idx = i
            break

    if device_id is None:
        return None, None

    # Camera name: tokens after device_idx
    cam_parts = parts[device_idx + 1:]
    
    # Clean cam_parts: remove trailing noise tokens
    NOISE_TOKENS = re.compile(r'^(persons\d*|conf[\d.]+|annotated|no|targets|static|person|\d{1,3})$', re.IGNORECASE)
    while cam_parts and NOISE_TOKENS.match(cam_parts[-1]):
        cam_parts.pop()

    camera_name = "_".join(cam_parts).strip("_") if cam_parts else None

    if not camera_name:
        return None, None

    return device_id, camera_name


def normalize(text):
    return re.sub(r'\s+', '', str(text)).lower()


def load_camera_data():
    wb = openpyxl.load_workbook(CAMERA_FILE)
    ws = wb.active
    camera_rows = []

    for row in ws.iter_rows(min_row=2, values_only=True):
        device_id = str(row[1]).strip() if row[1] is not None else None
        camera_name_raw = str(row[7]).strip() if row[7] is not None else None  # "33981/GF LIFT AREA /S45"

        # Extract S-number from camera name: S45, S112, S060 etc.
        s_number = None
        if camera_name_raw:
            s_match = re.search(r'/S(\d+)\s*$', camera_name_raw, re.IGNORECASE)
            if s_match:
                s_number = "S" + s_match.group(1).lstrip("0") or "S0"
                # Normalize: S045 → S45, S060 → S60
                s_number = "S" + str(int(s_match.group(1)))

        cam_type_raw = row[10]
        cam_type_clean = cam_type_raw

        if isinstance(cam_type_raw, str) and "category" in cam_type_raw:
            try:
                cleaned = cam_type_raw.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(cleaned)
                cam_type_clean = parsed.get("category", cam_type_raw)
            except:
                cam_type_clean = cam_type_raw

        camera_rows.append({
            "device_id": device_id,
            "camera_no": camera_name_raw,       # full name for display
            "s_number": s_number,               # "S45" for matching
            "City": row[3],
            "Center": row[2],
            "Cam ID": f"{device_id}_{s_number}",
            "Camera Name": camera_name_raw,
            "Cam Type": cam_type_clean,
            "TC Code": row[1],
            "Status": row[12],
        })

    wb.close()
    return camera_rows



def build_camera_lookup(camera_rows):
    exact_lookup = {}    # (device_id, "S45") → cam
    device_lookup = {}   # device_id → list of cams

    for cam in camera_rows:
        dev = str(cam["device_id"]).strip()
        device_lookup.setdefault(dev, []).append(cam)

        if cam["s_number"]:
            exact_lookup[(dev, cam["s_number"])] = cam

    return exact_lookup, device_lookup


def extract_s_number(camera_name):
    """Extract S-number from filename camera part: FRISKING_S03 → S3, RECPT_S40 → S40"""
    if not camera_name:
        return None
    s_match = re.search(r'_S(\d+)$', camera_name, re.IGNORECASE)
    if s_match:
        return "S" + str(int(s_match.group(1)))  # S03 → S3, S060 → S60
    return None



def match_camera(device_id, camera_name, exact_lookup, device_lookup):
    if not device_id or not camera_name:
        return None

    s_num = extract_s_number(camera_name)

    # 1. S-number exact match
    if s_num:
        key = (device_id, s_num)
        if key in exact_lookup:
            return exact_lookup[key]

    # 2. Fallback: normalize full name match
    cam_norm = normalize(camera_name)
    for cam in device_lookup.get(device_id, []):
        if cam_norm in normalize(str(cam["camera_no"])) or normalize(str(cam["camera_no"])) in cam_norm:
            return cam

    return None


def collect_data(camera_rows):

    exact_lookup, device_lookup = build_camera_lookup(camera_rows)

    shift_counts = {s: {} for s in SHIFT_TIMES}
    detections_list = []

    # All valid camera keys (device_id, camera_no normalized)
    camera_keys = set(
        (cam["device_id"], normalize(str(cam["camera_no"])))
        for cam in camera_rows
    )

    TCS_DETECTION_FOLDERS = [
        "crowd_detection",
        "entry_exit_detection",
        "intruder_detection",
        "invigilator_detection",
        "phone_detection",
        "proximity_detection",
        "server_room_detection"
    ]

    matched = 0
    unmatched = 0
    unmatched_samples = []

    for folder in TCS_DETECTION_FOLDERS:

        folder_path = os.path.join(RESULTS_FOLDER, "tcs_detections", folder)

        if not os.path.exists(folder_path):
            continue

        # os.walk covers both direct files AND subfolders (annotated/no_targets/etc.)
        for root, dirs, files in os.walk(folder_path):

            # Skip false positive folders
            if "false_positives" in root.lower():
                continue

            for file in files:

                if not file.lower().endswith(".jpg"):
                    continue

                dt = extract_time(file)
                if not dt:
                    continue

                # Date filter
                if dt.strftime("%Y-%m-%d") != TARGET_DATE:
                    continue

                shift = get_shift(dt.time())
                if not shift:
                    continue

                dev, cam = extract_device_camera(file)

                cam_data = match_camera(dev, cam, exact_lookup, device_lookup)

                if not cam_data:
                    unmatched += 1
                    if len(unmatched_samples) < 10:
                        unmatched_samples.append(f"dev={dev} cam={cam} | file={file}")
                    continue

                matched += 1
                key = (cam_data["device_id"], cam_data["camera_no"])

                shift_counts[shift].setdefault(key, 0)
                shift_counts[shift][key] += 1

                detections_list.append([
                    shift,
                    cam_data["device_id"],
                    cam_data["camera_no"],
                    cam_data["Cam ID"],
                    cam_data["Camera Name"],
                    cam_data["Center"],
                    cam_data["City"],
                    folder.replace("_detection", "").replace("_", " ").title(),
                    dt.strftime("%Y-%m-%d %H:%M:%S"),
                    BASE_IMAGE_URL + file,
                    "View"
                ])

    print(f"\n✅ Matched detections   : {matched}")
    print(f"❌ Unmatched detections : {unmatched}")
    if unmatched_samples:
        print("   Unmatched samples:")
        for s in unmatched_samples:
            print("   ", s)

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
            status = "Online" if cam["Status"] == "Accessible" else "Offline"

            ws.append([
                cam["City"],
                cam["Center"],
                cam["Cam ID"],
                cam["Camera Name"],
                cam["Cam Type"],
                cam["TC Code"],
                count,
                0,
                status
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

    camera_lookup = {
        (cam["device_id"], cam["camera_no"]): cam
        for cam in camera_rows
    }

    row = 1
    total_all = 0
    unique_online = set()

    for shift in SHIFT_TIMES:

        ws[f"A{row}"] = f"{shift} ANALYSIS"
        ws[f"A{row}"].font = Font(bold=True)
        row += 1

        total_cameras = len(camera_rows)
        total_detections = sum(shift_counts[shift].values())

        online_cameras = sum(1 for cam in camera_rows if cam["Status"] == "Accessible")
        offline_cameras = total_cameras - online_cameras
        online_rate = (online_cameras / total_cameras) * 100 if total_cameras else 0

        total_all += total_detections
        unique_online.update(shift_counts[shift].keys())

        data = [
            ("Total Cameras Monitored", total_cameras),
            ("Online Cameras", online_cameras),
            ("Offline Cameras", offline_cameras),
            ("Total Detections", total_detections),
            ("Online Rate", f"{online_rate:.2f}%")
        ]

        for label, value in data:
            ws[f"A{row}"] = label
            ws[f"B{row}"] = value
            row += 1

        row += 1

        ws[f"A{row}"] = f"Top 5 Most Active Cameras ({shift})"
        ws[f"A{row}"].font = Font(bold=True)
        row += 1

        top5 = sorted(
            shift_counts[shift].items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]

        for i, (key, count) in enumerate(top5, 1):
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
    ws[f"B{row}"] = "4.5 hours (3 shifts × 1.5 hours)"

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