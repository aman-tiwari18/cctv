# # # import requests
# # # import json
# # # import hashlib
# # # import cv2
# # # import time
# # # import torch
# # # from ultralytics import YOLO
# # # from datetime import datetime
# # # import os
# # # import threading
# # # import pandas as pd
# # # import logging

# # # # === Logging Setup ===
# # # logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # # # === Configuration ===
# # # # Get project root (3 levels up from scripts/detection/)
# # # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
# # # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_detection_results")
# # # os.makedirs(SAVE_FOLDER, exist_ok=True)
# # # COOLDOWN_TIME = 0
# # # EXCEL_FILE = os.path.join(PROJECT_ROOT, "data/sheets/new_sheet4.xlsx")
# # # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # # MIN_PERSONS = 0  # Minimum persons for Intruder detection
# # # CONF_THRESHOLD = 0.3  # Confidence threshold for person detection

# # # print("Loading YOLO model...")
# # # yolo_model = YOLO(MODEL_PATH)

# # # last_save_times = {}
# # # person_counts = {}  # Store person counts for each camera

# # # def load_camera_config():
# # #     """Load camera configuration from Excel file, filter by Server Room or Computer Lab"""
# # #     try:
# # #         df = pd.read_excel(EXCEL_FILE)
# # #         logging.info(f"Loaded Excel file: {EXCEL_FILE}")
# # #         logging.info(f"Columns found: {list(df.columns)}")
# # #         logging.info(f"Total rows: {len(df)}")
        
# # #         # Check required columns (handle both old and new column names)
# # #         if 'Device ID' in df.columns:
# # #             df.rename(columns={'Device ID': 'device_id', 'Camera No': 'camera_no'}, inplace=True)
        
# # #         required_columns = ['device_id', 'camera_no', 'Scene Classification']
# # #         if not all(col in df.columns for col in required_columns):
# # #             logging.error(f"Required columns {required_columns} not found in Excel file")
# # #             logging.error(f"Available columns: {list(df.columns)}")
# # #             return [], None
        
# # #         # Filter for Server Room or Computer Lab
# # #         filtered_df = df[df['Scene Classification'].isin(['Server Room','Computer Lab'])]
        
# # #         # Clean and process data
# # #         filtered_df = filtered_df.dropna(subset=['device_id', 'camera_no'])
# # #         filtered_df['device_id'] = filtered_df['device_id'].astype(str)
# # #         filtered_df['camera_no'] = filtered_df['camera_no'].astype(int)
        
# # #         camera_configs = []
# # #         for index, row in filtered_df.iterrows():
# # #             device_id = str(row['device_id']).strip()
# # #             camera_no = int(row['camera_no'])
# # #             camera_configs.append({
# # #                 'device_id': device_id,
# # #                 'camera_no': camera_no,
# # #                 'index': index  # Store index to update Excel later
# # #             })
        
# # #         logging.info(f"Successfully loaded {len(camera_configs)} camera configurations (['Server Room','Computer Lab']):")
# # #         for config in camera_configs:
# # #             logging.info(f"  Device ID: {config['device_id']}, Camera No: {config['camera_no']}")
        
# # #         return camera_configs, df  # Return DataFrame for updating later
        
# # #     except FileNotFoundError:
# # #         logging.error(f"Excel file '{EXCEL_FILE}' not found.")
# # #         return [], None
# # #     except Exception as e:
# # #         logging.error(f"Error reading Excel file: {e}")
# # #         return [], None

# # # def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
# # #     """Detect persons in a frame using YOLO and optionally save detections if Intruder threshold is met"""
# # #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
# # #     person_detections = [box for box in results.boxes if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD]
# # #     person_count = len(person_detections)
# # #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# # #     # Draw bounding boxes for detected persons
# # #     for box in person_detections:
# # #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# # #         conf = float(box.conf[0])
# # #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# # #         label = f"Person {conf:.2f}"
# # #         cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

# # #     # Add detection info to frame
# # #     y_offset = 30
# # #     cv2.putText(frame, f"Persons: {person_count}", (10, y_offset), 
# # #                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# # #     y_offset += 30
# # #     cv2.putText(frame, f"Device: {device_id}, Cam: {camera_no}", (10, y_offset), 
# # #                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# # #     # Save frame if Intruder detected and cooldown period passed
# # #     key = f"{device_id}_{camera_no}"
# # #     now = time.time()
# # #     time_elapsed = now - last_save_times.get(key, 0)

# # #     Intruder_detected = person_count > MIN_PERSONS
# # #     if Intruder_detected and time_elapsed >= COOLDOWN_TIME:
# # #         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
# # #         filename = f"{SAVE_FOLDER}/{key}_{timestamp}_persons{person_count}_conf{max_conf:.2f}.jpg"
# # #         cv2.imwrite(filename, frame)
# # #         last_save_times[key] = now
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] 💾 Intruder detected & saved: {filename}")
# # #     elif Intruder_detected:
# # #         remaining = int(COOLDOWN_TIME - time_elapsed)
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] ⏳ Intruder detected but cooldown active ({remaining}s left)")

# # #     # Update person count for this camera
# # #     person_counts[key] = person_counts.get(key, 0) + person_count
    
# # #     return frame, Intruder_detected, person_count

# # # def generate_signature(userName, password, realm, randomKey):
# # #     temp = hashlib.md5(password.encode()).hexdigest()
# # #     temp = hashlib.md5((userName + temp).encode()).hexdigest()
# # #     temp = hashlib.md5(temp.encode()).hexdigest()
# # #     temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
# # #     signature = hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()
# # #     return signature

# # # def make_api_call(url, payload, headers):
# # #     response = requests.post(url, headers=headers, data=json.dumps(payload))
# # #     return response

# # # def process_rtsp_stream_with_Intruder_detection(rtsp_url, device_id, camera_no, verbose=False):
# # #     """
# # #     Process RTSP stream with YOLO Intruder detection
# # #     """
# # #     if verbose:
# # #         logging.info(f"Starting Intruder detection on RTSP stream...")
# # #         logging.info(f"Device ID: {device_id}, Camera No: {camera_no}")
# # #         logging.info(f"RTSP URL: {rtsp_url}")
    
# # #     backends = [
# # #         (cv2.CAP_FFMPEG, "FFmpeg"),
# # #         (cv2.CAP_GSTREAMER, "GStreamer"), 
# # #         (cv2.CAP_V4L2, "V4L2"),
# # #         (cv2.CAP_ANY, "Any available")
# # #     ]
    
# # #     cap = None
# # #     successful_backend = None
    
# # #     for backend, backend_name in backends:
# # #         if verbose:
# # #             logging.info(f"Trying {backend_name} backend...")
# # #         try:
# # #             cap = cv2.VideoCapture(rtsp_url, backend)
# # #             cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
# # #             cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
# # #             cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
# # #             if cap.isOpened():
# # #                 ret, test_frame = cap.read()
# # #                 if ret and test_frame is not None:
# # #                     if verbose:
# # #                         logging.info(f"Successfully opened RTSP stream with {backend_name} backend")
# # #                     successful_backend = backend_name
# # #                     break
# # #                 else:
# # #                     if verbose:
# # #                         logging.info(f"{backend_name} backend opened but cannot read frames")
# # #                     cap.release()
# # #                     cap = None
# # #             else:
# # #                 if verbose:
# # #                     logging.info(f"Failed to open with {backend_name} backend")
# # #                 cap.release()
# # #                 cap = None
# # #         except Exception as e:
# # #             if verbose:
# # #                 logging.error(f"Error with {backend_name} backend: {e}")
# # #             if cap:
# # #                 cap.release()
# # #                 cap = None
    
# # #     if cap is None or not cap.isOpened():
# # #         logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to open RTSP stream: {rtsp_url}")
# # #         return False
    
# # #     if verbose:
# # #         logging.info(f"Stream opened successfully with {successful_backend} backend")
    
# # #     fps = cap.get(cv2.CAP_PROP_FPS)
# # #     width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
# # #     height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
# # #     if fps <= 0 or fps > 60:
# # #         fps = 25.0
# # #         if verbose:
# # #             logging.info(f"Invalid FPS detected, using default: {fps}")
# # #     if verbose:
# # #         logging.info(f"Stream properties: {width}x{height} @ {fps} FPS")
# # #     frame_count = 0
# # #     start_time = time.time()
# # #     fail_count = 0
# # #     try:
# # #         if verbose:
# # #             logging.info("Starting Intruder detection...")
# # #             logging.info("Press Ctrl+C to stop")
# # #         while True:
# # #             ret, frame = cap.read()
# # #             if not ret:
# # #                 logging.warning(f"[Device {device_id} - Camera {camera_no}] Failed to receive frame")
# # #                 fail_count += 1
# # #                 if fail_count >= 3:
# # #                     logging.error(f"[Device {device_id} - Camera {camera_no}] Max retries reached, stopping")
# # #                     break
# # #                 time.sleep(3)
# # #                 continue
# # #             fail_count = 0
# # #             frame_count += 1
# # #             current_time = time.time()
# # #             elapsed_time = current_time - start_time
# # #             if frame_count % 5 == 0:
# # #                 processed_frame, Intruder_detected, person_count = detect_persons_in_frame(
# # #                     frame, device_id, camera_no
# # #                 )
# # #                 if frame_count % 50 == 0:
# # #                     if Intruder_detected:
# # #                         logging.info(f"[Device {device_id} - Camera {camera_no}] 👥 Intruder detected! Count: {person_count}")
# # #                     else:
# # #                         logging.info(f"[Device {device_id} - Camera {camera_no}] ✅ Monitoring active - No Intruder detected")
# # #             if frame_count % (int(fps) * 60) == 0:
# # #                 logging.info(f"[Device {device_id} - Camera {camera_no}] 🔄 Processing: {elapsed_time:.1f}s elapsed ({frame_count} frames)")
# # #             time.sleep(1)  # As in Intruder_det.py to control processing rate
# # #     except KeyboardInterrupt:
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection interrupted by user")
# # #     except Exception as e:
# # #         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during detection: {e}")
# # #     finally:
# # #         if cap:
# # #             cap.release()
# # #         cv2.destroyAllWindows()
# # #         total_time = time.time() - start_time
# # #         actual_fps = frame_count / total_time if total_time > 0 else 0
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection finished!")
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Total frames processed: {frame_count}")
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Total processing time: {total_time:.2f} seconds")
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Actual processing FPS: {actual_fps:.2f}")
# # #     return True

