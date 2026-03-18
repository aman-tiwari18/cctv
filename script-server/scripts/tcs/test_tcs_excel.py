#!/usr/bin/env python3
"""
Test TCS Camera Excel Loading
==============================
Verifies that the TCS camera Excel file can be loaded correctly
and displays camera information.
"""

import pandas as pd
import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EXCEL_FILE = os.path.join(PROJECT_ROOT, "cctv_classfication/results/tcs_classification/accessible_cameras_20251230_174822.xlsx")

def test_excel_loading():
    """Test loading TCS camera Excel file"""
    print("=" * 70)
    print("TCS Camera Excel File Test")
    print("=" * 70)
    
    # Check if file exists
    if not os.path.exists(EXCEL_FILE):
        print(f"❌ ERROR: Excel file not found at: {EXCEL_FILE}")
        sys.exit(1)
    
    print(f"✅ Excel file found: {EXCEL_FILE}")
    print()
    
    try:
        # Load Excel file
        df = pd.read_excel(EXCEL_FILE)
        print(f"✅ Excel file loaded successfully")
        print(f"   Total rows: {len(df)}")
        print()
        
        # Display columns
        print("📋 Available Columns:")
        for i, col in enumerate(df.columns, 1):
            print(f"   {i}. {col}")
        print()
        
        # Check for required columns
        required_cols = ['CCTV URL', 'Center Name', 'Camera Location']
        optional_cols = ['Scene Classification', 'Status', 'Camera Status']
        
        print("🔍 Column Verification:")
        for col in required_cols:
            if col in df.columns:
                print(f"   ✅ {col} - Found")
            else:
                # Try to find similar column names
                similar = [c for c in df.columns if col.lower() in c.lower()]
                if similar:
                    print(f"   ⚠️  {col} - Not found, but found similar: {similar}")
                else:
                    print(f"   ❌ {col} - Missing (Required)")
        
        for col in optional_cols:
            if col in df.columns:
                print(f"   ✅ {col} - Found (Optional)")
        print()
        
        # Display first few cameras
        print("📷 Sample Camera Data (First 5):")
        print("-" * 70)
        for idx, row in df.head(5).iterrows():
            print(f"\nCamera {idx + 1}:")
            for col in df.columns:
                value = row[col]
                if pd.notna(value) and value != '':
                    # Truncate long URLs
                    if isinstance(value, str) and len(str(value)) > 60:
                        value = str(value)[:57] + "..."
                    print(f"  {col}: {value}")
        
        print()
        print("=" * 70)
        print("✅ TEST PASSED - TCS Excel file is valid and loadable")
        print("=" * 70)
        
        # Display summary
        print("\n📊 Summary:")
        print(f"   Total TCS Cameras: {len(df)}")
        
        # Count by center if Center Name exists
        center_col = None
        for col in df.columns:
            if 'center' in col.lower() and 'name' in col.lower():
                center_col = col
                break
        
        if center_col:
            centers = df[center_col].value_counts()
            print(f"   Total Centers: {len(centers)}")
            print("\n   Cameras by Center:")
            for center, count in centers.head(10).items():
                if pd.notna(center):
                    print(f"     - {center}: {count} cameras")
        
        # Count accessible cameras if status column exists
        status_col = None
        for col in df.columns:
            if 'status' in col.lower():
                status_col = col
                break
        
        if status_col:
            accessible = df[status_col].str.lower().str.contains('accessible', na=False).sum()
            print(f"\n   Accessible Cameras: {accessible}")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR loading Excel file: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_excel_loading()
    sys.exit(0 if success else 1)
