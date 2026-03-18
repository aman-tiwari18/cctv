#!/usr/bin/env python3
"""
Comprehensive Camera Status Update Script

Updates camera status across all exam reports based on:
1. Any camera with ≥1 detection event → Online
2. Cameras marked "Accessible" in Camera_Details → Online (even with 0 detections)
3. Cameras marked "Online" in daily_camera_reports → Online

Processes all exam reports and regenerates financial analysis.
"""

import os
import pandas as pd
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import re

BASE_DIR = '/home/suvam/projects/cctv/cctv-analytics-system'

# Exam configurations
EXAM_CONFIGS = {
    'je_exam_3rd_to_6th_dec/d11': {
        'name': 'JE Exam (D11)',
        'dates': ['2025-12-03', '2025-12-04', '2025-12-05', '2025-12-06'],
        'shifts': ['Shift 1', 'Shift 2']
    },
    'sicpo_exam_9th_to_12th_dec': {
        'name': 'SICPO Exam',
        'dates': ['2025-12-09', '2025-12-10', '2025-12-11', '2025-12-12'],
        'shifts': ['Shift 1', 'Shift 2']
    },
    'ssc_constable_driver_16_17_dec': {
        'name': 'SSC Constable Driver',
        'dates': ['2025-12-16', '2025-12-17'],
        'shifts': ['Shift 1', 'Shift 2']
    },
    'ssc_constable_exec_18dec_6jan': {
        'name': 'SSC Constable Executive',
        'dates': [
            '2025-12-18', '2025-12-19', '2025-12-20', '2025-12-21', '2025-12-22',
            '2025-12-23', '2025-12-24', '2025-12-25', '2025-12-26', '2025-12-27',
            '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01',
            '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'
        ],
        'shifts': ['Shift 1', 'Shift 2', 'Shift 3']
    },
    'ssc_head_constable_min_7_12jan': {
        'name': 'SSC Head Constable Ministerial',
        'dates': ['2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11', '2026-01-12'],
        'shifts': ['Shift 1', 'Shift 2', 'Shift 3']
    },
    'head_constable_awo_16_21jan': {
        'name': 'Head Constable AWO/TPO',
        'dates': ['2026-01-16', '2026-01-17', '2026-01-18', '2026-01-19', '2026-01-20', '2026-01-21'],
        'shifts': ['Shift 1', 'Shift 2', 'Shift 3']
    }
}

def load_camera_details_for_date(date_str):
    """Load all Camera_Details files for a specific date and merge online cameras."""
    camera_details_dir = os.path.join(BASE_DIR, 'data/Camera_Details')
    online_cameras = set()
    
    # Find all files for this date
    for filename in os.listdir(camera_details_dir):
        if filename.startswith(f'Camera_Details_All_{date_str}') and filename.endswith('.xlsx'):
            filepath = os.path.join(camera_details_dir, filename)
            try:
                df = pd.read_excel(filepath, sheet_name='Camera Details')
                
                # Get cameras with "Accessible" status
                if 'Status' in df.columns:
                    accessible = df[df['Status'] == 'Accessible']
                    
                    # Create camera IDs
                    if 'Device ID' in accessible.columns and 'Camera No' in accessible.columns:
                        for _, row in accessible.iterrows():
                            device_id = str(row['Device ID']).strip()
                            camera_no = str(row['Camera No']).strip()
                            cam_id = f"{device_id}_{camera_no}"
                            online_cameras.add(cam_id)
            except Exception as e:
                print(f"    ⚠️ Error reading {filename}: {e}")
    
    return online_cameras

def load_daily_report_online_cameras(date_str):
    """Load online cameras from daily_camera_reports for a specific date."""
    daily_report_path = os.path.join(BASE_DIR, f'output/daily_camera_reports/combined_daily_reports/{date_str}.xlsx')
    online_cameras = set()
    
    if os.path.exists(daily_report_path):
        try:
            df = pd.read_excel(daily_report_path, sheet_name=f'Report {date_str}')
            
            # Get cameras with "Online" status
            if 'Camera Status' in df.columns and 'Cam ID' in df.columns:
                online = df[df['Camera Status'] == 'Online']
                online_cameras = set(online['Cam ID'].astype(str).str.strip())
        except Exception as e:
            print(f"    ⚠️ Error reading daily report {date_str}: {e}")
    
    return online_cameras

