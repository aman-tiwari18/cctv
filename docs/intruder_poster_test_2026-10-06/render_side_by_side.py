"""Side-by-side video of the synthetic intruder clip: filter OFF (old) | filter ON (new).

  python render_side_by_side.py cam26_synth.mp4 out.mp4 [--start 370] [--end 540]

Frames before --start are fed to the filter at 5 fps (not written) so the poster's static zone
is learned the way it would be in production; from --start every frame is written. Output is
H.264 so it plays in a browser / VS Code.
"""
import argparse, subprocess, sys
import cv2
import numpy as np

sys.path.insert(0, "/root/cctv/script-server/scripts/detection")
import Intruder_det as det

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("out")
ap.add_argument("--start", type=float, default=370)
ap.add_argument("--end", type=float, default=540)
a = ap.parse_args()

cap = cv2.VideoCapture(a.video)
fps = cap.get(cv2.CAP_PROP_FPS) or 15
W, H = int(cap.get(3)), int(cap.get(4))
model = det.get_yolo_model()
BAR = 36
ff = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
                       "-s", f"{2 * W}x{H + BAR}", "-r", str(fps), "-i", "-",
                       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart",
                       a.out], stdin=subprocess.PIPE)

def label(img, text, color):
    bar = np.zeros((BAR, img.shape[1], 3), np.uint8)
    cv2.putText(bar, text, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
    return np.vstack([bar, img])

consec = {"off": 0, "on": 0}
alerts = {"off": 0, "on": 0}
i, next_warm = 0, 0.0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    t = i / fps
    i += 1
    if t > a.end:
        break
    warm = t < a.start
    if warm:
        if t < next_warm:
            continue
        next_warm = t + 0.2
    r = model(frame, conf=det.CONF_THRESHOLD, verbose=False)
    item = {"frame": frame, "device_id": "test", "camera_no": "cam26", "captured_at": t}
    panels = {}
    for mode in ("off", "on"):
        det.MOTION_GATE_ENABLED = mode == "on"
        ann, detected, _ = det.detect_intruder_batch([item], results=r)[0]
        consec[mode] = consec[mode] + 1 if detected else 0
        if consec[mode] >= 2:      # production 2-consecutive-hit gate → an alert is sent
            consec[mode] = 0
            alerts[mode] += 1
        panels[mode] = ann
    if warm:
        continue
    left = label(panels["off"], f"PURANA (filter OFF)   t={t:5.1f}s   alerts={alerts['off']}", (80, 80, 255))
    right = label(panels["on"], f"NAYA (filter ON)   t={t:5.1f}s   alerts={alerts['on']}", (80, 255, 80))
    ff.stdin.write(np.hstack([left, right]).tobytes())

ff.stdin.close()
ff.wait()
print("wrote", a.out, "alerts:", alerts)
