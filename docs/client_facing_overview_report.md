# CCTV Intelligent Monitoring Platform
### Solution Overview

A CCTV monitoring platform that uses AI to watch live camera feeds, detect security and integrity violations, and alert the right people. Every AI detection is checked by a human reviewer before it reaches observers. The platform is proven at national scale, currently monitoring examination centres during major exams, and built to work for any large, distributed camera network.

| **40,000+** | **1,00,000** | **16** |
|---|---|---|
| Concurrent camera streams processed in one deployment — *Proven, NEET 2026* | Concurrent camera capacity the platform is built for — *Engineered Target* | Detection analytics, each matched to the camera category it applies to — *In Production* |

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Detection Engine | FastAPI (Python) | Runs the AI models on every camera feed |
| Application Backend | Node.js | Manages exams, schedules, cameras and alerts |
| Client Dashboard | React.js | Live monitoring for observers and staff |
| Database | MySQL | Stores cameras, detections and reports |

## AI Models in Use

- **YOLO26 — Object & Person Detection**: Counts people, spots phones and other items, and tracks movement on every camera it processes.
- **vLLM (Qwen3-VL) — Scene Classification**: Classifies what each reachable camera is looking at (Computer Lab, Entry, Server Room) so only the right analytics run on it.

---

## End-to-End Workflow

1. **Connect & Check Accessibility** *(Automated)* — Each camera is connected over its RTSP or HLS link. Offline or unreachable cameras are marked and skipped.
2. **Classify Camera Category** *(AI · vLLM)* — Every accessible camera is classified: Computer Lab, Entry, Server Room, Outside Area and more.
3. **Scheduled Detection** *(AI · YOLO26)* — During each shift, fresh frames are checked by only the analytics that apply to that camera's category.
4. **Detection Logged** *(Automated)* — The snapshot is saved with the violation highlighted, plus camera, centre, TC code, shift and time.
5. **Manual Review** *(Human Verified)* — Trained annotators review every detection and filter out false positives before anything goes further.
6. **Live Alerts to Observers** *(Dashboard + SMS)* — Verified detections reach the observers' Live Alerts, and an SMS goes to the observers of that centre.

## What Observers Can Do on the Dashboard

- **Live Alerts** — Verified detections appear as they are pushed, backed by an SMS to the centre's observers.
- **Detection Evidence** — Every alert opens its snapshot with the violation highlighted, plus camera, centre, TC code and shift.
- **Search & Filter** — Search by centre name or location; filter by exam name, shift timing and analytic type.
- **Camera Health** — Live count of accessible vs. offline cameras per exam and shift, so coverage gaps are visible.
- **Downloadable Shift Reports** — Download a summary report for any shift with every detection, its snapshot and camera details.
- **Exam & Shift Scheduling** — Analytics run only inside each exam's shift windows, with timing and camera categories set per shift.

---

## Supported Camera Links

- **RTSP — Direct Camera & DVR/NVR Streams**: Connects straight to IP cameras and DVR/NVR recorders over the standard RTSP streaming protocol.
- **HLS — Web Streaming Links**: Connects to camera feeds published as HLS web streams, such as those served by third-party CCTV portals.

## In Practice — A Real Detection

Phone detected during the RE-NEET examination, 21 June 2026 (image: `/data/nfs/cctv_images/phone_detection/phone_1001800_9_exam25_shift128_gpu11_20260621_141758_d77d4486-733f-4f2e-96ed-bc04c4564427.jpg`).

| Analytic | Exam | Detected |
|---|---|---|
| Phone Detection | RE-NEET (NTA) · Shift 1 | 21 June 2026, 02:17 PM |
| **Centre** | **Location** | **Camera** |
| E.M.G Yadava Women's College (Centre A) | Madurai, Tamil Nadu · TC 4106101 | Computer Lab · RTSP link |

Reviewed by an annotator and pushed to the observers' Live Alerts.

---

## Analytics We Run

16 detection analytics in production, each running only on the cameras it applies to.

| Analytic | What It Flags |
|---|---|
| **Exam Hall Integrity** | |
| Phone | A mobile phone visible in the exam hall or a secure room |
| Close Proximity | Candidates seated or standing too close to each other |
| Invigilator | No invigilator in the room, or one standing still in one spot for over 7 minutes |
| Crowd < 5 | Fewer than 5 candidates present in an exam room |
| Zero Person | An exam room found completely empty |
| Crowd — Biometric | More than 5 people bunched together in one tight group |
| Blind Spot | Part of the camera view blocked, leaving areas unmonitored |
| Improper Furniture | Overturned, broken or missing seats in the exam hall |
| **Entry & Perimeter** | |
| Crowd | More than 10 people gathered at a gate or outside the centre |
| Entry Exit | People moving through the entry or exit gate during the exam |
| **Restricted Areas** | |
| Intruder | Anyone present in a restricted area during a restricted window, such as before the exam starts |
| Server Room Access | People present inside the server room |
| Strong Room Movement | Any movement inside the secured strong room |
| QP Box | The question-paper box missing from its expected place |
| **Camera Integrity** | |
| Camera Tampering | A camera that has been blocked, covered or blurred |
| Camera Inversion | A camera mounted or feeding upside down |

---

*Prepared for client presentation — CCTV Intelligent Monitoring Platform · Confidential*
