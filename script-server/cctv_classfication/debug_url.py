# debug_url_v3.py
import requests
import re

TEST_URL = "https://g01.tcsion.com/iCAMERAStreamingFW/ViewCameraFeedServlet?OrgID=2083&AssessmentCCTVID=045972856717608a2250o2083&CameraID=39616"

# Browser se copy karo - F12 > Network > ViewCameraFeedServlet > Request Headers > Cookie
COOKIE_STRING = "PASTE_YOUR_COOKIE_STRING_HERE"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Cookie": COOKIE_STRING,
    "Referer": "https://g01.tcsion.com/",
}

r = requests.get(TEST_URL, headers=headers, timeout=10)
print("Status:", r.status_code)
print("Response:", r.text[:1000])

m3u8 = re.findall(r'https?://[^\s<>"]+?\.m3u8[^\s<>"]*', r.text)
print("M3U8 found:", m3u8)