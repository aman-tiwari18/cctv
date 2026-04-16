USE cctv_monitoring;

-- Add unique_id column to camera_report_hls for UUID-based detection tracking
ALTER TABLE camera_report_hls
    ADD COLUMN unique_id VARCHAR(50) DEFAULT NULL AFTER detection_type;

-- Add index for faster lookups by unique_id
ALTER TABLE camera_report_hls
    ADD INDEX idx_unique_id (unique_id);
