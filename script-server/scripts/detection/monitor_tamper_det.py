"""
Monitor Tampering detection — a monitor moved, lifted or carried away in an exam lab.

Built from monitor_alerts_deploy_v2 (the standalone service) and its person + monitor
model (rfdetr_model/checkpoint_best_total.pth, RF-DETR Medium, copied to
models/monitor_person_rfdetr.pth). The rule engine is vendored in monitor_tamper/;
this module adds the per-camera lifecycle and plugs it into the unified detector:

  1. capture : the first CAPTURE seconds of a camera's frames learn its "home spots"
               (where each monitor normally sits) and measure how fast the camera is
               fed: v2's rules for a steady feed, wider windows for sparse bursts.
  2. watch   : every later frame is compared with them. Alerts:
       MONITOR_MISSING  a spot stays empty (nobody in front of it) after a person
                        was at it recently
       MONITOR_OFF_HOME a monitor away from every spot keeps moving while a person
                        touches it (carried / lifted)
       VIEW_CHANGED     most spots empty at once (camera covered / moved, lights off)
  3. evidence: every frame is also kept for evidence_buffer_seconds. An alert is held
               for evidence_delay_seconds, then the buffer is searched for the frames
               that show who carried the monitor (monitor_tamper/evidence.py).

Stateful: unified_detector keeps one state dict per camera for the whole run, calls
evaluate() for every frame of that camera and flush() about once a second (and at
shutdown) so a held alert is reported even if the camera sends no more frames. The
watcher does its own cooldown and incident grouping, so it bypasses the unified
consecutive-hit gate.

The reported image is the annotated trigger frame with the best evidence frame
stacked under it. The full v2 alert (JSON, raw frame, every evidence frame) is also
written to results/monitor_tamper_alerts/<camera>/<date>/.

Home spots are saved per exam shift in results/monitor_tamper_homes/<session>/ with a
reference image, so an operator can check that every monitor was found; a restart
within the same shift reuses them, a new shift learns again.
"""

import logging
import os
from dataclasses import dataclass
from datetime import datetime

import cv2
import numpy as np

from monitor_tamper.alerts import BASIS_LABEL, draw_annotated, draw_incident, write_alert
from monitor_tamper.core import Detection, FrameDetections, Params
from monitor_tamper.evidence import Evidence, FrameBuffer, decode, select_evidence
from monitor_tamper.home_map import HomeMap, capture_home_map, load_home_map, save_home_map
from monitor_tamper.watcher import Event, Watcher

logger = logging.getLogger(__name__)

# ================= CONFIG ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLASS_IDS = {"person": 0, "monitor": 1}
# RF-DETR Medium (models/monitor_person_rfdetr.pth), the default model
# (UNIFIED_MONITOR_MODEL=rfdetr). Thresholds from monitor_alerts_deploy_v2/config.yaml.
THRESHOLDS_RFDETR = {"person": 0.475, "monitor": 0.45}
# Fine-tuned YOLO26m (models/monitor_person_yolo26m.pt, same classes), selected with
# UNIFIED_MONITOR_MODEL=yolo26m. Best-F1 thresholds from the model's test split.
THRESHOLDS = {"person": 0.425, "monitor": 0.35}
HOMES_DIR = os.path.join(BASE_DIR, "results", "monitor_tamper_homes")
ALERTS_DIR = os.path.join(BASE_DIR, "results", "monitor_tamper_alerts")

# The pipeline feeds a camera either at a steady rate (continuous RTSP, SAMPLE_FPS=5)
# or in sparse bursts (RTSP round-robin: 2 frames per visit; HLS: a frame every ~3 s).
# v2's rules assume the steady 5 fps and catch nothing on sparse frames (its 2 s gap
# reset clears every timer between visits), so each camera measures its own rate
# while it learns its home spots and then watches with one of two profiles.
STEADY_MIN_FPS = 2.5        # measured rate at or above this = "steady"
RATE_WARMUP_SECONDS = 5.0   # with saved home spots: measure this long before watching

