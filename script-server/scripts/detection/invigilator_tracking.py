import cv2
import time
import os
import random
_DET_GPU_ID = int(os.environ["WORKER_INDEX"]) if os.environ.get("WORKER_INDEX", "").strip().isdigit() else int("".join(c for c in os.environ.get("WORKER_ID", "main").split("-")[-1] if c.isdigit()) or "0")
import logging
import threading
import torch
import numpy as np
from datetime import datetime
from ultralytics import YOLO

# ================= LOGGING =================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ================= CONFIG ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# UNIFIED_PERSON_MODEL=finetuned -> the fine-tuned person+monitor model (person = class 0)
from detection_models import person_model_path
MODEL_PATH = person_model_path(os.path.join(BASE_DIR, "models", "yolov10m.pt"))
SAVE_FOLDER = os.path.join(BASE_DIR, "results/invigilator_detection")

# CAMERA CLASSIFICATION: Inside Lab
# This detection runs on cameras classified as:
# - Computer Lab / Inside Lab / Exam Lab / Inside Classroom

# --- Standing-person classification (used by both ABSENT and STATIC) ---
CONF_THRESHOLD = 0.40          # Tightened from 0.30 — weak phantom standing shapes were polluting the tracker
MIN_HEIGHT = 100               # Minimum bbox height (px) to be considered standing.
                               # Original mentor-set value; below this is YOLO noise from far-away phantoms.
STANDING_ASPECT_RATIO = 2.5    # h/w >= 2.5 → "standing" pose. Tightened from 2.3 because half-body
                               # seated bboxes of upright students (head + torso + arms at desk) were
                               # leaking through at h/w ~2.4-2.5. A standing invigilator with arms
                               # relaxed has h/w ~3-4; arms-out / oblique poses ~2.3-2.7. Brief
                               # rejection on arms-out frames is safe — the 30 s percentile window
                               # (>= 90 % inside radius) absorbs short detection gaps without
                               # resetting the 7-min STATIC timer. This is the practical ceiling
                               # of bbox-only standing classification; going further requires pose
                               # estimation, which no script in this codebase currently uses.

# --- ABSENT violation (no invigilator in the room) ---
NO_TARGET_TIME_THRESH = 45     # Seconds of zero-standing-person before ABSENT fires

# --- STATIC violation (checkpoint-based, same person at the same spot) ---
# Instead of following every frame, a checkpoint is taken every CHECK_INTERVAL_SEC. The first
# checkpoint that sees a standing person anchors their foot position + clothing colour signature;
# each later checkpoint asks "is the SAME person still standing at that spot?". This works with
# round-robin capture (a camera is revisited every 10-60 s), survives short occlusions, and the
# colour check stops a different person who steps into the spot from inheriting the timer.
STATIC_TIME_THRESH    = 420   # Seconds — 7 min at the same spot before STATIC fires (per client spec)
CHECK_INTERVAL_SEC    = 60    # One checkpoint per ~minute per camera, jittered ±25 % so someone
                              # pacing on a regular loop isn't sampled at the same spot every time
MAX_CHECK_GAP_SEC     = 180   # Camera unseen longer than this → continuity unknown, drop all anchors
MISS_STREAK_RESET     = 2     # Consecutive checkpoints without the same person at the spot → moved, reset
MIN_HITS              = 3     # Checkpoints the person must have been seen at the spot
MIN_HIT_RATIO         = 0.80  # ...and the fraction of checkpoints they were seen at
CONFIRM_HIT_STREAK    = 2     # The latest N checkpoints must all be hits — one lucky pass of a
                              # walking person through the spot can't re-confirm a stale anchor
ANCHOR_RADIUS_FLOOR   = 40    # px — foot must be within max(floor, bbox_h * ratio) of the anchor
ANCHOR_RADIUS_RATIO   = 0.25
MAX_ANCHORS           = 20    # Per camera; bounds work if a scene produces many standing boxes

# --- Same-person check (clothing colour signature) ---
# HSV hue/saturation histogram of torso and legs, compared with Bhattacharyya distance
# (0 = identical, 1 = unrelated). Tuned on real lab footage: 0.40 keeps ~99 % of same-person
# checks and rejects ~90 % of different people per checkpoint; over the 7-min run of checkpoints
# a swapped-in person rarely inherits the timer. Weak spot: near-identical clothing
# (same-colour vests / dark jackets).
APPEARANCE_MAX_DIST   = 0.40
GALLERY_SIZE          = 3     # Anchor signature + the next confirmed matches, compared by min distance

