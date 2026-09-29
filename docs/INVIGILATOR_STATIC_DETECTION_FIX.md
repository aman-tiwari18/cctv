# Invigilator "Not Moving" (STATIC) Detection — Investigation & Fix

**Status:** Code changed and tested (simulation + real-footage signature test). Not committed, not deployed (workers not restarted). See [Testing status](#5-testing-status).
**File changed:** `script-server/scripts/detection/invigilator_tracking.py` (only this file)

---

## 1. What the invigilator script does

The script watches exam-lab cameras (classification *Inside Lab / Computer Lab*) and raises two violations:

| Violation | Meaning |
|---|---|
| **ABSENT** | No standing person (invigilator) in the room for 45 s |
| **STATIC** | An invigilator has stood at the same spot for 7 min (420 s) |

A "standing person" is a YOLO person box with conf ≥ 0.40, height ≥ 100 px and height/width ≥ 2.5 (seated students are rejected by the aspect ratio).

Code path:
- `invigilator_tracking.py`: detection rule, tracker, annotation
- `workers/invigilator_worker.py`: legacy per-script worker (RTSP + HLS)
- `unified_detector.py`: production path (`UNIFIED_DETECTOR=1` by default). Calls `detect_invigilator_batch` and applies the reporting gate.

---

## 2. Problem: STATIC alerts never arrive

ABSENT alerts were being saved, STATIC alerts were not. The old tracker's logic was fine on a continuous 5 fps stream, but production settings blocked it in three ways.

### 2.1 Unified reporting gate discards STATIC (main cause)
`unified_detector._passed_gate` only saves a detection after **2 consecutive frames** return `detected=True` (`CONSEC_THRESHOLD = 2`).
The old tracker returned STATIC for **exactly one frame**, because it reset `static_start = now` as soon as it fired. The next frame was `False`, so the counter reset and nothing was saved.
ABSENT stays `True` on every frame after 45 s, so it passed the gate. That is why only ABSENT showed up.

Simulation: old tracker fired STATIC twice in 20 min, and **0 were saved** through the unified gate. The logs contain no `[Unified] invigilator saved` lines.

### 2.2 Round-robin capture starves the tracker
`ROUND_ROBIN=1` (default) grabs a 2-frame burst per camera per visit, then moves on. Revisits are typically 10–60 s apart.
The old tracker evicted a track unseen for 5 s (`TRACK_TTL_SEC = 5`) and needed 5 s of continuous history before judging stillness. Every revisit therefore started from zero.
Simulation: STATIC never formed with a 30 s revisit gap.

### 2.3 Any 5 s detection gap reset the 7-min timer
Someone walking in front of the invigilator, or arms-out poses dropping below the h/w 2.5 gate, evicted the track.
Simulation: an 8 s gap every 5 min meant STATIC never fired.

### 2.4 Identity switch on a specific glitch size
A foot-position jump of about 0.45–0.5 × bbox height created a new track. The new track then got first pick of the next detection, which reset the real track's timer.
Simulation: a 140 px glitch on 1 % of frames meant STATIC never fired.

### Other observations (not changed)
- The legacy worker shares one `last_save` cooldown between ABSENT and STATIC, so an ABSENT save suppresses STATIC for 7 min on that camera.
- A seated invigilator is not "standing", so ABSENT fires instead of STATIC.
- `pipeline/test_invigilator_worker.py` is broken. It puts raw frames on the queue, but the worker expects a dict or a 5-tuple, and the test video it references does not exist.
- Some comments still say aspect ratio "2.0". The actual value is 2.5.

---

## 3. New design: checkpoint + same-person check

The per-frame tracker is replaced by a **checkpoint** approach. It needs only occasional frames, survives short gaps, and verifies identity.

**Checkpoints.** About once a minute per camera (60 s ± 25 % random jitter, so a person pacing on a regular loop isn't sampled at the same spot every time):

1. **Anchor.** A standing person not matching any existing anchor creates one: foot position, bbox height, and a clothing-colour signature.
2. **Check.** For each anchor, a checkpoint is a **hit** if a standing box is within `max(40 px, 0.25 × bbox_h)` of the anchor's foot **and** its colour signature matches the anchor's gallery. Otherwise it is a **miss**.
3. **Reset.** 2 consecutive misses drop the anchor, meaning the person moved or was replaced.
4. **Different person at the same spot.** They don't match the gallery, so the old anchor misses and the newcomer gets their own new anchor and timer.
5. **Continuity guard.** If the camera was unseen for more than 180 s, all anchors are dropped.

**STATIC fires when** an anchor has:
- existed ≥ 420 s, **and**
- ≥ 3 hits, **and**
- a hit ratio ≥ 80 %, **and**
- hits at the **latest 2 checkpoints in a row**. A walking person who happens to pass the spot at one checkpoint can't re-confirm a stale anchor.

The check also re-runs on the current frame: the box at the spot must still match in colour.

**STATIC stays true on every frame** while that person remains at the spot. The unified "2 consecutive" gate therefore passes, and the save cadence is controlled by the existing 420 s cooldown (one save per 7 min while the violation continues).

**Colour signature** (`appearance_signature` / `appearance_distance`):
- Person crop resized to 64×160. Left and right 15 % (background) and the head (top 15 %) are dropped. The rest is split into torso and legs.
- An HSV hue×saturation histogram (16×8) is computed for each part and **smoothed circularly along hue**. Without smoothing, red (hue wraps 0↔180) and small colour shifts made the same person look different. This was found while testing with red invigilator vests.
- Distance is the mean Bhattacharyya distance over torso and legs. Match if < **0.40** against any of up to **3** gallery signatures (anchor + first confirmed matches).
- CPU only. No extra model and no GPU load.

**Unchanged:** ABSENT logic, box drawing, workers, `unified_detector.py`.
`PersonTracker.update()` now takes the frame: `update(person_boxes, frame)`. Both call sites pass the un-annotated frame, before drawing.

### Tunables (top of `invigilator_tracking.py`)
| Constant | Value | Purpose |
|---|---|---|
| `STATIC_TIME_THRESH` | 420 | 7-min client spec |
| `CHECK_INTERVAL_SEC` | 60 (±25 %) | Checkpoint spacing |
| `MAX_CHECK_GAP_SEC` | 180 | Drop anchors if camera unseen longer |
| `MISS_STREAK_RESET` | 2 | Consecutive misses → reset |
| `MIN_HITS` / `MIN_HIT_RATIO` | 3 / 0.80 | Required presence |
| `CONFIRM_HIT_STREAK` | 2 | Latest N checkpoints must all be hits |
| `ANCHOR_RADIUS_FLOOR` / `_RATIO` | 40 px / 0.25 | "Same spot" radius |
| `APPEARANCE_MAX_DIST` | 0.40 | Same-person threshold |
| `GALLERY_SIZE` | 3 | Signatures kept per anchor |
| `MAX_ANCHORS` | 20 | Per-camera cap |

---

## 4. Validation on real footage

**Data.** 6 real exam-lab clips from `monitor_script/videos/` (0.4–3.2 min each). YOLOv10m was run every 0.5 s, giving 6,150 person detections and 963 short IoU tracks.
- *Same-person pairs:* same track, ≥ 10 s apart.
- *Different-person pairs:* two standing people in the same frame.

**Signature variants tried** (standing persons). The simple torso/legs HS histogram was best. Narrower centre strips and chroma/achroma splitting were worse (AUC 0.96–0.99 vs 0.99).

**Final signature, per checkpoint** (gallery of 3, threshold 0.40):
- same person kept **99.0 %**
- different person rejected **89.8 %**

**End-to-end over a 7-min window.** 8 checkpoints, 20k trials sampling the real distances:

| Case | Result |
|---|---|
| Same person stands 7 min | **97.8 %** fire on time |
| Replaced by another person at 2 min | 0.01 % false alert |
| Replaced at 4 min | 0.18 % false alert |
| Replaced at 6 min | 1.2 % false alert |
| Replaced at 7 min (last checkpoint) | 10.1 % false alert |

Requiring the latest checkpoints to match reduced a last-minute swap from ~75 % to ~10 % false alerts. Requiring 2 in a row cut a swap at 6 min from 9.8 % to 1.2 %.

**Synthetic scenario test (current code).** Simulated people with per-pixel noise and lighting drift, run through `PersonTracker` and the production gate (2 consecutive hits + 420 s cooldown). Numbers are the times (s) at which an alert was saved.

| Scenario | Expected | 5 fps | RR 10 s | RR 30 s | RR 60 s |
|---|---|---|---|---|---|
| A stands still 20 min | alert | 420, 840 | 420, 840 | 420, 840 | 420, 840 |
| A walks the whole time (30 s loop) | none | – | – | 420, 840 ⚠️ | 420, 840 ⚠️ |
| A walks (37 s loop, not aligned) | none | – | – | – | – |
| A still, hidden 8 s every 5 min | alert | 420, 840 | 420, 840 | 420, 840 | 420, 840 |
| A still, B walking around | alert | 420, 840 | 420, 840 | 420, 840 | 420, 840 |
| A still 6 min, then walks (30 s loop) | none | – | – | 810 ⚠️ | 780 ⚠️ |
| A still 6 min, then walks (37 s loop) | none | – | – | – | – |
| A 4 min, then B takes the spot | none | – | – | – | – |
| A 6.5 min, then B takes the spot | none | – | – | – | – |
| A 4 min, then B stays 10 min | B alerts ~660 | 688 | 700 | 720 | 660 |
| A 4 min, then C in near-identical clothes | known weak | 420 | 420 | 420 | 420 |

The old tracker saved **0** alerts in every scenario.

⚠️ These are a test artifact. The walker's loop is exactly 30 s and the round-robin frames arrive exactly every 30/60 s, so every frame catches the walker at the same point. The same walker on a 37 s loop produces no alert. A real person would have to return to the exact spot at every camera revisit for this to happen.

---

## 5. Testing status

| Item | Status |
|---|---|
| File compiles | ✅ |
| Colour signature (final version) on real pairs | ✅ numbers above |
| Scenario test on current code | ✅ table above |
| Full 7-min real recording | ❌ no such footage available on the server |
| Deployed / workers restarted | ❌ |
| Committed | ❌ |

Fixes made because of testing:
1. **Circular hue smoothing.** Red clothing (hue wraps 0↔180) made the same person look different.
2. **Checkpoint jitter (±25 %).** Stops regular pacing from being sampled at the same spot every time.
3. **2 consecutive hits to confirm.** Without it, a person who had walked away could re-trigger an alert when passing the old spot once at 5 fps.

---

## 6. Known limitations

- **Similar clothing.** Two people in the same-colour vest or dark jackets can be mistaken for each other. Hardest real negatives were dark navy/black jackets.
- **Same-spot swap.** Background is shared, so it may be harder than the tested case, where people stood at different spots.
- **No face or body identity.** Only "same spot + same clothing colours".
- **Sparse round-robin.** With ~120 s+ revisit gaps, a walker passing the spot at a checkpoint can occasionally be counted.
- **Upgrade path.** A Re-ID embedding model (e.g. OSNet) would handle similar clothing. It needs a new model download, and the root disk is at 99 %, with only ~900 MB free.

---

## 7. Next steps

1. Restart the detection workers so the change takes effect.
2. After the next exam shift, review saved invigilator images. A thick red box labelled `STATIC` marks the new alerts. Check them for wrong-person or walking false positives.
3. Optional: fix the legacy worker's shared ABSENT/STATIC cooldown and the broken `test_invigilator_worker.py`.

Test scripts used for this work were kept in a temporary scratchpad, not in the repo: `sim_static.py`, `compare.py`, `reid_collect.py`, `reid_eval.py`, `reid_variants.py`, `reid_e2e.py`, `reid_smooth.py`, `repo_real.py`, `test_new_tracker.py`. Ask if they should be moved into the repo.
