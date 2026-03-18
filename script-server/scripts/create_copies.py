import shutil
import os

# Original file
source_file = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification/complete_results_20260312_113406.xlsx"

# Destination folder
dest_folder = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_classification"

# New filenames
new_files = [
    "accessible_cameras_crowd.xlsx",
    "accessible_cameras_entry.xlsx",
    "accessible_cameras_intruder.xlsx",
    "accessible_cameras_invigilator.xlsx",
    "accessible_cameras_phone.xlsx",
    "accessible_cameras_proximity.xlsx",
    "accessible_cameras_server.xlsx"
]

# Copy file with new names
for name in new_files:
    dest_path = os.path.join(dest_folder, name)
    shutil.copy(source_file, dest_path)
    print(f"Created: {dest_path}")

print("✅ All files created successfully")