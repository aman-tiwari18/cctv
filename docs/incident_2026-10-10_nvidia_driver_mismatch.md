# Incident: Shift 2 and 3 classification failures caused by an automatic NVIDIA driver upgrade (10 Oct 2026)

**Exam:** 42 (SSC, RTSP) · **Host:** main VM (worker-0) · **Status:** open, nothing fixed yet. Rechecked 10 Oct ~20:30 IST: `nvidia-smi` still fails with the mismatch, and no NVIDIA package is on hold.

> **Related:** the driver upgrade is only one of three causes of the online-camera drop from Shift 1 to Shift 3. See [incident_2026-10-08_to_10_shift_online_camera_drop.md](incident_2026-10-08_to_10_shift_online_camera_drop.md) for the full analysis of 8–10 Oct.

## Summary

At 06:35 IST on 10 Oct, unattended-upgrades updated the NVIDIA driver on the main VM from 580.173.02 to 580.178.04. The host was not rebooted, so the new userspace libraries are now paired with the old kernel module. Every new process that uses the GPU fails with `Driver/library version mismatch`.

The Scene Classification run starts a fresh vLLM server each shift, so it crashed in Shift 2 and Shift 3. Because of that, worker-0's cameras got no classification rows for those shifts. The client report marks every camera without a row as **Offline / Failed to Classify**. Detection processes that were already running kept producing detections.

The driver explains worker-0's loss only (~466 cameras per shift). The Shift 3 online rate of 23.8% also includes worker-2 and worker-3, which were killed at the end of the 14-minute Shift 3 window while vLLM was still starting. That is a separate cause and is not driver-related.

## Timeline (IST)

| Time | Event |
|---|---|
| 05:50–06:15 | Shift 1 pre-run classification: COMPLETED |
| **06:35** | unattended-upgrades upgrades `nvidia-driver-580-server` and related packages from 580.173.02 to 580.178.04 (`/var/log/apt/history.log`). No reboot. |
| 07:45–08:25 | Shift 1 classification: COMPLETED, 1818 cameras classified. Probably did not need to start vLLM (not confirmed). |
| 09:15–10:59 | Shift 1 detections: 383 |
| 11:30 | Shift 2 classification starts. Pass-1 finds 466 accessible and 71 failed (worker-0). |
| 11:41 | vLLM crashes on startup. Assignment 11641 is marked **FAILED**. |
| 12:46–14:30 | Shift 2 detections: 396 |
| 15:15 | Shift 3 classification starts. Pass-1 finds 469 accessible and 68 failed (worker-0). |
| 15:26 | vLLM crashes on startup. Assignment 12046 is marked **FAILED**. |
| 16:58–17:59 | Shift 3 detections: 368 |

## Root cause

```
NVRM (loaded kernel module):  580.173.02   ← /proc/driver/nvidia/version
NVML / userspace libraries:   580.178      ← installed by apt at 06:35
```

From the vLLM startup log (`script-server/scripts/logs/vision/vllm_startup_20261010_152547.log`):

```
Failed to initialize NVML: Driver/library version mismatch
RuntimeError: Failed to infer device type
```

`nvidia-smi` on the host fails with the same error.

- **Processes started before 06:35**, such as the running detection workers, already had the old libraries loaded, so they kept working.
- **Processes started after 06:35**, such as the per-run vLLM server, load the new libraries, which do not match the kernel module, so they fail at once.

This is the same failure class as the w1/2/3 incident on 7 Sep (580.159 to 580.173).

## Impact on the client report (`client_report_2026-10-10.xlsx`)

The report decides Online/Offline per shift from that shift's latest classification run (`ReportController.js`, `rtspShiftCameraLists`):

- The camera has a row in `camera_classification_rtsp` for that run: **Online**, and Cam Type is its label.
- The camera has no row: **Offline**, and Cam Type is "Failed to Classify".

The status is not taken from detections, so cameras that were producing detections can still show as Offline.

| Shift | Run used | Online | Offline | Online rate | Detections on "Offline" cameras |
|---|---|---|---|---|---|
| Shift 1 | 07:55 | 1818 | 293 | 86.1% | 0 |
| Shift 2 | 11:44 | 1348 | 763 | 63.9% | 82 (57 cameras) |
| Shift 3 | 15:25 | 503 | 1608 | **23.8%** | **230 of 368 (136 cameras)** |

The Offline counts for Shift 2 and Shift 3 are inflated. They do not reflect real camera outages.

### Per-worker breakdown (from each worker's `vision_db_*.log`)

"Reachable" is the Pass-1 `accessible` count. "Saved" is the number of rows the worker wrote to `camera_classification_rtsp`.

| Shift | worker-0 | worker-2 | worker-3 | worker-4 | Online in report |
|---|---|---|---|---|---|
| Shift 2 | 466 reachable, **0 saved (driver)** | 444 saved | 460 saved | 444 saved | 1348 |
| Shift 3 | 469 reachable, **0 saved (driver)** | 455 reachable, **~48 saved (killed at 15:29)** | 465 reachable, **0 saved (killed at 15:29)** | 455 saved | 503 |

Across the four workers, about 1844 cameras were reachable in Shift 3 and 1814 in Shift 2. Shift 1 had 1818 reachable, and all of them were saved.

If the driver had been fine, Shift 3 would still have lost worker-2 and worker-3 to the short window. The result would have been about 970 online cameras, not about 1800.

## Was 9 Oct affected?

Not by the driver, which was upgraded on 10 Oct. All three 9 Oct runs are marked COMPLETED.

**Correction to an earlier version of this document:** that version said only about 9 cameras were affected on 9 Oct Shift 3. That was wrong. worker-0 and worker-3 were both still starting vLLM when the scheduler sent SIGTERM at 15:29:00. The run saves results only at the end, so neither worker saved any rows, including the ~450 cameras each that already had a label. About 900 reachable cameras were lost, and Shift 3 showed 899 online instead of about 1800.

The cause is the 14-minute window plus the save-at-end design, not the driver. See the related document.

## Fix (pending, not applied)

1. **Restore the driver on the main VM.** Outside exam hours, reload the NVIDIA kernel module or reboot, then run `nvidia-ctk cdi generate` and recreate the GPU containers (same steps as on 7 Sep). This restarts the running detection processes.
2. **Prevent a repeat.** Hold the NVIDIA packages so unattended-upgrades cannot change them (`apt-mark hold` on `nvidia-*-580-server`, `libnvidia-*-580-server` and `nvidia-fabricmanager-580`), or add them to the unattended-upgrades blacklist. Do this on every worker host.
3. **Make the report honest when a run fails.** Options:
   - When the shift's classification assignment is FAILED, show "Not Classified" instead of "Offline / Failed to Classify".
   - Count a camera as Online if it produced detections during the shift, even when it has no classification row.
4. **Widen the Shift 3 classification window** (15:15–15:29) to at least 30 minutes, and **save the history rows of already-labelled cameras before vLLM starts**. This is no longer optional, because it caused more of the Shift 3 loss than the driver did. See the related document.

## References

- Assignments: `shift_script_assignments` 11641 (Shift 2) and 12046 (Shift 3), whose `error_log` holds the run output.
- vLLM logs: `script-server/scripts/logs/vision/vllm_startup_20261010_114051.log` and `vllm_startup_20261010_152547.log`
- Upgrade record: `/var/log/apt/history.log`, Start-Date 2026-10-10 06:35:15
- Report logic: `cctv_backend/src/controllers/ReportController.js`, functions `rtspShiftCameraLists` and `cameraIsOnline`
