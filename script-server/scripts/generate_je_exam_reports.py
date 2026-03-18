#!/usr/bin/env python3
"""
Generate JE Exam Reports for Dec 3-6, 2025
Creates separate reports for D11 and D14 cameras with:
- Shift 1 (10:00-12:00) camera status
- Shift 2 (15:00-17:00) camera status
- Daily analysis
- Detections list with view links
"""

import os
import re
import pandas as pd
from datetime import datetime
from collections import defaultdict
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils.dataframe import dataframe_to_rows

# Configuration
BASE_DIR = '/home/suvam/projects/cctv/cctv-analytics-system'
RESULTS_DIR = os.path.join(BASE_DIR, 'results')
OUTPUT_DIR = os.path.join(BASE_DIR, 'output/je_exam_3rd_to_6th_dec')
D11_SHEET = os.path.join(BASE_DIR, 'camera_data_of_dec-jan/je_3rd_to_6th/sheet_d11.xlsx')
D14_SHEET = os.path.join(BASE_DIR, 'camera_data_of_dec-jan/je_3rd_to_6th/sheet_d14.xlsx')

# Server URL for image links
IMAGE_BASE_URL = 'http://103.42.50.241/cctv/images/'

# Dates to process
DATES = ['20251203', '20251204', '20251205', '20251206']

# Folders to EXCLUDE
EXCLUDE_FOLDERS = {'client_selected_results'}

# Detection type mapping
DETECTION_TYPE_MAP = {
    'proximity_detection_results': 'Proximity Violation',
    'phone_detection_results': 'Phone Detection',
    'crowd_detection_results': 'Crowd Detection',
    'entry_exit_detection_results': 'Entry/Exit Detection',
    'server_room_detection_results': 'Server Room Detection',
    'intruder_detection_results': 'Intruder Detection',
    'invigilator_detection_results': 'Invigilator Monitoring',
    'tcs_detections': 'TCS Detection',
}

print("="*80)
print("JE EXAM REPORT GENERATOR - DEC 3-6, 2025")
print("="*80)

# ============================================================================
# STEP 1: Load Camera Metadata
# ============================================================================
print("\n📊 Step 1: Loading camera metadata...")

df_d11 = pd.read_excel(D11_SHEET)
df_d11['Device ID'] = df_d11['Device ID'].astype(str).str.strip()
df_d11['Camera No'] = df_d11['Camera No'].astype(int)
print(f"✓ Loaded D11 cameras: {len(df_d11)} cameras from {df_d11['Device ID'].nunique()} devices")

df_d14 = pd.read_excel(D14_SHEET)
df_d14['Device ID'] = df_d14['Device ID'].astype(str).str.strip()
df_d14['Camera No'] = df_d14['Camera No'].astype(int)
print(f"✓ Loaded D14 cameras: {len(df_d14)} cameras from {df_d14['Device ID'].nunique()} devices")

# Create camera lookup dictionaries
d11_cameras = {}
d14_cameras = {}

for _, row in df_d11.iterrows():
    key = f"{row['Device ID']}_{row['Camera No']}"
    d11_cameras[key] = {
        'Device ID': row['Device ID'],
        'Camera No': row['Camera No'],
        'Camera Name': row.get('Camera Name', ''),
        'Center Name': row.get('Center Name', ''),
        'City': row.get('City', ''),
        'TC Code': row.get('TC Code', ''),
        'State': row.get('State', ''),
    }

for _, row in df_d14.iterrows():
    key = f"{row['Device ID']}_{row['Camera No']}"
    d14_cameras[key] = {
        'Device ID': row['Device ID'],
        'Camera No': row['Camera No'],
        'Camera Name': row.get('Camera Name', ''),
        'Center Name': row.get('Center Name', ''),
        'City': row.get('City', ''),
        'TC Code': row.get('TC Code', ''),
        'State': row.get('State', ''),
    }

# Create camera name lookup for invigilator files
d11_name_lookup = {}
d14_name_lookup = {}

for cam_id, info in d11_cameras.items():
    name = info['Camera Name'].upper().strip()
    if name:
        if name not in d11_name_lookup:
            d11_name_lookup[name] = []
        d11_name_lookup[name].append(cam_id)