# # # def authenticate_and_get_token():
# # #     """Authenticate and get token for API access"""
# # #     logging.info("Starting authentication...")
    
# # #     url = "https://d11.camview.io:443/admin/API/accounts/authorize"
# # #     headers = {
# # #         "Content-Type": "application/json;charset=UTF-8",
# # #         "Connection": "close",
# # #         "HOST": "d11.camview.io:443"
# # #     }
# # #     payload = {
# # #         "userName": "system",
# # #         "ipAddress": "",
# # #         "clientType": "WINPC_V1"
# # #     }
    
# # #     response = make_api_call(url, payload, headers)
# # #     response_content = json.loads(response.content.decode('utf-8'))
# # #     res_head = response.headers
    
# # #     logging.info(f"Status Code 1: {response.status_code}")
    
# # #     userName = "system"
# # #     password = "Coreiseven@@"
# # #     realm = response_content["realm"]
# # #     randomKey = response_content["randomKey"]
# # #     publicKey = response_content["publickey"]
# # #     cookie = res_head['Set-Cookie']
# # #     signature = generate_signature(userName, password, realm, randomKey)
    
# # #     payload2 = {
# # #         "mac": '',
# # #         "signature": signature,
# # #         "userName": userName,
# # #         "randomKey": randomKey,
# # #         "publicKey": publicKey,
# # #         "encryptType": "MD5",
# # #         "ipAddress": "",
# # #         "clientType": "WINPC_V1",
# # #         "userType": "0"
# # #     }
    
# # #     headers2 = {
# # #         "Content-Type": "application/json;charset=UTF-8",
# # #         "Connection": "close",
# # #         "Cookie": cookie
# # #     }
    
# # #     response2 = make_api_call(url, payload2, headers2)
# # #     response_content2 = json.loads(response2.content.decode('utf-8'))
# # #     logging.info(f"Status Code 2: {response2.status_code}")
# # #     logging.info(f"Response Content 2: {response_content2}")
    
# # #     token = response_content2["token"]
# # #     return token

# # # def start_camera_detection(device_id, camera_no, token, df, index):
# # #     """Start detection for a specific camera and update Excel with results"""
# # #     logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting camera detection...")
    
# # #     url3 = f'https://d11.camview.io:443/admin/API/MTS/Video/StartVideo?token={token}'
# # #     headers3 = {
# # #         "Connection": "close",
# # #         "Content-Type": "application/json;charset=UTF-8",
# # #         "X-Subject-Token": token
# # #     }
# # #     payload3 = {
# # #         "clientType": "WINPC_V1",
# # #         "clientMac": '',
# # #         "clientPushId": "",
# # #         "project": "PSDK",
# # #         "method": "MTS.Video.StartVideo",
# # #         "data": {
# # #             "streamType": "1",
# # #             "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
# # #             "trackId": "",
# # #             "extend": "",
# # #             "channelId": f"{device_id}$1$0${camera_no}",
# # #             "keyCode": "",
# # #             "planId": "",
# # #             "dataType": "2",
# # #             "enableRtsps": "0"
# # #         }
# # #     }
    
# # #     try:
# # #         response3 = make_api_call(url3, payload3, headers3)
# # #         response_content3 = json.loads(response3.content.decode('utf-8'))
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Status Code 3: {response3.status_code}")
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Response Content 3: {response_content3}")
        
# # #         if response3.status_code != 200 or 'data' not in response_content3:
# # #             logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to get video stream URL")
# # #             return
        
# # #         rtsp_urls = []
# # #         if '|' in response_content3['data']['url']:
# # #             urls = response_content3['data']['url'].split('|')
# # #             if len(urls) >= 2 and urls[1].strip():
# # #                 rtsp_url = urls[1] + '?token=' + response_content3['data']['token']
# # #                 rtsp_urls.append(rtsp_url)
# # #             else:
# # #                 logging.info(f"[Device {device_id} - Camera {camera_no}] Second URL not available, using first URL")
# # #                 rtsp_url = urls[0] + '?token=' + response_content3['data']['token']
# # #                 rtsp_urls.append(rtsp_url)
# # #         else:
# # #             rtsp_url = response_content3['data']['url'] + '?token=' + response_content3['data']['token']
# # #             rtsp_urls.append(rtsp_url)
        
# # #         logging.info(f"[Device {device_id} - Camera {camera_no}] Found {len(rtsp_urls)} RTSP URLs:")
# # #         for i, url in enumerate(rtsp_urls):
# # #             logging.info(f"  {i+1}. {url}")
        
# # #         if rtsp_urls:
# # #             url_to_process = rtsp_urls[0]
# # #             logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting Intruder detection on RTSP URL: {url_to_process}")
# # #             success = process_rtsp_stream_with_Intruder_detection(url_to_process, device_id, camera_no, verbose=False)
# # #             if success:
# # #                 logging.info(f"Successfully processed Intruder detection for camera {device_id} - Camera {camera_no}")
# # #                 # Update Excel with person count
# # #                 key = f"{device_id}_{camera_no}"
# # #                 df.at[index, 'Persons Detected'] = person_counts.get(key, 0)
# # #             else:
# # #                 logging.error(f"Failed to process RTSP stream for camera No {device_id}: Camera {camera_no}")
# # #                 df.at[index, 'Persons Detected'] = 0
# # #         else:
# # #             logging.error(f"[Device {device_id} - Camera {camera_no}] No RTSP URLs found in the response")
# # #             df.at[index, 'Persons Detected'] = 0
            
# # #     except Exception as e:
# # #         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during camera detection: {e}")
# # #         df.at[index, 'Persons Detected'] = 0
    
# # #     # NOTE: Excel write disabled to prevent file corruption when multiple services run
# # #     # Save updated DataFrame to Excel
# # #     # try:
# # #     #     df.to_excel(EXCEL_FILE, index=False)
# # #     #     logging.info(f"[Device {device_id} - Camera {camera_no}] Updated Excel file with Intruder detection results")
# # #     # except Exception as e:
# # #     #     logging.error(f"[Device {device_id} - Camera {camera_no}] Error saving Excel file: {e}")
# # # def main():
# # #     """Main function to orchestrate the entire process"""
# # #     logging.info("=== RTSP Intruder Detection with Excel Configuration ===\n")
    
# # #     # Load camera configurations from Excel
# # #     camera_configs, df = load_camera_config()
    
# # #     if not camera_configs or df is None:
# # #         logging.error("No camera configurations found. Please check your Excel file.")
# # #         return
    
# # #     # Initialize Persons Detected column
# # #     if 'Persons Detected' not in df.columns:
# # #         df['Persons Detected'] = -1  # Default to -1 for all
# # #     else:
# # #         # Set Persons Detected to -1 for cameras not in Server Room or Computer Lab
# # #         df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
# # #     # NOTE: Excel write disabled to prevent file corruption when multiple services run
# # #     # Save initial DataFrame with -1 for non-processed cameras
# # #     # try:
# # #     #     df.to_excel(EXCEL_FILE, index=False)
# # #     #     logging.info(f"Initialized Excel file with Persons Detected set to -1 for non-processed cameras")
# # #     # except Exception as e:
# # #     #     logging.error(f"Error saving initial Excel file: {e}")
# # #     #     return
    
# # #     # Authenticate and get token
# # #     try:
# # #         token = authenticate_and_get_token()
# # #         logging.info(f"Authentication successful. Token obtained.")
# # #     except Exception as e:
# # #         logging.error(f"Authentication failed: {e}")
# # #         return
    
# # #     # Start detection for all cameras in parallel
# # #     logging.info(f"\nStarting Intruder detection for {len(camera_configs)} cameras...")
# # #     threads = []  # Initialize threads list
    
# # #     for config in camera_configs:
# # #         device_id = config['device_id']
# # #         camera_no = config['camera_no']
# # #         index = config['index']
        
# # #         t = threading.Thread(
# # #             target=start_camera_detection, 
# # #             args=(device_id, camera_no, token, df, index),
# # #             name=f"Camera-{device_id}-{camera_no}"
# # #         )
# # #         t.start()
# # #         threads.append(t)
        
# # #         # Small delay between starting threads to avoid overwhelming the server
# # #         time.sleep(1)
    