_COMMON_PARAMS = {
    "fps": 5,                      # highest rate a camera is fed at (SAMPLE_FPS); sizes the buffer
    "capture_seconds": 30,         # learn home spots for at least this long...
    "capture_min_frames": 6,       # ...and over at least this many frames
    "capture_group_iou": 0.5,
    "capture_min_presence": 0.5,
    "match_overlap": 0.5,
    "occlude_cover": 0.3,
    "missing_seconds": 4.0,
    "offhome_move_frac": 0.5,
    "jitter_tolerance": 0.01,
    "view_changed_frac": 0.5,
    # --- culprit evidence ---
    "evidence_buffer_seconds": 60,
    "evidence_delay_seconds": 10,
    "evidence_lookback_seconds": 45,
    "evidence_frames": 5,
    "evidence_min_spacing_seconds": 1.0,
    "carry_overlap": 0.3,
    "min_carry_frames": 2,
    "link_gap_frames": 5,
}
PROFILES = {
    # monitor_alerts_deploy_v2/config.yaml as shipped (recall-first).
    "steady": {
        **_COMMON_PARAMS,
        "offhome_min_frames": 6,
        "person_window_seconds": 60,
        "stray_forget_seconds": 120,
        "learn_seconds": 10,
        "gap_reset_seconds": 2.0,
    },
    # Windows that count frames or assume a steady rate are wider, and "missing" also
    # needs several EMPTY frames in a row.
    "sparse": {
        **_COMMON_PARAMS,
        "touch_cover": 0.2,            # person over a visible monitor = touching it (see watcher.py)
        "missing_min_obs": 3,
        "offhome_min_frames": 3,       # bursts give few frames per carry
        "person_window_seconds": 120,  # a revisit can be tens of seconds away
        "stray_forget_seconds": 300,
        "learn_seconds": 30,
        "gap_reset_seconds": 90,       # longer than a round-robin revisit
    },
}

SEPARATOR_H = 6  # grey bar between the trigger frame and the evidence frame


# ================= MODEL OUTPUT ============
def to_frame_detections(result) -> FrameDetections:
    """supervision.Detections (RF-DETR) or Ultralytics Results (YOLO26m) -> our boxes."""
    class_of = {i: c for c, i in CLASS_IDS.items()}
    if hasattr(result, "boxes"):
        xyxy, conf, cls = (result.boxes.xyxy.cpu().numpy(), result.boxes.conf.cpu().numpy(),
                           result.boxes.cls.cpu().numpy())
        thresholds = THRESHOLDS
    else:
        xyxy, conf, cls = result.xyxy, result.confidence, result.class_id
        thresholds = THRESHOLDS_RFDETR
    persons, monitors = [], []
    for box, score, cls in zip(xyxy, conf, cls.astype(int)):
        c = class_of.get(int(cls))
        if c is None or score < thresholds[c]:
            continue
        det = Detection(tuple(float(v) for v in box), float(score))
        (persons if c == "person" else monitors).append(det)
    return FrameDetections(persons, monitors)


# ================= PER-CAMERA LIFECYCLE ====
@dataclass
class _Pending:
    event: Event
    frame: np.ndarray  # frame at trigger time
    due: float


class _Camera:
    """Capture home spots first, then watch; hold each alert until its evidence is in.
    Mirrors monitor_alerts.camera.CameraRunner; the alert is returned to the caller
    to report instead of only being written to disk. The profile (steady / sparse) is
    picked from the rate the camera was fed at while learning."""

    def __init__(self, camera_id: str, profiles: dict[str, Params], homes_dir: str | None):
        self.camera_id = camera_id
        self.profiles = profiles
        # Until watching starts only the settings both profiles share are used.
        self.params = profiles["steady"]
        self.homes_dir = homes_dir  # None: never reuse a saved map
        self.frame_size = None
        self.home_map: HomeMap | None = None
        self.watcher: Watcher | None = None
        self.buffer = FrameBuffer(self.params.evidence_buffer_seconds, self.params.fps)
        self._pending: list[_Pending] = []
        self._capture_frames: list[FrameDetections] = []
        self._capture_start: float | None = None
        self._saved: HomeMap | None = None  # saved spots, used once the rate is known
        self._first_t: float | None = None  # rate measurement since the stream (re)started
        self._seen = 0

    def process(self, frame, dets: FrameDetections, t: float) -> list:
        size = (frame.shape[1], frame.shape[0])
        if size != self.frame_size:
            self._on_new_frame_size(size)
        self.buffer.push(t, frame, dets)
        if self._first_t is None:
            self._first_t = t
        self._seen += 1
        if self.watcher is None:
            if self._saved is None:
                self._capture(frame, dets, t)
            elif t - self._first_t >= RATE_WARMUP_SECONDS:
                self._start_watching(self._saved, t)
                logger.info(f"[MonitorTamper] {self.camera_id}: reusing {len(self._saved.spots)} saved monitor spots")
                self._saved = None
            return []
        for event in self.watcher.update(dets, t):
            self._pending.append(_Pending(event, frame, t + self.params.evidence_delay_seconds))
        return self.flush(t)

    def flush(self, now: float | None) -> list:
        """[(event, trigger frame, evidence)] for every held alert due by `now` (None: all)."""
        due = [a for a in self._pending if now is None or a.due <= now]
        out = []
        for alert in due:
            self._pending.remove(alert)
            evidence = select_evidence(alert.event, self.buffer, self.home_map, self.params)
            out.append((alert.event, alert.frame, evidence))
        return out

    def _on_new_frame_size(self, size) -> None:
        if self.frame_size is not None:
            # A different resolution (other stream / camera reconfigured) makes the
            # old spots and the buffered boxes meaningless.
            logger.warning(f"[MonitorTamper] {self.camera_id}: frame size {self.frame_size} -> {size}; "
                           f"re-learning home spots")
            if self._pending:
                logger.error(f"[MonitorTamper] {self.camera_id}: dropping {len(self._pending)} held "
                             f"alert(s): their boxes do not fit the new frame size")
        saved = None
        if self.frame_size is None and self.homes_dir:
            saved = load_home_map(self.homes_dir, self.camera_id, size)
        self.frame_size, self._pending, self._saved = size, [], saved
        self.buffer.clear()
        self._capture_frames, self._capture_start = [], None
        self._first_t, self._seen = None, 0
        self.home_map, self.watcher = None, None

    def _capture(self, frame, dets: FrameDetections, t: float) -> None:
        if self._capture_start is None:
            self._capture_start = t
        self._capture_frames.append(dets)
        if (t - self._capture_start < self.params.capture_seconds
                or len(self._capture_frames) < self.params.capture_min_frames):
            return
        home_map = capture_home_map(self.camera_id, self.frame_size, self._capture_frames, self.params)
        self._capture_frames = []
        self._start_watching(home_map, t)
        try:
            save_home_map(home_map, self.homes_dir or HOMES_DIR, reference_frame=frame)
        except Exception as e:
            logger.error(f"[MonitorTamper] {self.camera_id}: could not save home spots: {e}")
        logger.info(f"[MonitorTamper] {self.camera_id}: learned {len(home_map.spots)} monitor spots")

    def _start_watching(self, home_map: HomeMap, t: float) -> None:
        elapsed = t - self._first_t
        fps = (self._seen - 1) / elapsed if elapsed > 0 else 0.0
        profile = "steady" if fps >= STEADY_MIN_FPS else "sparse"
        self.params = self.profiles[profile]
        self.home_map = home_map
        self.watcher = Watcher(home_map, self.params)
        logger.info(f"[MonitorTamper] {self.camera_id}: fed {fps:.1f} frames/s -> {profile} rules")


