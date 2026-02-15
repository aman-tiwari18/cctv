-- CCTV Exam Monitoring System Database Schema
-- Created: 2026-02-14

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS cctv_monitoring CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cctv_monitoring;

-- ============================================
-- Table: exams
-- Stores exam information and configuration
-- ============================================
CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_name VARCHAR(255) NOT NULL,
  exam_body VARCHAR(100) NOT NULL COMMENT 'e.g., TCS, SSC, etc.',
  link_type ENUM('RTSP', 'HLS') NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exam_body (exam_body),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: camera_links
-- Stores CCTV camera stream URLs and metadata
-- ============================================
CREATE TABLE IF NOT EXISTS camera_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  camera_id VARCHAR(100) NOT NULL COMMENT 'Unique camera identifier',
  stream_url TEXT NOT NULL COMMENT 'RTSP or HLS stream URL',
  stream_type ENUM('RTSP', 'HLS') NOT NULL,
  location VARCHAR(255) COMMENT 'Physical location or room number',
  metadata JSON COMMENT 'Additional camera metadata',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  UNIQUE KEY unique_camera_per_exam (exam_id, camera_id),
  INDEX idx_exam_id (exam_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: exam_schedules
-- Stores exam dates
-- ============================================
CREATE TABLE IF NOT EXISTS exam_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  exam_date DATE NOT NULL,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  UNIQUE KEY unique_exam_date (exam_id, exam_date),
  INDEX idx_exam_date (exam_date),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: schedule_shifts
-- Stores time shifts for each exam date
-- ============================================
CREATE TABLE IF NOT EXISTS schedule_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  shift_name VARCHAR(100) NOT NULL COMMENT 'e.g., Morning Shift, Afternoon Shift',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES exam_schedules(id) ON DELETE CASCADE,
  INDEX idx_schedule_id (schedule_id),
  INDEX idx_start_time (start_time),
  INDEX idx_is_active (is_active),
  CHECK (end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: analytics_tasks
-- Stores monitoring/analytics task configuration
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  task_name VARCHAR(255) NOT NULL,
  description TEXT,
  script_path VARCHAR(500) NOT NULL COMMENT 'Path to the monitoring script on script server',
  frequency_minutes INT NOT NULL COMMENT 'How often to run (in minutes)',
  duration_minutes INT COMMENT 'How long the task should run',
  start_time TIME COMMENT 'Daily start time for the task',
  end_time TIME COMMENT 'Daily end time for the task',
  parameters JSON COMMENT 'Additional parameters to pass to the script',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_exam_id (exam_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: script_executions
-- Tracks script execution status and results
-- ============================================
CREATE TABLE IF NOT EXISTS script_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_id INT,
  camera_link_id INT,
  analytics_task_id INT NOT NULL,
  status ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
  scheduled_time DATETIME NOT NULL,
  started_at DATETIME,
  completed_at DATETIME,
  error_log TEXT,
  result_data JSON COMMENT 'Results returned by the script',
  execution_metadata JSON COMMENT 'Additional execution metadata',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES schedule_shifts(id) ON DELETE SET NULL,
  FOREIGN KEY (camera_link_id) REFERENCES camera_links(id) ON DELETE SET NULL,
  FOREIGN KEY (analytics_task_id) REFERENCES analytics_tasks(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_scheduled_time (scheduled_time),
  INDEX idx_shift_id (shift_id),
  INDEX idx_analytics_task_id (analytics_task_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: users
-- Stores user authentication information
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role ENUM('ADMIN', 'OPERATOR', 'VIEWER') DEFAULT 'VIEWER',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Insert default admin user
-- Password: admin123 (should be changed immediately)
-- ============================================
INSERT INTO users (username, email, password_hash, full_name, role) 
VALUES (
  'admin', 
  'admin@example.com', 
  '$2a$10$sPWmm5xLOruCv.hDLs3BW.RZvgbGa3w32IwEiJKr.q19F7mXQyN/m', 
  'System Administrator', 
  'ADMIN'
) ON DUPLICATE KEY UPDATE username=username;

-- ============================================
-- Create views for easier querying
-- ============================================

-- View: upcoming_shifts
-- Shows all upcoming shifts with exam details
CREATE OR REPLACE VIEW upcoming_shifts AS
SELECT 
  ss.id AS shift_id,
  e.id AS exam_id,
  e.exam_name,
  e.exam_body,
  es.exam_date,
  ss.shift_name,
  ss.start_time,
  ss.end_time,
  CONCAT(es.exam_date, ' ', ss.start_time) AS shift_start_datetime,
  CONCAT(es.exam_date, ' ', ss.end_time) AS shift_end_datetime
FROM schedule_shifts ss
JOIN exam_schedules es ON ss.schedule_id = es.id
JOIN exams e ON es.exam_id = e.id
WHERE ss.is_active = TRUE 
  AND es.is_active = TRUE 
  AND e.is_active = TRUE
  AND es.exam_date >= CURDATE();

-- View: execution_summary
-- Provides execution statistics
CREATE OR REPLACE VIEW execution_summary AS
SELECT 
  e.exam_name,
  at.task_name,
  COUNT(*) AS total_executions,
  SUM(CASE WHEN se.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN se.status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN se.status = 'RUNNING' THEN 1 ELSE 0 END) AS running,
  SUM(CASE WHEN se.status = 'PENDING' THEN 1 ELSE 0 END) AS pending
FROM script_executions se
JOIN analytics_tasks at ON se.analytics_task_id = at.id
JOIN exams e ON at.exam_id = e.id
GROUP BY e.exam_name, at.task_name;
