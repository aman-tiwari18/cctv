# Incident: online camera count falls from Shift 1 to Shift 3 (8–10 Oct 2026)

**Exam:** 42 (SSC CGLE, RTSP) · **Reports:** `client_report_2026-10-08.xlsx`, `client_report_2026-10-09.xlsx`, `client_report_2026-10-10(1).xlsx` · **Status:** open, nothing fixed yet

## Summary

On each of the three days, the client report shows far fewer online cameras in Shift 3 than in Shift 1. On 10 Oct, for example, the rate fell from 86.1% to 23.8%.

**This is not a real camera outage.** The number of cameras the workers could reach was about the same in every shift, around 1800. The report counts a camera as Online only if that shift's Scene Classification run saved a row for it. In many runs, whole workers saved nothing, for three reasons:

1. **The run saves only at the very end (all-or-nothing).** Each worker covers about 450 cameras. Usually only 0–9 of them need a new label, but the rows for every camera, including the ones that keep their label, are written only after vLLM has started and Pass-2 has finished. If vLLM crashes or the run is killed, the worker saves nothing.
2. **The Shift 3 window is 14 minutes (15:15–15:29), which is too short.** Pass-1 plus preparation takes about 10.5 minutes, and vLLM needs another 3–4 minutes to start. At 15:29:00 the scheduler sends SIGTERM. Any worker that needed even one new label was still starting vLLM at that point and lost its whole share.
3. **vLLM failed to start on some workers.**
   - worker-1 on 8–9 Oct: another user's ollama held about 85 GB of the GPU.
   - worker-0 on 10 Oct Shift 2 and Shift 3: NVIDIA driver/library mismatch after an unattended upgrade. See [incident_2026-10-10_nvidia_driver_mismatch.md](incident_2026-10-10_nvidia_driver_mismatch.md).

Reason 2 is why the drop is worst in Shift 3. Shift 1 (40 minutes) and Shift 2 (29 minutes) leave enough time for vLLM to start and the run to save.

## What the report shows

From the Analysis sheet of each report:

| Date | Shift 1 online | Shift 2 online | Shift 3 online |
|---|---|---|---|
| 8 Oct | 1289 / 2114 (61.0%) | 1085 / 1906 (56.9%) | **499 / 1906 (26.2%)** |
| 9 Oct | 1353 / 2111 (64.1%) | 1367 / 2111 (64.8%) | **899 / 2111 (42.6%)** |
| 10 Oct | 1818 / 2111 (86.1%) | 1348 / 2111 (63.9%) | **503 / 2111 (23.8%)** |

On 8 Oct, Shift 2 and Shift 3 monitor 1906 cameras instead of 2114 because the centre schedule leaves some centres out of those shifts.

## How the report decides Online

`cctv_backend/src/controllers/ReportController.js`:

- `rtspShiftCameraLists` takes the **latest** classification run of each shift from `camera_classification_rtsp`. Rows are grouped by `shift_id`, and a gap of more than 15 minutes starts a new run.
- A camera with a row in that run gets status `Accessible`, and its Cam Type is the row's label.
- A camera without a row gets status `Not Accessible`, and its Cam Type is "Failed to Classify".
- `cameraIsOnline` returns Online only for a camera that has a label and is `Accessible`.

Detections are not considered. A camera that produced detections all shift is still reported as Offline if the classification run saved nothing for it.

## Evidence

### Cameras actually reachable were flat across shifts

This is the sum of the Pass-1 `accessible` count over the four active workers, taken from each worker's `scripts/logs/vision/vision_db_*.log`:

| Date | Shift 1 | Shift 2 | Shift 3 |
|---|---|---|---|
| 8 Oct | 1724 | 1449 | 1592 |
| 9 Oct | 1799 | 1814 | 1802 |
| 10 Oct | 1818 | 1814 | **1844** |

On 10 Oct, Shift 3 had the **most** reachable cameras of the day but the lowest online count. 8 Oct Shift 2 and Shift 3 are lower only because fewer cameras were scheduled (485 instead of 538 per worker).

### Which worker saved

Fleet: TOTAL_WORKERS=4. worker-0 has index 0. Index 1 was worker-1 until the night of 9 Oct and worker-2 after that. worker-3 has index 2 and worker-4 has index 3. Each number is the count of rows that worker saved for the run. The per-worker sums match the report's Online counts.

| Run | worker-0 | worker-1 / worker-2 | worker-3 | worker-4 | Online |
|---|---|---|---|---|---|
| 8 Oct S1 | 434 | 0: vLLM crash (ollama), 435 reachable | 433 | 422 | 1289 |
| 8 Oct S2 | 366 | 0: vLLM crash, 364 reachable | 366 | 353 | 1085 |
| 8 Oct S3 | 404 | 0: vLLM crash, 392 reachable | ~95: killed at 15:29 mid-save, 404 reachable | 0: killed at 15:29 while vLLM was starting, 392 reachable | 499 |
| 9 Oct S1 | 459 | 0: vLLM crash, 446 reachable | 453 | 441 | 1353 |
| 9 Oct S2 | 463 | 0: vLLM crash, 447 reachable | 461 | 443 | 1367 |
| 9 Oct S3 | 0: killed at 15:29 while vLLM was starting, 454 reachable | 452 | 0: killed at 15:29 while vLLM was starting, 449 reachable | 447 | 899 |
| 10 Oct S1 | 458 | 449 (worker-2) | 462 | 449 | 1818 |
| 10 Oct S2 | 0: driver mismatch, 466 reachable | 444 | 460 | 444 | 1348 |
| 10 Oct S3 | 0: driver mismatch, 469 reachable | ~48: killed at 15:29 mid-save, 455 reachable | 0: killed at 15:29 while vLLM was starting, 465 reachable | 455 | 503 |

