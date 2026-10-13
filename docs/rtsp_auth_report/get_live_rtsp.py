#!/usr/bin/env python3
"""Print fresh RTSP links for the 20 cameras verified live on 10 Oct 2026 (exam 42, SSC CGL).

Each link works ONCE and expires within ~30-90 s if unused, so run this right before use.
Tokens come from the camview token server (never logs in to the DVR directly, so the
fleet's shared session is not disturbed).

    python3 get_live_rtsp.py            # all 20
    python3 get_live_rtsp.py 3 7        # only cameras #3 and #7
Env: CAMVIEW_TOKEN_SERVER (default http://localhost:8090, use http://192.168.19.30:8090 off worker-0)
"""
import json, os, re, sys
import requests, urllib3

urllib3.disable_warnings()
TOKEN_SERVER = os.environ.get("CAMVIEW_TOKEN_SERVER", "http://localhost:8090").rstrip("/")
PRIVATE = re.compile(r"rtsp://(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)")

# (server, device_id, camera_no, classification, centre, city)
CAMERAS = [
    ("d15.camview.io", "1000021", "9",  "Server Room",  "AADARSH PARIKSHA KENDRA GAYA", "GAYA"),
    ("d14.camview.io", "1000684", "10", "Computer Lab", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NOIDA"),
    ("d15.camview.io", "1000119", "13", "Server Room",  "AADARSH PARIKSHA KENDRA SAHARSA", "SAHARSA"),
    ("d15.camview.io", "1000115", "4",  "Computer Lab", "AADARSH PARIKSHA KENDRA DARBHANGA", "DARBHANGA"),
    ("d14.camview.io", "1000833", "11", "Computer Lab", "LAVISHA ONLINE AND TECHNICAL SERVICES", "AGRA"),
    ("d14.camview.io", "1000828", "7",  "Entry",        "EXAMINA INFOTECH", "LUCKNOW"),
    ("d14.camview.io", "1000767", "8",  "Computer Lab", "ANAND INTERNATIONAL COLLEGE OF ENGINEERING", "JAIPUR"),
    ("d14.camview.io", "1000568", "9",  "Computer Lab", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NEW DELHI"),
    ("d15.camview.io", "1000015", "18", "Outside Area", "AADARSH PARIKSHA KENDRA MUZAFFARPUR", "MUZAFFARPUR"),
    ("d14.camview.io", "1000685", "20", "Outside Area", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NOIDA"),
    ("d14.camview.io", "1000659", "0",  "Outside Area", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NOIDA"),
    ("d15.camview.io", "1000117", "21", "Server Room",  "AADARSH PARIKSHA KENDRA DARBHANGA", "DARBHANGA"),
    ("d15.camview.io", "1000219", "8",  "Computer Lab", "AADARSH PARIKSHA KENDRA CHHAPRA", "CHHAPRA"),
    ("d14.camview.io", "1000700", "12", "Computer Lab", "JAI ARIHANT GROUP OF INSTITUTIONS", "HALDWANI"),
    ("d15.camview.io", "1000024", "4",  "Computer Lab", "AADARSH PARIKSHA KENDRA GAYA", "GAYA"),
    ("d14.camview.io", "1000685", "0",  "Outside Area", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NOIDA"),
    ("d14.camview.io", "1000680", "5",  "Computer Lab", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NOIDA"),
    ("d15.camview.io", "1000007", "26", "Computer Lab", "AADARSH PARIKSHA KENDRA MUZAFFARPUR", "MUZAFFARPUR"),
    ("d14.camview.io", "1000654", "11", "Computer Lab", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NOIDA"),
    ("d14.camview.io", "1000683", "11", "Computer Lab", "AADARSH PARIKSHA KENDRA - NOIDA - SECTOR", "NOIDA"),
]

_tokens = {}


def session_token(server):
    if server not in _tokens:
        r = requests.get(f"{TOKEN_SERVER}/token", params={"server": server}, timeout=15)
        _tokens[server] = r.json().get("token") if r.status_code == 200 else None
    return _tokens[server]


def fresh_link(server, device_id, camera_no):
    tok = session_token(server)
    if not tok:
        return None
    payload = {"clientType": "WINPC_V1", "project": "PSDK", "method": "MTS.Video.StartVideo",
               "data": {"streamType": "1", "optional": f"/admin/API/MTS/Video/StartVideo?token={tok}",
                        "channelId": f"{device_id}$1$0${camera_no}", "dataType": "2", "enableRtsps": "0"}}
    r = requests.post(f"https://{server}/admin/API/MTS/Video/StartVideo?token={tok}",
                      headers={"Content-Type": "application/json;charset=UTF-8", "X-Subject-Token": tok},
                      data=json.dumps(payload), timeout=10, verify=False)
    if r.status_code != 200:
        return None
    d = r.json().get("data") or {}
    urls = [u.strip() for k in ("url", "url2") for u in (d.get(k) or "").split("|") if u.strip()]
    public = [u for u in urls if not PRIVATE.match(u)] or urls
    return f"{public[0]}?token={d.get('token') or tok}" if public else None


def main():
    picks = [int(a) for a in sys.argv[1:]] or range(1, len(CAMERAS) + 1)
    for n in picks:
        server, dev, ch, cls, centre, city = CAMERAS[n - 1]
        link = fresh_link(server, dev, ch)
        print(f"#{n:<2} {dev}_{ch:<3} {cls:<13} {city:<12} {link or 'FAILED (no token / StartVideo error)'}")


if __name__ == "__main__":
    main()
