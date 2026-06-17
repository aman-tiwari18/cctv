"""
Unified Detector — ONE shared YOLO pass per frame, dispatched to many analytics.
====================================================================================

WHY THIS EXISTS
---------------
Today every analytic (crowd, proximity, intruder, ...) is a separate worker process
that loads the SAME model (`models/yolov10m.pt`) and runs it independently. An
inside-lab camera matches ~10 analytics, so its frame is run through YOLO ~10×.
~90% of that inference is duplicated work — the boxes are identical.

This module runs the detector **once** per frame and fans the resulting boxes out to
each enabled analytic as a cheap rule. Capacity gain ≈ M× (M = analytics/camera).

FLEXIBILITY PRESERVED
---------------------
Each packet carries `enabled_scripts` (the per-camera analytic set, from the SAME
classification config used today). An analytic runs only if it's in that set — so
"trigger crowd but not proximity on camera X" is fully supported; the model running
once does NOT mean every rule runs.

STATUS
------
Additive proof-of-concept. The existing per-script workers in `workers/` are left
intact. Crowd is implemented as the reference evaluator; other analytics follow the
same pattern (refactor each `detect_*_batch` to accept a precomputed `results`).

INTEGRATION (not wired yet — flip after evaluators exist for all needed scripts):
  In master_pipeline.run_rtsp_pipeline, instead of one queue+worker per script_code,
  create ONE queue + one `unified_worker` process, and have producers push packets
  carrying `enabled_scripts` = the camera's matched analytics.
"""

import os
import sys
import time
import uuid
import queue as queue_module
import logging
import threading

import cv2
import torch

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from ultralytics import YOLO

logger = logging.getLogger(__name__)

# ============================================================
# Shared model — loaded ONCE, used for every analytic
# ============================================================
MODEL_PATH = os.path.join(BASE_DIR, "models", "yolov10m.pt")
CONF_THRESHOLD = 0.45          # base detector confidence; per-rule filters tighten further

_model = None
_model_lock = threading.Lock()


def get_shared_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                logger.info(f"[Unified] Loading shared YOLO model {MODEL_PATH}")
                _model = YOLO(MODEL_PATH)
                if torch.cuda.is_available():
                    _model.to("cuda")
                    logger.info("[Unified] Shared model on CUDA")
    return _model


# ============================================================
# Batch config (mirrors the per-script workers)
# ============================================================
GPU_BATCH_SIZE     = 16
GPU_QUEUE_SIZE     = 32
BATCH_WAIT_TIMEOUT = 0.2

# Per-analytic cooldowns (CLIENT-DEFINED — fixed, never tuned for capacity).
# Mirrors the COOLDOWN_TIME constants in each detection script.
COOLDOWNS = {
    "crowd":      120,
    "crowd_zero": 360,
    "crowd_five": 120,
    "proximity":  120,
    "intruder":   0,
    "entry_exit": 120,
    "server":     60,
    "phone":      90,
    "strongroom": 180,
    "qp_box":     240,
    "blind_spot": 180,
}

RESULTS_ROOT = os.path.join(BASE_DIR, "results")


# ============================================================
# Box helpers — extract once from the shared result
# ============================================================
def persons_from_result(result, conf=CONF_THRESHOLD):
    """COCO class 0 = person."""
    return [b for b in result.boxes
            if int(b.cls[0]) == 0 and float(b.conf[0]) >= conf]


def class_from_result(result, class_ids, conf=CONF_THRESHOLD):
    cls_set = set(class_ids)
    return [b for b in result.boxes
            if int(b.cls[0]) in cls_set and float(b.conf[0]) >= conf]