for cam_id, info in d14_cameras.items():
    name = info['Camera Name'].upper().strip()
    if name:
        if name not in d14_name_lookup:
            d14_name_lookup[name] = []
        d14_name_lookup[name].append(cam_id)

# ============================================================================
# STEP 2: Define Helper Functions
# ============================================================================

def classify_camera_type(camera_name):
    """Classify camera type based on name"""
    if not camera_name:
        return "Outside Area"
    
    name_upper = camera_name.upper()
    
    # Server Room
    if any(keyword in name_upper for keyword in ['SERVER', 'RACK', 'DATA CENTER', 'COMPUTER ROOM']):
        return "Server Room"
    
    # Computer Lab
    if any(keyword in name_upper for keyword in ['LAB', 'EXAM HALL', 'CLASS']) and re.search(r'\d', name_upper):
        return "Computer Lab"
    
    # Entry
    if any(keyword in name_upper for keyword in ['ENTRY', 'ENTRANCE', 'GATE', 'DOOR', 'MAIN', 'RECEPTION', 'FRISKING']):
        return "Entry"
    
    # Parking Lot
    if any(keyword in name_upper for keyword in ['PARKING', 'VEHICLE']):
        return "Parking Lot"
    
    # Outdoor Scene
    if any(keyword in name_upper for keyword in ['OUTDOOR', 'GROUND', 'GARDEN', 'FIELD']):
        return "Outdoor Scene"
    
    # Outside Area (default)
    return "Outside Area"


def extract_device_camera_datetime(filename, folder_name):
    """Extract device_id, camera_no, and datetime from filename"""
    
    # Pattern 1: violation_DEVICEID_CAMERANO_DATETIME
    m = re.search(r'violation_(\d+)_(\d+)_(\d{8})_(\d{6})', filename)
    if m:
        return m.group(1), int(m.group(2)), m.group(3), m.group(4)
    
    # Pattern 2: phone_detected_DEVICEID_CAMERANO_DATETIME
    m = re.search(r'phone_detected_(\d+)_(\d+)_(\d{8})_(\d{6})', filename)
    if m:
        return m.group(1), int(m.group(2)), m.group(3), m.group(4)
    
    # Pattern 3: DEVICEID_CAMERANO_DATETIME_persons
    m = re.search(r'^(\d+)_(\d+)_(\d{8})_(\d{6})_', filename)
    if m:
        return m.group(1), int(m.group(2)), m.group(3), m.group(4)
    
    # Pattern 4: CAMERANAME_no_targets_DATETIME (invigilator)
    m = re.search(r'(.+)_no_targets_(\d{8})_(\d{6})', filename)
    if m:
        camera_name = m.group(1).upper().strip()
        date_str = m.group(2)
        time_str = m.group(3)
        # Try to match camera name in lookup
        return None, None, date_str, time_str, camera_name
    
    # Pattern 5: Generic DATETIME search
    m = re.search(r'(\d{8})_(\d{6})', filename)
    if m:
        return None, None, m.group(1), m.group(2)
    
    return None, None, None, None


def determine_shift(hour):
    """Determine shift based on hour"""
    if 10 <= hour < 12:
        return "Shift 1"
    elif 15 <= hour < 17:
        return "Shift 2"
    else:
        return None


# ============================================================================
# STEP 3: Scan Detection Files
# ============================================================================
print("\n🔍 Step 2: Scanning detection files...")

detections_d11 = defaultdict(lambda: defaultdict(list))  # [date][shift] = [detection_dict]
detections_d14 = defaultdict(lambda: defaultdict(list))

camera_counts_d11 = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))  # [date][shift][cam_id] = count
camera_counts_d14 = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

total_files_scanned = 0
total_files_matched = 0
skipped_folders = 0
folders_processed = 0