The workers that survived Shift 3 are the ones that needed **no** new label and so never started vLLM: worker-0 on 8 Oct, worker-1 and worker-4 on 9 Oct, and worker-4 on 10 Oct. They finished by about 15:26.

### Shift 3 timing on a typical worker

From worker-3 on 10 Oct:

```
15:15:01  Pass-1 | 536 cameras | 16 concurrent
15:23:43  Pass-1 done 521.6s | accessible=465 failed=71
15:25:41  Classification needed for 2 of 465 reachable cameras (463 keep their label)
15:25:41  Starting temporary vLLM server process...
15:29:00  WARNING Received signal 15; cleaning up classification vLLM before exit
```

Over 8–10 Oct, vLLM took 180–294 seconds to start on worker-2, worker-3 and worker-4. Pass-1 started at 15:15 and finished around 15:23:30–15:24:30. The next step, "Classification needed", followed about 1.5–2 minutes later. That leaves at most about 3.5 minutes before 15:29, which is less than vLLM's startup time.

### "Offline" cameras were producing detections

Counted from the shift sheets of the reports:

| Run | "Offline" cameras that had events | Events on those cameras |
|---|---|---|
| 8 Oct S3 | 94 | 197 |
| 9 Oct S3 | 111 | 188 |
| 10 Oct S3 | 136 | 230 |

## Root cause in code

`script-server/scripts/detection/vision_classification_rtsp.py`, `run_assignment_mode`:

1. Pass-1 captures a frame from each camera and writes only the `status` column of `camera_links_rtsp` (`_bulk_persist_status`).
2. If any reachable camera needs a label, `_ensure_vllm_running()` starts vLLM. This takes 3–4 minutes.
3. Pass-2 classifies the few cameras that need a label.
4. Only then are the history rows written: `_bulk_persist` writes the new labels and `_persist_history_for_kept` writes the cameras that keep their label. The report reads exactly these rows.

A SIGTERM from the scheduler at the end of the window (`_handle_shutdown_signal` → `SystemExit`), or `sys.exit(1)` after a vLLM startup crash, ends the process before step 4. Every camera on that worker is then lost, including the roughly 450 that never needed vLLM.

## Fixes (pending, not applied)

1. **Write the history rows of already-labelled cameras right after Pass-1, before vLLM starts.** This is the most important fix. A vLLM crash or a window kill would then lose only the 0–9 cameras that need a new label, not about 450.
2. **Widen the Shift 3 classification window** from 15:15–15:29 to at least 30 minutes, for example 15:00–15:40. Also check Shift 2 (11:30–11:59): vLLM finished at 11:44–11:45, which leaves little margin. Shift 1 (07:45–08:25) is fine.
3. **Optionally, start vLLM in parallel with Pass-1** when the worker already knows some cameras are unlabelled. This removes 3–4 minutes from the critical path.
4. **Keep GPUs stable.**
   - Fix the driver mismatch on the main VM, which is still broken as of 10 Oct ~20:30.
   - Hold NVIDIA packages on every host so unattended-upgrades cannot change them.
   - Keep shared-GPU workers out of the fleet when another user's process holds the memory vLLM needs, as was done with worker-1 on 9 Oct.
5. **Make the report honest when classification is missing.**
   - Count a camera as Online if it produced detections in the shift.
   - When a worker's run failed, show "Not Classified" instead of "Offline / Failed to Classify".

## References

- Worker logs: `scripts/logs/vision/vision_db_2026100{8,9}_*.log` and `vision_db_20261010_*.log` on each worker.
  - worker-0: `/data/cctv_dev/cctv/script-server`
  - worker-1: 192.168.19.43
  - worker-2: 192.168.19.42
  - worker-3: 192.168.19.41
  - worker-4: 192.168.19.44
- Schedule: `shift_script_assignments`, script 15 (Scene Classification), shift 160 at 07:45–08:25, shift 156 at 11:30–11:59 and shift 157 at 15:15–15:29.
- Classification rows: `camera_classification_rtsp`, exam_date 2026-10-08 to 2026-10-10.
- Report logic: `cctv_backend/src/controllers/ReportController.js`, functions `rtspShiftCameraLists` and `cameraIsOnline`.
- Classification flow: `script-server/scripts/detection/vision_classification_rtsp.py`, functions `run_assignment_mode`, `_ensure_vllm_running` and `_handle_shutdown_signal`.
