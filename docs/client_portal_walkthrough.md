# Client Portal Walkthrough

A structured walkthrough of the client-facing (VIEWER role) side of the CCTV monitoring portal, for use when presenting the site to clients. Organized in the order a client would naturally navigate.

## 1. Login & Access Model

- Each client logs in with their own account, scoped to their **company** (e.g., UPCISB, NTA, SSC) — they only ever see exams/cameras/detections belonging to their own exam body.
- One account can belong to **multiple companies** if needed (a person working across clients gets one login, memberships added/approved independently).
- Role-based menu: clients (VIEWER role) see a simplified nav — **Dashboard, Exams, Cameras, Detections, Video Uploads** — no admin-only sections (Schedule Analysis, Executions, GPU Monitor, User Verification).

## 2. Dashboard (landing page)

- Live overview cards: exam status breakdown — **Scheduled / Ongoing / Completed**.
- Camera health at a glance: **Accessible / Inaccessible** counts.
- Detection summary by outcome: **Pending / Removed** (and Accepted, via the badge shown per row elsewhere).
- **Today's Script Distribution** card — shows which detection scripts are running for the selected exam, live.
- **Live Exams** widget — real-time list of exams currently in progress.
- Date-range filters (Last week / Last month) to review historical activity, not just today.

## 3. Exams

- Read-only list of all exams belonging to the client's company (active exams only).
- Per-exam **detection count** shown inline — a quick health signal without drilling in.
- Day-of-week/shift context surfaced so the client can correlate detections to a specific exam day.

## 4. Cameras

- Full camera inventory for the exam: **Camera Name, Channel Id (Ch Code), TC Code, Centre Name, City, State, Camera Category, Classification, Status**.
- Filter by **shift** and **exam date** — camera lists correctly narrow per day for multi-day exams.
- Status badge: **Accessible** vs **Not Accessible** — tells the client at a glance which streams are actually live.
- **"Open frame"** — click-through to view the actual classification snapshot captured for that camera (or "No frame captured yet" if classification hasn't run). Good moment to show them the AI is literally looking at their rooms.
- Supports both **HLS** and **RTSP** stream types, with the relevant columns (Device ID/Camera No for RTSP).

## 5. Detections (the core feature)

Live feed of every AI-flagged event across all detection types:

- Crowd (Entry/Exit, Biometric)
- Intruder, Invigilator, Proximity, Phone, Blind Spot
- Server Room, Entry/Exit Movement
- Camera Inversion, Camera Tampering
- Improper Furniture, QP Box, Strong Room Movement

Each row shows: camera name/no, center name, city, TC code, detection type, timestamp, and the **snapshot image** ("Click to open image").

**Client actions per detection:**

- **Accept** — client confirms the alert is real; this triggers the DLT-compliant **SMS alert** to the registered observer numbers automatically (visible via the SMS-sent badge on the row).
- **Remove** — client dismisses a false positive; it drops off their active feed (but is retained, see below).

Filters: date, source, detection type, camera/city search — lets a client narrow down to exactly what they're auditing.

## 6. Removed Detections (accountability trail)

- Separate page showing everything a client has **removed** from their feed — nothing is silently deleted.
- Same rich filtering as the main feed (date, source, detection type).
- Emphasize to clients: **removal is reversible and auditable** — nothing dismissed just disappears from the system.

## 7. Video Uploads

- Client-facing area for exam-related **media** — recent uploads, live images, and videos, searchable/selectable by **TC code**.
- Useful for showing physical evidence tied to a specific center outside the automated detection feed.

## 8. Reports (available via download, not a nav page)

Client-specific Excel export, distinct from the admin export:

- Per-shift camera summary sheet with **Channel Id**, camera status, and event counts.
- Detections List sheet with a **Status** column (Accepted / Rejected / Not Verified) — cleaner for a client audience than a raw 0/1 flag.
- Hyperlinked "View" column straight to each detection's image.

## 9. Trust & Compliance Talking Points

- SMS alerts use the client's own **DLT-registered templates** (exact wording match required by Indian telecom regulation) — worth showing them their own template text is what actually gets sent.
- Detection pipeline runs on dedicated GPU infrastructure processing their camera feeds in near-real-time across the exam's full shift schedule, not on a delay.