# Compile regex patterns once
pattern_violation = re.compile(r'violation_(\d+)_(\d+)_(\d{8})_(\d{6})')
pattern_phone = re.compile(r'phone_detected_(\d+)_(\d+)_(\d{8})_(\d{6})')
pattern_persons = re.compile(r'^(\d+)_(\d+)_(\d{8})_(\d{6})_')
pattern_no_targets = re.compile(r'(.+)_no_targets_(\d{8})_(\d{6})')
pattern_datetime = re.compile(r'(\d{8})_(\d{6})')
date_filter = re.compile(r'2025120[3-6]')

for root, dirs, files in os.walk(RESULTS_DIR):
    folder_name = os.path.basename(root)
    
    # Skip excluded folders
    if folder_name in EXCLUDE_FOLDERS:
        skipped_folders += 1
        continue
    
    # Print progress
    if folder_name in DETECTION_TYPE_MAP:
        folders_processed += 1
        print(f"  Processing {folder_name}...")
    
    # Get detection type
    detection_type = DETECTION_TYPE_MAP.get(folder_name, folder_name.replace('_', ' ').title())
    
    for file in files:
        if not file.lower().endswith(('.jpg', '.png', '.jpeg')):
            continue
        
        # Quick date filter first
        if not date_filter.search(file):
            continue
        
        total_files_scanned += 1
        
        # Extract using pre-compiled patterns
        device_id, camera_no, date_str, time_str = None, None, None, None
        camera_name = None
        
        # Pattern 1: violation
        m = pattern_violation.search(file)
        if m:
            device_id, camera_no, date_str, time_str = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        # Pattern 2: phone_detected
        elif (m := pattern_phone.search(file)):
            device_id, camera_no, date_str, time_str = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        # Pattern 3: persons
        elif (m := pattern_persons.search(file)):
            device_id, camera_no, date_str, time_str = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        # Pattern 4: no_targets (invigilator)
        elif (m := pattern_no_targets.search(file)):
            camera_name = m.group(1).upper().strip()
            date_str, time_str = m.group(2), m.group(3)
        # Pattern 5: generic datetime
        elif (m := pattern_datetime.search(file)):
            date_str, time_str = m.group(1), m.group(2)
        
        if not date_str or date_str not in DATES:
            continue
        
        result = (device_id, camera_no, date_str, time_str, camera_name) if camera_name else (device_id, camera_no, date_str, time_str)
        
        # Handle invigilator files separately
        if camera_name:
            
            # Try to match camera name
            matched_cam_id = None
            
            # Try exact match first
            if camera_name in d11_name_lookup:
                matched_cam_id = d11_name_lookup[camera_name][0]
                server = 'd11'
            elif camera_name in d14_name_lookup:
                matched_cam_id = d14_name_lookup[camera_name][0]
                server = 'd14'
            else:
                # Try partial match
                for name, cam_ids in d11_name_lookup.items():
                    if camera_name in name or name in camera_name:
                        matched_cam_id = cam_ids[0]
                        server = 'd11'
                        break
                
                if not matched_cam_id:
                    for name, cam_ids in d14_name_lookup.items():
                        if camera_name in name or name in camera_name:
                            matched_cam_id = cam_ids[0]
                            server = 'd14'
                            break
            
            if not matched_cam_id:
                continue  # Skip if no match found
            
            # Extract device_id and camera_no from matched cam_id
            device_id, camera_no = matched_cam_id.split('_')
            camera_no = int(camera_no)
        else:
            if not device_id or not date_str:
                continue
            
            # Determine server
            cam_id = f"{device_id}_{camera_no}"
            if cam_id in d11_cameras:
                server = 'd11'
            elif cam_id in d14_cameras:
                server = 'd14'
            else:
                continue  # Camera not in our lists
        
        # Parse datetime
        try:
            dt = datetime.strptime(date_str + time_str, '%Y%m%d%H%M%S')
        except:
            continue
        
        # Determine shift
        shift = determine_shift(dt.hour)
        if not shift:
            continue  # Outside shift hours
        
        # Get camera info
        cam_id = f"{device_id}_{camera_no}"
        if server == 'd11':
            cam_info = d11_cameras.get(cam_id, {})
            detections = detections_d11
            counts = camera_counts_d11
        else:
            cam_info = d14_cameras.get(cam_id, {})
            detections = detections_d14
            counts = camera_counts_d14
        
        if not cam_info:
            continue
        
        # Build detection record
        file_path = os.path.join(root, file).replace(BASE_DIR + '/', '')
        image_url = IMAGE_BASE_URL + file_path
        
        detection = {
            'Shift': shift,
            'Device ID': device_id,
            'Camera No': camera_no,
            'Cam ID': cam_id,
            'Camera Name': cam_info.get('Camera Name', ''),
            'Center Name': cam_info.get('Center Name', ''),
            'City': cam_info.get('City', ''),
            'Detection Type': detection_type,
            'Detection Time': dt,
            'File Path': file_path,
            'Image URL': image_url,
        }
        
        detections[date_str][shift].append(detection)
        counts[date_str][shift][cam_id] += 1
        total_files_matched += 1

