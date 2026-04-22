# CCTV Detection System - Complete Workflow Documentation

> **Comprehensive guide to understanding single script execution and the master pipeline orchestration**

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Single Script Execution Flow](#single-script-execution-flow)
3. [Master Pipeline Workflow](#master-pipeline-workflow)
4. [Scheduling & Assignment Flow](#scheduling--assignment-flow)
5. [Data Flow & Persistence](#data-flow--persistence)
6. [Component Interactions](#component-interactions)

---

## System Architecture Overview

```mermaid
graph TB
    subgraph Frontend["Frontend Layer"]
        UI[React Dashboard]
        ADMIN[Admin Interface]
    end
    
    subgraph Backend["Backend Layer - Node.js"]
        API[Express API Server]
        SCHED[Scheduler Service - Cron Every 1 min]
        DB[(MySQL Database)]
    end
    
    subgraph ScriptServer["Script Server Layer - Python"]
        POLLER[Poller Service - Polls every 30s]
        RUNNER[Script Runner]
        LOGMGR[Log Manager]
    end
    
    subgraph Execution["Execution Layer"]
        MASTER[Master Pipeline - master_pipeline.py]
        VISION[Vision Classification - vision_classification.py]
        WORKERS[Detection Workers - phone, crowd, etc.]
    end
    
    subgraph Infrastructure["Infrastructure"]
        RTSP[RTSP Cameras - DSS Auth]
        HLS[HLS Cameras - Direct HTTP]
        GPU[GPU Resources - YOLO Models]
    end
    
    UI --> API
    ADMIN --> API
    API --> DB
    SCHED --> DB
    POLLER -->|GET /executions/pending| API
    RUNNER --> MASTER
    RUNNER --> VISION
    MASTER --> WORKERS
    WORKERS --> GPU
    WORKERS --> RTSP
    WORKERS --> HLS
    WORKERS -->|Report Results| API
    LOGMGR -.->|Store Logs| RUNNER
    
    style MASTER fill:#e1f8dc,stroke:#1b4d3e,stroke-width:3px
    style POLLER fill:#d4f1f4,stroke:#05445e,stroke-width:2px
    style GPU fill:#ffd1dc,stroke:#ff69b4,stroke-width:2px
```

---

## Single Script Execution Flow

### Overview
This flow shows how a **single analytics assignment** (e.g., "Run Phone Detection on Camera X") progresses from scheduling to completion.

```mermaid
sequenceDiagram
    participant Admin as Admin Dashboard
    participant Backend as Node.js Backend
    participant Scheduler as Scheduler Service
    participant DB as MySQL Database
    participant Poller as Python Poller
    participant Runner as Script Runner
    participant Worker as Detection Worker
    participant GPU as GPU YOLO Model
    
    Admin->>Backend: Create Shift Script Assignment
    Backend->>DB: INSERT shift_script_assignments (status PENDING)
    
    Note over Scheduler: Runs every 1 minute
    Scheduler->>DB: Check upcoming shifts
    Scheduler->>DB: Create execution records 5 min before shift
    
    Note over Poller: Polls every 30 seconds
    Poller->>Backend: GET /executions/pending (lookahead 3min grace 30min)
    Backend->>DB: Query PENDING assignments
    DB-->>Backend: Return assignments
    Backend-->>Poller: Assignment list
    
    Poller->>Poller: Calculate delay until scheduled_at
    Poller->>Poller: Queue assignment with setTimeout
    
    Note over Poller: At scheduled_at time
    Poller->>Backend: PUT /executions/id/status (status RUNNING)
    Backend->>DB: UPDATE status = RUNNING
    
    Poller->>Runner: execute_script assignment
    Runner->>Runner: Build script arguments Set environment variables
    Runner->>Worker: subprocess.exec script_path args
    
    Worker->>GPU: Load YOLO model
    Worker->>Worker: Connect to camera stream
    
    loop Frame Processing
        Worker->>Worker: Capture frame
        Worker->>GPU: Batch inference size 64
        GPU-->>Worker: Detection results
        Worker->>Worker: Save detection image
        Worker->>Backend: POST detection report
        Backend->>DB: INSERT camera_report_hls rtsp
    end
    
    Note over Worker: Runs until end_at or duration_minutes
    Worker->>Worker: Timeout reached Script completes
    Worker-->>Runner: Exit code 0
    
    Runner->>Backend: PUT /executions/id/status (status COMPLETED result_data)
    Backend->>DB: UPDATE status = COMPLETED
    Backend->>DB: Persist vision classifications if vision script
    
    Backend-->>Admin: Live updates via Socket.IO
```

### Key Phases

#### **Phase A: Discovery & Dispatch**
- **Poller** queries backend API every 30 seconds
- Backend returns assignments within lookahead window (3 min) or grace period (30 min overdue)
- Poller calculates exact delay and schedules via `asyncio.sleep()`

#### **Phase B: Process Bootstrapping**
- **Script Runner** injects environment variables:
  - `CAMERA_ID`, `STREAM_URL`, `EXECUTION_ID`
  - `EXAM_ID`, `SHIFT_ID`, `ASSIGNMENT_DATE`, `LINK_TYPE`
- Spawns subprocess with `asyncio.create_subprocess_exec()`
- Creates named log file: `scripts/logs/{ScriptName}_{Exam}_{Shift}_{Date}.log`

#### **Phase C: Worker Runtime**
- Worker loads YOLO model on GPU
- Connects to camera stream (RTSP or HLS)
- Processes frames in batches (typically 64 frames)
- Saves detection images to `results/` directory
- Reports detections to backend via REST API

#### **Phase D: Lifecycle Management**
- Runner monitors subprocess with timeout (from `end_at` or `duration_minutes`)
- Captures stdout/stderr and streams to log files
- On timeout: sends SIGTERM to process group
- Updates assignment status to COMPLETED/FAILED
- Cleans up resources and log handlers

---

## Master Pipeline Workflow

### Overview
The **Master Pipeline** (`master_pipeline.py`) orchestrates multiple cameras and analytics scripts simultaneously, optimized for both RTSP and HLS streams.

```mermaid
graph TB
    subgraph Entry["Entry Point"]
        START[master_pipeline.py] -->|Read ENV vars| ENV[EXAM_ID SHIFT_ID LINK_TYPE analytics]
        ENV --> LOADER[Camera Loader]
    end
    
    subgraph Loading["Camera Loading"]
        LOADER -->|Query DB| DBCAM[(camera_links_hls camera_links_rtsp)]
        DBCAM --> FILTER[Filter by exam shift script]
        FILTER --> SPLIT{Link Type?}
    end
    
    subgraph RTSP["RTSP Pipeline - Bandwidth Optimized"]
        SPLIT -->|RTSP| RTSP_GROUP[Group by camera_id ch_no]
        RTSP_GROUP --> RTSP_PROD[RTSP Producer FFmpeg Pipe]
        
        RTSP_PROD -->|DSS Auth| DSS[DSS Server Token Generation]
        DSS -->|RTSP URL Token| FFMPEG[FFmpeg Process]
        FFMPEG -->|Raw Frames| QUEUE[Multiprocessing Queue Size 5]
        
        QUEUE --> WORKER1[Phone Worker]
        QUEUE --> WORKER2[Crowd Worker]
        QUEUE --> WORKER3[Server Worker]
        QUEUE --> WORKERN[N Workers]
        
        WORKER1 --> GPU1[GPU Inference]
        WORKER2 --> GPU1
        WORKER3 --> GPU1
        WORKERN --> GPU1
    end
    
    subgraph HLS["HLS Pipeline - Scale Optimized"]
        SPLIT -->|HLS| HLS_GROUP[Group by script_code]
        HLS_GROUP --> HLS_WORKER1[Phone Worker HLS]
        HLS_GROUP --> HLS_WORKER2[Crowd Worker HLS]
        HLS_GROUP --> HLS_WORKERN[N Workers]
        
        HLS_WORKER1 --> THREADS1[Camera Threads VideoCapture Pool]
        HLS_WORKER2 --> THREADS2[Camera Threads VideoCapture Pool]
        HLS_WORKERN --> THREADSN[Camera Threads VideoCapture Pool]
        
        THREADS1 --> GPU2[GPU Batch Queue Size 64]
        THREADS2 --> GPU2
        THREADSN --> GPU2
    end
    
    subgraph Output["Output and Reporting"]
        GPU1 --> RESULTS[Detection Results]
        GPU2 --> RESULTS
        
        RESULTS --> SAVE[Save Images results detection]
        RESULTS --> REPORT[Report to Backend db_client.py]
        REPORT --> BACKEND_DB[(camera_report_hls camera_report_rtsp)]
        SAVE --> SOCKET[Socket.IO Live Updates]
    end
    
    style RTSP_PROD fill:#fff2cc,stroke:#d6b656,stroke-width:2px
    style THREADS1 fill:#fff2cc,stroke:#d6b656,stroke-width:2px
    style GPU1 fill:#ffd1dc,stroke:#ff69b4,stroke-width:2px
    style GPU2 fill:#ffd1dc,stroke:#ff69b4,stroke-width:2px
    style START fill:#e1f8dc,stroke:#1b4d3e,stroke-width:3px
```

### RTSP vs HLS Strategy

#### **RTSP Pipeline (Camera-Centric)**
- **One Producer per Camera**: Single FFmpeg process connects to DSS server
- **Frame Distribution**: Producer feeds frames to multiple worker queues via multiprocessing
- **Bandwidth Efficient**: Camera stream decoded once, shared across all analytics
- **DSS Authentication**: Generates MD5 signature, fetches session token
- **Reconnection Logic**: Re-authenticates after 10 consecutive frame failures

#### **HLS Pipeline (Analytics-Centric)**
- **One Worker per Analytics Type**: Each worker manages its own camera pool
- **Thread-Based**: Worker spawns threads for each camera using `cv2.VideoCapture`
- **GPU Batch Queue**: Accumulates frames from all cameras, processes in batches of 64
- **Scale Optimized**: Can handle hundreds of cameras per worker
- **Direct HTTP**: No authentication required, pulls snapshots directly

### Worker Lazy Loading

```python
def get_worker(analytic_name, mode="rtsp"):
    """
    Dynamically imports workers to prevent loading unused models.
    Only the requested analytics load their YOLO models into GPU memory.
    """
    mapping = {
        "server":      ("server_room_worker",      "server_room_worker",      "server_room_worker_hls"),
        "crowd":       ("crowd_worker",            "crowd_worker",            "crowd_worker_hls"),
        "phone":       ("phone_worker",            "phone_worker",            "phone_worker_hls"),
        # ... 13 total analytics
    }
    module_name, rtsp_fn, hls_fn = mapping[analytic_name]
    module = importlib.import_module(f"workers.{module_name}")
    fn_name = rtsp_fn if mode == "rtsp" else hls_fn
    return getattr(module, fn_name)
```

---

## Scheduling & Assignment Flow

### Complete Scheduling Lifecycle

```mermaid
flowchart TD
    START([Admin Creates Exam]) --> EXAM[Exam Created start_date end_date skip_days skip_dates]
    EXAM --> SHIFT[Create Exam Shifts Morning 09:00-12:00 Afternoon 14:00-17:00]
    SHIFT --> SCRIPT[Assign Scripts to Shifts phone crowd server etc]
    
    SCRIPT --> BULK[Bulk Assignment Creation]
    BULK --> DATES{Calculate Assignable Dates}
    
    DATES -->|Filter| SKIP_DAYS[Remove skip_days eg Sunday]
    SKIP_DAYS --> SKIP_DATES[Remove skip_dates eg 2026-02-20]
    SKIP_DATES --> VALID[Valid Date Range 2026-02-15 to 2026-02-28]
    
    VALID --> INSERT[INSERT shift_script_assignments One row per date per script status PENDING]
    
    INSERT --> CRON[Scheduler Cron Job Runs every 1 minute]
    
    CRON --> CHECK{Check Time}
    CHECK -->|5 min before custom_start_time| READY[Assignment Ready]
    CHECK -->|Not yet| WAIT[Wait for next cycle]
    WAIT --> CRON
    
    READY --> POLL[Poller Fetches GET /executions/pending]
    POLL --> QUEUE[Queue Assignment Calculate delay]
    
    QUEUE --> DELAY{Delay greater than 0?}
    DELAY -->|Yes| SCHEDULE[asyncio.sleep delay]
    DELAY -->|No| IMMEDIATE[Run Immediately]
    
    SCHEDULE --> EXECUTE[Execute Script]
    IMMEDIATE --> EXECUTE
    
    EXECUTE --> RUNNING[Status RUNNING started_at NOW]
    RUNNING --> WORKER[Worker Process Detection Loop]
    
    WORKER --> TIMEOUT{Timeout Reached?}
    TIMEOUT -->|No| DETECT[Process Frame Save Detection]
    DETECT --> WORKER
    
    TIMEOUT -->|Yes| COMPLETE[Status COMPLETED completed_at NOW]
    COMPLETE --> PERSIST[Persist Results result_data images]
    
    PERSIST --> END([Assignment Complete])
    
    style EXAM fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style CRON fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style EXECUTE fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style COMPLETE fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
```

### Assignment Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> RUNNING
    RUNNING --> COMPLETED
    RUNNING --> FAILED
    RUNNING --> CANCELLED
    COMPLETED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

**Status Transitions:**

- **PENDING → RUNNING**: Poller picks up assignment at `scheduled_at` time
- **RUNNING → COMPLETED**: Script exits with code 0 OR timeout reached
- **RUNNING → FAILED**: Script exits with non-zero code OR exception thrown
- **RUNNING → CANCELLED**: Manual cancellation via `POST /executions/{id}/cancel`

**Status Metadata:**

| Status | Fields |
|--------|--------|
| PENDING | `created_at`, `scheduled_at`, `custom_start_time` |
| RUNNING | `started_at`, subprocess spawned, logs streaming |
| COMPLETED | `completed_at`, `result_data` (JSON), images saved |
| FAILED | `completed_at`, `error_log` |
| CANCELLED | `completed_at`, `error_log` |

---

## Data Flow & Persistence

### Detection Result Flow

```mermaid
graph LR
    subgraph Worker["Detection Worker"]
        FRAME[Frame Capture] --> INFER[GPU Inference]
        INFER --> DETECT[Detection Found]
    end
    
    subgraph Storage["Image Storage"]
        DETECT --> SAVE[Save JPG results detection]
        SAVE --> NAME[Filename Pattern camera date time uid.jpg]
    end
    
    subgraph Database["Database Reporting"]
        DETECT --> REPORT[db_client.report_to_db]
        REPORT --> INSERT[INSERT camera_report_hls rtsp]
        INSERT --> FIELDS[Fields unique_id camera_id detection_type confidence imageurl exam_id timestamp]
    end
    
    subgraph Live["Live Updates"]
        SAVE --> WATCH[File Watcher detection_watch_loop]
        WATCH --> EMIT[Socket.IO Emit detection:new]
        EMIT --> UI[Dashboard Update]
    end
    
    subgraph Client["Client Selection"]
        UI --> SELECT[Admin Selects Image]
        SELECT --> COPY[POST /client-detections/copy]
        COPY --> FLAG[UPDATE pushed_to_client = 1]
        COPY --> MOVE[Copy to client_selected_images]
    end
    
    style INFER fill:#ffd1dc,stroke:#ff69b4,stroke-width:2px
    style EMIT fill:#d4f1f4,stroke:#05445e,stroke-width:2px
```

### Vision Classification Persistence

```mermaid
sequenceDiagram
    participant Worker as vision_classification.py
    participant Backend as Node.js Backend
    participant DB as MySQL Database
    participant Camera as camera_links_hls rtsp
    
    Worker->>Worker: Fetch cameras from DB
    Worker->>Worker: Classify each camera frame using Qwen3-VL model
    
    Worker->>Backend: PUT /executions/id/status (status COMPLETED result_data classifications)
    
    Backend->>Backend: persistVisionClassifications
    
    loop For each classification
        Backend->>Camera: UPDATE classification = Exam Hall WHERE ch_code = camera_id
        Camera-->>Backend: Rows affected
    end
    
    Backend->>DB: UPDATE shift_script_assignments SET result_data.persisted_classification_updates
    
    Backend-->>Worker: Success response
    
    Note over Camera: classification column now populated Visible in Cameras tab
```

---

## Component Interactions

### Backend Services Architecture

```mermaid
graph TB
    subgraph API["Express API Layer"]
        AUTH[Auth Controller JWT Tokens]
        EXAM[Exam Controller CRUD Operations]
        CAM[Camera Controller Upload Excel]
        SHIFT[Shift Controller Schedule Management]
        SCRIPT[Script Controller Registry Sync]
        EXEC[Execution Controller Status Updates]
    end
    
    subgraph Service["Service Layer"]
        SCHED[Scheduler Service Cron Job]
        EXCEL[Excel Parser XLSX Processing]
        SMS[SMS Service Alert Notifications]
    end
    
    subgraph Data["Data Layer"]
        EXAM_M[Exam Model]
        SHIFT_M[ExamShift Model]
        CAMERA_M[CameraLink Models]
        SCRIPT_M[Script Model]
        ASSIGN_M[ShiftScriptAssignment Model]
        EXEC_M[ScriptExecution Model]
    end
    
    subgraph External["External Systems"]
        DB[(MySQL Database)]
        SCRIPT_SRV[Python Script Server]
        SMS_GW[SMS Gateway Hub]
    end
    
    AUTH --> EXAM
    EXAM --> CAM
    CAM --> SHIFT
    SHIFT --> SCRIPT
    SCRIPT --> EXEC
    
    SCHED --> ASSIGN_M
    EXCEL --> CAMERA_M
    SMS --> SMS_GW
    
    EXAM --> EXAM_M
    CAM --> CAMERA_M
    SHIFT --> SHIFT_M
    SCRIPT --> SCRIPT_M
    EXEC --> ASSIGN_M
    
    EXAM_M --> DB
    SHIFT_M --> DB
    CAMERA_M --> DB
    SCRIPT_M --> DB
    ASSIGN_M --> DB
    EXEC_M --> DB
    
    EXEC --> SCRIPT_SRV
    
    style SCHED fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style SCRIPT_SRV fill:#e1f8dc,stroke:#1b4d3e,stroke-width:2px
```

### Script Server Architecture

```mermaid
graph TB
    subgraph FastAPI["FastAPI Application"]
        MAIN[main.py FastAPI App]
        HEALTH[Health Endpoints]
        DETECT[Detection Endpoints]
        ANALYTICS[Analytics Endpoints]
    end
    
    subgraph Core["Core Services"]
        POLLER[Poller Service Async Polling]
        RUNNER[Script Runner Subprocess Manager]
        LOGMGR[Log Manager File-based Logging]
        WATCH[Detection Watcher File System Monitor]
    end
    
    subgraph Execution["Execution Layer"]
        MASTER[master_pipeline.py]
        VISION[vision_classification.py]
        WORKERS[Worker Modules phone crowd etc]
    end
    
    subgraph Utilities["Utilities"]
        DB_CLIENT[db_client.py MySQL Direct Access]
        CAM_LOADER[camera_loader.py DB Query Helper]
        STREAM[stream_utils.py Video Capture]
    end
    
    subgraph Infrastructure["Infrastructure"]
        SOCKET[Socket.IO Server Live Updates]
        LOGS[Named Log Files scripts logs]
        RESULTS[Detection Images results detection]
    end
    
    MAIN --> POLLER
    MAIN --> WATCH
    MAIN --> SOCKET
    
    POLLER --> RUNNER
    RUNNER --> LOGMGR
    RUNNER --> MASTER
    RUNNER --> VISION
    
    MASTER --> WORKERS
    VISION --> DB_CLIENT
    WORKERS --> DB_CLIENT
    WORKERS --> STREAM
    
    MASTER --> CAM_LOADER
    CAM_LOADER --> DB_CLIENT
    
    RUNNER --> LOGS
    WORKERS --> RESULTS
    WATCH --> RESULTS
    WATCH --> SOCKET
    
    style POLLER fill:#d4f1f4,stroke:#05445e,stroke-width:2px
    style MASTER fill:#e1f8dc,stroke:#1b4d3e,stroke-width:3px
    style SOCKET fill:#fff3e0,stroke:#f57c00,stroke-width:2px
```

---

## Key Concepts Summary

### 1. **Distributed Architecture**
- **Backend**: Node.js handles API, scheduling, and database operations
- **Script Server**: Python handles heavy computation, GPU inference, and video processing
- **Separation of Concerns**: Backend manages state, Script Server executes workloads

### 2. **Scheduling Strategy**
- **Proactive Scheduling**: Scheduler creates assignments 5 minutes before shift start
- **Polling Model**: Script server polls for upcoming assignments every 30 seconds
- **Precise Timing**: Poller uses `asyncio.sleep()` to fire scripts at exact `scheduled_at` time
- **Overnight Shifts**: Supports shifts that cross midnight (end_at on next day)

### 3. **Execution Isolation**
- **Process per Assignment**: Each script runs in isolated subprocess
- **Environment Variables**: Metadata passed via ENV vars (EXAM_ID, SHIFT_ID, etc.)
- **Named Logs**: Separate log file per script execution for debugging
- **Graceful Shutdown**: SIGTERM handling for clean resource cleanup

### 4. **Pipeline Optimization**
- **RTSP**: One FFmpeg process per camera, frames distributed to multiple workers
- **HLS**: One worker per analytics type, manages pool of camera threads
- **Lazy Loading**: Workers only load their required YOLO models
- **GPU Batching**: Accumulates frames for efficient batch inference

### 5. **Data Persistence**
- **Dual Storage**: Images saved to filesystem, metadata to MySQL
- **Unique IDs**: Each detection has UUID for tracking and client selection
- **Live Updates**: Socket.IO broadcasts new detections in real-time
- **Classification Storage**: Vision results persisted to camera_links table

### 6. **Error Handling**
- **Retry Logic**: RTSP producer re-authenticates after 10 frame failures
- **Timeout Management**: Scripts terminated gracefully after duration_minutes
- **Status Tracking**: PENDING → RUNNING → COMPLETED/FAILED/CANCELLED
- **Log Preservation**: All stdout/stderr captured for post-mortem analysis

---

## Appendix: Script Registry

### Available Analytics Scripts

| Script Code | Name | Description | Link Type | Worker Module |
|-------------|------|-------------|-----------|---------------|
| `phone` | Phone Detection | Detects mobile phone usage | RTSP/HLS | phone_worker.py |
| `crowd` | Crowd Detection | Detects crowding | RTSP/HLS | crowd_worker.py |
| `crowd_zero` | Zero Person Detection | Detects empty rooms | HLS | crowd_zero_det_worker.py |
| `crowd_five` | Low Person Count (<5) | Detects low occupancy | HLS | crowd_five_det_worker.py |
| `server` | Server Room Detection | Detects unauthorized access | RTSP/HLS | server_room_worker.py |
| `intruder` | Intruder Detection | Detects unauthorized persons | RTSP/HLS | intruder_worker.py |
| `entry_exit` | Entry/Exit Tracking | Tracks movement patterns | RTSP/HLS | entry_exit_worker.py |
| `proximity` | Proximity Detection | Detects close proximity violations | RTSP/HLS | close_proximity_worker.py |
| `invigilator` | Invigilator Tracking | Tracks invigilator presence | RTSP/HLS | invigilator_worker.py |
| `vision` | Scene Classification | Classifies camera scenes (Qwen3-VL) | RTSP/HLS | vision_classification.py |
| `inversion` | Camera Inversion | Detects rotated/inverted cameras | HLS | camera_inversion_worker.py |
| `tampering` | Camera Tampering | Detects blur/blockage/tampering | HLS | camera_tampering_worker.py |
| `blind_spot` | Blind Spot Detection | Detects blind spots and static issues | HLS | blind_spot_worker.py |

