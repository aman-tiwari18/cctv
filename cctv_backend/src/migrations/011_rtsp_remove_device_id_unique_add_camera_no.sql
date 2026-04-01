-- Remove unique constraint on device_id (allow duplicate device IDs across cameras)
ALTER TABLE camera_links_rtsp DROP INDEX device_id;

-- Add camera_no column
ALTER TABLE camera_links_rtsp ADD COLUMN camera_no VARCHAR(50) NULL AFTER camera_name;