def _homes_dir(session: str | None) -> str | None:
    return os.path.join(HOMES_DIR, session) if session else None


def evaluate(result, frame, state: dict, t: float, camera_id: str, cooldown_s: float,
             session: str | None = None) -> list:
    """Feed one frame's detections to this camera's watcher.

    `state` is the unified detector's per-camera dict and holds the _Camera.
    `t` is the frame's capture time (time.time() clock). `session` (e.g. the exam
    and shift) scopes the saved home spots; None never reuses them.
    Returns [(image, event_type)] for every alert whose evidence wait ended.
    """
    cam = state.get("camera")
    if cam is None:
        profiles = {name: Params.from_dict({**p, "cooldown_seconds": cooldown_s}) for name, p in PROFILES.items()}
        cam = state["camera"] = _Camera(camera_id, profiles, _homes_dir(session))
    return _render(cam, cam.process(frame, to_frame_detections(result), t))


def flush(state: dict, now: float | None) -> list:
    """Alerts held for evidence that are due by `now` (None: all of them, at shutdown)."""
    cam = state.get("camera")
    return _render(cam, cam.flush(now)) if cam is not None else []


def _render(cam: _Camera, alerts) -> list:
    out = []
    for event, frame, evidence in alerts:
        try:
            write_alert(event, frame, cam.home_map, ALERTS_DIR, evidence)
        except Exception as e:
            logger.error(f"[MonitorTamper] {cam.camera_id}: could not write alert files: {e}")
        logger.info(f"[MonitorTamper] {cam.camera_id}: {event.type} (evidence: {evidence.basis}, "
                    f"{len(evidence.frames)} frames)")
        out.append((compose_report_image(event, frame, cam.home_map, evidence), event.type))
    return out


def compose_report_image(event: Event, frame, home_map: HomeMap, evidence: Evidence):
    """The annotated trigger frame (empty desk red, moved monitor orange) with the best
    evidence frame (desk red, monitor orange, culprit magenta) stacked under it."""
    top = draw_annotated(event, frame, home_map)
    if not evidence.frames:
        return top
    best = max(evidence.frames, key=lambda f: f.score)
    when = datetime.fromtimestamp(best.t).astimezone().strftime("%Y-%m-%d %H:%M:%S")
    header = f"EVIDENCE {BASIS_LABEL[evidence.basis]}  {event.camera_id}  {when}"
    bottom = draw_incident(decode(best.jpeg), best.monitor_box, best.culprit_box, evidence.desk_box, header)
    if bottom.shape[1] != top.shape[1]:
        bottom = cv2.resize(bottom, (top.shape[1], round(bottom.shape[0] * top.shape[1] / bottom.shape[1])))
    bar = np.full((SEPARATOR_H, top.shape[1], 3), 128, dtype=np.uint8)
    return np.vstack([top, bar, bottom])