# # #     # Log and print after threads are created
# # #     logging.info(f"Started {len(threads)} camera detection threads.")
# # #     print(f"Started {len(threads)} camera detection threads.")
# # #     logging.info("Press Ctrl+C to stop all detections.\n")
    
# # #     # Wait for all threads to complete
# # #     try:
# # #         for t in threads:
# # #             t.join()
# # #     except KeyboardInterrupt:
# # #         logging.info("\nInterrupt received. Stopping all camera detections...")
    
# # #     # Final update: Ensure non-processed cameras still have -1
# # #     df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
# # #     # NOTE: Excel write disabled to prevent file corruption when multiple services run
# # #     # Final save of Excel file
# # #     # try:
# # #     #     df.to_excel(EXCEL_FILE, index=False)
# # #     #     logging.info(f"Final update: Saved Excel file with all Intruder detection results")
# # #     # except Exception as e:
# # #     #     logging.error(f"Error saving final Excel file: {e}")
    
# # #     logging.info("All camera detections completed.")
# # #     print("All camera detections completed.")

# # # if __name__ == "__main__":
# # #     main()


















# # import cv2
# # import time
# # import os
# # import logging
# # import sys
# # from datetime import datetime
# # from ultralytics import YOLO

# # # ================= LOGGING =================
# # logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # # ================= CONFIG ==================
# # PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# # # DAV_VIDEO_PATH = os.path.join(
# # #     PROJECT_ROOT,
# # #     "NVR_ch19_main_20231206120001_20231206130000.dav"
# # # )






# # if len(sys.argv) < 2:
# #     print("❌ Usage: python3 script.py <video_file>")
# #     sys.exit(1)

# # DAV_VIDEO_PATH = sys.argv[1]










# # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_detection_results")

# # MIN_PERSONS = 0
# # CONF_THRESHOLD = 0.3
# # COOLDOWN_TIME = 0

# # DEVICE_ID = "DAV_NVR"
# # CAMERA_NO = "CH19"

# # os.makedirs(SAVE_FOLDER, exist_ok=True)

# # # ================= YOLO ====================
# # print("Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # # ================= STATE ===================
# # last_save_times = {}
# # person_counts = {}

# # # =====================================================
# # # SAME LOGIC FUNCTION (UNCHANGED)
# # # =====================================================
# # def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

# #     person_detections = [
# #         box for box in results.boxes
# #         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
# #     ]

# #     person_count = len(person_detections)
# #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         cv2.putText(
# #             frame,
# #             f"Person {conf:.2f}",
# #             (x1, y1 - 10),
# #             cv2.FONT_HERSHEY_SIMPLEX,
# #             0.6,
# #             (0, 0, 255),
# #             2
# #         )

# #     cv2.putText(
# #         frame,
# #         f"Persons: {person_count}",
# #         (10, 30),
# #         cv2.FONT_HERSHEY_SIMPLEX,
# #         0.7,
# #         (0, 255, 0),
# #         2
# #     )
# #     cv2.putText(
# #         frame,
# #         f"Device: {device_id}, Cam: {camera_no}",
# #         (10, 60),
# #         cv2.FONT_HERSHEY_SIMPLEX,
# #         0.7,
# #         (0, 255, 0),
# #         2
# #     )

# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     time_elapsed = now - last_save_times.get(key, 0)

# #     intruder_detected = person_count > MIN_PERSONS

# #     if intruder_detected and time_elapsed >= COOLDOWN_TIME:
# #         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         # Format: intruder_{device_id}_{camera_no}_{ts}.jpg
# #         filename = f"{SAVE_FOLDER}/intruder_{device_id}_{camera_no}_{ts}.jpg"
# #         cv2.imwrite(filename, frame)
# #         last_save_times[key] = now
# #         logging.info(f"[{device_id}-{camera_no}] 🚨 Intruder detected & saved: {filename}")

# #     person_counts[key] = person_counts.get(key, 0) + person_count
# #     return frame, intruder_detected, person_count

# # # =====================================================
# # # DAV PROCESSOR
# # # =====================================================
# # def process_dav_video():
# #     cap = cv2.VideoCapture(DAV_VIDEO_PATH, cv2.CAP_FFMPEG)

# #     if not cap.isOpened():
# #         logging.error("❌ DAV video open nahi ho raha")
# #         return

# #     frame_count = 0
# #     logging.info("Starting Intruder detection on DAV video")

# #     while True:
# #         ret, frame = cap.read()
# #         if not ret:
# #             logging.info("✅ Video finished")
# #             break

# #         frame_count += 1

# #         # performance optimization
# #         if frame_count % 5 != 0:
# #             continue

# #         frame = cv2.resize(frame, (640, 360))

# #         processed_frame, detected, count = detect_persons_in_frame(
# #             frame,
# #             DEVICE_ID,
# #             CAMERA_NO
# #         )

# #         if frame_count % 50 == 0:
# #             if detected:
# #                 logging.warning(
# #                     f"[{DEVICE_ID}-{CAMERA_NO}] 🚨 Intruder detected! Count={count}"
# #                 )
# #             else:
# #                 logging.info(
# #                     f"[{DEVICE_ID}-{CAMERA_NO}] Monitoring... No intruder"
# #                 )

# #         cv2.imshow("DAV Intruder Detection", processed_frame)
# #         if cv2.waitKey(1) & 0xFF == ord("q"):
# #             break

# #     cap.release()
# #     cv2.destroyAllWindows()
# #     logging.info("Intruder detection completed")

# # # ================= MAIN ====================
# # if __name__ == "__main__":
# #     process_dav_video()




# # import requests
# # import json
# # import hashlib
# # import cv2
# # import time
# # import torch
# # from ultralytics import YOLO
# # from datetime import datetime
# # import os
# # import threading
# # import pandas as pd
# # import logging

# # # === Logging Setup ===
# # logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # # === Configuration ===
# # # Get project root (3 levels up from scripts/detection/)
# # PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
# # SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_detection_results")
# # os.makedirs(SAVE_FOLDER, exist_ok=True)
# # COOLDOWN_TIME = 0
# # EXCEL_FILE = os.path.join(PROJECT_ROOT, "data/sheets/new_sheet4.xlsx")
# # MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# # MIN_PERSONS = 0  # Minimum persons for Intruder detection
# # CONF_THRESHOLD = 0.3  # Confidence threshold for person detection

# # print("Loading YOLO model...")
# # yolo_model = YOLO(MODEL_PATH)

# # last_save_times = {}
# # person_counts = {}  # Store person counts for each camera

# # def load_camera_config():
# #     """Load camera configuration from Excel file, filter by Server Room or Computer Lab"""
# #     try:
# #         df = pd.read_excel(EXCEL_FILE)
# #         logging.info(f"Loaded Excel file: {EXCEL_FILE}")
# #         logging.info(f"Columns found: {list(df.columns)}")
# #         logging.info(f"Total rows: {len(df)}")
        
# #         # Check required columns (handle both old and new column names)
# #         if 'Device ID' in df.columns:
# #             df.rename(columns={'Device ID': 'device_id', 'Camera No': 'camera_no'}, inplace=True)
        
# #         required_columns = ['device_id', 'camera_no', 'Scene Classification']
# #         if not all(col in df.columns for col in required_columns):
# #             logging.error(f"Required columns {required_columns} not found in Excel file")
# #             logging.error(f"Available columns: {list(df.columns)}")
# #             return [], None
        
# #         # Filter for Server Room or Computer Lab
# #         filtered_df = df[df['Scene Classification'].isin(['Server Room','Computer Lab'])]
        
# #         # Clean and process data
# #         filtered_df = filtered_df.dropna(subset=['device_id', 'camera_no'])
# #         filtered_df['device_id'] = filtered_df['device_id'].astype(str)
# #         filtered_df['camera_no'] = filtered_df['camera_no'].astype(int)
        
# #         camera_configs = []
# #         for index, row in filtered_df.iterrows():
# #             device_id = str(row['device_id']).strip()
# #             camera_no = int(row['camera_no'])
# #             camera_configs.append({
# #                 'device_id': device_id,
# #                 'camera_no': camera_no,
# #                 'index': index  # Store index to update Excel later
# #             })
        
# #         logging.info(f"Successfully loaded {len(camera_configs)} camera configurations (['Server Room','Computer Lab']):")
# #         for config in camera_configs:
# #             logging.info(f"  Device ID: {config['device_id']}, Camera No: {config['camera_no']}")
        
# #         return camera_configs, df  # Return DataFrame for updating later
        
# #     except FileNotFoundError:
# #         logging.error(f"Excel file '{EXCEL_FILE}' not found.")
# #         return [], None
# #     except Exception as e:
# #         logging.error(f"Error reading Excel file: {e}")
# #         return [], None

# # def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
# #     """Detect persons in a frame using YOLO and optionally save detections if Intruder threshold is met"""
# #     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
# #     person_detections = [box for box in results.boxes if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD]
# #     person_count = len(person_detections)
# #     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

# #     # Draw bounding boxes for detected persons
# #     for box in person_detections:
# #         x1, y1, x2, y2 = map(int, box.xyxy[0])
# #         conf = float(box.conf[0])
# #         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
# #         label = f"Person {conf:.2f}"
# #         cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