print(f"✓ Scanned {total_files_scanned} files")
print(f"✓ Matched {total_files_matched} detections")
print(f"✓ Skipped {skipped_folders} excluded folders")

# ============================================================================
# STEP 4: Generate Excel Files
# ============================================================================
print("\n📝 Step 3: Generating Excel files...")

# Create output directories
os.makedirs(os.path.join(OUTPUT_DIR, 'd11'), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, 'd14'), exist_ok=True)

def create_shift_data(cameras_dict, counts_dict, date_str, shift):
    """Create shift sheet data"""
    data = []
    
    for cam_id, cam_info in sorted(cameras_dict.items()):
        event_count = counts_dict.get(date_str, {}).get(shift, {}).get(cam_id, 0)
        camera_status = "Online" if event_count > 0 else "Offline"
        cam_type = classify_camera_type(cam_info.get('Camera Name', ''))
        
        data.append({
            'City': cam_info.get('City', ''),
            'Center': cam_info.get('Center Name', ''),
            'Cam ID': cam_id,
            'Camera Name': cam_info.get('Camera Name', ''),
            'Cam Type': cam_type,
            'TC Code': cam_info.get('TC Code', ''),
            'Events(Excluding Rejected Events)': event_count,
            'Rejected Events': 0,
            'Camera Status': camera_status,
        })
    
    return pd.DataFrame(data)


