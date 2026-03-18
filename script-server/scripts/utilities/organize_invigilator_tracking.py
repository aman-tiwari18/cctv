#!/usr/bin/env python3
"""
Organize invigilator tracking images by date, shift, and camera/category.

Workflow:
1. Scan invigilator_tracking folder for all camera folders
2. For each camera, scan annotated, no_targets, static_person folders
3. Extract date and time from filename (YYYYMMDD_HHMMSS format)
4. Determine shift based on hour (9-11, 13-15, 16-18)
5. Create organized directory structure in new_results
6. Copy images to respective locations preserving camera and category structure
"""

import os
import shutil
from datetime import datetime
from pathlib import Path
import logging
import re

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('organize_invigilator_tracking.log'),
        logging.StreamHandler()
    ]
)

# Configuration
SOURCE_BASE = 'invigilator_tracking'
OUTPUT_BASE = 'new_results'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}
VALID_DATES = set(range(18, 28))  # 18-27 Nov
IMAGE_CATEGORIES = ['annotated', 'no_targets', 'static_person']

# Shift timings
SHIFT_TIMINGS = {
    'shift_1': (9, 11),      # 9-11 AM
    'shift_2': (13, 15),     # 1-3 PM
    'shift_3': (16, 18),     # 4-6 PM
}


def extract_timestamp_from_filename(filename):
    """
    Extract date and hour from filename format: [CAMERA_NAME]_[category]_YYYYMMDD_HHMMSS.jpg
    Returns: (date_day, hour) or (None, None) if unable to extract
    """
    try:
        # Match pattern: YYYYMMDD_HHMMSS anywhere in filename
        match = re.search(r'(\d{8})_(\d{6})', filename)
        if match:
            date_str = match.group(1)  # YYYYMMDD
            time_str = match.group(2)  # HHMMSS
            
            # Extract day and hour
            day = int(date_str[6:8])  # DD from YYYYMMDD
            hour = int(time_str[0:2])  # HH from HHMMSS
            
            return day, hour
        else:
            return None, None
    except Exception as e:
        logging.warning(f"Failed to extract timestamp from {filename}: {e}")
        return None, None


def get_shift(hour):
    """
    Determine shift based on hour.
    Returns: 'shift_1', 'shift_2', 'shift_3' or None
    """
    if 9 <= hour <= 11:
        return 'shift_1'
    elif 13 <= hour <= 15:
        return 'shift_2'
    elif 16 <= hour <= 18:
        return 'shift_3'
    else:
        return None


def create_camera_category_folders():
    """Create all camera and category folder structures in new_results"""
    try:
        source_base_path = Path(SOURCE_BASE)
        
        # Get all camera folders
        camera_folders = [f.name for f in source_base_path.iterdir() 
                         if f.is_dir()]
        
        logging.info(f"Found {len(camera_folders)} camera/location folders")
        
        # For each date and shift, create camera structure
        for day in VALID_DATES:
            for shift in SHIFT_TIMINGS.keys():
                base_path = os.path.join(OUTPUT_BASE, f'{day:02d}_Nov', shift, 'invigilator_tracking')
                
                # Create camera folders with their category subfolders
                for camera_name in camera_folders:
                    for category in IMAGE_CATEGORIES:
                        category_path = os.path.join(base_path, camera_name, category)
                        os.makedirs(category_path, exist_ok=True)
        
        logging.info(f"✓ Directory structure created for invigilator_tracking")
        return True
    except Exception as e:
        logging.error(f"✗ Failed to create directory structure: {e}")
        return False


