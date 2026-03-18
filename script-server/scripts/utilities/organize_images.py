#!/usr/bin/env python3
"""
Organize detection images by date, shift, and detection type.

Workflow:
1. Scan source folders for images
2. Extract timestamp from image metadata
3. Determine detection type from source folder
4. Determine shift based on hour (9-11, 13-15, 16-18)
5. Create organized directory structure
6. Copy images to respective locations
"""

import os
import shutil
from datetime import datetime
from pathlib import Path
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('organize_images.log'),
        logging.StreamHandler()
    ]
)

# Configuration
SOURCE_FOLDERS = {
    'intruder_detection_results': 'intruder_detection',
    'entry_exit_detection_results': 'entry_exit_detection',
    'server_room_detection_results': 'server_room_detection',
    'phone_detection_results': 'phone_detection',
    'crowd_detection_results': 'crowd_detection',
    'proximity_detection_results': 'proximity_detection',
    'invigilator_detection_results': 'invigilator_detection',
}

OUTPUT_BASE = 'new_results'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}
VALID_DATES = set(range(18, 28))  # 18-27 Nov

# Shift timings
SHIFT_TIMINGS = {
    'shift_1': (9, 11),      # 9-11 AM
    'shift_2': (13, 15),     # 1-3 PM
    'shift_3': (16, 18),     # 4-6 PM
}


def get_image_timestamp(image_path):
    """
    Extract timestamp from image metadata using file modification time.
    Returns: (date_day, hour) or (None, None) if unable to extract
    """
    try:
        timestamp = os.path.getmtime(image_path)
        dt = datetime.fromtimestamp(timestamp)
        return dt.day, dt.hour
    except Exception as e:
        logging.warning(f"Failed to get timestamp for {image_path}: {e}")
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


def create_directory_structure():
    """Create the complete directory structure for new_results"""
    try:
        # Create base output directory
        os.makedirs(OUTPUT_BASE, exist_ok=True)
        
        # Create date folders
        for day in VALID_DATES:
            date_folder = os.path.join(OUTPUT_BASE, f'{day:02d}_Nov')
            os.makedirs(date_folder, exist_ok=True)
            
            # Create shift folders
            for shift in SHIFT_TIMINGS.keys():
                shift_folder = os.path.join(date_folder, shift)
                os.makedirs(shift_folder, exist_ok=True)
                
                # Create detection type folders
                for detection_type in SOURCE_FOLDERS.values():
                    detection_folder = os.path.join(shift_folder, detection_type)
                    os.makedirs(detection_folder, exist_ok=True)
        
        logging.info(f"✓ Directory structure created successfully in '{OUTPUT_BASE}'")
        return True
    except Exception as e:
        logging.error(f"✗ Failed to create directory structure: {e}")
        return False


def organize_images():
    """Scan source folders and organize images"""
    stats = {
        'total_images': 0,
        'copied_images': 0,
        'skipped_images': 0,
        'error_images': 0,
        'by_detection_type': {}
    }
    
    # Initialize stats for each detection type
    for detection_type in SOURCE_FOLDERS.values():
        stats['by_detection_type'][detection_type] = 0
    
    # Process each source folder
    for source_folder, detection_type in SOURCE_FOLDERS.items():
        source_path = Path(source_folder)
        
        if not source_path.exists():
            logging.warning(f"⚠ Source folder not found: {source_folder}")
            continue
        
        logging.info(f"\n📁 Processing folder: {source_folder} → {detection_type}")
        
        # Get all image files at top level
        image_files = [f for f in source_path.iterdir() 
                      if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
        
        logging.info(f"  Found {len(image_files)} image(s)")
        
        # Process each image
        for image_file in image_files:
            stats['total_images'] += 1
            
            # Get image timestamp
            day, hour = get_image_timestamp(str(image_file))
            
            if day is None or hour is None:
                logging.warning(f"  ⚠ Could not extract timestamp: {image_file.name}")
                stats['skipped_images'] += 1
                continue
            
            # Validate date is within range
            if day not in VALID_DATES:
                logging.info(f"  ⏭ Skipping (outside date range 18-27): {image_file.name} (Date: {day})")
                stats['skipped_images'] += 1
                continue
            
            # Get shift
            shift = get_shift(hour)
            
            if shift is None:
                logging.info(f"  ⏭ Skipping (outside shift hours): {image_file.name} (Hour: {hour}:00)")
                stats['skipped_images'] += 1
                continue
            
            # Build destination path
            dest_dir = os.path.join(
                OUTPUT_BASE,
                f'{day:02d}_Nov',
                shift,
                detection_type
            )
            
            dest_path = os.path.join(dest_dir, image_file.name)
            
            try:
                # Copy image
                shutil.copy2(str(image_file), dest_path)
                stats['copied_images'] += 1
                stats['by_detection_type'][detection_type] += 1
                
                logging.info(
                    f"  ✓ Copied: {image_file.name} "
                    f"→ {day:02d}_Nov/{shift}/{detection_type}/ "
                    f"(Hour: {hour}:00)"
                )
            except Exception as e:
                logging.error(f"  ✗ Error copying {image_file.name}: {e}")
                stats['error_images'] += 1
    
    return stats


def print_summary(stats):
    """Print summary statistics"""
    logging.info("\n" + "="*70)
    logging.info("📊 ORGANIZATION SUMMARY")
    logging.info("="*70)
    logging.info(f"Total images found:     {stats['total_images']}")
    logging.info(f"Images copied:          {stats['copied_images']}")
    logging.info(f"Images skipped:         {stats['skipped_images']}")
    logging.info(f"Errors:                 {stats['error_images']}")
    logging.info("\nBreakdown by detection type:")
    for detection_type, count in stats['by_detection_type'].items():
        logging.info(f"  • {detection_type}: {count}")
    logging.info("="*70 + "\n")


def main():
    """Main execution"""
    logging.info("🚀 Starting image organization process...\n")
    
    # Step 1: Create directory structure
    logging.info("Step 1: Creating directory structure...")
    if not create_directory_structure():
        logging.error("Failed to create directory structure. Aborting.")
        return
    
    # Step 2: Organize images
    logging.info("\nStep 2: Organizing images by date, shift, and detection type...")
    stats = organize_images()
    
    # Step 3: Print summary
    print_summary(stats)
    
    logging.info("✅ Image organization complete!")


if __name__ == "__main__":
    main()
