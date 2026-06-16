# CCTV Capacity & Specification Report
### AI-Powered CCTV Surveillance & Violation Detection System

This system provides automated, AI-driven monitoring of CCTV camera feeds —
purpose-built for exam-centre and high-security surveillance. It captures frames
from the camera streams and analyses them to understand each scene and detect
violations in near real time — with snapshot evidence on a central dashboard.

| 1,00,000 | 20 | ~2.8 TB | 24×7 |
|:--:|:--:|:--:|:--:|
| Cameras supported | NVIDIA H200 GPUs | Total GPU memory | Automated operation |

---

## Hardware & Compute Capacity

The system runs on data-centre-class NVIDIA H200 GPUs across two server types: four
single-GPU servers and two high-density servers that each carry eight H200 GPUs and
2 TB of system RAM.

| Resource | Specification |
|---|---|
| GPU type | NVIDIA H200 NVL — 141 GB per GPU |
| Total GPUs | 20 (~2,820 GB / ~2.8 TB total GPU memory) |
| Single-GPU servers | 4 servers × 1 H200, 128 GB RAM each |
| High-density servers | 2 servers × 8 H200 (~1.15 TB VRAM each), 2 TB RAM each |
| Total system RAM | ~4.5 TB (4 × 128 GB + 2 × 2 TB) |

## Key Specifications

| Capability | Current Standing |
|---|---|
| Cameras supported | Up to 1,00,000 (1 lakh) cameras |
| Camera link types | RTSP and HLS |
| Processing | Every camera classified, then monitored for violations |
| Violation types | 15+ (phone, crowd, intruder, proximity, etc.) |
| Evidence | Snapshot + timestamp logged for every detected incident |
| Availability | Continuous 24×7 automated operation |

---

## How the System Works — Per-Camera Flow

Every camera follows the same two-step journey. The system first classifies the
camera to understand what it shows, then runs violation detection — but only on
cameras that are successfully classified and accessible.

**Step 1 — Scene Classification**

1. **Check accessibility.** The system first connects to the camera and confirms it is
   reachable. Cameras that are offline or unreachable are marked inaccessible and skipped.
2. **Capture a frame.** For an accessible camera, a single frame is captured from the stream.
3. **Classify the scene.** The frame is sent to a Vision-Language AI model (Qwen3-VL) that
   identifies the scene — e.g. Computer Lab, Server Room, Entry or Parking Lot. Frames that
   are dark, blank or unclear are labelled "Uncertain / Obstructed"; all others are assigned
   their scene category.

**Step 2 — Violation Detection** (on accessible, classified cameras)

4. **Detect.** At a set interval the system captures a fresh frame and runs high-speed
   object-detection models (YOLO), matched to the camera's scene, to look for
   violations — people, phones, crowding, movement in restricted zones, and more.
5. **Act.** If a violation is found, the system saves a snapshot as evidence, logs the
   incident (camera, type and time), and surfaces it on the operator dashboard. The
   cycle repeats continuously, so violations appear in near real time.

```
  Check accessibility  ─►  Capture frame  ─►  Classify (vLLM)
        Capture fresh frame  ─►  YOLO detection  ─►  Violation?  ─►  Snapshot + log + alert
```

## Violations & Events Detected

| Category | Catches | Category | Catches |
|---|---|---|---|
| Phone | phone usage in monitored areas | Server Room | people or movement in server rooms |
| Crowd | overcrowding at entry/exit & biometric | Entry/Exit | movement patterns at doorways |
| Low/Zero Occupancy | empty or understaffed rooms | Invigilator | invigilator presence & movement |
| Proximity | candidates sitting too close | Tampering | blur, blockage or feed interference |
| Intruder | unauthorised persons in protected areas | Inversion | rotated or wrongly mounted cameras |
| Strong Room | movement inside secured rooms | Blind Spot | partial visibility or frozen feeds |
| QP Box | question-paper box presence/absence | | |
