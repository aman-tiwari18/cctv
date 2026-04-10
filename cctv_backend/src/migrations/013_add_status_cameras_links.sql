-- Add status column to camera_links_hls and camera_links_rtsp
ALTER TABLE camera_links_hls
ADD COLUMN status VARCHAR(255) DEFAULT NULL;

ALTER TABLE camera_links_rtsp
ADD COLUMN status VARCHAR(255) DEFAULT NULL;