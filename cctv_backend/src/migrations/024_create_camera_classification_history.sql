USE cctv_monitoring;

-- Per-run classification history for HLS cameras.
-- Each vision classification run inserts one row per classified camera so the
-- full history of (camera, shift, date) → classification can be reviewed.
CREATE TABLE IF NOT EXISTS camera_classification_hls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camera_id INT NOT NULL,            -- camera_links_hls.id
    shift_id INT NULL,
    exam_date DATE NULL,
    frame_path TEXT NULL,
    classification VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_camera_id (camera_id),
    INDEX idx_shift_date (shift_id, exam_date),
    INDEX idx_created_at (created_at)
);

-- Per-run classification history for RTSP cameras.
CREATE TABLE IF NOT EXISTS camera_classification_rtsp (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camera_id INT NOT NULL,            -- camera_links_rtsp.id
    shift_id INT NULL,
    exam_date DATE NULL,
    frame_path TEXT NULL,
    classification VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_camera_id (camera_id),
    INDEX idx_shift_date (shift_id, exam_date),
    INDEX idx_created_at (created_at)
);
