USE cctv_monitoring;

-- Create Report table for RTSP cameras
CREATE TABLE IF NOT EXISTS camera_report_rtsp (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NULL,
    shift_id INT NULL,
    city VARCHAR(255) NULL,
    center_name VARCHAR(255) NULL,
    camera_id INT NULL, -- Reference to camera_links_rtsp.id
    device_id VARCHAR(255) NULL,
    camera_no VARCHAR(255) NULL,
    camera_name VARCHAR(255) NULL,
    tc_code VARCHAR(255) NULL,
    state VARCHAR(255) NULL,
    camera_status VARCHAR(50) NULL,
    events INT DEFAULT 0,
    date_time VARCHAR(100) NULL, -- Formatted timestamp
    imageurl TEXT NULL,
    detection_type VARCHAR(255) NULL,
    unique_id VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL,
    INDEX idx_device_camera (device_id, camera_no),
    INDEX idx_exam_shift (exam_id, shift_id),
    INDEX idx_unique_id (unique_id)
);
