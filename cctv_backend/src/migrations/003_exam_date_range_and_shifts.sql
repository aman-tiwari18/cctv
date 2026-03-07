-- Migration: Add exam date range, skip configuration, and exam_shifts table

-- Add date range and skip fields to exams table
ALTER TABLE exams ADD COLUMN start_date DATE DEFAULT NULL;
ALTER TABLE exams ADD COLUMN end_date DATE DEFAULT NULL;
ALTER TABLE exams ADD COLUMN skip_days JSON DEFAULT NULL;
ALTER TABLE exams ADD COLUMN skip_dates JSON DEFAULT NULL;

-- Create exam_shifts table (template shifts at exam level)
CREATE TABLE IF NOT EXISTS exam_shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NOT NULL,
    shift_name VARCHAR(255) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    INDEX idx_exam_shifts_exam_id (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
