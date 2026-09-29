"""
Monitor Tampering detection — a monitor moved, lifted or carried away in an exam lab.

Built from monitor_alerts_deploy (the standalone service) and its person + monitor
model (monitor_person_model/yolo26m_model/best.pt). The rule engine is vendored in
monitor_tamper/; this module adds the model and the per-camera lifecycle and plugs
them into the unified detector:

  1. capture : the first CAPTURE seconds of a camera's frames learn its "home spots"
               (where each monitor normally sits).
  2. watch   : every later frame is compared with them. Alerts:
       MONITOR_MISSING  a spot stays empty (nobody in front of it) after a person
                        was at it recently
       MONITOR_OFF_HOME a monitor away from every spot keeps moving while a person
                        touches it (carried / lifted)
       VIEW_CHANGED     most spots empty at once (camera covered / moved, lights off)

Stateful: unified_detector keeps one state dict per camera for the whole run and
calls evaluate() for every frame of that camera. The watcher does its own cooldown
and incident grouping, so it bypasses the unified consecutive-hit gate.

Home spots live in memory for the run (re-learned after a restart); a reference
image of each camera's spots is written to results/monitor_tamper_homes/ so an
operator can check that every monitor was found.
"""

import logging
import os
import threading

import cv2
import torch
from ultralytics import YOLO

from monitor_tamper.core import Detection, FrameDetections, Params
from monitor_tamper.home_map import HomeMap, capture_home_map, save_home_map
from monitor_tamper.watcher import Event, Watcher

logger = logging.getLogger(__name__)

# ================= CONFIG ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Fine-tuned YOLO26m, classes 0 = person, 1 = monitor, trained at 960.
MODEL_PATH = os.path.join(BASE_DIR, "models", "monitor_person_yolo26m.pt")
MODEL_IMGSZ = 960
CLASS_IDS = {"person": 0, "monitor": 1}
THRESHOLDS = {"person": 0.425, "monitor": 0.35}  # best-F1 thresholds from the model's test split
# RF-DETR Medium (models/monitor_person_rfdetr.pth, same classes), selected in the
# unified detector with UNIFIED_MONITOR_MODEL=rfdetr.
THRESHOLDS_RFDETR = {"person": 0.475, "monitor": 0.45}
HOMES_DIR = os.path.join(BASE_DIR, "results", "monitor_tamper_homes")

# The pipeline samples each camera in bursts every few seconds (RTSP round-robin,
# HLS every ~3 s), not the steady 5 fps the service was tuned on, so the time
# windows are wider and "missing" also needs several EMPTY frames in a row.
PIPELINE_PARAMS = {
    "capture_seconds": 30,         # learn home spots for at least this long...
    "capture_min_frames": 6,       # ...and over at least this many frames
    "capture_group_iou": 0.5,
    "capture_min_presence": 0.5,
    "match_overlap": 0.5,
    "occlude_cover": 0.3,
    "touch_cover": 0.2,            # person over a visible monitor = touching it (see watcher.py)
    "missing_seconds": 15.0,
    "missing_min_obs": 3,
    "offhome_min_frames": 3,
    "offhome_move_frac": 0.5,
    "jitter_tolerance": 0.01,
    "person_window_seconds": 120,
    "view_changed_frac": 0.5,
    "stray_forget_seconds": 300,
    "learn_seconds": 30,
    "gap_reset_seconds": 90,       # longer than a round-robin revisit; a real outage resets timers
}

# BGR colours for the annotated snapshot
RED, ORANGE, MAGENTA, GREEN = (0, 0, 255), (0, 140, 255), (255, 0, 255), (0, 200, 0)
HEADER_H = 30

# ================= MODEL ===================
_model = None
_model_lock = threading.Lock()


def get_yolo_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                logger.info(f"Loading monitor/person model from {MODEL_PATH}...")
                _model = YOLO(MODEL_PATH)
                if torch.cuda.is_available():
                    _model.to("cuda")
    return _model


