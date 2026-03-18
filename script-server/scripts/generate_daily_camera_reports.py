#!/usr/bin/env python3
"""
Daily Camera Alert Report Generator

This script:
1. Reads all Excel files from data/rtsp_links_sheet_all
2. Identifies camera list sheets (those with "Server Address" column)
3. Separates them into individual camera_list files
4. Generates daily reports showing alert counts per camera
"""

import os
import sys
import re
from datetime import datetime
from pathlib import Path
from collections import defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configuration
BASE_DIR = Path(__file__).parent.parent
CAMERA_LISTS_DIR = BASE_DIR / 'data' / 'rtsp_links_sheet_all'
RESULTS_DIR = BASE_DIR / 'results'
OUTPUT_DIR = BASE_DIR / 'output' / 'daily_camera_reports'
CAMERA_LISTS_OUTPUT_DIR = OUTPUT_DIR / 'camera_lists'
DAILY_REPORTS_DIR = OUTPUT_DIR / 'daily_reports'

# Detection type to camera type mapping
DETECTION_TYPE_TO_CAM_TYPE = {
    'intruder': 'Inside Lab / Server room',
    'crowd': 'Outside (Crowd at entry gate)',
    'proximity': 'Inside Lab',
    'invigilator': 'Inside Lab',
    'server_room': 'Server Room',
    'phone': 'Inside Lab / Server room',
    'entry_exit': 'Outside (Crowd at entry/ exit gate)'
}

# Detection folders to process
DETECTION_FOLDERS = {
    'crowd': 'crowd_detection_results',
    'entry_exit': 'entry_exit_detection_results',
    'intruder': 'intruder_detection_results',
    'invigilator': 'invigilator_detection_results',
    'phone': 'phone_detection_results',
    'proximity': 'proximity_detection_results',
    'server_room': 'server_room_detection_results'
}


def normalize_column_name(name):
    """Normalize column names for semantic matching"""
    if not name:
        return ''
    name = str(name).lower().strip()
    # Remove special characters
    name = re.sub(r'[^a-z0-9\s]', '', name)
    # Remove extra spaces
    name = re.sub(r'\s+', ' ', name)
    return name


def find_column_by_semantics(columns, target_variations):
    """Find a column by semantic matching"""
    normalized_cols = {normalize_column_name(col): col for col in columns}
    
    for variation in target_variations:
        norm_var = normalize_column_name(variation)
        if norm_var in normalized_cols:
            return normalized_cols[norm_var]
    return None


def has_server_address_column(sheet):
    """Check if sheet has a Server Address column"""
    if not sheet or sheet.max_row < 1:
        return False
    
    # Check first row for column headers
    first_row = [cell.value for cell in sheet[1]]
    for val in first_row:
        if val and 'server' in str(val).lower() and 'address' in str(val).lower():
            return True
    return False


def read_camera_list_from_sheet(wb, sheet_name):
    """Read camera list from a worksheet"""
    sheet = wb[sheet_name]
    
    # Get headers from first row
    headers = []
    for cell in sheet[1]:
        headers.append(cell.value)
    
    # Find important columns semantically
    device_id_variations = ['device id', 'device_id', 'deviceid', 'devie i', 'device']
    camera_no_variations = ['camera no', 'camera_no', 'camerano', 'camera number', 'cam no']
    camera_name_variations = ['camera name', 'camera_name', 'cameraname', 'cam name']
    center_name_variations = ['center name', 'center_name', 'centername', 'centre name']
    city_variations = ['city']
    tc_code_variations = ['tc code', 'tc_code', 'tccode']
    server_address_variations = ['server address', 'server_address', 'serveraddress']
    
    device_id_col = find_column_by_semantics(headers, device_id_variations)
    camera_no_col = find_column_by_semantics(headers, camera_no_variations)
    camera_name_col = find_column_by_semantics(headers, camera_name_variations)
    center_name_col = find_column_by_semantics(headers, center_name_variations)
    city_col = find_column_by_semantics(headers, city_variations)
    tc_code_col = find_column_by_semantics(headers, tc_code_variations)
    server_address_col = find_column_by_semantics(headers, server_address_variations)
    
    # Read all data
    cameras = []
    for row_idx in range(2, sheet.max_row + 1):
        row_data = {}
        for col_idx, header in enumerate(headers, start=1):
            cell_value = sheet.cell(row=row_idx, column=col_idx).value
            row_data[header] = cell_value
        
        # Only add rows that have device_id and camera_no
        if device_id_col and camera_no_col:
            device_id = row_data.get(device_id_col)
            camera_no = row_data.get(camera_no_col)
            
            if device_id is not None and camera_no is not None:
                camera = {
                    'all_data': row_data,
                    'device_id': str(device_id).strip() if device_id else '',
                    'camera_no': str(camera_no).strip() if camera_no else '',
                    'camera_name': str(row_data.get(camera_name_col, '')).strip() if camera_name_col else '',
                    'center_name': str(row_data.get(center_name_col, '')).strip() if center_name_col else '',
                    'city': str(row_data.get(city_col, '')).strip() if city_col else '',
                    'tc_code': str(row_data.get(tc_code_col, '')).strip() if tc_code_col else '',
                }
                cameras.append(camera)
    
    return cameras, headers


