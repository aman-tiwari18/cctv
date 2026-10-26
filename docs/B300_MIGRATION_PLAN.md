# Moving the CCTV system onto the B300 server (4 GPUs)

**Status:** plan, not started · **Written:** 23 Oct 2026
**Target:** one server with 8 × B300 (275 GB each), 256 cores, 4 TB RAM, driver 595 / CUDA 13.2.
We use 4 of the 8 GPUs. Everything runs in Docker (no sudo, no host Node/MySQL/Apache/ffmpeg).

---

## 1. The idea in one paragraph

Keep the system exactly as it works today: the same poller, the same database-driven assignments, the same
`master_pipeline` jobs and the same camera split (`crc32(device:camera) % TOTAL_WORKERS`). The only
difference is *where* the pieces run. Today five machines each run one worker on one GPU. On the B300 server,
four worker containers each get **their own GPU**, so each container behaves exactly like one of today's
worker machines. MySQL, the Node backend (which also serves the frontend), the web proxy, the camview token
server and Prometheus become containers on the same server. **No code changes are required** — every
address and limit that has to change is already read from an environment variable.

---

## 2. What stays the same

- Worker code and image: same `script-server` Dockerfile and code (repo `aman-tiwari18/script_server`, synced
  to what runs today on 23 Oct, commit `fc634c6`).
- Main's script-server (worker-0 + the web API: images, socket.io, Prometheus proxy, GPU page): same code
  (repo `aman-tiwari18/cctv`, `script-server/`).
- Node backend and the React frontend build: same code (repo `aman-tiwari18/cctv`).
- Database schema and data: `cctv_monitoring` copied as is.
- How work is shared: every worker polls MySQL for assignments and takes its share of cameras by
  `WORKER_INDEX` / `TOTAL_WORKERS`. Shift sessions, classification, vLLM-per-worker, the token server — all
  unchanged.
- Software versions: the worker image already has PyTorch 2.11 + CUDA 13.0 (includes Blackwell `sm_100`),
  vLLM 0.20.1, Ultralytics 8.4.23. Expected to run on B300 (`sm_103`, same family) — **must be verified**,
  see §6.

---

## 3. Target layout

```
                      users / client  ──►  web (Apache or nginx container, ports 80/443)
                                              │  /cctv_analytics  → backend:3000   (API + frontend)
                                              │  /cctv_dev/       → worker-0:8000  (images, socket.io, GPU page)
                                              ▼
  ┌──────────── one Docker network (cctv_net) on the B300 server ─────────────────────────────┐
  │ mysql        backend (Node 3000)     token-server (8090)     prometheus + exporters       │
  │                                                                                            │
  │ worker-0 (GPU 0)   worker-1 (GPU 1)   worker-2 (GPU 2)   worker-3 (GPU 3)    GPUs 4-7 free │
  │  = today's main      = today's w2-w5 role, one GPU each                                    │
  │  script-server        each runs its own vLLM on localhost:8001 inside its container        │
  └────────────────────────────────────────────────────────────────────────────────────────────┘
       shared host folders:  /localstorage/cctv/results  (detection images, state)   18 TB disk
                             /localstorage/cctv/models, /localstorage/cctv/hf_cache  (read-mostly)
```

| Container | Today | GPU | Notes |
|---|---|---|---|
| `worker-0` | main (pm2 `cctv-backend-fastapi`), index 0 | 0 | Built from the `cctv` repo's `script-server/` (has the web endpoints). |
| `worker-1`…`worker-3` | worker-2…worker-5 containers | 1, 2, 3 | Built from `script_server` repo. |
| `token-server` | pm2 `camview-token-server` on main | – | Same `camview_token_server.py --port 8090`, run from the worker image. |
| `backend` | pm2 `cctv-backend-node` (:3000) | – | Serves the frontend `dist/` under `/cctv_analytics`. |
| `mysql` | host MySQL on main | – | MySQL 8, data restored from a dump. |
| `web` | host Apache on main | – | Only the two proxy rules above + TLS certificate. |
| `prometheus`, `gpu-exporter`, `node-exporter` | `cctv_prometheus` + per-host exporters | – | One exporter now covers all GPUs. Optional on day one. |

