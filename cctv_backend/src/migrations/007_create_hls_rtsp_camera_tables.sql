USE cctv_monitoring;

-- Create HLS cameras table
CREATE TABLE IF NOT EXISTS camera_links_hls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    tc_name VARCHAR(255) NULL,
    tc_code VARCHAR(255) NULL,
    camera_name VARCHAR(255) NULL,
    date_of_assessment VARCHAR(255) NULL,
    shift_of_assessment VARCHAR(255) NULL,
    url TEXT NOT NULL,
    camera_category VARCHAR(255) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- Create RTSP cameras table
CREATE TABLE IF NOT EXISTS camera_links_rtsp (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    tc_name VARCHAR(255) NULL,
    tc_code VARCHAR(255) NULL,
    camera_name VARCHAR(255) NULL,
    city VARCHAR(255) NULL,
    state VARCHAR(255) NULL,
    url TEXT NOT NULL,
    camera_category VARCHAR(255) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
