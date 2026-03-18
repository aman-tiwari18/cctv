#!/usr/bin/env python3
"""
Combine Daily Camera Reports

For each day, combines all 6 camera list reports into a single sheet.
Only includes camera lists that have at least one camera with events > 0.
If a list has ANY camera with events, ALL cameras from that list are included.
"""

import os
from pathlib import Path
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Configuration
BASE_DIR = Path(__file__).parent.parent
DAILY_REPORTS_DIR = BASE_DIR / 'output' / 'daily_camera_reports' / 'daily_reports'
COMBINED_OUTPUT_DIR = BASE_DIR / 'output' / 'daily_camera_reports' / 'combined_daily_reports'

def has_any_events(file_path):
    """Check if any camera in the report has events > 0"""
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active
    
    # Events column is column 7 (index 7)
    # Use iter_rows for better performance
    for row in ws.iter_rows(min_row=2, min_col=7, max_col=7, values_only=True):
        events = row[0]
        if events and events > 0:
            wb.close()
            return True
    
    wb.close()
    return False

def combine_daily_reports():
    """Combine all camera list reports for each day into a single sheet"""
    print("=" * 80)
    print("COMBINING DAILY REPORTS")
    print("=" * 80)
    print()
    
    # Create output directory
    COMBINED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get all unique dates
    all_files = list(DAILY_REPORTS_DIR.glob('*.xlsx'))
    dates = set()
    for file in all_files:
        date = file.name.split('_camera_list')[0]
        dates.add(date)
    
    dates = sorted(dates)
    print(f"Processing {len(dates)} dates...\n")
    
    combined_count = 0
    
    for date in dates:
        print(f"Processing {date}:")
        
        # Get all 6 camera list reports for this date
        date_files = []
        for i in range(1, 7):
            file_path = DAILY_REPORTS_DIR / f"{date}_camera_list_{i}.xlsx"
            if file_path.exists():
                date_files.append((i, file_path))
        
        # Filter to only lists with at least one event > 0
        active_lists = []
        total_cameras = 0
        total_events = 0
        
        for list_num, file_path in date_files:
            if has_any_events(file_path):
                # Load the workbook
                wb = openpyxl.load_workbook(file_path, data_only=True)
                ws = wb.active
                
                # Count cameras and events
                cameras = ws.max_row - 1  # Exclude header
                events = sum(ws.cell(row=i, column=7).value or 0 for i in range(2, ws.max_row + 1))
                
                active_lists.append({
                    'list_num': list_num,
                    'workbook': wb,
                    'worksheet': ws,
                    'cameras': cameras,
                    'events': events
                })
                
                total_cameras += cameras
                total_events += events
                
                print(f"  ✓ List {list_num}: {cameras} cameras, {events} events")
            else:
                print(f"  ✗ List {list_num}: All cameras have 0 events - EXCLUDED")
        
        if not active_lists:
            print(f"  → No active cameras for {date}, skipping\n")
            # Close workbooks
            for item in active_lists:
                item['workbook'].close()
            continue
        
        # Create combined workbook
        combined_wb = openpyxl.Workbook()
        combined_ws = combined_wb.active
        combined_ws.title = f"Report {date}"
        
        # Write headers
        headers = ['City', 'Center', 'Cam ID', 'Camera Name', 'Cam Type', 
                   'TC Code', 'Events(Excluding Rejected Events)', 'Rejected Events', 'Camera Status']
        
        # Style headers
        header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
        header_font = Font(bold=True, color='FFFFFF', size=11)
        header_alignment = Alignment(horizontal='center', vertical='center')
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        
        for col_idx, header in enumerate(headers, start=1):
            cell = combined_ws.cell(row=1, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = header_alignment
            cell.border = thin_border
        
        # Copy all data from active lists
        current_row = 2
        
        for list_info in active_lists:
            ws = list_info['worksheet']
            
            # Copy all rows (skip header)
            for row_idx in range(2, ws.max_row + 1):
                for col_idx in range(1, 10):  # 9 columns
                    source_cell = ws.cell(row=row_idx, column=col_idx)
                    dest_cell = combined_ws.cell(row=current_row, column=col_idx, value=source_cell.value)
                    
                    # Apply border
                    dest_cell.border = thin_border
                    
                    # Copy some formatting
                    if source_cell.font:
                        dest_cell.font = Font(
                            name=source_cell.font.name,
                            size=source_cell.font.size,
                            bold=source_cell.font.bold
                        )
                    
                    # Align numbers to right
                    if col_idx in [7, 8]:  # Events columns
                        dest_cell.alignment = Alignment(horizontal='right')
                    elif col_idx == 9:  # Status column
                        dest_cell.alignment = Alignment(horizontal='center')
                
                current_row += 1
        
        # Auto-size columns
        for col_idx in range(1, len(headers) + 1):
            column_letter = get_column_letter(col_idx)
            
            # Set specific widths
            if col_idx == 1:  # City
                combined_ws.column_dimensions[column_letter].width = 18
            elif col_idx == 2:  # Center
                combined_ws.column_dimensions[column_letter].width = 40
            elif col_idx == 3:  # Cam ID
                combined_ws.column_dimensions[column_letter].width = 20
            elif col_idx == 4:  # Camera Name
                combined_ws.column_dimensions[column_letter].width = 25
            elif col_idx == 5:  # Cam Type
                combined_ws.column_dimensions[column_letter].width = 30
            elif col_idx == 6:  # TC Code
                combined_ws.column_dimensions[column_letter].width = 12
            elif col_idx in [7, 8]:  # Events
                combined_ws.column_dimensions[column_letter].width = 15
            elif col_idx == 9:  # Status
                combined_ws.column_dimensions[column_letter].width = 15
        
        # Freeze top row
        combined_ws.freeze_panes = 'A2'
        
        # Save combined workbook
        output_file = COMBINED_OUTPUT_DIR / f"{date}_combined.xlsx"
        combined_wb.save(output_file)
        combined_wb.close()
        
        # Close source workbooks
        for item in active_lists:
            item['workbook'].close()
        
        print(f"  → Combined: {total_cameras} cameras, {total_events} events")
        print(f"  → Saved: {output_file.name}\n")
        combined_count += 1
    
    print("=" * 80)
    print(f"✅ COMPLETE! Generated {combined_count} combined daily reports")
    print(f"Output: {COMBINED_OUTPUT_DIR}")
    print("=" * 80)

if __name__ == '__main__':
    combine_daily_reports()
