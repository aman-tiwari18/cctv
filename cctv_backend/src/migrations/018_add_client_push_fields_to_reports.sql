-- Migration: Add pushed_to_client and remove_from_client fields to camera report tables
-- Date: 2026-04-23

-- Update camera_report_hls table
-- Add pushed_to_client (will fail silently if exists)
ALTER TABLE camera_report_hls 
ADD COLUMN pushed_to_client TINYINT(1) NOT NULL DEFAULT 0;

-- Add remove_from_client (will fail silently if exists)
ALTER TABLE camera_report_hls 
ADD COLUMN remove_from_client TINYINT(1) NOT NULL DEFAULT 0;

-- Update camera_report_rtsp table
-- Add pushed_to_client (will fail silently if exists)
ALTER TABLE camera_report_rtsp 
ADD COLUMN pushed_to_client TINYINT(1) NOT NULL DEFAULT 0;

-- Add remove_from_client (will fail silently if exists)
ALTER TABLE camera_report_rtsp 
ADD COLUMN remove_from_client TINYINT(1) NOT NULL DEFAULT 0;

-- Add indexes (will fail silently if exists)
ALTER TABLE camera_report_hls 
ADD INDEX idx_pushed_to_client (pushed_to_client);

ALTER TABLE camera_report_rtsp 
ADD INDEX idx_pushed_to_client (pushed_to_client);

ALTER TABLE camera_report_hls 
ADD INDEX idx_exam_detection_type (exam_id, detection_type);

ALTER TABLE camera_report_rtsp 
ADD INDEX idx_exam_detection_type (exam_id, detection_type);

ALTER TABLE camera_report_hls 
ADD INDEX idx_exam_pushed (exam_id, pushed_to_client);

ALTER TABLE camera_report_rtsp 
ADD INDEX idx_exam_pushed (exam_id, pushed_to_client);
