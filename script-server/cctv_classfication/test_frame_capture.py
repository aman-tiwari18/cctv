#!/usr/bin/env python3
"""
Test frame capture with authenticated RTSP URLs
"""
import requests
import json
import hashlib
import cv2
import subprocess
import os
import shutil
import uuid
import urllib.parse

# Test with one camera from D14 server (was more responsive)
SERVER = "D14.camview.io"
DEVICE_ID = "1000525"
CAMERA_NO = "2"

def generate_signature(userName, password, realm, randomKey):
    temp = hashlib.md5(password.encode()).hexdigest()
    temp = hashlib.md5((userName + temp).encode()).hexdigest()
    temp = hashlib.md5(temp.encode()).hexdigest()
    temp = hashlib.md5((userName + ":" + realm + ":" + temp).encode()).hexdigest()
    return hashlib.md5((temp + ":" + randomKey).encode()).hexdigest()

def authenticate(server):
    print(f"Authenticating with {server}...")
    url = f"https://{server}/admin/API/accounts/authorize"
    headers = {"Content-Type": "application/json"}
    payload = {"userName": "system", "ipAddress": "", "clientType": "WINPC_V1"}
    
    # Step 1: Get realm and randomKey (expects 401 response)
    res = requests.post(url, headers=headers, json=payload, timeout=10)
    
    # Parse response even if 401
    try:
        data = res.json()
    except:
        print(f"❌ Failed to parse auth response (status {res.status_code})")
        print(f"   Response: {res.text[:200]}")
        return None
    
    realm = data.get("realm")
    randomKey = data.get("randomKey")
    publicKey = data.get("publickey")
    
    if not realm or not randomKey:
        print(f"❌ Missing realm/randomKey in response")
        return None
    
    cookie = res.headers.get("Set-Cookie", "")
    
    # Step 2: Exchange signature for token
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
    res2 = requests.post(url, headers=headers2, json=payload2, timeout=10)
    data2 = res2.json()
    
    token = data2.get("token")
    if not token:
        print(f"❌ No token in response")
        return None
        
    print(f"✅ Got token: {token[:20]}...")
    return token

def get_rtsp_url(server, device_id, camera_no, token):
    print(f"Getting RTSP URL for {device_id}_{camera_no}...")
    url = f"https://{server}/admin/API/MTS/Video/StartVideo?token={token}"
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
    
    res = requests.post(url, headers=headers, json=payload, timeout=10)
    data = res.json()
    
    # Extract URL from data field
    stream_data = data.get("data", {})
    raw_url = stream_data.get("url")
    stream_token = stream_data.get("token") or token
    
    if not raw_url:
        print(f"❌ No URL in response")
        return None, None
    
    # Split by pipe and get first URL (API returns multiple URLs separated by |)
    urls = [part.strip() for part in raw_url.split('|') if part.strip()]
    if not urls:
        print(f"❌ No URLs after splitting")
        return None, None
    
    # Decode first URL (API returns URL-encoded)
    rtsp_url = urllib.parse.unquote(urls[0])
    print(f"✅ Got RTSP URL: {rtsp_url}")
    print(f"✅ Got stream token: {stream_token[:20]}...")
    
    return rtsp_url, stream_token

def add_token_to_url(rtsp_url, token):
    """Add token to RTSP URL"""
    parsed = urllib.parse.urlparse(rtsp_url)
    query = urllib.parse.parse_qs(parsed.query)
    query['token'] = [token]
    new_query = urllib.parse.urlencode(query, doseq=True)
    return urllib.parse.urlunparse(parsed._replace(query=new_query))

def test_opencv(rtsp_url_with_token):
    print(f"\n=== Testing OpenCV ===")
    print(f"URL: {rtsp_url_with_token[:100]}...")
    
    cap = cv2.VideoCapture(rtsp_url_with_token, cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
    
    if not cap.isOpened():
        print("❌ OpenCV: Failed to open stream")
        return None
    
    print("✅ OpenCV: Stream opened")
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret or frame is None:
        print("❌ OpenCV: Failed to read frame")
        return None
    
    # Save frame
    os.makedirs("test_frames", exist_ok=True)
    img_path = f"test_frames/opencv_test.jpg"
    cv2.imwrite(img_path, frame)
    print(f"✅ OpenCV: Frame saved to {img_path}")
    print(f"   Frame size: {frame.shape}")
    
    return img_path

def test_ffmpeg(rtsp_url_with_token):
    print(f"\n=== Testing FFmpeg ===")
    
    if not shutil.which("ffmpeg"):
        print("❌ FFmpeg not found")
        return None
    
    os.makedirs("test_frames", exist_ok=True)
    img_path = "test_frames/ffmpeg_test.jpg"
    
    cmd = [
        "ffmpeg",
        "-y",
        "-rtsp_transport", "tcp",
        "-timeout", "5000000",  # 5 seconds in microseconds
        "-i", rtsp_url_with_token,
        "-frames:v", "1",
        "-loglevel", "error",
        img_path
    ]
    
    print(f"Running: {' '.join(cmd[:6])}...")
    
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        
        if result.returncode != 0:
            print(f"❌ FFmpeg failed with code {result.returncode}")
            print(f"   stderr: {result.stderr.decode()[:200]}")
            return None
        
        if not os.path.exists(img_path):
            print("❌ FFmpeg: No output file created")
            return None
        
        print(f"✅ FFmpeg: Frame saved to {img_path}")
        file_size = os.path.getsize(img_path)
        print(f"   File size: {file_size} bytes")
        
        return img_path
        
    except subprocess.TimeoutExpired:
        print("❌ FFmpeg: Timeout")
        return None
    except Exception as e:
        print(f"❌ FFmpeg error: {e}")
        return None

if __name__ == "__main__":
    print("="*80)
    print("Testing Frame Capture with Authenticated RTSP URLs")
    print("="*80)
    
    # Step 1: Authenticate
    token = authenticate(SERVER)
    
    # Step 2: Get RTSP URL
    rtsp_url, stream_token = get_rtsp_url(SERVER, DEVICE_ID, CAMERA_NO, token)
    
    if not rtsp_url:
        print("❌ Failed to get RTSP URL")
        exit(1)
    
    # Step 3: Add token to URL
    rtsp_url_with_token = add_token_to_url(rtsp_url, stream_token)
    print(f"\n✅ Final RTSP URL (with token): {rtsp_url_with_token[:100]}...")
    
    # Step 4: Test OpenCV
    opencv_result = test_opencv(rtsp_url_with_token)
    
    # Step 5: Test FFmpeg
    ffmpeg_result = test_ffmpeg(rtsp_url_with_token)
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"OpenCV:  {'✅ SUCCESS' if opencv_result else '❌ FAILED'}")
    print(f"FFmpeg:  {'✅ SUCCESS' if ffmpeg_result else '❌ FAILED'}")
    print("="*80)