# ============================================================
# Reporting helper (shared by all evaluators)
# ============================================================
def _save_and_report(frame, *, folder, script_name, device_id, ch_no,
                     exam_id, shift_id):
    save_folder = os.path.join(RESULTS_ROOT, folder)
    os.makedirs(save_folder, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    uid = str(uuid.uuid4())
    fname = f"{script_name}_{device_id}_{ch_no}_exam{exam_id}_shift{shift_id}_{ts}_{uid}.jpg"
    path = os.path.join(save_folder, fname)
    cv2.imwrite(path, frame)
    try:
        from utils.db_client import report_to_db_rtsp
        report_to_db_rtsp(device_id=str(device_id), camera_no=str(ch_no),
                          image_name=fname, folder=folder)
    except Exception as e:
        logger.error(f"[Unified] DB report error ({script_name}): {e}")
    logger.warning(f"[Unified] 🚨 {script_name} saved → {path}")


# ============================================================
# Evaluators — each is a pure function over the SHARED result.
# Signature: (result, item, state) -> None  (handles its own save/report)
# Reuse the existing detection-script rule code wherever possible.
# ============================================================
CONSEC_THRESHOLD = 2  # require 2 consecutive hits (matches crowd_worker)


def _passed_gate(state, script, now):
    """Shared consecutive-hit + client-cooldown gate. Returns True if we should report."""
    cd = COOLDOWNS.get(script, 120)
    state["consec"] = state.get("consec", 0) + 1
    if state["consec"] < CONSEC_THRESHOLD:
        return False
    if now - state.get("last_save", 0) < cd:
        return False
    state["last_save"] = now
    state["consec"] = 0
    return True


def eval_crowd(result, item, state):
    """Reuses Crowd_det_complete.detect_crowd_batch with the SHARED result (no re-inference)."""
    import Crowd_det_complete as crowd_core
    outputs = crowd_core.detect_crowd_batch([item], results=[result])
    annotated, detected, person_count = outputs[0]
    if not detected:
        state["consec"] = 0
        return
    if not _passed_gate(state, "crowd", time.time()):
        return
    _save_and_report(annotated, folder="crowd_detection", script_name="crowd",
                     device_id=item["device_id"], ch_no=item["ch_no"],
                     exam_id=item.get("exam_id", "0"), shift_id=item.get("shift_id", "0"))


# Registry: script_code -> evaluator. Extend as each analytic is converted.
EVALUATORS = {
    "crowd": eval_crowd,
    # "proximity": eval_proximity,   # TODO: refactor close_proximity to accept shared result
    # "intruder":  eval_intruder,
    # "server":    eval_server,
    # ... one per analytic; all read the same `result`.
}


# ============================================================
# Unified worker — ONE inference per batch, dispatched per camera/script
# ============================================================
def unified_worker(frame_queue):
    """
    RTSP worker entry (drop-in replacement for the N per-script workers).

    Expects packets (dict) carrying:
        frame, device_id, ch_no, camera_id_pk, exam_id, shift_id,
        enabled_scripts: list[str]   # the analytics this camera should run
    """
    logger.info("🟢 [Unified] worker started")
    get_shared_model()  # warm up
    # per-(camera, script) cooldown/consec state
    states = {}

    def state_for(dev, ch, script):
        return states.setdefault((dev, ch, script), {})

    while True:
        batch = []
        try:
            pkt = frame_queue.get(timeout=0.1)
        except queue_module.Empty:
            continue
        if pkt is None:
            break
        batch.append(pkt)

        deadline = time.time() + BATCH_WAIT_TIMEOUT
        while len(batch) < GPU_BATCH_SIZE and time.time() < deadline:
            try:
                nxt = frame_queue.get_nowait()
                if nxt is None:
                    frame_queue = _drain_sentinel(frame_queue)
                    break
                batch.append(nxt)
            except queue_module.Empty:
                time.sleep(0.002)

        # ---- ONE inference for the whole batch ----
        model = get_shared_model()
        frames = [p["frame"] for p in batch]
        try:
            results = model(frames, conf=CONF_THRESHOLD, verbose=False)
        except Exception as e:
            logger.error(f"[Unified] inference error: {e}")
            for p in batch:
                p.pop("frame", None)
            continue

        # ---- dispatch boxes to each camera's enabled analytics ----
        for pkt, result in zip(batch, results):
            dev = pkt.get("device_id", "unknown")
            ch = pkt.get("ch_no") or pkt.get("camera_no") or "1"
            item = {
                "frame":     pkt["frame"],
                "ch_no":     ch,
                "device_id": dev,
                "camera_id": dev,
                "exam_id":   pkt.get("exam_id", "0"),
                "shift_id":  pkt.get("shift_id", "0"),
            }
            for script in pkt.get("enabled_scripts", []):
                fn = EVALUATORS.get(script)
                if fn is None:
                    continue  # not yet converted to the unified path
                try:
                    fn(result, item, state_for(dev, ch, script))
                except Exception as e:
                    logger.error(f"[Unified] evaluator '{script}' error ({dev}_{ch}): {e}")

        for p in batch:
            p.pop("frame", None)

    logger.info("🔴 [Unified] worker stopped")


def _drain_sentinel(q):
    """Helper to keep the loop simple if a None sentinel is pulled mid-batch."""
    return q