Not moved (out of scope): the UAT/new_dev stack (`cctv-uat-backend`, `/data/new_dev`), the dev server.

---

## 4. What changes — configuration only

### 4.1 Docker Compose (one file, e.g. `docker-compose.b300.yml`)

The worker compose file we use today has two settings that would break on a multi-GPU box:

| Setting | Today | On B300 | Why |
|---|---|---|---|
| GPU reservation | `count: all` + `CUDA_VISIBLE_DEVICES: 0` | `device_ids: ["N"]` per worker | Today every container would see all 8 GPUs and all pick GPU 0. |
| Container / project name | one compose project per machine | one project, services `worker-0..3` | Four workers from one folder would otherwise overwrite each other. |
| Host port | `${WORKER_HTTP_PORT}:8000` on each machine | only `worker-0` exposed (to `web`) | Workers talk over the Docker network; nothing else needs a host port. |
| `ollama` service | defined, unused | removed | Not used by any analytic. |
| Memory limit | `96g` | `256g` | 4 TB RAM; today workers use 80–105 GB. |
| NFS mount `/mnt/nfs/cctv_images` | NFS from main | bind mount `/localstorage/cctv/results` | Same folder for every container, no NFS needed. |

Inside each container the GPU still appears as device 0, so `CUDA_VISIBLE_DEVICES: 0` and the rest of the
code stay as they are.

### 4.2 Environment variables

| Variable | Today | On B300 | Where |
|---|---|---|---|
| `TOTAL_WORKERS` | 5 | **4** | all workers |
| `WORKER_INDEX` / `WORKER_ID` | 0–4 / worker-0…5 | 0–3 / `worker-0…worker-3` | per worker |
| `SESSION_MAX_STREAMS` | 800 | **1400** | all workers (SSC CGL ≈ 4,478 cameras / 4 ≈ 1,120 each) |
| `VLLM_GPU_MEMORY_UTILIZATION` | 0.55 of 141 GB ≈ 78 GB | **0.30** of 275 GB ≈ 82 GB | all workers (read by `start_vllm.sh` and the classification scripts) |
| `DB_HOST` | `192.168.19.30` / `localhost` | `mysql` | workers, backend |
| `CAMVIEW_TOKEN_SERVER` | `http://192.168.19.30:8090` | `http://token-server:8090` | all workers |
| `MAIN_BACKEND_URL` | `http://192.168.19.30:3000/cctv_analytics/api` | `http://backend:3000/cctv_analytics/api` | all workers |
| `SCRIPT_SERVER_URL` | `http://localhost:8000` | `http://worker-0:8000` | backend |
| `DETECTION_IMAGE_BASE_URL`, `DETECTION_RTSP_IMAGE_BASE_URL` | `http://192.168.19.30:3000/cctv_dev/...` | `http://worker-0:8000/...` | workers |
| `PROMETHEUS_URL` | `http://localhost:9090` | `http://prometheus:9090` | worker-0 |
| `GPU_WORKERS_JSON` | five machines | the four containers (`worker-0..3`, port 8000) | worker-0 (GPU page) |
| `WORKER_1_IP` … `WORKER_3_IP` | worker machines | see §5 | backend (frame fetch fallback) |
| `HF_HOME` | `/data/hf_cache` | unchanged (mount the shared cache there) | all workers |
| `PROXIMITY_ENGINE`, `CAMERA_REFRESH_S`, `UNIFIED_PHONE_BACKEND`… | as today | unchanged | copy each `.env` as is |

Everything else in today's `.env` files is copied unchanged.

### 4.3 Storage

