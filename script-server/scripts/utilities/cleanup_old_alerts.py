#!/usr/bin/env python3
"""
Cleanup Old Alert Images Script

Deletes all alert images from result folders except today's alerts.
Preserves current day's detections while cleaning up older data.

Features:
- Scans all detection result folders
- Identifies images based on date in filename
- Keeps only today's images (based on system date)
- Creates backup option before deletion
- Provides detailed logging and statistics
- Dry-run mode for safety

Usage:
    python cleanup_old_alerts.py              # Dry run (no deletion)
    python cleanup_old_alerts.py --delete     # Actually delete files
    python cleanup_old_alerts.py --backup     # Create backup before deletion
"""

import os
import sys
import shutil
import argparse
from datetime import datetime, date
from pathlib import Path
import logging
import re

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('cleanup_old_alerts.log'),
        logging.StreamHandler()
    ]
)

# Configuration - Result folders containing alert images
# Note: client_selected_results is excluded as it contains admin-selected alerts
RESULT_FOLDERS = [
    'intruder_detection_results',
    'entry_exit_detection_results',
    'server_room_detection_results',
    'phone_detection_results',
    'crowd_detection_results',
    'proximity_detection_results',
    'invigilator_detection_results',
]

# Image file extensions to process
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp'}

# Backup directory
BACKUP_DIR = 'alert_backups'


def extract_date_from_filename(filename):
    """
    Extract date from various filename formats used in the system.
    
    Supported formats:
    - YYYYMMDD_HHMMSS (e.g., 20251128_094318)
    - device_camera_YYYYMMDD_HHMMSS_info.jpg
    - violation_device_camera_YYYYMMDD_HHMMSS_info.jpg
    - phone_detected_device_camera_YYYYMMDD_info.jpg
    
    Returns: date object or None
    """
    try:
        # Pattern 1: YYYYMMDD_HHMMSS anywhere in filename
        match = re.search(r'(\d{8})_\d{6}', filename)
        if match:
            date_str = match.group(1)
            year = int(date_str[0:4])
            month = int(date_str[4:6])
            day = int(date_str[6:8])
            return date(year, month, day)
        
        # Pattern 2: YYYYMMDD without time
        match = re.search(r'(\d{8})', filename)
        if match:
            date_str = match.group(1)
            year = int(date_str[0:4])
            month = int(date_str[4:6])
            day = int(date_str[6:8])
            return date(year, month, day)
        
        return None
    except (ValueError, IndexError) as e:
        logging.debug(f"Failed to extract date from {filename}: {e}")
        return None


def get_file_modification_date(file_path):
    """Get file modification date as fallback"""
    try:
        timestamp = os.path.getmtime(file_path)
        return datetime.fromtimestamp(timestamp).date()
    except Exception as e:
        logging.warning(f"Failed to get modification date for {file_path}: {e}")
        return None


def should_delete_file(file_path, today, use_filename=True):
    """
    Determine if file should be deleted based on date.
    
    Args:
        file_path: Path to the image file
        today: Today's date object
        use_filename: Try to extract date from filename first
    
    Returns: (should_delete, file_date)
    """
    filename = os.path.basename(file_path)
    
    # Try to extract date from filename
    if use_filename:
        file_date = extract_date_from_filename(filename)
        if file_date:
            return file_date < today, file_date
    
    # Fallback to file modification date
    file_date = get_file_modification_date(file_path)
    if file_date:
        return file_date < today, file_date
    
    # If unable to determine date, don't delete for safety
    logging.warning(f"Could not determine date for: {filename}")
    return False, None