os.makedirs(SAVE_FOLDER, exist_ok=True)

# ================= YOLO ====================
yolo_model = None
_model_lock = threading.Lock()

def get_yolo_model():
    """Return a shared YOLO model instance."""
    global yolo_model
    if yolo_model is None:
        with _model_lock:
            if yolo_model is None:
                logger.info(f"Loading YOLO model from {MODEL_PATH}...")
                yolo_model = YOLO(MODEL_PATH)
                if torch.cuda.is_available():
                    yolo_model.to('cuda')
                    logger.info("YOLO model moved to CUDA")
    return yolo_model

# ================= TRACKING =================
def appearance_signature(frame, box):
    """Clothing colour signature of one person box: (torso_hist, legs_hist), or None if the crop is empty.
    Crop is normalised to 64x160; left/right 15 % (background) and the head (top 15 %) are skipped."""
    fh, fw = frame.shape[:2]
    x1, y1 = max(int(box[0]), 0), max(int(box[1]), 0)
    x2, y2 = min(int(box[2]), fw), min(int(box[3]), fh)
    if x2 - x1 < 4 or y2 - y1 < 8:
        return None
    crop = cv2.resize(frame[y1:y2, x1:x2], (64, 160))
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

    def _hist(part):
        h = cv2.calcHist([part], [0, 1], None, [16, 8], [0, 180, 0, 256])
        # Spread each bin into its neighbours so a small colour shift — or red, whose hue
        # wraps around 0/180 — doesn't land the same clothing in an unrelated bin.
        h = h + 0.5 * (np.roll(h, 1, axis=0) + np.roll(h, -1, axis=0))
        h = h + 0.25 * (np.pad(h, ((0, 0), (1, 0)), mode="edge")[:, :-1] +
                        np.pad(h, ((0, 0), (0, 1)), mode="edge")[:, 1:])
        h = h.astype(np.float32)
        return cv2.normalize(h, h).flatten()

    return _hist(hsv[24:88, 9:55]), _hist(hsv[88:152, 9:55])


def appearance_distance(a, b):
    """0 = identical clothing colours, 1 = unrelated (mean Bhattacharyya of torso + legs)."""
    return 0.5 * (cv2.compareHist(a[0], b[0], cv2.HISTCMP_BHATTACHARYYA) +
                  cv2.compareHist(a[1], b[1], cv2.HISTCMP_BHATTACHARYYA))


