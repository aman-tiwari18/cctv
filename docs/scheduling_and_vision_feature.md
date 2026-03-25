# Scheduling & Vision Classification Feature

## Overview

This document describes changes made to integrate scheduled script execution (vision classification, camera inversion, camera tampering) with the frontend scheduling UI, camera filter improvements, and classification result persistence.

---

## New Script Keywords

Three new script keywords were added to the system:

| Keyword | Name | Description | Execution target |
|---------|------|-------------|-----------------|
| `vision` | Scene Classification | Classifies camera scenes using Qwen3-VL GPU model | `scripts/detection/vision_classification.py` |
| `inversion` | Camera Inversion Detection | Detects inverted/rotated cameras | `pipeline/master_pipeline.py` (`--analytics inversion`) |
| `tampering` | Camera Tampering Detection | Detects camera tampering events | `pipeline/master_pipeline.py` (`--analytics tamper`) |

> **Note:** `tampering` maps to analytics key `tamper` in `HLS_WORKER_MAP` inside `master_pipeline.py`.

---

## Backend Changes

### `cctv_backend/src/config/scriptRegistry.js`
- Completely replaced with new registry containing 10 scripts
- New entries: `vision`, `inversion`, `tampering`
- `vision` entry references `scripts/detection/vision_classification.py`

### `cctv_backend/src/controllers/ScriptController.js`
- Added `syncBuiltInScripts()` — auto-upserts all registry entries into `scripts` table on every `GET /scripts` call
- Ensures the DB stays in sync with the registry without manual migration

### `cctv_backend/src/models/CameraLinkRTSP.js`
- Added `classification: { type: DataTypes.STRING, allowNull: true }` field
- Corresponding DB migration: `009_alter_camera_links_rtsp_new_headers.sql`

### `cctv_backend/src/migrations/009_alter_camera_links_rtsp_new_headers.sql`
- Adds `classification VARCHAR(255) NULL` to `camera_links_rtsp`

### `cctv_backend/src/controllers/CameraController.js`
- Added `buildHlsCameraScope({ shiftId, examDate })` helper using `Op.or` — includes cameras with `null` shift_id/exam_date so "all shifts" cameras are always returned
- Updated `getByExam` to use compound `Op.and` filter for HLS cameras (shift + date)
- Added `getByAssignment` handler — loads assignment by ID, resolves exam/shift/date/link_type, returns cameras matching that assignment's scope

### `cctv_backend/src/controllers/ExecutionController.js`
- Added `persistVisionClassifications(assignment, resultData)` helper
  - Parses `result_data.classifications: [{camera_id, classification}]` from vision script output
  - Updates `CameraLinkHLS.classification` (matched by `ch_code`) or `CameraLinkRTSP.classification` (matched by `device_id`)
- Updated `updateStatus` — calls `persistVisionClassifications` when `script_code === 'vision'` and `status === 'COMPLETED'`

### `cctv_backend/src/routes/executions.js`
- Added `GET /executions/:id/cameras` → `CameraController.getByAssignment`

### `cctv_backend/migration.sql`
- Added seed INSERT rows for `vision`, `inversion`, `tampering` scripts

---

## Python Script Server Changes

### `script-server/app/script_runner.py`

**Routing logic:**
- `vision` → runs `scripts/detection/vision_classification.py` with assignment metadata as CLI args
- `inversion` → runs `master_pipeline.py --analytics inversion`
- `tampering` → runs `master_pipeline.py --analytics tamper` (key mapped via `ANALYTICS_ARG_OVERRIDES`)
- All other pipeline codes → `master_pipeline.py --analytics <code>` (unchanged)

**`build_script_arguments()` updated:**
- For `vision`: passes `--assignment_id`, `--exam_id`, `--shift_id`, `--link_type`, `--assignment_date`
- For pipeline codes: passes `--analytics <resolved_code>`

**Constants added:**
```python
VISION_CODES = {"vision"}
ANALYTICS_ARG_OVERRIDES = {
    "tampering": "tamper",  # HLS_WORKER_MAP uses key "tamper"
}
```

