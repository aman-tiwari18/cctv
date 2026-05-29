-- Add frame_path column to camera_links_hls (RTSP table already has it).
-- Stores the absolute filesystem path of the last classification frame on the
-- script-server so the UI can render a preview image per camera.
ALTER TABLE camera_links_hls
ADD COLUMN frame_path TEXT DEFAULT NULL;