# #     # Add detection info to frame
# #     y_offset = 30
# #     cv2.putText(frame, f"Persons: {person_count}", (10, y_offset), 
# #                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
# #     y_offset += 30
# #     cv2.putText(frame, f"Device: {device_id}, Cam: {camera_no}", (10, y_offset), 
# #                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

# #     # Save frame if Intruder detected and cooldown period passed
# #     key = f"{device_id}_{camera_no}"
# #     now = time.time()
# #     time_elapsed = now - last_save_times.get(key, 0)

# #     Intruder_detected = person_count > MIN_PERSONS
# #     if Intruder_detected and time_elapsed >= COOLDOWN_TIME:
# #         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
# #         filename = f"{SAVE_FOLDER}/{key}_{timestamp}_persons{person_count}_conf{max_conf:.2f}.jpg"
# #         cv2.imwrite(filename, frame)
# #         last_save_times[key] = now
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] 💾 Intruder detected & saved: {filename}")
# #     elif Intruder_detected:
# #         remaining = int(COOLDOWN_TIME - time_elapsed)
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] ⏳ Intruder detected but cooldown active ({remaining}s left)")

# #     # Update person count for this camera
# #     person_counts[key] = person_counts.get(key, 0) + person_count
    
# #     return frame, Intruder_detected, person_count

# # def generate_signature(userName, password, realm, randomKey):
# #     temp = hashlib.md5(password.encode()).hexdigest()
# #     temp = hashlib.md5((userName + temp).encode()).hexdigest()
# #     temp = hashlib.md5(temp.encode()).hexdigest()
# #     temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
# #     signature = hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()
# #     return signature

# # def make_api_call(url, payload, headers):
# #     response = requests.post(url, headers=headers, data=json.dumps(payload))
# #     return response

# # def process_rtsp_stream_with_Intruder_detection(rtsp_url, device_id, camera_no, verbose=False):
# #     """
# #     Process RTSP stream with YOLO Intruder detection
# #     """
# #     if verbose:
# #         logging.info(f"Starting Intruder detection on RTSP stream...")
# #         logging.info(f"Device ID: {device_id}, Camera No: {camera_no}")
# #         logging.info(f"RTSP URL: {rtsp_url}")
    
# #     backends = [
# #         (cv2.CAP_FFMPEG, "FFmpeg"),
# #         (cv2.CAP_GSTREAMER, "GStreamer"), 
# #         (cv2.CAP_V4L2, "V4L2"),
# #         (cv2.CAP_ANY, "Any available")
# #     ]
    
# #     cap = None
# #     successful_backend = None
    
# #     for backend, backend_name in backends:
# #         if verbose:
# #             logging.info(f"Trying {backend_name} backend...")
# #         try:
# #             cap = cv2.VideoCapture(rtsp_url, backend)
# #             cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
# #             cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
# #             cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
# #             if cap.isOpened():
# #                 ret, test_frame = cap.read()
# #                 if ret and test_frame is not None:
# #                     if verbose:
# #                         logging.info(f"Successfully opened RTSP stream with {backend_name} backend")
# #                     successful_backend = backend_name
# #                     break
# #                 else:
# #                     if verbose:
# #                         logging.info(f"{backend_name} backend opened but cannot read frames")
# #                     cap.release()
# #                     cap = None
# #             else:
# #                 if verbose:
# #                     logging.info(f"Failed to open with {backend_name} backend")
# #                 cap.release()
# #                 cap = None
# #         except Exception as e:
# #             if verbose:
# #                 logging.error(f"Error with {backend_name} backend: {e}")
# #             if cap:
# #                 cap.release()
# #                 cap = None
    
# #     if cap is None or not cap.isOpened():
# #         logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to open RTSP stream: {rtsp_url}")
# #         return False
    
# #     if verbose:
# #         logging.info(f"Stream opened successfully with {successful_backend} backend")
    
# #     fps = cap.get(cv2.CAP_PROP_FPS)
# #     width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
# #     height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
# #     if fps <= 0 or fps > 60:
# #         fps = 25.0
# #         if verbose:
# #             logging.info(f"Invalid FPS detected, using default: {fps}")
# #     if verbose:
# #         logging.info(f"Stream properties: {width}x{height} @ {fps} FPS")
# #     frame_count = 0
# #     start_time = time.time()
# #     fail_count = 0
# #     try:
# #         if verbose:
# #             logging.info("Starting Intruder detection...")
# #             logging.info("Press Ctrl+C to stop")
# #         while True:
# #             ret, frame = cap.read()
# #             if not ret:
# #                 logging.warning(f"[Device {device_id} - Camera {camera_no}] Failed to receive frame")
# #                 fail_count += 1
# #                 if fail_count >= 3:
# #                     logging.error(f"[Device {device_id} - Camera {camera_no}] Max retries reached, stopping")
# #                     break
# #                 time.sleep(3)
# #                 continue
# #             fail_count = 0
# #             frame_count += 1
# #             current_time = time.time()
# #             elapsed_time = current_time - start_time
# #             if frame_count % 5 == 0:
# #                 processed_frame, Intruder_detected, person_count = detect_persons_in_frame(
# #                     frame, device_id, camera_no
# #                 )
# #                 if frame_count % 50 == 0:
# #                     if Intruder_detected:
# #                         logging.info(f"[Device {device_id} - Camera {camera_no}] 👥 Intruder detected! Count: {person_count}")
# #                     else:
# #                         logging.info(f"[Device {device_id} - Camera {camera_no}] ✅ Monitoring active - No Intruder detected")
# #             if frame_count % (int(fps) * 60) == 0:
# #                 logging.info(f"[Device {device_id} - Camera {camera_no}] 🔄 Processing: {elapsed_time:.1f}s elapsed ({frame_count} frames)")
# #             time.sleep(1)  # As in Intruder_det.py to control processing rate
# #     except KeyboardInterrupt:
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection interrupted by user")
# #     except Exception as e:
# #         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during detection: {e}")
# #     finally:
# #         if cap:
# #             cap.release()
# #         cv2.destroyAllWindows()
# #         total_time = time.time() - start_time
# #         actual_fps = frame_count / total_time if total_time > 0 else 0
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection finished!")
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Total frames processed: {frame_count}")
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Total processing time: {total_time:.2f} seconds")
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Actual processing FPS: {actual_fps:.2f}")
# #     return True

# # def authenticate_and_get_token():
# #     """Authenticate and get token for API access"""
# #     logging.info("Starting authentication...")
    
# #     url = "https://d11.camview.io:443/admin/API/accounts/authorize"
# #     headers = {
# #         "Content-Type": "application/json;charset=UTF-8",
# #         "Connection": "close",
# #         "HOST": "d11.camview.io:443"
# #     }
# #     payload = {
# #         "userName": "system",
# #         "ipAddress": "",
# #         "clientType": "WINPC_V1"
# #     }
    
# #     response = make_api_call(url, payload, headers)
# #     response_content = json.loads(response.content.decode('utf-8'))
# #     res_head = response.headers
    
# #     logging.info(f"Status Code 1: {response.status_code}")
    
# #     userName = "system"
# #     password = "Coreiseven@@"
# #     realm = response_content["realm"]
# #     randomKey = response_content["randomKey"]
# #     publicKey = response_content["publickey"]
# #     cookie = res_head['Set-Cookie']
# #     signature = generate_signature(userName, password, realm, randomKey)
    
# #     payload2 = {
# #         "mac": '',
# #         "signature": signature,
# #         "userName": userName,
# #         "randomKey": randomKey,
# #         "publicKey": publicKey,
# #         "encryptType": "MD5",
# #         "ipAddress": "",
# #         "clientType": "WINPC_V1",
# #         "userType": "0"
# #     }
    
# #     headers2 = {
# #         "Content-Type": "application/json;charset=UTF-8",
# #         "Connection": "close",
# #         "Cookie": cookie
# #     }
    
# #     response2 = make_api_call(url, payload2, headers2)
# #     response_content2 = json.loads(response2.content.decode('utf-8'))
# #     logging.info(f"Status Code 2: {response2.status_code}")
# #     logging.info(f"Response Content 2: {response_content2}")
    
# #     token = response_content2["token"]
# #     return token

# # def start_camera_detection(device_id, camera_no, token, df, index):
# #     """Start detection for a specific camera and update Excel with results"""
# #     logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting camera detection...")
    
# #     url3 = f'https://d11.camview.io:443/admin/API/MTS/Video/StartVideo?token={token}'
# #     headers3 = {
# #         "Connection": "close",
# #         "Content-Type": "application/json;charset=UTF-8",
# #         "X-Subject-Token": token
# #     }
# #     payload3 = {
# #         "clientType": "WINPC_V1",
# #         "clientMac": '',
# #         "clientPushId": "",
# #         "project": "PSDK",
# #         "method": "MTS.Video.StartVideo",
# #         "data": {
# #             "streamType": "1",
# #             "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
# #             "trackId": "",
# #             "extend": "",
# #             "channelId": f"{device_id}$1$0${camera_no}",
# #             "keyCode": "",
# #             "planId": "",
# #             "dataType": "2",
# #             "enableRtsps": "0"
# #         }
# #     }
    
# #     try:
# #         response3 = make_api_call(url3, payload3, headers3)
# #         response_content3 = json.loads(response3.content.decode('utf-8'))
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Status Code 3: {response3.status_code}")
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Response Content 3: {response_content3}")
        