### `script-server/scripts/detection/vision_classification.py`

**New functions added:**
- `notify_backend_completion(assignment_id, status, result_data, error_log)` — PUTs status to backend `PUT /executions/{id}/status`
- `run_scheduled_vision_classification(assignment_id, exam_id, shift_id, link_type, assignment_date)`:
  - Fetches cameras from DB via `db_client.get_hls_cameras()` or `get_rtsp_cameras()`
  - Captures a frame per camera
  - Classifies each frame using `classify_with_vlm()`
  - Returns structured JSON: `{"assignment_id": ..., "classifications": [{"camera_id": ..., "classification": ...}]}`
  - Calls `notify_backend_completion()` to update assignment status

**`__main__` entry point updated:**
- If `--assignment_id` arg is present → run scheduled mode via `run_scheduled_vision_classification()`
- Otherwise → legacy Excel/RTSP batch mode (unchanged)

**Environment variables used:**
- `MAIN_BACKEND_URL` — backend API base URL (default: `http://localhost:3000/cctv_analytics/api`)
- `API_KEY` — backend auth key

---

## Qwen3-VL Model Setup

Model directory: `script-server/models/qwen3-vl-8b-instruct/`

**Files present:**
- Config/tokenizer files: `config.json`, `generation_config.json`, `preprocessor_config.json`, `tokenizer.json`, `tokenizer_config.json`, `vocab.json`, `merges.txt`, `chat_template.json`, `video_preprocessor_config.json`
- Weights: `model.safetensors` → symlinked to `models/qwen3-vl-8b-instruct-download/qwen3-vl-8b-instruct-abliterated.safetensors` (17GB)

**Model IDs:**
- `VISION_MODEL_ID`: `wangkanai/qwen3-vl-8b-instruct` (weights source)
- `VISION_PROCESSOR_ID`: `Qwen/Qwen3-VL-8B-Instruct` (processor/tokenizer config)

GPU: NVIDIA H200 NVL, CUDA 12.1, torch 2.5.0+cu121

---

## Frontend Changes

### `cctv_frontend/src/pages/Cameras.jsx`

**HLS camera filter bar:**
- Added shift dropdown (`filterShiftId`) below exam selector
- Added date picker (`filterExamDate`)
- Filters are passed as `shift_id` and `exam_date` query params to `camerasAPI.getByExam()`
- Filter bar only shown when the selected exam has HLS cameras

**Classification column:**
- HLS table: new `Classification` column showing a `<Chip>` with the classification value (or "—" if unset)
- RTSP: `classification` field added to the edit form and empty row template

### `cctv_frontend/src/components/ShiftScriptManager.jsx`

- Assignment list rows now show script keyword as a secondary `<Chip color="secondary">`
- Script selection dropdown shows `Keyword: {script.script_id}` subtitle under the script name

---

## Data Flow: Vision Classification Scheduling

```
Frontend (Schedule Scripts tab)
  → POST /assignments  { script_id: <vision>, exam_id, shift_id, link_type, assignment_date }
  → Script server picks up assignment
  → script_runner.py: routes to vision_classification.py
     --assignment_id <id> --exam_id <x> --shift_id <x> --link_type <x> --assignment_date <x>
  → vision_classification.py: fetches cameras from DB, classifies each
     outputs JSON: { "assignment_id": ..., "classifications": [...] }
  → backend PUT /executions/:id/status { status: "COMPLETED", result_data: {...} }
  → ExecutionController.updateStatus: calls persistVisionClassifications()
     → updates camera_links_hls.classification or camera_links_rtsp.classification
  → Camera tab shows updated classification values
```

---

## Running the DB Migration

If the `camera_links_rtsp.classification` column doesn't exist yet:

```sql
-- Run migration 009
USE cctv_monitoring;
ALTER TABLE camera_links_rtsp ADD COLUMN classification VARCHAR(255) NULL;
```

Or run via the migration runner:
```bash
cd cctv_backend && node src/migrations/run.js
```