def extract_camera_lists():
    """Extract all camera lists from Excel files"""
    print("=" * 80)
    print("STEP 1: Extracting Camera Lists")
    print("=" * 80)
    
    camera_lists = []
    
    # Create output directory
    CAMERA_LISTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Process each Excel file
    excel_files = list(CAMERA_LISTS_DIR.glob('*.xlsx')) + list(CAMERA_LISTS_DIR.glob('*.xls'))
    
    for file_path in excel_files:
        print(f"\nProcessing: {file_path.name}")
        
        try:
            wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
            
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                
                # Check if this sheet has camera list (Server Address column)
                if has_server_address_column(sheet):
                    print(f"  ✓ Found camera list in sheet: {sheet_name}")
                    
                    # Re-open in write mode to copy
                    wb_write = openpyxl.load_workbook(file_path, data_only=True)
                    cameras, headers = read_camera_list_from_sheet(wb_write, sheet_name)
                    
                    if cameras:
                        list_index = len(camera_lists) + 1
                        camera_lists.append({
                            'index': list_index,
                            'source_file': file_path.name,
                            'sheet_name': sheet_name,
                            'cameras': cameras,
                            'headers': headers,
                            'workbook': wb_write,
                            'sheet': wb_write[sheet_name]
                        })
                        
                        print(f"    - Found {len(cameras)} cameras")
                    
                    wb_write.close()
            
            wb.close()
            
        except Exception as e:
            print(f"  ✗ Error processing {file_path.name}: {e}")
            continue
    
    print(f"\n{'='*80}")
    print(f"Total camera lists found: {len(camera_lists)}")
    print(f"{'='*80}\n")
    
    return camera_lists


def save_camera_lists(camera_lists):
    """Save separated camera lists to individual Excel files"""
    print("=" * 80)
    print("STEP 2: Saving Separated Camera Lists")
    print("=" * 80)
    
    for cam_list in camera_lists:
        output_file = CAMERA_LISTS_OUTPUT_DIR / f"camera_list_{cam_list['index']}.xlsx"
        
        # Create new workbook and copy the sheet
        wb_new = openpyxl.Workbook()
        ws_new = wb_new.active
        ws_new.title = "Camera List"
        
        # Copy all data from original sheet
        source_sheet = cam_list['sheet']
        for row in source_sheet.iter_rows():
            for cell in row:
                new_cell = ws_new.cell(row=cell.row, column=cell.column, value=cell.value)
                # Copy formatting
                if cell.has_style:
                    new_cell.font = cell.font.copy()
                    new_cell.border = cell.border.copy()
                    new_cell.fill = cell.fill.copy()
                    new_cell.number_format = cell.number_format
                    new_cell.protection = cell.protection.copy()
                    new_cell.alignment = cell.alignment.copy()
        
        # Save
        wb_new.save(output_file)
        wb_new.close()
        
        print(f"  ✓ Saved camera_list_{cam_list['index']}.xlsx")
        print(f"    Source: {cam_list['source_file']} - {cam_list['sheet_name']}")
        print(f"    Cameras: {len(cam_list['cameras'])}")


def parse_date_from_filename(filename):
    """Extract date from detection filename"""
    # Pattern: YYYYMMDD
    match = re.search(r'(\d{8})', filename)
    if match:
        date_str = match.group(1)
        try:
            return datetime.strptime(date_str, '%Y%m%d').date()
        except:
            pass
    return None