# #         if response3.status_code != 200 or 'data' not in response_content3:
# #             logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to get video stream URL")
# #             return
        
# #         rtsp_urls = []
# #         if '|' in response_content3['data']['url']:
# #             urls = response_content3['data']['url'].split('|')
# #             if len(urls) >= 2 and urls[1].strip():
# #                 rtsp_url = urls[1] + '?token=' + response_content3['data']['token']
# #                 rtsp_urls.append(rtsp_url)
# #             else:
# #                 logging.info(f"[Device {device_id} - Camera {camera_no}] Second URL not available, using first URL")
# #                 rtsp_url = urls[0] + '?token=' + response_content3['data']['token']
# #                 rtsp_urls.append(rtsp_url)
# #         else:
# #             rtsp_url = response_content3['data']['url'] + '?token=' + response_content3['data']['token']
# #             rtsp_urls.append(rtsp_url)
        
# #         logging.info(f"[Device {device_id} - Camera {camera_no}] Found {len(rtsp_urls)} RTSP URLs:")
# #         for i, url in enumerate(rtsp_urls):
# #             logging.info(f"  {i+1}. {url}")
        
# #         if rtsp_urls:
# #             url_to_process = rtsp_urls[0]
# #             logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting Intruder detection on RTSP URL: {url_to_process}")
# #             success = process_rtsp_stream_with_Intruder_detection(url_to_process, device_id, camera_no, verbose=False)
# #             if success:
# #                 logging.info(f"Successfully processed Intruder detection for camera {device_id} - Camera {camera_no}")
# #                 # Update Excel with person count
# #                 key = f"{device_id}_{camera_no}"
# #                 df.at[index, 'Persons Detected'] = person_counts.get(key, 0)
# #             else:
# #                 logging.error(f"Failed to process RTSP stream for camera No {device_id}: Camera {camera_no}")
# #                 df.at[index, 'Persons Detected'] = 0
# #         else:
# #             logging.error(f"[Device {device_id} - Camera {camera_no}] No RTSP URLs found in the response")
# #             df.at[index, 'Persons Detected'] = 0
            
# #     except Exception as e:
# #         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during camera detection: {e}")
# #         df.at[index, 'Persons Detected'] = 0
    
# #     # NOTE: Excel write disabled to prevent file corruption when multiple services run
# #     # Save updated DataFrame to Excel
# #     # try:
# #     #     df.to_excel(EXCEL_FILE, index=False)
# #     #     logging.info(f"[Device {device_id} - Camera {camera_no}] Updated Excel file with Intruder detection results")
# #     # except Exception as e:
# #     #     logging.error(f"[Device {device_id} - Camera {camera_no}] Error saving Excel file: {e}")
# # def main():
# #     """Main function to orchestrate the entire process"""
# #     logging.info("=== RTSP Intruder Detection with Excel Configuration ===\n")
    
# #     # Load camera configurations from Excel
# #     camera_configs, df = load_camera_config()
    
# #     if not camera_configs or df is None:
# #         logging.error("No camera configurations found. Please check your Excel file.")
# #         return
    
# #     # Initialize Persons Detected column
# #     if 'Persons Detected' not in df.columns:
# #         df['Persons Detected'] = -1  # Default to -1 for all
# #     else:
# #         # Set Persons Detected to -1 for cameras not in Server Room or Computer Lab
# #         df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
# #     # NOTE: Excel write disabled to prevent file corruption when multiple services run
# #     # Save initial DataFrame with -1 for non-processed cameras
# #     # try:
# #     #     df.to_excel(EXCEL_FILE, index=False)
# #     #     logging.info(f"Initialized Excel file with Persons Detected set to -1 for non-processed cameras")
# #     # except Exception as e:
# #     #     logging.error(f"Error saving initial Excel file: {e}")
# #     #     return
    
# #     # Authenticate and get token
# #     try:
# #         token = authenticate_and_get_token()
# #         logging.info(f"Authentication successful. Token obtained.")
# #     except Exception as e:
# #         logging.error(f"Authentication failed: {e}")
# #         return
    
# #     # Start detection for all cameras in parallel
# #     logging.info(f"\nStarting Intruder detection for {len(camera_configs)} cameras...")
# #     threads = []  # Initialize threads list
    
# #     for config in camera_configs:
# #         device_id = config['device_id']
# #         camera_no = config['camera_no']
# #         index = config['index']
        
# #         t = threading.Thread(
# #             target=start_camera_detection, 
# #             args=(device_id, camera_no, token, df, index),
# #             name=f"Camera-{device_id}-{camera_no}"
# #         )
# #         t.start()
# #         threads.append(t)
        
# #         # Small delay between starting threads to avoid overwhelming the server
# #         time.sleep(1)
    
# #     # Log and print after threads are created
# #     logging.info(f"Started {len(threads)} camera detection threads.")
# #     print(f"Started {len(threads)} camera detection threads.")
# #     logging.info("Press Ctrl+C to stop all detections.\n")
    
# #     # Wait for all threads to complete
# #     try:
# #         for t in threads:
# #             t.join()
# #     except KeyboardInterrupt:
# #         logging.info("\nInterrupt received. Stopping all camera detections...")
    
# #     # Final update: Ensure non-processed cameras still have -1
# #     df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
# #     # NOTE: Excel write disabled to prevent file corruption when multiple services run
# #     # Final save of Excel file
# #     # try:
# #     #     df.to_excel(EXCEL_FILE, index=False)
# #     #     logging.info(f"Final update: Saved Excel file with all Intruder detection results")
# #     # except Exception as e:
# #     #     logging.error(f"Error saving final Excel file: {e}")
    
# #     logging.info("All camera detections completed.")
# #     print("All camera detections completed.")

# # if __name__ == "__main__":
# #     main()


















# import cv2
# import time
# import os
# import logging
# import sys
# from datetime import datetime
# import pymysql
# import re
# from ultralytics import YOLO

# # ================= LOGGING =================
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # ================= CONFIG ==================
# PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# # DAV_VIDEO_PATH = os.path.join(
# #     PROJECT_ROOT,
# #     "NVR_ch19_main_20231206120001_20231206130000.dav"
# # )






# # DAV_VIDEO_PATH will be set when running as a script
# DAV_VIDEO_PATH = None










# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

# MIN_PERSONS = 0
# CONF_THRESHOLD = 0.3
# COOLDOWN_TIME = 0

# DEVICE_ID = "DAV_NVR"
# CAMERA_NO = "CH19"

# os.makedirs(SAVE_FOLDER, exist_ok=True)

# # ================= YOLO ====================
# print("Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# # ================= STATE ===================
# last_save_times = {}
# person_counts = {}

# # =====================================================
# # SAME LOGIC FUNCTION (UNCHANGED)
# # =====================================================
# def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

#     person_detections = [
#         box for box in results.boxes
#         if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
#     ]

#     person_count = len(person_detections)
#     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         cv2.putText(
#             frame,
#             f"Person {conf:.2f}",
#             (x1, y1 - 10),
#             cv2.FONT_HERSHEY_SIMPLEX,
#             0.6,
#             (0, 0, 255),
#             2
#         )

#     cv2.putText(
#         frame,
#         f"Persons: {person_count}",
#         (10, 30),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.7,
#         (0, 255, 0),
#         2
#     )
#     cv2.putText(
#         frame,
#         f"Device: {device_id}, Cam: {camera_no}",
#         (10, 60),
#         cv2.FONT_HERSHEY_SIMPLEX,
#         0.7,
#         (0, 255, 0),
#         2
#     )

#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     time_elapsed = now - last_save_times.get(key, 0)

#     intruder_detected = person_count > MIN_PERSONS

#     if intruder_detected and time_elapsed >= COOLDOWN_TIME:
#         ts = datetime.now().strftime("%Y%m%d_%H%M%S")
#         # Format: intruder_{device_id}_{camera_no}_{ts}.jpg
#         filename = f"{SAVE_FOLDER}/intruder_{device_id}_{camera_no}_{ts}.jpg"
#         cv2.imwrite(filename, frame)
#         last_save_times[key] = now
#         logging.info(f"[{device_id}-{camera_no}] 🚨 Intruder detected & saved: {filename}")

#     person_counts[key] = person_counts.get(key, 0) + person_count
#     return frame, intruder_detected, person_count


# # ================= DB CONFIG =================
# DB_CONFIG = {
#     "host": "localhost",
#     "user": "root",
#     "password": "rootpassword123",
#     "database": "cctv_monitoring",
#     "cursorclass": pymysql.cursors.DictCursor
# }

# def report_to_db_hls(ch_code, image_name, folder="intruder_detection"):
#     """
#     Look up camera info by ch_code and report detection to camera_report_hls.
#     Specifically for HLS detections.
#     """
#     try:
#         # 0. Get the project root based on this script's location
#         script_dir = os.path.dirname(os.path.abspath(__file__))
#         log_file = os.path.join(script_dir, "../../db_reports.log")
        
#         with open(log_file, "a") as f:
#             f.write(f"\n--- New Intruder Report Attempt: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
#             f.write(f"Image: {image_name} | Passed ch_code: {ch_code}\n")

