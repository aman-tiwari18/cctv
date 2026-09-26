-- Migration: persist the operator "Skip" decision
-- Date: 2026-09-24 (ported from new_dev)
-- The admin/operator Detections page already had a "Skip" button (grid card +
-- list-view left-arrow), but it only removed the item from local React state —
-- nothing was persisted, so a refresh (or another operator's session) brought
-- the same detection right back with no record anyone had reviewed it. These
-- columns give skip the same durability push/accept/remove already have.

ALTER TABLE camera_report_hls
ADD COLUMN skipped TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Set to 1 when an operator reviews this detection and chooses not to push it';
ALTER TABLE camera_report_hls
ADD COLUMN skipped_at DATETIME DEFAULT NULL;

ALTER TABLE camera_report_rtsp
ADD COLUMN skipped TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Set to 1 when an operator reviews this detection and chooses not to push it';
ALTER TABLE camera_report_rtsp
ADD COLUMN skipped_at DATETIME DEFAULT NULL;