def create_analysis_data(cameras_dict, counts_dict, detections_dict, date_str, server):
    """Create analysis sheet data as a DataFrame"""
    date_obj = datetime.strptime(date_str, '%Y%m%d')
    date_formatted = date_obj.strftime('%B %d, %Y')
    
    # Shift 1 stats
    shift1_counts = counts_dict.get(date_str, {}).get('Shift 1', {})
    shift1_online = len([c for c, count in shift1_counts.items() if count > 0])
    shift1_total_detections = sum(shift1_counts.values())
    
    # Shift 2 stats
    shift2_counts = counts_dict.get(date_str, {}).get('Shift 2', {})
    shift2_online = len([c for c, count in shift2_counts.items() if count > 0])
    shift2_total_detections = sum(shift2_counts.values())
    
    # Overall stats
    total_cameras = len(cameras_dict)
    all_online_cameras = set(list(shift1_counts.keys()) + list(shift2_counts.keys()))
    unique_online = len(all_online_cameras)
    both_shifts = len(set(shift1_counts.keys()) & set(shift2_counts.keys()))
    only_shift1 = len(set(shift1_counts.keys()) - set(shift2_counts.keys()))
    only_shift2 = len(set(shift2_counts.keys()) - set(shift1_counts.keys()))
    
    # Top cameras
    def get_top_cameras(counts, cameras_dict, n=5):
        sorted_cams = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:n]
        return [(cam_id, count, cameras_dict[cam_id].get('Camera Name', '')) for cam_id, count in sorted_cams]
    
    shift1_top = get_top_cameras(shift1_counts, cameras_dict)
    shift2_top = get_top_cameras(shift2_counts, cameras_dict)
    
    # Build analysis data as rows
    data = []
    
    # Header
    data.append(['DAILY CAMERA ANALYSIS REPORT', ''])
    data.append(['Date', date_formatted])
    data.append(['Server', server.upper()])
    data.append(['', ''])  # Empty row
    
    # Shift 1 Section
    data.append(['SHIFT 1 ANALYSIS', ''])
    data.append(['Shift Timing', '10:00 AM - 12:00 PM'])
    data.append(['Duration', '2 hours'])
    data.append(['Total Cameras Monitored', total_cameras])
    data.append(['Online Cameras', shift1_online])
    data.append(['Offline Cameras', total_cameras - shift1_online])
    data.append(['Total Detections', shift1_total_detections])
    data.append(['Online Rate', f"{(shift1_online/total_cameras*100):.2f}%"])
    data.append(['', ''])  # Empty row
    
    # Shift 1 Top Cameras
    data.append(['Top 5 Most Active Cameras (Shift 1)', ''])
    for i, (cam_id, count, name) in enumerate(shift1_top, 1):
        data.append([f"{i}. {cam_id} ({name})", f"{count} detections"])
    if not shift1_top:
        data.append(['No active cameras', ''])
    data.append(['', ''])  # Empty row
    
    # Shift 2 Section
    data.append(['SHIFT 2 ANALYSIS', ''])
    data.append(['Shift Timing', '3:00 PM - 5:00 PM'])
    data.append(['Duration', '2 hours'])
    data.append(['Total Cameras Monitored', total_cameras])
    data.append(['Online Cameras', shift2_online])
    data.append(['Offline Cameras', total_cameras - shift2_online])
    data.append(['Total Detections', shift2_total_detections])
    data.append(['Online Rate', f"{(shift2_online/total_cameras*100):.2f}%"])
    data.append(['', ''])  # Empty row
    
    # Shift 2 Top Cameras
    data.append(['Top 5 Most Active Cameras (Shift 2)', ''])
    for i, (cam_id, count, name) in enumerate(shift2_top, 1):
        data.append([f"{i}. {cam_id} ({name})", f"{count} detections"])
    if not shift2_top:
        data.append(['No active cameras', ''])
    data.append(['', ''])  # Empty row
    
    # Overall Summary
    data.append(['OVERALL SUMMARY', ''])
    data.append(['Total Unique Cameras Online Today', unique_online])
    data.append(['Cameras Online in Both Shifts', both_shifts])
    data.append(['Cameras Online Only in Shift 1', only_shift1])
    data.append(['Cameras Online Only in Shift 2', only_shift2])
    data.append(['Total Detections (All Shifts)', shift1_total_detections + shift2_total_detections])
    data.append(['Total Shift Duration', '4 hours (2 shifts × 2 hours)'])
    
    return pd.DataFrame(data, columns=['Metric', 'Value'])


def create_detections_list(detections_dict, date_str):
    """Create detections list sheet data"""
    all_detections = []
    
    for shift in ['Shift 1', 'Shift 2']:
        detections = detections_dict.get(date_str, {}).get(shift, [])
        all_detections.extend(detections)
    
    # Sort by time (chronological)
    all_detections.sort(key=lambda x: x['Detection Time'])
    
    # Format datetime and remove File Path
    for det in all_detections:
        det['Detection Time'] = det['Detection Time'].strftime('%Y-%m-%d %H:%M:%S')
        # Remove File Path from the detection dict
        det.pop('File Path', None)
    
    return pd.DataFrame(all_detections)


