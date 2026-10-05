-- Migration: record when a detection was pushed to the client
-- Date: 2026-09-25 (ported from new_dev)
-- The client feed was ordered by created_at (when the camera saw it), but an
-- operator can push an hours-old detection, which then landed mid-list instead
-- of at the top — so the client page couldn't page through new pushes in
-- order. pushed_at is the client feed's order key. Rows already pushed get
-- updated_at as a best-effort backfill (it's set on push, though any later
-- update also moves it).

ALTER TABLE camera_report_hls
ADD COLUMN pushed_at TIMESTAMP NULL DEFAULT NULL
COMMENT 'When an operator pushed this detection to the client (client feed order)';
ALTER TABLE camera_report_rtsp
ADD COLUMN pushed_at TIMESTAMP NULL DEFAULT NULL
COMMENT 'When an operator pushed this detection to the client (client feed order)';

UPDATE camera_report_hls SET pushed_at = COALESCE(updated_at, created_at) WHERE pushed_to_client = 1 AND pushed_at IS NULL;
UPDATE camera_report_rtsp SET pushed_at = COALESCE(updated_at, created_at) WHERE pushed_to_client = 1 AND pushed_at IS NULL;

ALTER TABLE camera_report_hls ADD INDEX idx_pushed_at (pushed_at);
ALTER TABLE camera_report_rtsp ADD INDEX idx_pushed_at (pushed_at);