def scan_alerts_by_date():
    """Scan all alert images and group by date and camera"""
    print("=" * 80)
    print("STEP 3: Scanning All Alerts")
    print("=" * 80)
    
    # Structure: {date: {(device_id, camera_no): {detection_types: set(), count: int}}}
    alerts_by_date_camera = defaultdict(lambda: defaultdict(lambda: {'detection_types': set(), 'count': 0}))
    
    # Structure for invigilator (by camera name): {date: {camera_name: {detection_types: set(), count: int}}}
    invigilator_alerts_by_date = defaultdict(lambda: defaultdict(lambda: {'detection_types': set(), 'count': 0}))
    
    for detection_type, folder_name in DETECTION_FOLDERS.items():
        folder_path = RESULTS_DIR / folder_name
        
        if not folder_path.exists():
            print(f"  ⚠ Folder not found: {folder_name}")
            continue
        
        print(f"\n  Processing {detection_type} ({folder_name})...")
        
        if detection_type == 'invigilator':
            # Handle hierarchical structure - camera names are folder names
            count = 0
            for camera_folder in folder_path.iterdir():
                if camera_folder.is_dir():
                    camera_name = camera_folder.name
                    
                    # Recursively find all jpg files
                    for img_file in camera_folder.rglob('*.jpg'):
                        date = parse_date_from_filename(img_file.name)
                        if date:
                            invigilator_alerts_by_date[date][camera_name]['detection_types'].add(detection_type)
                            invigilator_alerts_by_date[date][camera_name]['count'] += 1
                            count += 1
            
            print(f"    Found {count} invigilator alerts")
        
        else:
            # Handle flat structure - parse device_id and camera_no from filename
            count = 0
            for img_file in folder_path.glob('*.jpg'):
                # Extract device_id and camera_no from filename
                # Patterns vary by detection type
                patterns = [
                    r'(\d+)_(\d+)_(\d{8})',  # device_camera_date
                    r'phone_detected_(\d+)_(\d+)_(\d{8})',  # phone
                    r'violation_(\d+)_(\d+)_(\d{8})',  # proximity
                ]
                
                matched = False
                for pattern in patterns:
                    match = re.search(pattern, img_file.name)
                    if match:
                        device_id = match.group(1)
                        camera_no = match.group(2)
                        date_str = match.group(3)
                        
                        try:
                            date = datetime.strptime(date_str, '%Y%m%d').date()
                            key = (device_id, camera_no)
                            alerts_by_date_camera[date][key]['detection_types'].add(detection_type)
                            alerts_by_date_camera[date][key]['count'] += 1
                            count += 1
                            matched = True
                            break
                        except:
                            pass
                
                if not matched and img_file.suffix.lower() == '.jpg':
                    # Try simple date extraction
                    date = parse_date_from_filename(img_file.name)
                    if date:
                        # Try to extract device and camera from filename
                        match = re.search(r'(\d{6,7})_(\d{1,2})', img_file.name)
                        if match:
                            device_id = match.group(1)
                            camera_no = match.group(2)
                            key = (device_id, camera_no)
                            alerts_by_date_camera[date][key]['detection_types'].add(detection_type)
                            alerts_by_date_camera[date][key]['count'] += 1
                            count += 1
            
            print(f"    Found {count} alerts")
    
    print(f"\n  {'='*76}")
    print(f"  Total dates with alerts: {len(alerts_by_date_camera) + len(invigilator_alerts_by_date)}")
    print(f"  {'='*76}\n")
    
    return alerts_by_date_camera, invigilator_alerts_by_date