def run_monitor_model(frames):
    """Batched inference. Used by the unified detector, whose shared yolov10m
    results have no "monitor" class."""
    return get_yolo_model()(frames, conf=min(THRESHOLDS.values()), imgsz=MODEL_IMGSZ, verbose=False)


def to_frame_detections(result) -> FrameDetections:
    """Ultralytics Results (YOLO26m) or supervision.Detections (RF-DETR) -> our boxes."""
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
class _Camera:
    """Capture home spots first, then watch. Mirrors monitor_alerts.camera.CameraRunner
    without the disk-backed home maps."""

    def __init__(self, camera_id: str, params: Params):
        self.camera_id = camera_id
        self.params = params
        self.frame_size = None
        self.home_map: HomeMap | None = None
        self.watcher: Watcher | None = None
        self._capture_frames: list[FrameDetections] = []
        self._capture_start: float | None = None

    def process(self, frame, dets: FrameDetections, t: float) -> list[Event]:
        size = (frame.shape[1], frame.shape[0])
        if size != self.frame_size:
            if self.frame_size is not None:
                logger.warning(f"[MonitorTamper] {self.camera_id}: frame size {self.frame_size} -> {size}; "
                               f"re-learning home spots")
            # A different resolution (other stream / camera reconfigured) makes the
            # old spots meaningless.
            self.frame_size, self.home_map, self.watcher = size, None, None
            self._capture_frames, self._capture_start = [], None
        if self.watcher is None:
            self._capture(frame, dets, t)
            return []
        return self.watcher.update(dets, t)

    def _capture(self, frame, dets: FrameDetections, t: float) -> None:
        if self._capture_start is None:
            self._capture_start = t
        self._capture_frames.append(dets)
        if (t - self._capture_start < self.params.capture_seconds
                or len(self._capture_frames) < self.params.capture_min_frames):
            return
        self.home_map = capture_home_map(self.camera_id, self.frame_size, self._capture_frames, self.params)
        self._capture_frames = []
        self.watcher = Watcher(self.home_map, self.params)
        try:
            save_home_map(self.home_map, HOMES_DIR, reference_frame=frame)
        except Exception as e:
            logger.error(f"[MonitorTamper] {self.camera_id}: could not save reference image: {e}")
        logger.info(f"[MonitorTamper] {self.camera_id}: learned {len(self.home_map.spots)} monitor spots")


def evaluate(result, frame, state: dict, t: float, camera_id: str, cooldown_s: float) -> list:
    """Feed one frame's detections to this camera's watcher.

    `state` is the unified detector's per-camera dict and holds the _Camera.
    Returns [(annotated_frame, event_type)] for every alert raised on this frame.
    """
    cam = state.get("camera")
    if cam is None:
        params = Params.from_dict({**PIPELINE_PARAMS, "cooldown_seconds": cooldown_s})
        cam = state["camera"] = _Camera(camera_id, params)
    events = cam.process(frame, to_frame_detections(result), t)
    return [(draw_annotated(e, frame, cam.home_map), e.type) for e in events]


def draw_annotated(event: Event, frame, home_map: HomeMap):
    """Every home spot (thin green), then the anomaly: the spot the monitor went
    missing from (red), a monitor that moved (orange) and the person involved (magenta)."""
    img = frame.copy()
    for s in home_map.spots:
        _rect(img, s.box, GREEN, 1)
    for s in event.missing_homes:
        _rect(img, s.box, RED, 3)
    for d in event.off_home_monitors:
        _rect(img, d.box, ORANGE, 3)
    if event.nearest_person:
        _rect(img, event.nearest_person.box, MAGENTA, 3)
    cv2.rectangle(img, (0, 0), (img.shape[1], HEADER_H), (0, 0, 0), -1)
    cv2.putText(img, f"{event.type}  {event.camera_id}", (8, HEADER_H - 9),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def _rect(img, box, colour, thickness):
    x1, y1, x2, y2 = map(int, box)
    cv2.rectangle(img, (x1, y1), (x2, y2), colour, thickness)