| Folder | Size today | On B300 | Must copy? |
|---|---|---|---|
| Detection images (`/data/nfs/cctv_images`) | 197 GB | `/localstorage/cctv/results` | **Yes** for the dashboard to show old detections; can be copied after cut-over. |
| Analytic state inside it: `monitor_tamper_homes` (2.9 GB), `invigilator_state`, `crowd_five_invigilator_state`, `proximity_repeat` | ~3 GB | same folder | **Yes, before cut-over** (or monitor tampering re-learns its home positions). |
| MySQL `cctv_monitoring` | 0.75 GB (1.8 GB on disk) | `mysql` volume on `/localstorage` | **Yes**, dump + restore. |
| Models (`models/`, `scripts/detection/models` ≈ 0.8 GB) | — | `/localstorage/cctv/models` | Yes (or bake into the image). |
| vLLM weights (`hf_cache`, ≈ 62 GB) | — | `/localstorage/cctv/hf_cache` | Download once from Hugging Face (server can reach it), shared by all 4 workers. |

One shared `hf_cache` is a bonus: the second, third and fourth vLLM start read the weights from the page cache,
which removes the slow 7–12 minute loads we see on worker-5 today.

---

## 5. Code changes

**Required: none.** Every address checked (`DB_HOST`, `CAMVIEW_TOKEN_SERVER`, `MAIN_BACKEND_URL`,
`SCRIPT_SERVER_URL`, image base URLs, `PROMETHEUS_URL`, `GPU_WORKERS_JSON`, `WORKER_n_IP`) has an environment
override; the `192.168.19.x` values in the code are only defaults.

Known items to check, not change:

- **Frame fetch fallback (backend `utils/workerFrameFetch.js`)** reaches worker machines over SSH +
  `docker exec`. On one server with one shared images folder this path should never be needed. Confirm it is
  unused during the rehearsal; if it is used, the simple fix is to point it at the shared folder (small change).
- **Frontend** builds image links with `www.examscctvmonitoring.com`. No change if the domain points at the new
  server; if a different domain is used, the frontend needs a rebuild with that domain.
- **Two images, two repos:** worker-0 is built from `cctv/script-server` (it has the web/API endpoints),
  workers 1–3 from `script_server`. That is how it works today; keep it.

---

## 6. Compatibility checks on the B300 (before anything else)

Run each inside a worker container on GPU 0, with no connection to production:

| Check | How | Pass |
|---|---|---|
| PyTorch sees the GPU | `torch.cuda.is_available()`, device name, a matmul | B300 listed, no "no kernel image" error |
| Person detector (YOLO26m) | run the unified detector on a test image | boxes returned |
| Phone + posture (RF-DETR) | same | boxes returned (watch for the cuDNN "no valid execution plans" error we fixed on worker-0 with `LD_LIBRARY_PATH`) |
| Proximity (YOLO11m + pose + Depth-Anything, `lapx`) | `test_proximity_temporal_det.py` + the real-frame smoke test | 12/12 + engine OK |
| HLS refresh | `test_hls_camera_refresh.py` | 13/13 |
| vLLM (Qwen3-VL-30B) | `start_vllm.sh` with `VLLM_GPU_MEMORY_UTILIZATION=0.30`, one image request | `/health` 200, answer in a few seconds; note load time |
| FFmpeg/OpenCV streams | open one recorded video and one live HLS URL inside the container | frames read |

If PyTorch or vLLM refuse the GPU, the fix is a newer PyTorch/vLLM wheel in the image (image rebuild only).

---

## 7. Phased plan

### Phase 0 — decisions and access (½ day)
- Agree the open decisions in §10 (public entry, data copy route, camview test window).
- Network path between today's main server and the B300 server for the data copy (today there is none:
  the B300 is only reachable over Tailscale/jump, and the worker-6 jump host is closed).

### Phase 1 — build and smoke test on the B300 (1 day, no production impact)
1. Create `/localstorage/cctv/{results,models,hf_cache,mysql,logs}`.
2. Clone both repos; build the worker image and the worker-0 image.
3. Start **one** worker container on GPU 0 (no DB connection needed for the tests).
4. Run every check in §6. Record GPU memory and vLLM load time.

### Phase 2 — full-stack rehearsal on a copy of the database (1–2 days, no production impact)
1. Start `mysql`, restore a fresh dump of `cctv_monitoring`.
2. Start `backend`, `web`, `token-server`, `worker-0..3`, Prometheus.
3. Test with **HLS (UPCISB) and recorded videos first** — they do not touch the camview login.
4. Test SSC (camview, RTSP) **only in an agreed window** — see the camview risk in §9.
5. Run one classification and one full shift on the `SSC_test` exam (43) or a dated copy of a real shift;
   compare per-worker camera counts, alerts, GPU memory and CPU with today's fleet.