def generate_daily_reports(camera_lists, alerts_by_date_camera, invigilator_alerts_by_date):
    """Generate daily reports for each camera list"""
    print("=" * 80)
    print("STEP 4: Generating Daily Reports")
    print("=" * 80)
    
    # Create output directory
    DAILY_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get all unique dates
    all_dates = set(alerts_by_date_camera.keys()) | set(invigilator_alerts_by_date.keys())
    all_dates = sorted(all_dates)
    
    print(f"\nGenerating reports for {len(all_dates)} dates")
    print(f"Date range: {min(all_dates)} to {max(all_dates)}\n")
    
    report_count = 0
    
    for date in all_dates:
        date_str = date.strftime('%Y-%m-%d')
        print(f"  Processing date: {date_str}")
        
        for cam_list in camera_lists:
            list_index = cam_list['index']
            output_file = DAILY_REPORTS_DIR / f"{date_str}_camera_list_{list_index}.xlsx"
            
            # Create new workbook
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = f"Report {date_str}"
            
            # Write headers (following the template format)
            headers = ['City', 'Center', 'Cam ID', 'Camera Name', 'Cam Type', 
                      'TC Code', 'Events(Excluding Rejected Events)', 'Rejected Events', 'Camera Status']
            
            # Style headers
            header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
            header_font = Font(bold=True, color='FFFFFF')
            
            for col_idx, header in enumerate(headers, start=1):
                cell = ws.cell(row=1, column=col_idx, value=header)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center', vertical='center')
            
            # Process each camera in this list
            row_idx = 2
            cameras_with_alerts = 0
            
            for camera in cam_list['cameras']:
                device_id = camera['device_id']
                camera_no = camera['camera_no']
                camera_name = camera['camera_name']
                
                # Check if this camera has alerts on this date
                alert_count = 0
                detection_types = set()
                camera_status = 'Not Active'
                
                # For regular cameras (not invigilator)
                key = (device_id, camera_no)
                if key in alerts_by_date_camera.get(date, {}):
                    alert_info = alerts_by_date_camera[date][key]
                    alert_count = alert_info['count']
                    detection_types = alert_info['detection_types']
                    camera_status = 'Online'
                    cameras_with_alerts += 1
                
                # For invigilator cameras (match by name)
                if camera_name and camera_name in invigilator_alerts_by_date.get(date, {}):
                    alert_info = invigilator_alerts_by_date[date][camera_name]
                    alert_count += alert_info['count']
                    detection_types.update(alert_info['detection_types'])
                    camera_status = 'Online'
                    if alert_count == alert_info['count']:  # Only invigilator alerts
                        cameras_with_alerts += 1
                
                # Determine camera type from detection types
                cam_type = ''
                if detection_types:
                    # Use the first detection type mapping
                    cam_type = DETECTION_TYPE_TO_CAM_TYPE.get(list(detection_types)[0], 'Unknown')
                
                # Create Cam ID (device_id_camera_no format)
                cam_id = f"{device_id}_{camera_no}" if device_id and camera_no else ''
                
                # Write row
                row_data = [
                    camera.get('city', ''),
                    camera.get('center_name', ''),
                    cam_id,
                    camera_name,
                    cam_type,
                    camera.get('tc_code', ''),
                    alert_count,
                    0,  # Rejected events always 0
                    camera_status
                ]
                
                for col_idx, value in enumerate(row_data, start=1):
                    ws.cell(row=row_idx, column=col_idx, value=value)
                
                row_idx += 1
            
            # Auto-size columns
            for col_idx in range(1, len(headers) + 1):
                ws.column_dimensions[get_column_letter(col_idx)].width = 20
            
            # Save workbook
            wb.save(output_file)
            wb.close()
            
            print(f"    ✓ camera_list_{list_index}: {cameras_with_alerts} active cameras out of {len(cam_list['cameras'])}")
            report_count += 1
    
    print(f"\n  {'='*76}")
    print(f"  Total reports generated: {report_count}")
    print(f"  {'='*76}\n")


def main():
    """Main execution function"""
    print("\n" + "="*80)
    print("DAILY CAMERA ALERT REPORT GENERATOR")
    print("="*80 + "\n")
    
    # Step 1: Extract camera lists from Excel files
    camera_lists = extract_camera_lists()
    
    if not camera_lists:
        print("❌ No camera lists found. Exiting.")
        return
    
    # Step 2: Save separated camera lists
    save_camera_lists(camera_lists)
    
    # Step 3: Scan all alerts
    alerts_by_date_camera, invigilator_alerts_by_date = scan_alerts_by_date()
    
    # Step 4: Generate daily reports
    generate_daily_reports(camera_lists, alerts_by_date_camera, invigilator_alerts_by_date)
    
    print("\n" + "="*80)
    print("✅ PROCESSING COMPLETE!")
    print("="*80)
    print(f"\nOutput locations:")
    print(f"  Camera Lists: {CAMERA_LISTS_OUTPUT_DIR}")
    print(f"  Daily Reports: {DAILY_REPORTS_DIR}")
    print()


if __name__ == '__main__':
    main()
