-- Migration 020: Composite indexes for new dashboard endpoints (/overview, /live-exams)
-- Additive only — no existing query plans are altered, only new ones get faster.

-- For "detections today" range scans (overview Detections card + live-exams Detections column).
-- Leading column created_at makes the range filter index-only friendly; trailing exam_id + shift_id
-- cover the GROUP BY shapes used by both endpoints.
ALTER TABLE camera_report_hls
  ADD INDEX idx_created_at_exam_shift (created_at, exam_id, shift_id);

ALTER TABLE camera_report_rtsp
  ADD INDEX idx_created_at_exam_shift (created_at, exam_id, shift_id);

-- For overview Scripts card today-by-status counts.
ALTER TABLE shift_script_assignments
  ADD INDEX idx_date_status (assignment_date, status, is_active);
