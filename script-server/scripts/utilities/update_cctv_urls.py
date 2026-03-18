#!/usr/bin/env python3
"""
Script to update CCTV URLs in accessible_camera_list.xlsx using new_sheet.xlsx
Matches cameras by Camera Name and updates the CCTV URL column.
"""

import pandas as pd
from pathlib import Path
import sys

def update_cctv_urls(old_file_path, new_file_path, output_dir):
    """
    Update CCTV URLs by matching camera names between two Excel files.
    
    Args:
        old_file_path: Path to accessible_camera_list.xlsx (file 1)
        new_file_path: Path to new_sheet.xlsx (file 2)
        output_dir: Directory to save updated files
    """
    print("=" * 80)
    print("CCTV URL Update Script")
    print("=" * 80)
    
    # Load the Excel files
    print(f"\n[1/6] Loading old camera list from: {old_file_path}")
    try:
        df_old = pd.read_excel(old_file_path)
        print(f"   ✓ Loaded {len(df_old)} rows from old file")
    except Exception as e:
        print(f"   ✗ Error loading old file: {e}")
        sys.exit(1)
    
    print(f"\n[2/6] Loading new camera list from: {new_file_path}")
    try:
        df_new = pd.read_excel(new_file_path)
        print(f"   ✓ Loaded {len(df_new)} rows from new file")
    except Exception as e:
        print(f"   ✗ Error loading new file: {e}")
        sys.exit(1)
    
    # Create a lookup dictionary: Camera Name -> CCTV URL
    print("\n[3/6] Creating Camera Name -> CCTV URL lookup dictionary")
    url_lookup = {}
    for _, row in df_new.iterrows():
        camera_name = row.get('Camera Name')
        cctv_url = row.get('CCTV URL')
        if pd.notna(camera_name) and pd.notna(cctv_url):
            url_lookup[str(camera_name).strip()] = str(cctv_url).strip()
    
    print(f"   ✓ Created lookup with {len(url_lookup)} camera entries")
    
    # Update URLs in the old dataframe
    print("\n[4/6] Updating CCTV URLs...")
    updated_count = 0
    not_found_count = 0
    
    for idx, row in df_old.iterrows():
        camera_name = row.get('Camera Name')
        if pd.notna(camera_name):
            camera_name_clean = str(camera_name).strip()
            if camera_name_clean in url_lookup:
                df_old.at[idx, 'CCTV URL'] = url_lookup[camera_name_clean]
                updated_count += 1
            else:
                not_found_count += 1
    
    print(f"   ✓ Updated: {updated_count} cameras")
    print(f"   ✗ Not found in new file: {not_found_count} cameras")
    
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Save the updated dataframe with multiple names
    print(f"\n[5/6] Creating output directory: {output_dir}")
    print(f"   ✓ Directory ready")
    
    print("\n[6/6] Saving updated files...")
    output_files = [
        'accessible_cameras_crowd.xlsx',
        'accessible_cameras_entry.xlsx',
        'accessible_cameras_intruder.xlsx',
        'accessible_cameras_invigilator.xlsx',
        'accessible_cameras_phone.xlsx',
        'accessible_cameras_proximity.xlsx',
        'accessible_cameras_server.xlsx'
    ]
    
    for filename in output_files:
        output_file = output_path / filename
        try:
            df_old.to_excel(output_file, index=False, engine='openpyxl')
            print(f"   ✓ Saved: {filename}")
        except Exception as e:
            print(f"   ✗ Error saving {filename}: {e}")
    
    print("\n" + "=" * 80)
    print("Update Complete!")
    print("=" * 80)
    print(f"\nSummary:")
    print(f"  • Total cameras in old file: {len(df_old)}")
    print(f"  • URLs updated: {updated_count}")
    print(f"  • URLs not found: {not_found_count}")
    print(f"  • Files saved: {len(output_files)}")
    print(f"  • Output directory: {output_dir}")
    print("=" * 80)


if __name__ == "__main__":
    # Define file paths
    base_dir = Path(__file__).resolve().parent.parent.parent
    
    old_file = base_dir / "cctv_classfication" / "results" / "tcs_classification" / "accessible_classified_20260102_190400.xlsx"
    new_file = base_dir / "cctv_classfication" / "new_sheet_5_jan.xlsx"
    output_directory = base_dir / "cctv_classfication" / "results" / "tcs_classification"
    
    # Verify input files exist
    if not old_file.exists():
        print(f"Error: Old camera list file not found at: {old_file}")
        sys.exit(1)
    
    if not new_file.exists():
        print(f"Error: New sheet file not found at: {new_file}")
        sys.exit(1)
    
    # Run the update
    update_cctv_urls(
        old_file_path=str(old_file),
        new_file_path=str(new_file),
        output_dir=str(output_directory)
    )