#         # 0.1 Try to extract a numeric ch_code from the image_name if the passed one is generic
#         if not str(ch_code).isdigit():
#             match = re.search(r'_ch(\d+)_', image_name)
#             if match:
#                 ch_code = match.group(1)
#                 with open(log_file, "a") as f: f.write(f"Extracted ch_code from filename: {ch_code}\n")

#         # 1. Get metadata from Env
#         exam_id = os.environ.get("EXAM_ID")
#         shift_id = os.environ.get("SHIFT_ID")
        
#         if not exam_id:
#             msg = "[DB-REPORT] ❌ ERROR: EXAM_ID not found in environment. Detection NOT saved to DB.\n"
#             logging.error(msg)
#             with open(log_file, "a") as f: f.write(msg)
#             return False

#         # 2. Extract timestamp from filename
#         ts_match = re.search(r'(\d{8}_\d{6})', image_name)
#         if ts_match:
#             raw_ts = ts_match.group(1)
#             dt_obj = datetime.strptime(raw_ts, "%Y%m%d_%H%M%S")
#             date_time = dt_obj.strftime("%d/%m/%Y %H:%M:%S")
#         else:
#             date_time = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

#         # 3. Connection and Lookup
#         connection = pymysql.connect(**DB_CONFIG)
#         try:
#             with connection.cursor() as cursor:
#                 # Search camera_links_hls
#                 query = """
#                     SELECT * FROM camera_links_hls 
#                     WHERE ch_code = %s AND exam_id = %s
#                     AND (shift_id = %s OR shift_id IS NULL)
#                     LIMIT 1
#                 """
#                 cursor.execute(query, (ch_code, exam_id, shift_id))
#                 cam = cursor.fetchone()

#                 if not cam:
#                     msg = f"[DB-REPORT] ❌ ERROR: Camera NOT found (intruder) for ch_code={ch_code}, exam_id={exam_id}, shift_id={shift_id}\n"
#                     logging.error(msg)
#                     with open(log_file, "a") as f: f.write(msg)
#                     return False

#                 # 4. Prepare Report Data
#                 camera_name = cam.get('camera_name', '')
#                 parts = camera_name.split('/')
#                 report_camera_id = f"{parts[0]}_{parts[2]}" if len(parts) >= 3 else camera_name
#                 status_raw = str(cam.get('status', '')).lower()
#                 camera_status = "Online" if status_raw == 'accessible' else "Offline"
#                 image_url = f"http://www.examscctvmonitoring.com/cctv_dev/serve-detection-images/{folder}/{image_name}"

#                 # 5. Insert into camera_report_hls
#                 insert_query = """
#                     INSERT INTO camera_report_hls (
#                         exam_id, shift_id, city, center_name, camera_id, 
#                         camera_name, camera_category, tc_code, ch_code, 
#                         state, camera_status, events, date_time, 
#                         imageurl, detection_type
#                     ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
#                 """
#                 cursor.execute(insert_query, (
#                     cam.get('exam_id'), cam.get('shift_id'), cam.get('city'),
#                     cam.get('centre_name'), report_camera_id, camera_name,
#                     cam.get('camera_category'), cam.get('tc_code'), ch_code,
#                     cam.get('state'), camera_status, 1, date_time, image_url, folder
#                 ))
#                 connection.commit()
#                 msg = f"[DB-REPORT] ✅ SUCCESS: Inserted intruder report for ch_code {ch_code} (Camera: {report_camera_id})\n"
#                 logging.info(msg)
#                 with open(log_file, "a") as f: f.write(msg)
#                 return True
#         finally:
#             connection.close()
#     except Exception as e:
#         msg = f"[DB-REPORT] ❌ FATAL ERROR: {e}\n"
#         logging.error(msg)
#         with open(log_file, "a") as f: f.write(msg)
#         return False

# # =====================================================
# # DAV PROCESSOR
# # =====================================================
# def process_dav_video():
#     global DAV_VIDEO_PATH
#     if not DAV_VIDEO_PATH:
#         if len(sys.argv) < 2:
#             print("❌ Usage: python3 script.py <video_file>")
#             sys.exit(1)
#         DAV_VIDEO_PATH = sys.argv[1]

#     cap = cv2.VideoCapture(DAV_VIDEO_PATH, cv2.CAP_FFMPEG)

#     if not cap.isOpened():
#         logging.error("❌ DAV video open nahi ho raha")
#         return

#     frame_count = 0
#     logging.info("Starting Intruder detection on DAV video")

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             logging.info("✅ Video finished")
#             break

#         frame_count += 1

#         # performance optimization
#         if frame_count % 5 != 0:
#             continue

#         frame = cv2.resize(frame, (640, 360))

#         processed_frame, detected, count = detect_persons_in_frame(
#             frame,
#             DEVICE_ID,
#             CAMERA_NO
#         )

#         if frame_count % 50 == 0:
#             if detected:
#                 logging.warning(
#                     f"[{DEVICE_ID}-{CAMERA_NO}] 🚨 Intruder detected! Count={count}"
#                 )
#             else:
#                 logging.info(
#                     f"[{DEVICE_ID}-{CAMERA_NO}] Monitoring... No intruder"
#                 )

#         cv2.imshow("DAV Intruder Detection", processed_frame)
#         if cv2.waitKey(1) & 0xFF == ord("q"):
#             break

#     cap.release()
#     cv2.destroyAllWindows()
#     logging.info("Intruder detection completed")

# # ================= MAIN ====================
# if __name__ == "__main__":
#     process_dav_video()



# changes on 15-04-2026

# import requests
# import json
# import hashlib
# import cv2
# import time
# import torch
# from ultralytics import YOLO
# from datetime import datetime
# import os
# import threading
# import pandas as pd
# import logging

# # === Logging Setup ===
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# # === Configuration ===
# # Get project root (3 levels up from scripts/detection/)
# PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
# SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/intruder_detection_results")
# os.makedirs(SAVE_FOLDER, exist_ok=True)
# COOLDOWN_TIME = 0
# EXCEL_FILE = os.path.join(PROJECT_ROOT, "data/sheets/new_sheet4.xlsx")
# MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
# MIN_PERSONS = 0  # Minimum persons for Intruder detection
# CONF_THRESHOLD = 0.3  # Confidence threshold for person detection

# print("Loading YOLO model...")
# yolo_model = YOLO(MODEL_PATH)

# last_save_times = {}
# person_counts = {}  # Store person counts for each camera

# def load_camera_config():
#     """Load camera configuration from Excel file, filter by Server Room or Computer Lab"""
#     try:
#         df = pd.read_excel(EXCEL_FILE)
#         logging.info(f"Loaded Excel file: {EXCEL_FILE}")
#         logging.info(f"Columns found: {list(df.columns)}")
#         logging.info(f"Total rows: {len(df)}")
        
#         # Check required columns (handle both old and new column names)
#         if 'Device ID' in df.columns:
#             df.rename(columns={'Device ID': 'device_id', 'Camera No': 'camera_no'}, inplace=True)
        
#         required_columns = ['device_id', 'camera_no', 'Scene Classification']
#         if not all(col in df.columns for col in required_columns):
#             logging.error(f"Required columns {required_columns} not found in Excel file")
#             logging.error(f"Available columns: {list(df.columns)}")
#             return [], None
        
#         # Filter for Server Room or Computer Lab
#         filtered_df = df[df['Scene Classification'].isin(['Server Room','Computer Lab'])]
        
#         # Clean and process data
#         filtered_df = filtered_df.dropna(subset=['device_id', 'camera_no'])
#         filtered_df['device_id'] = filtered_df['device_id'].astype(str)
#         filtered_df['camera_no'] = filtered_df['camera_no'].astype(int)
        
#         camera_configs = []
#         for index, row in filtered_df.iterrows():
#             device_id = str(row['device_id']).strip()
#             camera_no = int(row['camera_no'])
#             camera_configs.append({
#                 'device_id': device_id,
#                 'camera_no': camera_no,
#                 'index': index  # Store index to update Excel later
#             })
        
#         logging.info(f"Successfully loaded {len(camera_configs)} camera configurations (['Server Room','Computer Lab']):")
#         for config in camera_configs:
#             logging.info(f"  Device ID: {config['device_id']}, Camera No: {config['camera_no']}")
        
#         return camera_configs, df  # Return DataFrame for updating later
        
#     except FileNotFoundError:
#         logging.error(f"Excel file '{EXCEL_FILE}' not found.")
#         return [], None
#     except Exception as e:
#         logging.error(f"Error reading Excel file: {e}")
#         return [], None

# def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
#     """Detect persons in a frame using YOLO and optionally save detections if Intruder threshold is met"""
#     results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]
#     person_detections = [box for box in results.boxes if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD]
#     person_count = len(person_detections)
#     max_conf = float(max([box.conf[0] for box in person_detections], default=0))

#     # Draw bounding boxes for detected persons
#     for box in person_detections:
#         x1, y1, x2, y2 = map(int, box.xyxy[0])
#         conf = float(box.conf[0])
#         cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
#         label = f"Person {conf:.2f}"
#         cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

#     # Add detection info to frame
#     y_offset = 30
#     cv2.putText(frame, f"Persons: {person_count}", (10, y_offset), 
#                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
#     y_offset += 30
#     cv2.putText(frame, f"Device: {device_id}, Cam: {camera_no}", (10, y_offset), 
#                 cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