6. Check the dashboard: cameras page, detections with images, GPU page, executions.

### Phase 3 — data copy (overlaps phase 2)
1. Copy the analytic state folders (§4.3) and models.
2. Start the 197 GB images copy with `rsync` (can keep running; re-run before cut-over to pick up new files).

### Phase 4 — cut-over (in a day with no exams; after SSC CGL ends on 28 Oct)
1. Stop the old pollers: `pm2 stop cctv-backend-fastapi` on main, stop the worker containers.
2. Final `mysqldump` from main → restore on B300 (minutes, 0.75 GB).
3. Final `rsync` of the images and state folders.
4. Start the B300 stack; check each worker polls and takes its share (`WORKER_INDEX 0..3 / 4`).
5. Point the public domain (or the main server's Apache) at the B300 `web` container.
6. Smoke test: log in, cameras page, schedule a short test job, see a detection with its image.
7. **Rollback** (keep for one week): stop the B300 stack, `pm2 start` on main, start the old worker containers.
   The old fleet keeps its code and images untouched.

### Phase 5 — after cut-over
- Nightly `mysqldump` to `/localstorage/cctv/backups` (and off the box).
- Watch the first two exam days: per-worker stream counts, drops, GPU memory, vLLM start times.
- Decide what to do with the old fleet (spare / dev / retire).

---

## 8. Capacity check (measured on 22 Oct, SSC CGL Shift 3, 17:00–18:00)

| | Today, per worker (5 workers) | B300, per worker (4 workers) | Fits? |
|---|---|---|---|
| Cameras | ≈ 900 | ≈ 1,120 | yes, needs `SESSION_MAX_STREAMS` 1400 (never run above 800 before — **verify in phase 2**) |
| GPU memory, detection | 92–118 GB | ≈ 115–145 GB | yes (275 GB) |
| GPU memory, + vLLM in a classification window | + 78 GB | + ≈ 82 GB | yes, ≈ 230 GB peak |
| GPU busy | ≈ 10% avg (main 40%) | B300 is faster | yes |
| CPU | 15–31 busy cores | ≈ 64 cores available each | yes (≈ 100 of 256 in total) |
| RAM | 80–105 GB | up to 256 GB each | yes (4 TB) |
| Network in | ≈ 400 Mbit/s each, ≈ 1.6 Gbit/s total | ≈ 1.6 Gbit/s on one network card | check the card is 10 Gbit/s or more |

If 1,120 streams per worker turns out to be too many for one process, add workers instead of raising the
limit: `worker-4`…`worker-7` on GPUs 4–7 with `TOTAL_WORKERS=8`. It is the same mechanism, no code change.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Camview single login.** The token server keeps one camview session for the whole fleet; a second token server with the same account replaces it. | Testing SSC on the B300 while production runs would knock production's camera streams off. | Test HLS/recordings first; test camview only in an agreed no-exam window, or with a separate camview account. |
| B300 (`sm_103`) not supported by the current PyTorch/vLLM build | Models fail to start | Phase 1 checks; if needed rebuild the image with newer wheels. |
| 1,120 streams per worker is untested | Stream cap hit, cameras skipped | Phase 2 measurement; fall back to 8 workers (§8). |
| One machine for everything | A crash or driver issue stops every exam | Keep the old fleet as rollback for at least a week; nightly DB backups off the box. |
| No network path from main to B300 today | Data copy and proxying blocked | Decide in phase 0 (Tailscale on main, a reopened jump host, or copy through the B300 pulling over the internet). |
| No sudo on the B300 | Can't install system packages or change firewall | Everything runs in Docker (user is in the `docker` group); ports exposed only through Docker. |
| Shared `hf_cache` written by four containers at once | Partial downloads | Download the vLLM weights once before starting the workers; `HF_HUB_OFFLINE=1` is already set in `start_vllm.sh`. |

---

## 10. Decisions needed

1. **Public entry:** point `www.examscctvmonitoring.com` at the B300 server, or keep today's main Apache and
   proxy to the B300 (needs a network path)?
2. **Data copy route** from main to the B300 (Tailscale on main, jump host, or other).
3. **Camview test window** (or a second camview account) for the SSC rehearsal.
4. **Old detection images:** copy all 197 GB, or only the analytic state and recent days?
5. **Cut-over date:** first day with no exams after SSC CGL (28 Oct) and UPCISB.
6. **Monitoring on day one:** move Prometheus + GPU page at cut-over, or right after?

---

## Appendix A — compose sketch

```yaml
# docker-compose.b300.yml  (sketch — fill values from today's .env files)
x-worker: &worker
  build: { context: ./script_server/script-server, dockerfile: Dockerfile }
  restart: unless-stopped
  shm_size: 16gb
  env_file: ./env/worker.env              # today's worker .env, with §4.2 changes
  environment: &worker_env
    TOTAL_WORKERS: "4"
    SESSION_MAX_STREAMS: "1400"
    VLLM_GPU_MEMORY_UTILIZATION: "0.30"
    DB_HOST: mysql
    CAMVIEW_TOKEN_SERVER: http://token-server:8090
    MAIN_BACKEND_URL: http://backend:3000/cctv_analytics/api
    CUDA_VISIBLE_DEVICES: "0"             # the one GPU this container is given
  volumes:
    - /localstorage/cctv/results:/app/scripts/detection/results
    - /localstorage/cctv/models:/app/models
    - /localstorage/cctv/hf_cache:/data/hf_cache
  networks: [cctv_net]
  deploy:
    resources:
      limits: { memory: 256g }

services:
  worker-0:
    <<: *worker
    build: { context: ./cctv/script-server, dockerfile: Dockerfile }   # main's script-server (web endpoints)
    environment: { <<: *worker_env, WORKER_ID: worker-0, WORKER_INDEX: "0" }
    volumes:
      - /localstorage/cctv/results:/app/scripts/detection/results
      - /localstorage/cctv/models:/app/models
      - /localstorage/cctv/hf_cache:/data/hf_cache
      - /localstorage/cctv/logs/worker-0:/app/scripts/logs
    deploy:
      resources:
        limits: { memory: 256g }
        reservations: { devices: [ { driver: nvidia, device_ids: ["0"], capabilities: [gpu] } ] }
  worker-1:
    <<: *worker
    environment: { <<: *worker_env, WORKER_ID: worker-1, WORKER_INDEX: "1" }
    deploy:
      resources:
        limits: { memory: 256g }
        reservations: { devices: [ { driver: nvidia, device_ids: ["1"], capabilities: [gpu] } ] }
  # worker-2 (device "2") and worker-3 (device "3") are the same as worker-1
  # (each also gets its own logs folder: /localstorage/cctv/logs/worker-N:/app/scripts/logs)

  token-server:
    image: <worker image>
    command: ["python", "/app/scripts/detection/camview_token_server.py", "--port", "8090"]
    env_file: ./env/worker.env
    networks: [cctv_net]

  backend:
    image: node:20
    working_dir: /app/cctv_backend
    command: ["node", "src/server.js"]
    env_file: ./env/backend.env           # DB_HOST=mysql, SCRIPT_SERVER_URL=http://worker-0:8000
    volumes:
      - ./cctv/cctv_backend:/app/cctv_backend
      - ./cctv/cctv_frontend/dist:/app/cctv_frontend/dist
    networks: [cctv_net]

  mysql:
    image: mysql:8.0
    volumes: [ "/localstorage/cctv/mysql:/var/lib/mysql" ]
    env_file: ./env/mysql.env
    networks: [cctv_net]

  web:
    image: httpd:2.4                      # or nginx; only the two proxy rules + TLS
    ports: ["80:80", "443:443"]
    networks: [cctv_net]

networks:
  cctv_net: {}
```

Checked against main on 23 Oct: the backend runs `src/server.js` from `cctv_backend/` on Node 20.20.2, and
MySQL is 8.0.46, so `node:20` and `mysql:8.0` match. The backend's `node_modules` must be installed inside the
container (`npm ci`) rather than copied from main.
