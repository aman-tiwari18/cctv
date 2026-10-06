"""Offline test of the intruder photo/poster filter.

Feeds a video through Intruder_det.detect_intruder_batch like production does and applies the
same consecutive-hit gate (2 hits) as unified_detector / intruder_worker. Reports how many
alerts fire with the filter OFF (old behaviour) vs ON.

  python run_intruder_test.py VIDEO OUTDIR [--mode continuous|rr] [--fps 5] [--rr-every 30]

continuous: SAMPLE_FPS frames/s (CONTINUOUS / legacy worker path)
rr:         round-robin — 2 frames (0.2 s apart) every --rr-every seconds (unified default)
"""
import argparse, json, os, sys
import cv2

sys.path.insert(0, "/root/cctv/script-server/scripts/detection")
import Intruder_det as det

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("outdir")
ap.add_argument("--mode", default="continuous", choices=["continuous", "rr"])
ap.add_argument("--fps", type=float, default=5)
ap.add_argument("--rr-every", type=float, default=30)
ap.add_argument("--max-sec", type=float, default=0)
ap.add_argument("--save-every", type=int, default=0, help="save an annotated frame every N samples")
a = ap.parse_args()
os.makedirs(a.outdir, exist_ok=True)

# Record the motion score the filter computes for each box (for calibration).
scores = []
_orig = det._StaticFilter._diff
def _rec(cur, ref, gain):
    d = _orig(cur, ref, gain)
    scores.append(d)
    return d
det._StaticFilter._diff = staticmethod(_rec)

import collections
verdicts = collections.Counter()
_orig_split = det._split_real_static
def _split(item, frame, boxes):
    v = _orig_split(item, frame, boxes)
    if det.MOTION_GATE_ENABLED:
        verdicts.update(r for _, r in v)
    return v
det._split_real_static = _split

cap = cv2.VideoCapture(a.video)
vfps = cap.get(cv2.CAP_PROP_FPS) or 25
total = cap.get(cv2.CAP_PROP_FRAME_COUNT) / vfps
print(f"{a.video}: {total:.0f}s @ {vfps:.1f} fps")

def sample_times():
    t = 0.0
    while t < total and (not a.max_sec or t < a.max_sec):
        if a.mode == "continuous":
            yield t; t += 1.0 / a.fps
        else:
            yield t; yield t + 0.2; t += a.rr_every

model = det.get_yolo_model()
res = {"off": {"alerts": 0, "pos": 0, "consec": 0, "alert_t": []},
       "on":  {"alerts": 0, "pos": 0, "consec": 0, "alert_t": []}}
reasons = {}
n = 0
for t in sample_times():
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    if not ok:
        continue
    r = model(frame, conf=det.CONF_THRESHOLD, verbose=False)
    item = {"frame": frame, "device_id": "test", "camera_no": os.path.basename(a.video), "captured_at": t}
    for mode in ("off", "on"):
        det.MOTION_GATE_ENABLED = mode == "on"
        before = len(scores)
        annotated, detected, count = det.detect_intruder_batch([item], results=r)[0]
        if mode == "off":
            del scores[before:]
        s = res[mode]
        if detected:
            s["pos"] += 1
            s["consec"] += 1
            if s["consec"] >= 2:          # same 2-hit gate as production
                s["alerts"] += 1; s["consec"] = 0; s["alert_t"].append(round(t, 1))
                cv2.imwrite(os.path.join(a.outdir, f"alert_{mode}_{t:07.1f}.jpg"), annotated)
        else:
            s["consec"] = 0
        if mode == "on" and a.save_every and n % a.save_every == 0:
            cv2.imwrite(os.path.join(a.outdir, f"frame_{t:07.1f}.jpg"), annotated)
    # reasons for every candidate box this frame (filter ON)
    det.MOTION_GATE_ENABLED = True
    n += 1

for mode in res:
    res[mode].pop("consec")
f = det._filters.get(f"test_{os.path.basename(a.video)}")
summary = {
    "video": a.video, "mode": a.mode, "samples": n,
    "filter_off": res["off"], "filter_on": res["on"],
    "learned_static_zones": [[round(v) for v in z["box"]] for z in f.zones if z["static"]] if f else [],
    "box_verdicts_filter_on": dict(verdicts),
    "motion_scores": {
        "count": len([s for s in scores if s is not None]),
        "max": round(max([s for s in scores if s is not None], default=0), 2),
        "over_thresh": sum(1 for s in scores if s is not None and s >= det.MOTION_DIFF_THRESH),
    },
}
json.dump(summary, open(os.path.join(a.outdir, "summary.json"), "w"), indent=1)
for mode in ("filter_off", "filter_on"):
    summary[mode]["alert_t"] = summary[mode]["alert_t"][:40]
print(json.dumps(summary, indent=1))