# Generate files for each date and server
for date_str in DATES:
    date_obj = datetime.strptime(date_str, '%Y%m%d')
    file_date = date_obj.strftime('%Y-%m-%d')
    
    for server, cameras, counts, detections in [
        ('d11', d11_cameras, camera_counts_d11, detections_d11),
        ('d14', d14_cameras, camera_counts_d14, detections_d14)
    ]:
        output_file = os.path.join(OUTPUT_DIR, server, f"{file_date}.xlsx")
        
        print(f"\n  Creating {server}/{file_date}.xlsx...")
        
        # Create Excel file with 4 sheets
        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            # Sheet 1: Shift 1
            df_shift1 = create_shift_data(cameras, counts, date_str, 'Shift 1')
            df_shift1.to_excel(writer, sheet_name='Shift 1', index=False)
            
            # Sheet 2: Shift 2
            df_shift2 = create_shift_data(cameras, counts, date_str, 'Shift 2')
            df_shift2.to_excel(writer, sheet_name='Shift 2', index=False)
            
            # Sheet 3: Analysis
            df_analysis = create_analysis_data(cameras, counts, detections, date_str, server)
            df_analysis.to_excel(writer, sheet_name='Analysis', index=False)
            
            # Sheet 4: Detections List
            df_detections = create_detections_list(detections, date_str)
            if not df_detections.empty:
                df_detections.to_excel(writer, sheet_name='Detections List', index=False)
            else:
                # Create empty sheet for dates with no detections
                pd.DataFrame(columns=['Shift', 'Device ID', 'Camera No', 'Cam ID', 'Camera Name', 
                                     'Center Name', 'City', 'Detection Type', 'Detection Time', 
                                     'Image URL']).to_excel(writer, sheet_name='Detections List', index=False)
        
        # Add hyperlinks to "View" column in Detections List
        wb = load_workbook(output_file)
        if 'Detections List' in wb.sheetnames:
            ws = wb['Detections List']
            
            # Add "View" column header
            max_col = ws.max_column
            ws.cell(row=1, column=max_col + 1, value='View')
            ws.cell(row=1, column=max_col + 1).font = Font(bold=True)
            
            # Add hyperlinks
            for row_idx in range(2, ws.max_row + 1):
                image_url = ws.cell(row=row_idx, column=max_col).value
                if image_url:
                    cell = ws.cell(row=row_idx, column=max_col + 1)
                    cell.value = 'View'
                    cell.hyperlink = image_url
                    cell.font = Font(color="0000FF", underline="single")
        
        # Format Analysis sheet
        if 'Analysis' in wb.sheetnames:
            ws = wb['Analysis']
            ws.column_dimensions['A'].width = 50
            ws.column_dimensions['B'].width = 30
            # Make headers bold
            for row in [1, 5, 19, 34]:
                if row <= ws.max_row:
                    ws.cell(row=row, column=1).font = Font(bold=True, size=12)
            # Make section headers bold
            for cell in ws['A']:
                if cell.value and ('ANALYSIS' in str(cell.value) or 'SUMMARY' in str(cell.value) or 'REPORT' in str(cell.value)):
                    cell.font = Font(bold=True, size=12)
        
        wb.save(output_file)
        
        # Print summary
        shift1_count = sum(counts.get(date_str, {}).get('Shift 1', {}).values())
        shift2_count = sum(counts.get(date_str, {}).get('Shift 2', {}).values())
        total_detections = len(detections.get(date_str, {}).get('Shift 1', [])) + len(detections.get(date_str, {}).get('Shift 2', []))
        
        print(f"    ✓ Shift 1: {shift1_count} total events")
        print(f"    ✓ Shift 2: {shift2_count} total events")
        print(f"    ✓ Total detections: {total_detections}")

# ============================================================================
# STEP 5: Generate Combined Analysis Files
# ============================================================================
print("\n📊 Step 4: Generating combined JE exam analysis...")

