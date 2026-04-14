USE cctv_monitoring;

-- Create Report table for HLS cameras
CREATE TABLE IF NOT EXISTS camera_report_hls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NULL,
    shift_id INT NULL,
    city VARCHAR(255) NULL,
    center_name VARCHAR(255) NULL,
    camera_id INT NULL, -- Reference to camera_links_hls.id
    camera_name VARCHAR(255) NULL,
    camera_category VARCHAR(255) NULL,
    tc_code VARCHAR(255) NULL,
    ch_code VARCHAR(255) NULL,
    state VARCHAR(255) NULL,
    camera_status VARCHAR(50) NULL,
    events INT DEFAULT 0,
    rejected_events INT DEFAULT 0,
    date_time VARCHAR(100) NULL, -- Manual entry field (dd/mm/yyyy HH:MM:SS)
    imageurl TEXT NULL,
    detection_type VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL,
    INDEX idx_camera_id (camera_id),
    INDEX idx_exam_shift (exam_id, shift_id)
);