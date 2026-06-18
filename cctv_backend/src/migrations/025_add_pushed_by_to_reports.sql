-- Migration: Add pushed_by field to camera report tables
-- Date: 2026-06-08
-- Stores the user id of the operator who pushed the detection to the client.

-- camera_report_hls
ALTER TABLE camera_report_hls
ADD COLUMN pushed_by INT NULL DEFAULT NULL;

-- camera_report_rtsp
ALTER TABLE camera_report_rtsp
ADD COLUMN pushed_by INT NULL DEFAULT NULL;

-- Indexes for "who pushed" lookups
ALTER TABLE camera_report_hls
ADD INDEX idx_pushed_by (pushed_by);

ALTER TABLE camera_report_rtsp
ADD INDEX idx_pushed_by (pushed_by);
