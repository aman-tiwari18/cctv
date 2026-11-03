# camera-uptime-service

An independent checker. During the scheduled shift hours of live exams it checks every scheduled
camera, captures one frame, and records whether the camera was available. It keeps that uptime
data for every shift.

**What it does not do:** no vLLM and no camera classification. No GPU, no scene labels. It never
writes `camera_links_*` or `camera_classification_*`. It imports nothing from `script-server`.

## How it works

**What is checked**
- A shift is live inside its `exam_shifts` start/end on an exam day.
- Exam days are the exam's date range minus `skip_days` / `skip_dates`, then the
  `exam_slot_schedule` gate.
- Checking starts after a 5-minute hold (`START_HOLD_MIN`) while detection opens its streams.
- Cameras come from `camera_links_rtsp` / `camera_links_hls` plus the centre schedule. Every
  status is included.

**Pacing**
- One camera at a time per Camview server (`MAX_INFLIGHT_PER_SERVER`), plus one HLS lane.
- At most one check per DVR, with at least `DVR_MIN_GAP_S` between checks on the same DVR.
- At most `MAX_NEW_STREAMS_PER_MIN` new RTSP streams per minute overall.
- At most `HLS_REQ_PER_S` HTTP requests per second to TCS.

**RTSP checks**
- The token comes from `camview-token-server` (:8090). The service never logs in, evicts, or
  forces a refresh.
- Then: StartVideo on the main stream, then ffmpeg grabs one frame.
- StopVideo is off (`STOP_VIDEO=0`).

**HLS checks:** portal page → `.m3u8`, then ffmpeg grabs one frame.

**Results**

| Result | Meaning |
|---|---|
| `UP` | A frame was captured |
| `DOWN` | Camera-side failure |
| `UNKNOWN` | Infrastructure failure (token, DVR/DSS, CDN block). Excluded from uptime % |

A uniform or black frame sets `frame_blank`. This is a pixel-statistics flag only: the camera
stays `UP`.

**Tables**

| Table | Contents |
|---|---|
| `camera_uptime_runs` | One row per exam / shift / date |
| `camera_uptime_checks` | Every check |
| `camera_uptime_summary` | One row per camera per run |
| `camera_uptime_events` | Pauses and backoffs |

The latest frame per camera per shift is saved as
`FRAMES_ROOT/<exam>/<date>/<shift>/<camera>.jpg`.

**Viewing:** the admin page is **Camera Uptime** (`/cctv_analytics/camera-uptime`). It has an Excel
download and is served by `cctv_backend` at `/api/camera-uptime/*`.

## Run

```bash
cd camera-uptime-service
python3 -m venv venv && venv/bin/pip install -r requirements.txt
mysql -u root cctv_monitoring < schema.sql      # once, as root
cp .env.example .env                             # DB user cctv_uptime: SELECT on source tables, write on camera_uptime_*
pm2 start ecosystem.config.js && pm2 save
```

## Commands

```bash
venv/bin/python -m uptime dry-run [--at "2026-11-02 13:30"]   # live runs + roster per lane; touches no camera
venv/bin/python -m uptime check-one --camera-id 291338 --save  # one real RTSP check, no DB writes
venv/bin/python -m uptime check-one --exam-id 44 --ch-code X   # one real HLS check
venv/bin/python -m uptime rebuild-summary --run-id N           # recompute a run's summary from raw checks
UPTIME_TEST_DB=1 venv/bin/python -m pytest -q tests            # unit tests (+ DB tests, rolled back)

curl -s 127.0.0.1:8095/status | python3 -m json.tool             # lanes, pass progress, ETA, pauses
curl -s -XPOST 127.0.0.1:8095/pause                              # kill switch (or: touch PAUSE)
curl -s -XPOST 127.0.0.1:8095/resume
pm2 logs camera-uptime
```

## Tuning (`.env`, then `pm2 restart camera-uptime`)

- **Pilot on one server:** `ONLY_SERVERS=d11.camview.io`. Leave it empty for all servers. Use
  `INCLUDE_HLS=1` for HLS exams.
- **More checks per shift:** `MAX_INFLIGHT_PER_SERVER=2` doubles the checks per shift.
  - Each DVR still sees one check at a time.
  - Raise `MAX_NEW_STREAMS_PER_MIN` to match.
- **HLS rate:** `HLS_REQ_PER_S` is capped at 1. Each HLS check costs about 3 requests.
- **Stream type:** `RTSP_STREAM_TYPE=1` is the main stream; detection's kept-open sessions use the
  substream (2).
- **`STOP_VIDEO`:** turn it on only after testing next to detection. StopVideo targets the shared
  session plus channel, not this checker's own stream.
