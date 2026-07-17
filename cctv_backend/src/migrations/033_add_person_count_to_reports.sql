-- Migration: person_count + threshold on detection reports
-- Date: 2026-07-17
-- The NTA "Max People Threshold" DLT template (Serverroom) renders
--   "Max people threshold crossed: <n> persons are in the <cam>. Max Threshold: <t>"
-- so the SMS layer needs both numbers. The server-room worker already computed
-- them (person_count from YOLO, threshold from server_room_constants) but only
-- logged them — nothing reached the DB.
--
-- Why not reuse `events`: every analytic's reporter inserts a hardcoded 1 there
-- and ReportController reads it, so repurposing it would change the meaning of
-- existing reports fleet-wide.
--
-- Pre-existing rows stay NULL: only detections captured after the worker rollout
-- carry these values, and sendAlertWithConfig() skips a message whose
-- placeholders cannot be filled rather than sending a malformed DLT text.
--
-- ORDER: run this BEFORE deploying the worker change — the new reporters insert
-- these columns, and the INSERT fails if they do not exist yet.

ALTER TABLE camera_report_rtsp
ADD COLUMN person_count INT DEFAULT NULL
COMMENT 'People detected in the frame; NULL for analytics that do not count'
AFTER events;

ALTER TABLE camera_report_rtsp
ADD COLUMN threshold INT DEFAULT NULL
COMMENT 'Per-TC-code threshold that this detection crossed'
AFTER person_count;

ALTER TABLE camera_report_hls
ADD COLUMN person_count INT DEFAULT NULL
COMMENT 'People detected in the frame; NULL for analytics that do not count'
AFTER events;

ALTER TABLE camera_report_hls
ADD COLUMN threshold INT DEFAULT NULL
COMMENT 'Per-TC-code threshold that this detection crossed'
AFTER person_count;
