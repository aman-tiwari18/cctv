import os
import shutil
import pymysql
import zipfile
from pathlib import Path

# Database Configuration
DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = "rootpassword123"
DB_NAME = "cctv_monitoring"
EXAM_ID = 25

# Directories
OUTPUT_DIR = "/data/cctv_dev/cctv/reneet_online_cameras_frames"
ZIP_FILE = "/data/cctv_dev/cctv/reneet_online_cameras_frames.zip"

def main():
    if os.path.exists(OUTPUT_DIR):
        print(f"Cleaning up existing directory {OUTPUT_DIR}...")
        shutil.rmtree(OUTPUT_DIR)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("Connecting to database...")
    try:
        connection = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            cursorclass=pymysql.cursors.DictCursor
        )
    except Exception as e:
        print(f"Failed to connect to DB: {e}")
        return

    try:
        with connection.cursor() as cursor:
            # Query for RENEET (exam_id=25) where status is 'Accessible'
            query = """
                SELECT id, device_id, camera_no, frame_path 
                FROM camera_links_rtsp 
                WHERE exam_id = %s 
                  AND status = 'Accessible' 
                  AND frame_path IS NOT NULL
                  AND frame_path != ''
            """
            cursor.execute(query, (EXAM_ID,))
            records = cursor.fetchall()
            
            total_records = len(records)
            print(f"Found {total_records} records matching criteria.")
            
            copied_count = 0
            missing_count = 0
            
            for index, row in enumerate(records, start=1):
                frame_path = row['frame_path']
                
                # Check if file exists
                if os.path.isfile(frame_path):
                    # Use the basename of the file. If there are duplicates, append the DB id
                    basename = os.path.basename(frame_path)
                    dest_path = os.path.join(OUTPUT_DIR, basename)
                    
                    if os.path.exists(dest_path):
                        # Avoid overwriting if basenames collide
                        name, ext = os.path.splitext(basename)
                        dest_path = os.path.join(OUTPUT_DIR, f"{name}_{row['id']}{ext}")
                    
                    shutil.copy2(frame_path, dest_path)
                    copied_count += 1
                else:
                    missing_count += 1
                    
                if index % 1000 == 0:
                    print(f"Processed {index}/{total_records} records...")
                    
            print(f"Finished copying. Copied: {copied_count}, Missing: {missing_count}")
            
    finally:
        connection.close()

    print(f"Creating zip file at {ZIP_FILE}...")
    shutil.make_archive(OUTPUT_DIR, 'zip', OUTPUT_DIR)
    print("Zip file created successfully!")
    print(f"You can download or access the zip file at: {ZIP_FILE}")

if __name__ == "__main__":
    main()