def organize_invigilator_images():
    """Scan invigilator_tracking folders and organize images"""
    stats = {
        'total_images': 0,
        'copied_images': 0,
        'skipped_images': 0,
        'error_images': 0,
        'by_camera': {}
    }
    
    source_base_path = Path(SOURCE_BASE)
    
    # Process each camera folder
    for camera_folder in sorted(source_base_path.iterdir()):
        if not camera_folder.is_dir():
            continue
        
        camera_name = camera_folder.name
        logging.info(f"\n📹 Processing camera: {camera_name}")
        
        if camera_name not in stats['by_camera']:
            stats['by_camera'][camera_name] = 0
        
        # Process each category folder
        for category in IMAGE_CATEGORIES:
            category_path = camera_folder / category
            
            if not category_path.exists():
                logging.info(f"  ⚠ Category folder not found: {category}")
                continue
            
            # Get all image files
            image_files = [f for f in category_path.iterdir() 
                          if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
            
            if len(image_files) == 0:
                logging.info(f"  ℹ No images in {category}/")
                continue
            
            logging.info(f"  Found {len(image_files)} image(s) in {category}/")
            
            # Process each image
            for image_file in image_files:
                stats['total_images'] += 1
                
                # Extract timestamp from filename
                day, hour = extract_timestamp_from_filename(image_file.name)
                
                if day is None or hour is None:
                    logging.warning(f"    ⚠ Could not extract timestamp: {image_file.name}")
                    stats['skipped_images'] += 1
                    continue
                
                # Validate date is within range
                if day not in VALID_DATES:
                    logging.info(f"    ⏭ Skipping (outside date range 18-27): {image_file.name} (Date: {day})")
                    stats['skipped_images'] += 1
                    continue
                
                # Get shift
                shift = get_shift(hour)
                
                if shift is None:
                    logging.info(f"    ⏭ Skipping (outside shift hours): {image_file.name} (Hour: {hour}:00)")
                    stats['skipped_images'] += 1
                    continue
                
                # Build destination path
                dest_dir = os.path.join(
                    OUTPUT_BASE,
                    f'{day:02d}_Nov',
                    shift,
                    'invigilator_tracking',
                    camera_name,
                    category
                )
                
                dest_path = os.path.join(dest_dir, image_file.name)
                
                try:
                    # Copy image
                    shutil.copy2(str(image_file), dest_path)
                    stats['copied_images'] += 1
                    stats['by_camera'][camera_name] += 1
                    
                    logging.info(
                        f"    ✓ Copied: {image_file.name} "
                        f"→ {day:02d}_Nov/{shift}/invigilator_tracking/{camera_name}/{category}/ "
                        f"(Hour: {hour}:00)"
                    )
                except Exception as e:
                    logging.error(f"    ✗ Error copying {image_file.name}: {e}")
                    stats['error_images'] += 1
    
    return stats


def print_summary(stats):
    """Print summary statistics"""
    logging.info("\n" + "="*80)
    logging.info("📊 INVIGILATOR TRACKING ORGANIZATION SUMMARY")
    logging.info("="*80)
    logging.info(f"Total images found:     {stats['total_images']}")
    logging.info(f"Images copied:          {stats['copied_images']}")
    logging.info(f"Images skipped:         {stats['skipped_images']}")
    logging.info(f"Errors:                 {stats['error_images']}")
    logging.info("\nBreakdown by camera:")
    
    # Sort and display top cameras by image count
    sorted_cameras = sorted(stats['by_camera'].items(), key=lambda x: x[1], reverse=True)
    for camera_name, count in sorted_cameras:
        if count > 0:
            logging.info(f"  • {camera_name}: {count}")
    
    logging.info("="*80 + "\n")


def main():
    """Main execution"""
    logging.info("🚀 Starting invigilator tracking image organization process...\n")
    
    # Step 1: Create directory structure
    logging.info("Step 1: Creating directory structure for all cameras and categories...")
    if not create_camera_category_folders():
        logging.error("Failed to create directory structure. Aborting.")
        return
    
    # Step 2: Organize images
    logging.info("\nStep 2: Organizing invigilator tracking images by date, shift, camera, and category...")
    stats = organize_invigilator_images()
    
    # Step 3: Print summary
    print_summary(stats)
    
    logging.info("✅ Invigilator tracking image organization complete!")


if __name__ == "__main__":
    main()