def update_exam_report(exam_folder, config):
    """Update camera status in exam reports."""
    print(f"\n{'='*80}")
    print(f"Processing {config['name']}")
    print(f"{'='*80}")
    
    exam_path = os.path.join(BASE_DIR, 'output', exam_folder)
    
    if not os.path.exists(exam_path):
        print(f"  ⚠️ Folder not found: {exam_path}")
        return
    
    stats = {
        'files_updated': 0,
        'cameras_updated': defaultdict(int),
        'total_online_before': 0,
        'total_online_after': 0
    }
    
    for date_str in config['dates']:
        excel_file = os.path.join(exam_path, f"{date_str}.xlsx")
        
        if not os.path.exists(excel_file):
            continue
        
        print(f"\n  📅 Processing {date_str}...")
        
        # Load reference data
        camera_details_online = load_camera_details_for_date(date_str)
        daily_report_online = load_daily_report_online_cameras(date_str)
        
        print(f"    📊 Camera_Details: {len(camera_details_online)} accessible cameras")
        print(f"    📊 Daily Reports: {len(daily_report_online)} online cameras")
        
        # Load Excel file
        try:
            excel_data = pd.read_excel(excel_file, sheet_name=None)  # Load all sheets
            
            updated_sheets = {}
            file_has_updates = False
            
            for shift_name in config['shifts']:
                if shift_name not in excel_data:
                    continue
                
                df = excel_data[shift_name].copy()
                
                # Count before
                if 'Camera Status' in df.columns:
                    online_before = (df['Camera Status'] == 'Online').sum()
                else:
                    continue
                
                # Update logic
                updates = 0
                
                for idx, row in df.iterrows():
                    cam_id = str(row.get('Cam ID', '')).strip()
                    events = row.get('Events(Excluding Rejected Events)', 0)
                    
                    current_status = row['Camera Status']
                    new_status = current_status
                    
                    # Rule 1: Any camera with ≥1 detection → Online
                    if events >= 1:
                        new_status = 'Online'
                    
                    # Rule 2: Camera in Camera_Details as Accessible → Online
                    elif cam_id in camera_details_online:
                        new_status = 'Online'
                    
                    # Rule 3: Camera in daily reports as Online → Online
                    elif cam_id in daily_report_online:
                        new_status = 'Online'
                    
                    # Update if changed
                    if current_status != new_status:
                        df.at[idx, 'Camera Status'] = new_status
                        updates += 1
                        stats['cameras_updated'][shift_name] += 1
                
                online_after = (df['Camera Status'] == 'Online').sum()
                
                if updates > 0:
                    print(f"      {shift_name}: {online_before} → {online_after} online (+{updates} updates)")
                    updated_sheets[shift_name] = df
                    file_has_updates = True
                    stats['total_online_before'] += online_before
                    stats['total_online_after'] += online_after
                else:
                    print(f"      {shift_name}: {online_before} online (no changes)")
                    updated_sheets[shift_name] = df
                    stats['total_online_before'] += online_before
                    stats['total_online_after'] += online_before
            
            # Copy other sheets as-is
            for sheet_name, sheet_df in excel_data.items():
                if sheet_name not in updated_sheets:
                    updated_sheets[sheet_name] = sheet_df
            
            # Save updated file if changes were made
            if file_has_updates:
                with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
                    # Maintain sheet order
                    for sheet_name in excel_data.keys():
                        if sheet_name in updated_sheets:
                            updated_sheets[sheet_name].to_excel(writer, sheet_name=sheet_name, index=False)
                
                stats['files_updated'] += 1
                print(f"    ✅ File updated: {date_str}.xlsx")
            else:
                print(f"    ℹ️  No changes needed for {date_str}.xlsx")
        
        except Exception as e:
            print(f"    ❌ Error processing {date_str}: {e}")
    
    # Print summary
    print(f"\n  📈 Summary for {config['name']}:")
    print(f"    Files updated: {stats['files_updated']}")
    print(f"    Total online cameras: {stats['total_online_before']} → {stats['total_online_after']}")
    if stats['cameras_updated']:
        print(f"    Updates by shift:")
        for shift, count in stats['cameras_updated'].items():
            print(f"      - {shift}: +{count} cameras")

def main():
    print("="*80)
    print("COMPREHENSIVE CAMERA STATUS UPDATE")
    print("="*80)
    print("\nUpdate Rules:")
    print("  1. Any camera with ≥1 detection event → Online")
    print("  2. Camera marked 'Accessible' in Camera_Details → Online")
    print("  3. Camera marked 'Online' in daily_camera_reports → Online")
    print()
    
    total_stats = {
        'exams_processed': 0,
        'files_updated': 0,
        'cameras_added': 0
    }
    
    for exam_folder, config in EXAM_CONFIGS.items():
        update_exam_report(exam_folder, config)
        total_stats['exams_processed'] += 1
    
    print(f"\n{'='*80}")
    print("OVERALL SUMMARY")
    print(f"{'='*80}")
    print(f"Exams processed: {total_stats['exams_processed']}")
    print(f"\n✅ Camera status update complete!")
    print("\n💡 Next step: Regenerate financial analysis with updated camera counts")
    print("   Run: python3 scripts/generate_financial_analysis_enhanced.py")
    print(f"{'='*80}")

if __name__ == '__main__':
    main()
