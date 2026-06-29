-- Migration: SMS alert fields for admin→client push
-- Date: 2026-06-24
-- - shift_script_assignments.sms_enabled : per-assignment toggle for SMS alerts
-- - exams.observer_phone                 : per-exam NTA observer recipient (env fallback)
-- - camera_report_*.sms_sent / sms_sent_at : marks a pushed detection whose SMS was sent

-- Per-assignment SMS toggle (set when scheduling invigilator/proximity scripts)
ALTER TABLE shift_script_assignments
ADD COLUMN sms_enabled TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'When 1, pushing a detection from this scheduled script sends an SMS alert';

-- Per-exam observer recipient number(s); comma-separated allowed. Falls back to
-- ALERT_PHONE_NUMBERS in .env when NULL/empty.
ALTER TABLE exams
ADD COLUMN observer_phone VARCHAR(64) DEFAULT NULL
COMMENT 'NTA observer phone for SMS alerts, falls back to ALERT_PHONE_NUMBERS env';

-- Mark which pushed detections had an SMS sent (for the client-image badge)
ALTER TABLE camera_report_hls
ADD COLUMN sms_sent TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE camera_report_hls
ADD COLUMN sms_sent_at DATETIME DEFAULT NULL;

ALTER TABLE camera_report_rtsp
ADD COLUMN sms_sent TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE camera_report_rtsp
ADD COLUMN sms_sent_at DATETIME DEFAULT NULL;