class PersonTracker:
    """
    Per-camera invigilator state.

      ABSENT → fires when zero standing persons are detected for
               NO_TARGET_TIME_THRESH continuous seconds.
      STATIC → fires when the SAME person has stood at the same spot for
               STATIC_TIME_THRESH seconds, judged at checkpoints taken every
               CHECK_INTERVAL_SEC.

    At a checkpoint each anchor (foot position + colour gallery) is checked:
    a standing box near the anchor whose colours match the gallery is a hit,
    anything else is a miss. MISS_STREAK_RESET misses in a row drop the anchor.
    Standing boxes that matched no anchor start new anchors — so a different
    person stepping into the spot starts their own timer instead of inheriting one.

    Once an anchor is confirmed (7 min elapsed, enough hits, latest
    CONFIRM_HIT_STREAK checkpoints all hits) STATIC stays true on every frame where that person is still at the
    spot, so the reporting gate (consecutive hits + cooldown) sees a stable
    signal and decides the save cadence.
    """
    def __init__(self):
        self.no_target_start = None
        self.anchors = []
        self.last_check = None
        self.next_check = None

    @staticmethod
    def _foot(box):
        return ((box[0] + box[2]) / 2.0, float(box[3]))

    @staticmethod
    def _near(anchor, foot):
        r = max(ANCHOR_RADIUS_FLOOR, anchor['h'] * ANCHOR_RADIUS_RATIO)
        return ((foot[0] - anchor['x']) ** 2 + (foot[1] - anchor['y']) ** 2) ** 0.5 < r

    @staticmethod
    def _same_person(anchor, sig):
        return sig is not None and min(
            appearance_distance(g, sig) for g in anchor['gallery']) < APPEARANCE_MAX_DIST

    def _checkpoint(self, now, people):
        # Camera unseen for too long → can't vouch for continuity.
        if self.last_check is not None and now - self.last_check > MAX_CHECK_GAP_SEC:
            self.anchors = []
        self.last_check = now
        self.next_check = now + CHECK_INTERVAL_SEC * random.uniform(0.75, 1.25)

        matched = set()
        for a in self.anchors:
            a['checks'] += 1
            hit = None
            for i, (foot, h, sig) in enumerate(people):
                if self._near(a, foot) and self._same_person(a, sig):
                    hit = i
                    break
            if hit is None:
                a['miss_streak'] += 1
                a['hit_streak'] = 0
                continue
            matched.add(hit)
            a['hits'] += 1
            a['miss_streak'] = 0
            a['hit_streak'] += 1
            if len(a['gallery']) < GALLERY_SIZE:
                a['gallery'].append(people[hit][2])
        self.anchors = [a for a in self.anchors if a['miss_streak'] < MISS_STREAK_RESET]

        for i, (foot, h, sig) in enumerate(people):
            if i in matched or sig is None or len(self.anchors) >= MAX_ANCHORS:
                continue
            self.anchors.append({
                'x': foot[0], 'y': foot[1], 'h': h, 'gallery': [sig], 'start': now,
                'checks': 1, 'hits': 1, 'miss_streak': 0, 'hit_streak': 1,
            })

    def update(self, person_boxes, frame):
        """
        person_boxes : list of [x1,y1,x2,y2] for STANDING-classified boxes.
        frame        : the un-annotated frame the boxes came from (for colour signatures).
        Returns (absent_violation: bool, static_violation: bool, static_feet: list[(fx,fy)]).
        `static_feet` holds the foot point of every box that is a confirmed STATIC
        person in this frame, so the caller can highlight only that subject.
        """
        now = time.time()

        if self.next_check is None or now >= self.next_check:
            people = [(self._foot(b), max(float(b[3] - b[1]), 1.0), appearance_signature(frame, b))
                      for b in person_boxes]
            self._checkpoint(now, people)

        # --- ABSENT branch -------------------------------------------------
        if not person_boxes:
            if self.no_target_start is None:
                self.no_target_start = now
            return (now - self.no_target_start) > NO_TARGET_TIME_THRESH, False, []

        # At least one standing person → disarm ABSENT clock
        self.no_target_start = None

        # --- STATIC branch -------------------------------------------------
        confirmed = [a for a in self.anchors
                     if a['hit_streak'] >= CONFIRM_HIT_STREAK
                     and now - a['start'] >= STATIC_TIME_THRESH
                     and a['hits'] >= MIN_HITS
                     and a['hits'] / a['checks'] >= MIN_HIT_RATIO]
        static_feet = []
        for b in person_boxes:
            foot = self._foot(b)
            near = [a for a in confirmed if self._near(a, foot)]
            if near and any(self._same_person(a, appearance_signature(frame, b)) for a in near):
                static_feet.append(foot)

        return False, bool(static_feet), static_feet

# ================= STATE ===================
trackers = {}
_state_lock = threading.Lock()

