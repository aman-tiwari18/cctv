USE cctv_monitoring;

-- Add unique constraint on exam_id and ch_code for HLS cameras to prevent duplicates
ALTER TABLE camera_links_hls ADD UNIQUE KEY unique_exam_ch_code (exam_id, ch_code);