#     # Save frame if Intruder detected and cooldown period passed
#     key = f"{device_id}_{camera_no}"
#     now = time.time()
#     time_elapsed = now - last_save_times.get(key, 0)

#     Intruder_detected = person_count > MIN_PERSONS
#     if Intruder_detected and time_elapsed >= COOLDOWN_TIME:
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         filename = f"{SAVE_FOLDER}/{key}_{timestamp}_persons{person_count}_conf{max_conf:.2f}.jpg"
#         cv2.imwrite(filename, frame)
#         last_save_times[key] = now
#         logging.info(f"[Device {device_id} - Camera {camera_no}] 💾 Intruder detected & saved: {filename}")
#     elif Intruder_detected:
#         remaining = int(COOLDOWN_TIME - time_elapsed)
#         logging.info(f"[Device {device_id} - Camera {camera_no}] ⏳ Intruder detected but cooldown active ({remaining}s left)")

#     # Update person count for this camera
#     person_counts[key] = person_counts.get(key, 0) + person_count
    
#     return frame, Intruder_detected, person_count

# def generate_signature(userName, password, realm, randomKey):
#     temp = hashlib.md5(password.encode()).hexdigest()
#     temp = hashlib.md5((userName + temp).encode()).hexdigest()
#     temp = hashlib.md5(temp.encode()).hexdigest()
#     temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
#     signature = hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()
#     return signature

# def make_api_call(url, payload, headers):
#     response = requests.post(url, headers=headers, data=json.dumps(payload))
#     return response

# def process_rtsp_stream_with_Intruder_detection(rtsp_url, device_id, camera_no, verbose=False):
#     """
#     Process RTSP stream with YOLO Intruder detection
#     """
#     if verbose:
#         logging.info(f"Starting Intruder detection on RTSP stream...")
#         logging.info(f"Device ID: {device_id}, Camera No: {camera_no}")
#         logging.info(f"RTSP URL: {rtsp_url}")
    
#     backends = [
#         (cv2.CAP_FFMPEG, "FFmpeg"),
#         (cv2.CAP_GSTREAMER, "GStreamer"), 
#         (cv2.CAP_V4L2, "V4L2"),
#         (cv2.CAP_ANY, "Any available")
#     ]
    
#     cap = None
#     successful_backend = None
    
#     for backend, backend_name in backends:
#         if verbose:
#             logging.info(f"Trying {backend_name} backend...")
#         try:
#             cap = cv2.VideoCapture(rtsp_url, backend)
#             cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
#             cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000)
#             cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
#             if cap.isOpened():
#                 ret, test_frame = cap.read()
#                 if ret and test_frame is not None:
#                     if verbose:
#                         logging.info(f"Successfully opened RTSP stream with {backend_name} backend")
#                     successful_backend = backend_name
#                     break
#                 else:
#                     if verbose:
#                         logging.info(f"{backend_name} backend opened but cannot read frames")
#                     cap.release()
#                     cap = None
#             else:
#                 if verbose:
#                     logging.info(f"Failed to open with {backend_name} backend")
#                 cap.release()
#                 cap = None
#         except Exception as e:
#             if verbose:
#                 logging.error(f"Error with {backend_name} backend: {e}")
#             if cap:
#                 cap.release()
#                 cap = None
    
#     if cap is None or not cap.isOpened():
#         logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to open RTSP stream: {rtsp_url}")
#         return False
    
#     if verbose:
#         logging.info(f"Stream opened successfully with {successful_backend} backend")
    
#     fps = cap.get(cv2.CAP_PROP_FPS)
#     width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
#     height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
#     if fps <= 0 or fps > 60:
#         fps = 25.0
#         if verbose:
#             logging.info(f"Invalid FPS detected, using default: {fps}")
#     if verbose:
#         logging.info(f"Stream properties: {width}x{height} @ {fps} FPS")
#     frame_count = 0
#     start_time = time.time()
#     fail_count = 0
#     try:
#         if verbose:
#             logging.info("Starting Intruder detection...")
#             logging.info("Press Ctrl+C to stop")
#         while True:
#             ret, frame = cap.read()
#             if not ret:
#                 logging.warning(f"[Device {device_id} - Camera {camera_no}] Failed to receive frame")
#                 fail_count += 1
#                 if fail_count >= 3:
#                     logging.error(f"[Device {device_id} - Camera {camera_no}] Max retries reached, stopping")
#                     break
#                 time.sleep(3)
#                 continue
#             fail_count = 0
#             frame_count += 1
#             current_time = time.time()
#             elapsed_time = current_time - start_time
#             if frame_count % 5 == 0:
#                 processed_frame, Intruder_detected, person_count = detect_persons_in_frame(
#                     frame, device_id, camera_no
#                 )
#                 if frame_count % 50 == 0:
#                     if Intruder_detected:
#                         logging.info(f"[Device {device_id} - Camera {camera_no}] 👥 Intruder detected! Count: {person_count}")
#                     else:
#                         logging.info(f"[Device {device_id} - Camera {camera_no}] ✅ Monitoring active - No Intruder detected")
#             if frame_count % (int(fps) * 60) == 0:
#                 logging.info(f"[Device {device_id} - Camera {camera_no}] 🔄 Processing: {elapsed_time:.1f}s elapsed ({frame_count} frames)")
#             time.sleep(1)  # As in Intruder_det.py to control processing rate
#     except KeyboardInterrupt:
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection interrupted by user")
#     except Exception as e:
#         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during detection: {e}")
#     finally:
#         if cap:
#             cap.release()
#         cv2.destroyAllWindows()
#         total_time = time.time() - start_time
#         actual_fps = frame_count / total_time if total_time > 0 else 0
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Detection finished!")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Total frames processed: {frame_count}")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Total processing time: {total_time:.2f} seconds")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Actual processing FPS: {actual_fps:.2f}")
#     return True

# def authenticate_and_get_token():
#     """Authenticate and get token for API access"""
#     logging.info("Starting authentication...")
    
#     url = "https://d11.camview.io:443/admin/API/accounts/authorize"
#     headers = {
#         "Content-Type": "application/json;charset=UTF-8",
#         "Connection": "close",
#         "HOST": "d11.camview.io:443"
#     }
#     payload = {
#         "userName": "system",
#         "ipAddress": "",
#         "clientType": "WINPC_V1"
#     }
    
#     response = make_api_call(url, payload, headers)
#     response_content = json.loads(response.content.decode('utf-8'))
#     res_head = response.headers
    
#     logging.info(f"Status Code 1: {response.status_code}")
    
#     userName = "system"
#     password = "Coreiseven@@"
#     realm = response_content["realm"]
#     randomKey = response_content["randomKey"]
#     publicKey = response_content["publickey"]
#     cookie = res_head['Set-Cookie']
#     signature = generate_signature(userName, password, realm, randomKey)
    
#     payload2 = {
#         "mac": '',
#         "signature": signature,
#         "userName": userName,
#         "randomKey": randomKey,
#         "publicKey": publicKey,
#         "encryptType": "MD5",
#         "ipAddress": "",
#         "clientType": "WINPC_V1",
#         "userType": "0"
#     }
    
#     headers2 = {
#         "Content-Type": "application/json;charset=UTF-8",
#         "Connection": "close",
#         "Cookie": cookie
#     }
    
#     response2 = make_api_call(url, payload2, headers2)
#     response_content2 = json.loads(response2.content.decode('utf-8'))
#     logging.info(f"Status Code 2: {response2.status_code}")
#     logging.info(f"Response Content 2: {response_content2}")
    
#     token = response_content2["token"]
#     return token

# def start_camera_detection(device_id, camera_no, token, df, index):
#     """Start detection for a specific camera and update Excel with results"""
#     logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting camera detection...")
    
#     url3 = f'https://d11.camview.io:443/admin/API/MTS/Video/StartVideo?token={token}'
#     headers3 = {
#         "Connection": "close",
#         "Content-Type": "application/json;charset=UTF-8",
#         "X-Subject-Token": token
#     }
#     payload3 = {
#         "clientType": "WINPC_V1",
#         "clientMac": '',
#         "clientPushId": "",
#         "project": "PSDK",
#         "method": "MTS.Video.StartVideo",
#         "data": {
#             "streamType": "1",
#             "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
#             "trackId": "",
#             "extend": "",
#             "channelId": f"{device_id}$1$0${camera_no}",
#             "keyCode": "",
#             "planId": "",
#             "dataType": "2",
#             "enableRtsps": "0"
#         }
#     }
    
#     try:
#         response3 = make_api_call(url3, payload3, headers3)
#         response_content3 = json.loads(response3.content.decode('utf-8'))
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Status Code 3: {response3.status_code}")
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Response Content 3: {response_content3}")
        
#         if response3.status_code != 200 or 'data' not in response_content3:
#             logging.error(f"[Device {device_id} - Camera {camera_no}] Failed to get video stream URL")
#             return
        
#         rtsp_urls = []
#         if '|' in response_content3['data']['url']:
#             urls = response_content3['data']['url'].split('|')
#             if len(urls) >= 2 and urls[1].strip():
#                 rtsp_url = urls[1] + '?token=' + response_content3['data']['token']
#                 rtsp_urls.append(rtsp_url)
#             else:
#                 logging.info(f"[Device {device_id} - Camera {camera_no}] Second URL not available, using first URL")
#                 rtsp_url = urls[0] + '?token=' + response_content3['data']['token']
#                 rtsp_urls.append(rtsp_url)
#         else:
#             rtsp_url = response_content3['data']['url'] + '?token=' + response_content3['data']['token']
#             rtsp_urls.append(rtsp_url)
        
