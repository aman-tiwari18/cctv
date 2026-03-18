#!/usr/bin/env python3
"""
Copy Excel Sheet Script

Creates copies of new_sheet.xlsx to new_sheet1.xlsx through new_sheet7.xlsx.
Overwrites existing files if they exist and updates column names.

Usage:
    python copy_sheets.py
"""

import shutil
import os
import sys
from pathlib import Path
import pandas as pd

# Configuration
SOURCE_FILE = '../../cctv_classfication/sheet.xlsx'  # Fixed typo: classfication not classification
TARGET_DIR = '../../data/sheets'  # Target directory for new sheets
TARGET_COPIES = 7  # Create new_sheet1.xlsx through new_sheet7.xlsx

# Column name mapping (old_name: new_name)
COLUMN_MAPPING = {
    'Device ID': 'device_id',
    'Camera No': 'camera_no',
    'scence classification': 'Scene Classification'
}


def update_column_names(file_path):
    """Update column names in the Excel file"""
    try:
        # Read Excel file
        df = pd.read_excel(file_path)
        
        # Apply column mapping
        df = df.rename(columns=COLUMN_MAPPING)
        renamed_cols = [new_name for old_name, new_name in COLUMN_MAPPING.items() if old_name in df.columns]
        
        if renamed_cols:
            print(f"   → Renamed columns: {', '.join(renamed_cols)}")
        else:
            print(f"   ⚠ Warning: No matching columns found to rename")
        
        # Save back to Excel
        df.to_excel(file_path, index=False)
        return True
        
    except Exception as e:
        print(f"   ✗ Failed to update columns: {e}")
        return False


def copy_sheet_files():
    """Copy source Excel file to multiple numbered copies and update column names"""
    
    # Check if source file exists
    if not os.path.exists(SOURCE_FILE):
        print(f"❌ Error: Source file '{SOURCE_FILE}' not found!")
        print(f"   Current directory: {os.getcwd()}")
        return False
    
    # Create target directory if it doesn't exist
    os.makedirs(TARGET_DIR, exist_ok=True)
    print(f"✓ Target directory ready: {TARGET_DIR}\n")
    
    print("="*60)
    print("📋 EXCEL SHEET COPY UTILITY")
    print("="*60)
    print(f"Source file: {SOURCE_FILE}")
    print(f"Target directory: {TARGET_DIR}")
    print(f"Target copies: {TARGET_COPIES + 1} files (new_sheet.xlsx + new_sheet1-7.xlsx)")
    print("="*60 + "\n")
    
    success_count = 0
    failed_count = 0
    
    # First create new_sheet.xlsx (without number)
    target_file = os.path.join(TARGET_DIR, 'new_sheet.xlsx')
    try:
        # Copy file (overwrites if exists)
        shutil.copy2(SOURCE_FILE, target_file)
        
        # Get file size for confirmation
        size = os.path.getsize(target_file)
        size_kb = size / 1024
        
        print(f"✓ Created: new_sheet.xlsx ({size_kb:.2f} KB)")
        
        # Update column names in the copied file
        if update_column_names(target_file):
            success_count += 1
        else:
            failed_count += 1
        
    except Exception as e:
        print(f"✗ Failed to copy to new_sheet.xlsx: {e}")
        failed_count += 1
    
    # Then create new_sheet1.xlsx through new_sheet7.xlsx
    for i in range(1, TARGET_COPIES + 1):
        target_file = os.path.join(TARGET_DIR, f'new_sheet{i}.xlsx')
        
        try:
            # Copy file (overwrites if exists)
            shutil.copy2(SOURCE_FILE, target_file)
            
            # Get file size for confirmation
            size = os.path.getsize(target_file)
            size_kb = size / 1024
            
            print(f"✓ Created: new_sheet{i}.xlsx ({size_kb:.2f} KB)")
            
            # Update column names in the copied file
            if update_column_names(target_file):
                success_count += 1
            else:
                failed_count += 1
            
        except Exception as e:
            print(f"✗ Failed to copy to new_sheet{i}.xlsx: {e}")
            failed_count += 1
    
    # Summary
    print("\n" + "="*60)
    print("📊 SUMMARY")
    print("="*60)
    print(f"Successfully copied: {success_count}/{TARGET_COPIES + 1} files")
    if failed_count > 0:
        print(f"Failed copies:       {failed_count} files")
    print("="*60)
    
    return failed_count == 0


def main():
    """Main execution"""
    try:
        success = copy_sheet_files()
        if success:
            print("\n✅ All files copied successfully!")
            sys.exit(0)
        else:
            print("\n⚠️  Some files failed to copy. Check errors above.")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Operation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