def create_combined_analysis(server, cameras_dict, counts_dict, detections_dict):
    """Create combined analysis across all exam days"""
    
    # Overall statistics
    data = []
    data.append(['JE EXAM COMBINED ANALYSIS - ALL DAYS', ''])
    data.append(['Server', server.upper()])
    data.append(['Exam Period', 'December 3-6, 2025'])
    data.append(['Total Cameras Monitored', len(cameras_dict)])
    data.append(['', ''])
    
    # Daily breakdown
    data.append(['DAILY BREAKDOWN', ''])
    data.append(['Date', 'Shift 1 Events', 'Shift 2 Events', 'Total Events', 'Online Cameras'])
    
    total_all_events = 0
    total_all_online = set()
    
    for date_str in DATES:
        date_obj = datetime.strptime(date_str, '%Y%m%d')
        date_formatted = date_obj.strftime('%b %d, %Y')
        
        shift1_counts = counts_dict.get(date_str, {}).get('Shift 1', {})
        shift2_counts = counts_dict.get(date_str, {}).get('Shift 2', {})
        
        shift1_events = sum(shift1_counts.values())
        shift2_events = sum(shift2_counts.values())
        total_events = shift1_events + shift2_events
        
        all_online = set(list(shift1_counts.keys()) + list(shift2_counts.keys()))
        online_count = len(all_online)
        
        total_all_events += total_events
        total_all_online.update(all_online)
        
        data.append([date_formatted, shift1_events, shift2_events, total_events, online_count])
    
    data.append(['TOTAL', '', '', total_all_events, len(total_all_online)])
    data.append(['', ''])
    
    # Shift comparison across all days
    data.append(['SHIFT-WISE COMPARISON (ALL DAYS)', ''])
    
    all_shift1_events = sum(sum(counts_dict.get(d, {}).get('Shift 1', {}).values()) for d in DATES)
    all_shift2_events = sum(sum(counts_dict.get(d, {}).get('Shift 2', {}).values()) for d in DATES)
    
    all_shift1_online = set()
    all_shift2_online = set()
    for date_str in DATES:
        all_shift1_online.update(counts_dict.get(date_str, {}).get('Shift 1', {}).keys())
        all_shift2_online.update(counts_dict.get(date_str, {}).get('Shift 2', {}).keys())
    
    data.append(['Metric', 'Shift 1 (10AM-12PM)', 'Shift 2 (3PM-5PM)'])
    data.append(['Total Events', all_shift1_events, all_shift2_events])
    data.append(['Unique Cameras Online', len(all_shift1_online), len(all_shift2_online)])
    data.append(['Average Events per Day', f"{all_shift1_events/4:.1f}", f"{all_shift2_events/4:.1f}"])
    data.append(['', ''])
    
    # Top 10 most active cameras overall
    data.append(['TOP 10 MOST ACTIVE CAMERAS (ALL DAYS)', ''])
    
    all_camera_events = defaultdict(int)
    for date_str in DATES:
        for shift in ['Shift 1', 'Shift 2']:
            for cam_id, count in counts_dict.get(date_str, {}).get(shift, {}).items():
                all_camera_events[cam_id] += count
    
    top_cameras = sorted(all_camera_events.items(), key=lambda x: x[1], reverse=True)[:10]
    
    data.append(['Rank', 'Camera ID', 'Camera Name', 'Total Events'])
    for i, (cam_id, count) in enumerate(top_cameras, 1):
        cam_name = cameras_dict.get(cam_id, {}).get('Camera Name', '')
        data.append([i, cam_id, cam_name, count])
    
    data.append(['', ''])
    
    # Detection type breakdown
    data.append(['DETECTION TYPE BREAKDOWN (ALL DAYS)', ''])
    
    all_detection_types = defaultdict(int)
    for date_str in DATES:
        for shift in ['Shift 1', 'Shift 2']:
            for det in detections_dict.get(date_str, {}).get(shift, []):
                all_detection_types[det['Detection Type']] += 1
    
    data.append(['Detection Type', 'Count', 'Percentage'])
    for det_type, count in sorted(all_detection_types.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / total_all_events * 100) if total_all_events > 0 else 0
        data.append([det_type, count, f"{percentage:.2f}%"])
    
    data.append(['', ''])
    
    # Camera utilization
    data.append(['CAMERA UTILIZATION ANALYSIS', ''])
    data.append(['Total Cameras Available', len(cameras_dict)])
    data.append(['Cameras Used at Least Once', len(total_all_online)])
    data.append(['Cameras Never Used', len(cameras_dict) - len(total_all_online)])
    data.append(['Utilization Rate', f"{(len(total_all_online)/len(cameras_dict)*100):.2f}%"])
    data.append(['', ''])
    
    # Financial analysis (payment based on active cameras)
    data.append(['FINANCIAL ANALYSIS', ''])
    data.append(['Payment Rate per Camera', '₹22 for 2-hour shifts'])
    data.append(['', ''])
    
    data.append(['Date', 'Shift 1 Cameras', 'Shift 1 Cost', 'Shift 2 Cameras', 'Shift 2 Cost', 'Daily Total'])
    
    total_cost = 0
    total_shift1_cameras = 0
    total_shift2_cameras = 0
    
    for date_str in DATES:
        date_obj = datetime.strptime(date_str, '%Y%m%d')
        date_formatted = date_obj.strftime('%b %d, %Y')
        
        shift1_counts = counts_dict.get(date_str, {}).get('Shift 1', {})
        shift2_counts = counts_dict.get(date_str, {}).get('Shift 2', {})
        
        shift1_cameras = len(shift1_counts)
        shift2_cameras = len(shift2_counts)
        
        shift1_cost = shift1_cameras * 22
        shift2_cost = shift2_cameras * 22
        daily_total = shift1_cost + shift2_cost
        
        total_shift1_cameras += shift1_cameras
        total_shift2_cameras += shift2_cameras
        total_cost += daily_total
        
        data.append([date_formatted, shift1_cameras, f"₹{shift1_cost}", 
                    shift2_cameras, f"₹{shift2_cost}", f"₹{daily_total}"])
    
    data.append(['TOTAL', total_shift1_cameras, f"₹{total_shift1_cameras * 22}",
                total_shift2_cameras, f"₹{total_shift2_cameras * 22}", f"₹{total_cost}"])
    data.append(['', ''])
    
    data.append(['PAYMENT SUMMARY', ''])
    data.append(['Total Camera-Shifts', total_shift1_cameras + total_shift2_cameras])
    data.append(['Rate per Camera-Shift', '₹22'])
    data.append(['Total Payment Amount', f"₹{total_cost}"])
    data.append(['Average Daily Cost', f"₹{total_cost/4:.2f}"])
    
    return pd.DataFrame(data)


