#!/usr/bin/env python3
"""
Camera Status Updater
Updates the Status column in new_sheet.xlsx based on camera accessibility
"""

import pandas as pd
import requests
import cv2
import urllib.parse
import hashlib
import json
import sys
import time
from datetime import datetime
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'logs/status_update_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration
EXCEL_FILE = "data/sheets/new_sheet.xlsx"
AUTH_URL = "https://d11.camview.io/admin/API/accounts/authorize"
VIDEO_URL = "https://d11.camview.io/admin/API/MTS/Video/StartVideo"
SUCCESS_STATUS_CODES = {200, 401}

def generate_signature(userName, password, realm, randomKey):
    """Generate DSS authentication signature"""
    temp = hashlib.md5(password.encode()).hexdigest()
    temp = hashlib.md5((userName + temp).encode()).hexdigest()
    temp = hashlib.md5(temp.encode()).hexdigest()
    temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
    return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()

def authenticate():
    """Authenticate with DSS server"""
    logger.info("Authenticating with DSS server...")
    headers = {"Content-Type": "application/json"}
    payload = {"userName": "system", "ipAddress": "", "clientType": "WINPC_V1"}
    
    try:
        # Initial authorization
        response = requests.post(AUTH_URL, headers=headers, data=json.dumps(payload), timeout=10)
        resp_json = response.json()
        
        realm = resp_json["realm"]
        randomKey = resp_json["randomKey"]
        publicKey = resp_json["publickey"]
        cookie = response.headers.get("Set-Cookie", "")
        
        # Token exchange
        sig = generate_signature("system", "Coreiseven@@", realm, randomKey)
        payload2 = {
            "mac": "",
            "signature": sig,
            "userName": "system",
            "randomKey": randomKey,
            "publicKey": publicKey,
            "encryptType": "MD5",
            "ipAddress": "",
            "clientType": "WINPC_V1",
            "userType": "0"
        }
        
        headers2 = {"Content-Type": "application/json", "Cookie": cookie}
        response2 = requests.post(AUTH_URL, headers=headers2, data=json.dumps(payload2), timeout=10)
        resp_json2 = response2.json()
        
        token = resp_json2.get("token")
        if token:
            logger.info(f"Authentication successful! Token: {token[:20]}...")
            return token
        else:
            logger.error("Authentication failed: No token received")
            return None
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        return None

def check_camera_accessibility(device_id, camera_no, token):
    """
    Check if a camera is accessible by attempting to start video stream
    Returns: 'Accessible', 'Not Accessible', or 'Unknown'
    """
    try:
        url = f"{VIDEO_URL}?token={token}"
        headers = {"Content-Type": "application/json", "X-Subject-Token": token}
        
        payload = {
            "clientType": "WINPC_V1",
            "project": "PSDK",
            "method": "MTS.Video.StartVideo",
            "data": {
                "streamType": "1",
                "optional": f"/admin/API/MTS/Video/StartVideo?token={token}",
                "channelId": f"{device_id}$1$0${camera_no}",
                "dataType": "2",
                "enableRtsps": "0"
            }
        }
        
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=10)
        
        if response.status_code == 200:
            resp_json = response.json()
            if resp_json.get("code") == 1000 and resp_json.get("data"):
                # Check if RTSP URLs are available
                data = resp_json["data"]
                urls = []
                for key in ("url", "url2"):
                    raw = data.get(key)
                    if raw:
                        parts = [part.strip() for part in raw.split('|') if part.strip()]
                        urls.extend(parts)
                
                if urls:
                    logger.info(f"✅ Device {device_id}, Camera {camera_no}: Accessible")
                    return "Accessible"
                else:
                    logger.warning(f"⚠️ Device {device_id}, Camera {camera_no}: No RTSP URLs")
                    return "Not Accessible"
            else:
                logger.warning(f"❌ Device {device_id}, Camera {camera_no}: API error code {resp_json.get('code')}")
                return "Not Accessible"
        else:
            logger.warning(f"❌ Device {device_id}, Camera {camera_no}: HTTP {response.status_code}")
            return "Not Accessible"
            
    except Exception as e:
        logger.error(f"❌ Device {device_id}, Camera {camera_no}: Exception - {str(e)}")
        return "Not Accessible"

def update_camera_status():
    """Main function to update camera status in Excel file"""
    logger.info("="*80)
    logger.info("Starting Camera Status Update")
    logger.info("="*80)
    
    # Authenticate
    token = authenticate()
    if not token:
        logger.error("Failed to authenticate. Exiting.")
        sys.exit(1)
    
    # Read Excel file
    try:
        logger.info(f"Reading Excel file: {EXCEL_FILE}")
        df = pd.read_excel(EXCEL_FILE)
        logger.info(f"Total cameras in file: {len(df)}")
        
        # Check if Status column exists, if not create it
        if 'Status' not in df.columns:
            df['Status'] = 'Unknown'
            logger.info("Created 'Status' column")
        
    except Exception as e:
        logger.error(f"Failed to read Excel file: {e}")
        sys.exit(1)
    
    # Update status for each camera
    updated_count = 0
    accessible_count = 0
    not_accessible_count = 0
    
    for index, row in df.iterrows():
        device_id = str(row['device_id']).strip()
        camera_no = int(row['camera_no'])
        
        logger.info(f"\n[{index+1}/{len(df)}] Checking Device {device_id}, Camera {camera_no}")
        
        # Check camera accessibility
        status = check_camera_accessibility(device_id, camera_no, token)
        
        # Update DataFrame
        df.at[index, 'Status'] = status
        updated_count += 1
        
        if status == "Accessible":
            accessible_count += 1
        elif status == "Not Accessible":
            not_accessible_count += 1
        
        # Small delay to avoid overwhelming the server
        time.sleep(0.5)
        
        # Re-authenticate every 20 cameras (token might expire)
        if (index + 1) % 20 == 0:
            logger.info("Re-authenticating...")
            token = authenticate()
            if not token:
                logger.error("Re-authentication failed. Stopping.")
                break
    
    # Save updated Excel file
    try:
        logger.info(f"\nSaving updated Excel file: {EXCEL_FILE}")
        df.to_excel(EXCEL_FILE, index=False)
        logger.info("File saved successfully!")
    except Exception as e:
        logger.error(f"Failed to save Excel file: {e}")
        sys.exit(1)
    
    # Summary
    logger.info("\n" + "="*80)
    logger.info("Camera Status Update Complete")
    logger.info("="*80)
    logger.info(f"Total Cameras: {len(df)}")
    logger.info(f"Accessible: {accessible_count}")
    logger.info(f"Not Accessible: {not_accessible_count}")
    logger.info(f"Updated: {updated_count}")
    logger.info("="*80)

if __name__ == "__main__":
    update_camera_status()