#         logging.info(f"[Device {device_id} - Camera {camera_no}] Found {len(rtsp_urls)} RTSP URLs:")
#         for i, url in enumerate(rtsp_urls):
#             logging.info(f"  {i+1}. {url}")
        
#         if rtsp_urls:
#             url_to_process = rtsp_urls[0]
#             logging.info(f"\n[Device {device_id} - Camera {camera_no}] Starting Intruder detection on RTSP URL: {url_to_process}")
#             success = process_rtsp_stream_with_Intruder_detection(url_to_process, device_id, camera_no, verbose=False)
#             if success:
#                 logging.info(f"Successfully processed Intruder detection for camera {device_id} - Camera {camera_no}")
#                 # Update Excel with person count
#                 key = f"{device_id}_{camera_no}"
#                 df.at[index, 'Persons Detected'] = person_counts.get(key, 0)
#             else:
#                 logging.error(f"Failed to process RTSP stream for camera No {device_id}: Camera {camera_no}")
#                 df.at[index, 'Persons Detected'] = 0
#         else:
#             logging.error(f"[Device {device_id} - Camera {camera_no}] No RTSP URLs found in the response")
#             df.at[index, 'Persons Detected'] = 0
            
#     except Exception as e:
#         logging.error(f"[Device {device_id} - Camera {camera_no}] Error during camera detection: {e}")
#         df.at[index, 'Persons Detected'] = 0
    
#     # NOTE: Excel write disabled to prevent file corruption when multiple services run
#     # Save updated DataFrame to Excel
#     # try:
#     #     df.to_excel(EXCEL_FILE, index=False)
#     #     logging.info(f"[Device {device_id} - Camera {camera_no}] Updated Excel file with Intruder detection results")
#     # except Exception as e:
#     #     logging.error(f"[Device {device_id} - Camera {camera_no}] Error saving Excel file: {e}")
# def main():
#     """Main function to orchestrate the entire process"""
#     logging.info("=== RTSP Intruder Detection with Excel Configuration ===\n")
    
#     # Load camera configurations from Excel
#     camera_configs, df = load_camera_config()
    
#     if not camera_configs or df is None:
#         logging.error("No camera configurations found. Please check your Excel file.")
#         return
    
#     # Initialize Persons Detected column
#     if 'Persons Detected' not in df.columns:
#         df['Persons Detected'] = -1  # Default to -1 for all
#     else:
#         # Set Persons Detected to -1 for cameras not in Server Room or Computer Lab
#         df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
#     # NOTE: Excel write disabled to prevent file corruption when multiple services run
#     # Save initial DataFrame with -1 for non-processed cameras
#     # try:
#     #     df.to_excel(EXCEL_FILE, index=False)
#     #     logging.info(f"Initialized Excel file with Persons Detected set to -1 for non-processed cameras")
#     # except Exception as e:
#     #     logging.error(f"Error saving initial Excel file: {e}")
#     #     return
    
#     # Authenticate and get token
#     try:
#         token = authenticate_and_get_token()
#         logging.info(f"Authentication successful. Token obtained.")
#     except Exception as e:
#         logging.error(f"Authentication failed: {e}")
#         return
    
#     # Start detection for all cameras in parallel
#     logging.info(f"\nStarting Intruder detection for {len(camera_configs)} cameras...")
#     threads = []  # Initialize threads list
    
#     for config in camera_configs:
#         device_id = config['device_id']
#         camera_no = config['camera_no']
#         index = config['index']
        
#         t = threading.Thread(
#             target=start_camera_detection, 
#             args=(device_id, camera_no, token, df, index),
#             name=f"Camera-{device_id}-{camera_no}"
#         )
#         t.start()
#         threads.append(t)
        
#         # Small delay between starting threads to avoid overwhelming the server
#         time.sleep(1)
    
#     # Log and print after threads are created
#     logging.info(f"Started {len(threads)} camera detection threads.")
#     print(f"Started {len(threads)} camera detection threads.")
#     logging.info("Press Ctrl+C to stop all detections.\n")
    
#     # Wait for all threads to complete
#     try:
#         for t in threads:
#             t.join()
#     except KeyboardInterrupt:
#         logging.info("\nInterrupt received. Stopping all camera detections...")
    
#     # Final update: Ensure non-processed cameras still have -1
#     df.loc[~df['Scene Classification'].isin(['Server Room', 'Computer Lab']), 'Persons Detected'] = -1
    
#     # NOTE: Excel write disabled to prevent file corruption when multiple services run
#     # Final save of Excel file
#     # try:
#     #     df.to_excel(EXCEL_FILE, index=False)
#     #     logging.info(f"Final update: Saved Excel file with all Intruder detection results")
#     # except Exception as e:
#     #     logging.error(f"Error saving final Excel file: {e}")
    
#     logging.info("All camera detections completed.")
#     print("All camera detections completed.")

# if __name__ == "__main__":
#     main()


















import cv2
import time
import os
import logging
import sys
from datetime import datetime
import pymysql
import re
from ultralytics import YOLO

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ================= CONFIG ==================
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# DAV_VIDEO_PATH = os.path.join(
#     PROJECT_ROOT,
#     "NVR_ch19_main_20231206120001_20231206130000.dav"
# )






# DAV_VIDEO_PATH will be set when running as a script
DAV_VIDEO_PATH = None










MODEL_PATH = os.path.join(PROJECT_ROOT, "models/yolov10m.pt")
SAVE_FOLDER = os.path.join(PROJECT_ROOT, "results/tcs_detections/intruder_detection")

MIN_PERSONS = 0
CONF_THRESHOLD = 0.3
COOLDOWN_TIME = 0

DEVICE_ID = "DAV_NVR"
CAMERA_NO = "CH19"

os.makedirs(SAVE_FOLDER, exist_ok=True)

# ================= YOLO ====================
print("Loading YOLO model...")
yolo_model = YOLO(MODEL_PATH)

# ================= STATE ===================
last_save_times = {}
person_counts = {}

# =====================================================
# SAME LOGIC FUNCTION (UNCHANGED)
# =====================================================
def detect_persons_in_frame(frame, device_id="unknown", camera_no="unknown"):
    results = yolo_model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    person_detections = [
        box for box in results.boxes
        if int(box.cls[0]) == 0 and box.conf[0] >= CONF_THRESHOLD
    ]

    person_count = len(person_detections)
    max_conf = float(max([box.conf[0] for box in person_detections], default=0))

    for box in person_detections:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame,
            f"Person {conf:.2f}",
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 255),
            2
        )

    cv2.putText(
        frame,
        f"Persons: {person_count}",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2
    )
    cv2.putText(
        frame,
        f"Device: {device_id}, Cam: {camera_no}",
        (10, 60),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2
    )

    key = f"{device_id}_{camera_no}"
    now = time.time()
    time_elapsed = now - last_save_times.get(key, 0)

    intruder_detected = person_count > MIN_PERSONS

    if intruder_detected and time_elapsed >= COOLDOWN_TIME:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Format: intruder_{device_id}_{camera_no}_{ts}.jpg
        filename = f"{SAVE_FOLDER}/intruder_{device_id}_{camera_no}_{ts}.jpg"
        cv2.imwrite(filename, frame)
        last_save_times[key] = now
        logging.info(f"[{device_id}-{camera_no}] 🚨 Intruder detected & saved: {filename}")

    person_counts[key] = person_counts.get(key, 0) + person_count
    return frame, intruder_detected, person_count


# ================= DB REPORTING =================
import sys as _sys
_utils_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'utils')
if _utils_path not in _sys.path:
    _sys.path.insert(0, _utils_path)
from db_client import report_to_db_hls  # noqa: E402


# =====================================================
# DAV PROCESSOR
# =====================================================
def process_dav_video():
    global DAV_VIDEO_PATH
    if not DAV_VIDEO_PATH:
        if len(sys.argv) < 2:
            print("❌ Usage: python3 script.py <video_file>")
            sys.exit(1)
        DAV_VIDEO_PATH = sys.argv[1]

    cap = cv2.VideoCapture(DAV_VIDEO_PATH, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        logging.error("❌ DAV video open nahi ho raha")
        return

    frame_count = 0
    logging.info("Starting Intruder detection on DAV video")

    while True:
        ret, frame = cap.read()
        if not ret:
            logging.info("✅ Video finished")
            break

        frame_count += 1

        # performance optimization
        if frame_count % 5 != 0:
            continue

        frame = cv2.resize(frame, (640, 360))

        processed_frame, detected, count = detect_persons_in_frame(
            frame,
            DEVICE_ID,
            CAMERA_NO
        )

        if frame_count % 50 == 0:
            if detected:
                logging.warning(
                    f"[{DEVICE_ID}-{CAMERA_NO}] 🚨 Intruder detected! Count={count}"
                )
            else:
                logging.info(
                    f"[{DEVICE_ID}-{CAMERA_NO}] Monitoring... No intruder"
                )

        cv2.imshow("DAV Intruder Detection", processed_frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    logging.info("Intruder detection completed")

# ================= MAIN ====================
if __name__ == "__main__":
    process_dav_video()