def scan_folder(folder_path, today, dry_run=True):
    """
    Scan a folder and identify old alert images.
    
    Returns: dict with statistics and file lists
    """
    stats = {
        'total_files': 0,
        'today_files': 0,
        'old_files': 0,
        'to_delete': [],
        'to_keep': [],
        'unknown_date': [],
        'size_to_free': 0,  # in bytes
    }
    
    if not os.path.exists(folder_path):
        logging.info(f"  Folder not found: {folder_path}")
        return stats
    
    # Walk through all subdirectories
    for root, dirs, files in os.walk(folder_path):
        for filename in files:
            # Check if it's an image file
            if not any(filename.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
                continue
            
            file_path = os.path.join(root, filename)
            stats['total_files'] += 1
            
            # Determine if file should be deleted
            should_delete, file_date = should_delete_file(file_path, today)
            
            if file_date is None:
                stats['unknown_date'].append(file_path)
            elif should_delete:
                stats['old_files'] += 1
                stats['to_delete'].append(file_path)
                try:
                    stats['size_to_free'] += os.path.getsize(file_path)
                except:
                    pass
            else:
                stats['today_files'] += 1
                stats['to_keep'].append(file_path)
    
    return stats


def create_backup(files_to_backup):
    """Create backup of files before deletion"""
    if not files_to_backup:
        return True
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(BACKUP_DIR, f'backup_{timestamp}')
    
    try:
        os.makedirs(backup_path, exist_ok=True)
        logging.info(f"Creating backup in: {backup_path}")
        
        for file_path in files_to_backup:
            try:
                # Preserve directory structure in backup
                rel_path = os.path.relpath(file_path)
                dest_path = os.path.join(backup_path, rel_path)
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                shutil.copy2(file_path, dest_path)
            except Exception as e:
                logging.error(f"  Failed to backup {file_path}: {e}")
        
        logging.info(f"✓ Backup created successfully")
        return True
    except Exception as e:
        logging.error(f"✗ Failed to create backup: {e}")
        return False


def delete_files(files_to_delete, dry_run=True):
    """Delete specified files"""
    deleted_count = 0
    failed_count = 0
    
    for file_path in files_to_delete:
        try:
            if dry_run:
                logging.debug(f"  [DRY RUN] Would delete: {file_path}")
            else:
                os.remove(file_path)
                logging.debug(f"  Deleted: {file_path}")
            deleted_count += 1
        except Exception as e:
            logging.error(f"  Failed to delete {file_path}: {e}")
            failed_count += 1
    
    return deleted_count, failed_count


def format_size(size_bytes):
    """Format bytes to human readable size"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def print_summary(all_stats, dry_run=True):
    """Print summary of scan/deletion operation"""
    total_files = sum(s['total_files'] for s in all_stats.values())
    total_today = sum(s['today_files'] for s in all_stats.values())
    total_old = sum(s['old_files'] for s in all_stats.values())
    total_unknown = sum(len(s['unknown_date']) for s in all_stats.values())
    total_size = sum(s['size_to_free'] for s in all_stats.values())
    
    mode = "DRY RUN" if dry_run else "DELETION"
    
    print("\n" + "="*80)
    print(f"📊 CLEANUP SUMMARY - {mode} MODE")
    print("="*80)
    print(f"Today's date:           {date.today().strftime('%Y-%m-%d (%B %d, %Y)')}")
    print(f"Total images found:     {total_files}")
    print(f"Today's images (keep):  {total_today}")
    print(f"Older images (delete):  {total_old}")
    print(f"Unknown date (keep):    {total_unknown}")
    print(f"Space to be freed:      {format_size(total_size)}")
    print("\n" + "-"*80)
    print("Breakdown by folder:")
    print("-"*80)
    
    for folder_name, stats in sorted(all_stats.items()):
        if stats['total_files'] > 0:
            print(f"\n📁 {folder_name}")
            print(f"   Total: {stats['total_files']} | "
                  f"Keep: {stats['today_files']} | "
                  f"Delete: {stats['old_files']} | "
                  f"Free: {format_size(stats['size_to_free'])}")
    
    print("\n" + "="*80)
    
    if dry_run:
        print("⚠️  DRY RUN MODE - No files were actually deleted")
        print("   Run with --delete flag to actually remove files")
        print("   Run with --backup flag to create backup before deletion")
    else:
        print("✅ Files have been deleted successfully")
    print("="*80 + "\n")


def main():
    """Main execution"""
    parser = argparse.ArgumentParser(
        description='Cleanup old alert images, keeping only today\'s alerts',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python cleanup_old_alerts.py                # Dry run (safe preview)
  python cleanup_old_alerts.py --delete       # Actually delete files
  python cleanup_old_alerts.py --backup       # Backup before deletion
  python cleanup_old_alerts.py --verbose      # Show detailed logs
        """
    )
    
    parser.add_argument('--delete', action='store_true',
                       help='Actually delete files (default: dry run)')
    parser.add_argument('--backup', action='store_true',
                       help='Create backup before deletion')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    dry_run = not args.delete
    today = date.today()
    
    # Header
    print("\n" + "="*80)
    print("🧹 ALERT IMAGE CLEANUP UTILITY")
    print("="*80)
    print(f"Mode:        {'🔍 DRY RUN (Preview Only)' if dry_run else '🗑️  DELETE MODE'}")
    print(f"Today:       {today.strftime('%Y-%m-%d (%B %d, %Y)')}")
    print(f"Backup:      {'✓ Enabled' if args.backup else '✗ Disabled'}")
    print("="*80 + "\n")
    
    if not dry_run:
        response = input("⚠️  You are about to DELETE old alert images. Continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Operation cancelled.")
            return
        print()
    
    # Scan all result folders
    all_stats = {}
    all_files_to_delete = []
    
    logging.info("Scanning result folders...")
    for folder_name in RESULT_FOLDERS:
        logging.info(f"\nScanning: {folder_name}")
        stats = scan_folder(folder_name, today, dry_run)
        all_stats[folder_name] = stats
        all_files_to_delete.extend(stats['to_delete'])
        
        if stats['total_files'] > 0:
            logging.info(f"  Total: {stats['total_files']}, "
                        f"Keep: {stats['today_files']}, "
                        f"Delete: {stats['old_files']}")
    
    # Create backup if requested
    if args.backup and not dry_run and all_files_to_delete:
        logging.info("\n" + "-"*80)
        if not create_backup(all_files_to_delete):
            response = input("\n⚠️  Backup failed. Continue with deletion anyway? (yes/no): ")
            if response.lower() != 'yes':
                print("Operation cancelled.")
                return
    
    # Delete files
    if all_files_to_delete and not dry_run:
        logging.info("\n" + "-"*80)
        logging.info("Starting deletion process...")
        deleted, failed = delete_files(all_files_to_delete, dry_run=False)
        logging.info(f"Deleted: {deleted} files, Failed: {failed} files")
    
    # Print summary
    print_summary(all_stats, dry_run)
    
    # Save detailed log
    if not dry_run and all_files_to_delete:
        log_file = f'cleanup_deleted_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt'
        with open(log_file, 'w') as f:
            f.write(f"Cleanup performed on: {datetime.now()}\n")
            f.write(f"Total files deleted: {len(all_files_to_delete)}\n\n")
            f.write("Deleted files:\n")
            for file_path in all_files_to_delete:
                f.write(f"{file_path}\n")
        logging.info(f"Detailed log saved to: {log_file}")
    
    logging.info("✅ Cleanup process complete!")


if __name__ == "__main__":
    main()