# =====================================================
# CORE DETECTION LOGIC
# =====================================================
def detect_invigilator_in_frame(frame, device_id="unknown", camera_no="unknown", script_name="invigilator"):
    """Standalone detection for a single frame."""
    model = get_yolo_model()
    results = model(frame, conf=CONF_THRESHOLD, verbose=False)[0]

    # Only standing persons count as invigilator candidates (per mentor rule).
    # Standing := height >= MIN_HEIGHT AND height/width >= STANDING_ASPECT_RATIO.
    # The aspect-ratio gate (h/w >= 2.0) rejects seated torso-above-desk bboxes
    # (h/w ~1.2-1.7) regardless of where they sit in the frame.
    person_boxes = []
    person_confs = []
    for box in results.boxes:
        if int(box.cls[0]) != 0 or float(box.conf[0]) < CONF_THRESHOLD:
            continue
        coords = box.xyxy[0].cpu().numpy()
        h = coords[3] - coords[1]
        w = max(coords[2] - coords[0], 1.0)
        if h >= MIN_HEIGHT and (h / w) >= STANDING_ASPECT_RATIO:
            person_boxes.append(coords)
            person_confs.append(float(box.conf[0]))

    key = f"{device_id}_{camera_no}"
    with _state_lock:
        if key not in trackers:
            trackers[key] = PersonTracker()
        tracker = trackers[key]

    absent, static_violation, static_feet = tracker.update(person_boxes, frame)
    violation_detected = absent or static_violation
    status = "ABSENT" if absent else ("STATIC" if static_violation else "Active")

    # Box drawing:
    # - On STATIC: the track that fired (matched by foot position) gets a thick
    #   red box with a "STATIC" label; other standees get thin green boxes.
    # - On ABSENT: no person_boxes exist this frame, so the loop draws nothing.
    # - Active: everyone in thin green.
    for box, conf in zip(person_boxes, person_confs):
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        bbox_h = y2 - y1
        fx = (x1 + x2) / 2.0
        fy = float(y2)
        match_r = max(bbox_h * 0.3, 25)
        is_static_box = static_violation and any(
            ((fx - sx) ** 2 + (fy - sy) ** 2) ** 0.5 < match_r
            for sx, sy in static_feet
        )
        if is_static_box:
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(frame, "STATIC", (x1, max(y1 - 8, 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        else:
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 1)
            cv2.putText(frame, f"Invig {conf:.2f}", (x1, max(y1 - 8, 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

    # Status overlay
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, 10), (450, 110), (0, 0, 0), -1)
    cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
    status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
    cv2.putText(frame, f"Invigilator: {status}", (20, 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, status_color, 2)
    cv2.putText(frame, f"Standing persons: {len(person_boxes)}", (20, 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(frame, f"{device_id} - Cam {camera_no}", (20, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    if violation_detected:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        import uuid
        uid = str(uuid.uuid4())
        fname = f"{script_name}_{device_id}_{camera_no}_gpu{_DET_GPU_ID}_{ts}_{uid}.jpg"
        filename = os.path.join(SAVE_FOLDER, fname)
        cv2.imwrite(filename, frame)
        logger.warning(f"[{device_id}-{camera_no}] 🚨 Invigilator {status}: {filename}")

    return frame, violation_detected, 1 if violation_detected else 0

def detect_invigilator_batch(items, results=None):
    """Run true batch inference."""
    if results is None:
        model = get_yolo_model()
        frames = [item['frame'].copy() for item in items]
        results = model(frames, conf=CONF_THRESHOLD, verbose=False)

    outputs = []
    for item, result in zip(items, results):
        frame = item['frame'].copy()
        # Standing := height >= MIN_HEIGHT AND h/w >= STANDING_ASPECT_RATIO.
        # Aspect-ratio gate (>= 2.0) rejects seated torso-above-desk shape.
        person_boxes = []
        person_confs = []
        for box in result.boxes:
            if int(box.cls[0]) != 0 or float(box.conf[0]) < CONF_THRESHOLD:
                continue
            coords = box.xyxy[0].cpu().numpy()
            h = coords[3] - coords[1]
            w = max(coords[2] - coords[0], 1.0)
            if h >= MIN_HEIGHT and (h / w) >= STANDING_ASPECT_RATIO:
                person_boxes.append(coords)
                person_confs.append(float(box.conf[0]))

        device_id = item.get('device_id', 'unknown')
        camera_no = item.get('ch_no', 'unknown')
        key = f"{device_id}_{camera_no}"

        with _state_lock:
            if key not in trackers:
                trackers[key] = PersonTracker()
            tracker = trackers[key]

        absent, static_violation, static_feet = tracker.update(person_boxes, frame)
        violation_detected = absent or static_violation
        status = "ABSENT" if absent else ("STATIC" if static_violation else "Active")

        # On STATIC, only the triggering track is drawn in thick red with "STATIC"
        # label; everyone else gets a thin green box. On ABSENT, no boxes (the
        # loop is empty). On Active, everyone in thin green.
        for box, conf in zip(person_boxes, person_confs):
            x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
            bbox_h = y2 - y1
            fx = (x1 + x2) / 2.0
            fy = float(y2)
            match_r = max(bbox_h * 0.3, 25)
            is_static_box = static_violation and any(
                ((fx - sx) ** 2 + (fy - sy) ** 2) ** 0.5 < match_r
                for sx, sy in static_feet
            )
            if is_static_box:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                cv2.putText(frame, "STATIC", (x1, max(y1 - 8, 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            else:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 1)
                cv2.putText(frame, f"Invig {conf:.2f}", (x1, max(y1 - 8, 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        # Status overlay
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, 10), (450, 110), (0, 0, 0), -1)
        cv2.addWeighted(frame, 0.7, overlay, 0.3, 0, frame)
        status_color = (0, 0, 255) if violation_detected else (0, 255, 0)
        cv2.putText(frame, f"Invigilator: {status}", (20, 38),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, status_color, 2)
        cv2.putText(frame, f"Standing persons: {len(person_boxes)}", (20, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.putText(frame, f"CH: {camera_no}", (20, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

        outputs.append((frame, violation_detected, 1 if violation_detected else 0))

    return outputs
