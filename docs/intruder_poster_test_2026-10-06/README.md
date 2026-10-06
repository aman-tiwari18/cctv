# Intruder — photo/poster false-alert fix (2026-10-06)

Problem: photos of people on the wall (biometric posters) were detected as persons, so `intruder`
fired on empty rooms (e.g. CH12 LAB1A, CH21 LAB3ARD).

Fix: `script-server/scripts/detection/Intruder_det.py` — per-camera photo/poster filter in
`detect_intruder_batch` (used by both the unified detector and `workers/intruder_worker.py`):

1. **Motion gate** — a person box counts only if the pixels inside it changed against a frame
   ≥ 2 s old (brightness-compensated). After moving, the person stays counted for 120 s.
2. **Static zones** — a box never seen moving, at the same spot for 300 s, is learned as a static
   object and ignored. Someone standing in front of it breaks the zone (pixel change).

Ignored boxes are drawn thin grey with `STILL` / `STATIC`. `INTRUDER_MOTION_GATE=0` disables the
filter. Tunables: `INTRUDER_MOTION_DIFF` (12), `INTRUDER_STATIC_LEARN_SEC` (300).

## Test

Camera: d15.camview.io device 1000118 ch 26 (LAB1B/C27) — 2 posters with face photos, empty
room, night IR. 10 min recorded with the fleet token server's token. Model: yolov10m, conf 0.30.
Alerts counted with the production 2-consecutive-hit gate.

`rr` = round-robin (2 frames 0.2 s apart every 30 s); `continuous` = 5 fps.

| Clip | Mode | Filter OFF alerts | Filter ON alerts |
|---|---|---|---|
| cam26 real 10 min (posters only) | continuous | 170 | **0** |
| cam26 real 10 min (posters only) | rr | 3 | **0** |
| cam26 + synthetic intruder (400–525 s) | continuous | 361 (48 from posters) | 313, all in intruder window; first at 400.2 s |
| cam26 + synthetic intruder (400–525 s) | rr | 5 (1 from poster) | 4, all in intruder window; first at 420.2 s (first visit) |
| lab_people_1 (real lab, many seated people) | continuous | 1050 | 1040 (2080/2101 frames positive) |
| lab_people_1 | rr | 14 | 13 (only the first visit missed — no reference yet) |
| lab_people_2 | continuous | 1051 | 1041 (2082/2102) |
| lab_people_2 | rr | 15 | 14 |

Poster motion scores peaked at 1.19 (threshold 12).

The synthetic intruder is a real person crop pasted onto the real recording: walks in, stands
60 s, walks to the right poster and stands in front of it 30 s
(`frames/cam26_synth_intruder_in_front_of_poster.jpg`).

The lab_people runs were done before the last change (a spot where a box was ever live can't
become a static zone). That change can only reduce static zones. The cam26 runs were repeated
after it, with identical results.

### Round-robin visit gap

Production round-robin revisits a camera every 10–60 s with a 2-frame burst. Same clips, other gaps:

| Visit gap | Posters only, OFF / ON | Synthetic intruder, ON | lab_people_1, OFF / ON |
|---|---|---|---|
| 10 s | 7 / **0** | 13, all in intruder window; first at 400.2 s | 42 / 41 |
| 30 s | 3 / **0** | 4, all in window | 14 / 13 |
| 60 s | 1 / **0** | 2, all in window | 7 / 6 |
| 120 s | 1 / **0** | 1, all in window | 4 / 3 |

ON misses only each camera's first visit after start (no reference frame yet).

## Known limits

- Something that never moves for 5 min is indistinguishable from a poster: in lab_people a student
  sitting perfectly still from the start of the clip was learned static
  (`frames/lab_still_student_learned_static.jpg`). An intruder always walks in first (alert
  fires then), and a spot that was ever live is never learned.
- An intruder who stays perfectly still for > 120 s stops being counted (already alerted on entry).
- First frame(s) of a camera after start / scene change (camera moved, day↔night switch) have no
  reference → nothing counted until a frame ≥ 2 s old exists (next round-robin visit).

## Files

- `run_intruder_test.py VIDEO OUTDIR [--mode continuous|rr]` — harness (run with script-server venv)
- `make_synth.py` — builds the synthetic intruder clip
- `render_side_by_side.py` — OFF | ON side-by-side video (`synthetic_intruder_off_vs_on.mp4`)
- `summary_*.json`, `frames/`, `*.mp4` — results (local only; ignored by `.gitignore`)