for server, cameras, counts, detections in [
    ('d11', d11_cameras, camera_counts_d11, detections_d11),
    ('d14', d14_cameras, camera_counts_d14, detections_d14)
]:
    combined_file = os.path.join(OUTPUT_DIR, server, 'JE_Exam_Combined_Analysis.xlsx')
    
    print(f"\n  Creating {server}/JE_Exam_Combined_Analysis.xlsx...")
    
    # Create combined analysis dataframe
    df_combined = create_combined_analysis(server, cameras, counts, detections)
    
    with pd.ExcelWriter(combined_file, engine='openpyxl') as writer:
        df_combined.to_excel(writer, sheet_name='Combined Analysis', index=False, header=False)
    
    # Format the sheet
    wb = load_workbook(combined_file)
    ws = wb['Combined Analysis']
    ws.column_dimensions['A'].width = 50
    ws.column_dimensions['B'].width = 25
    ws.column_dimensions['C'].width = 25
    ws.column_dimensions['D'].width = 25
    ws.column_dimensions['E'].width = 25
    ws.column_dimensions['F'].width = 25
    
    # Make headers and section titles bold
    for cell in ws['A']:
        if cell.value and any(keyword in str(cell.value) for keyword in 
                             ['ANALYSIS', 'BREAKDOWN', 'COMPARISON', 'TOP 10', 'DETECTION TYPE', 'UTILIZATION', 'FINANCIAL']):
            cell.font = Font(bold=True, size=12)
    
    wb.save(combined_file)
    
    total_events = sum(sum(counts.get(d, {}).get('Shift 1', {}).values()) + 
                      sum(counts.get(d, {}).get('Shift 2', {}).values()) for d in DATES)
    print(f"    ✓ Total events across all days: {total_events}")

print("\n" + "="*80)
print("✅ REPORT GENERATION COMPLETE")
print("="*80)
print(f"\nOutput directory: {OUTPUT_DIR}")
print(f"  - d11/: 4 daily files + 1 combined analysis")
print(f"  - d14/: 4 daily files + 1 combined analysis")
print(f"\nTotal: 10 Excel files generated")
print("\nDaily files contain 4 sheets:")
print("  1. Shift 1 - Camera status (10:00-12:00)")
print("  2. Shift 2 - Camera status (15:00-17:00)")
print("  3. Analysis - Daily statistics")
print("  4. Detections List - All detections with view links")
print("\nCombined analysis file contains:")
print("  - Daily breakdown of all 4 exam days")
print("  - Shift-wise comparison across all days")
print("  - Top 10 most active cameras overall")
print("  - Detection type breakdown")
print("  - Camera utilization analysis")
