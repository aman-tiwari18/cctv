-- ============================================================
-- CCTV Exam Monitoring System — Full Database Schema
-- Updated: 2026-03-23
-- Based on Current Sequelize Models
-- Run this ONCE on a fresh database to create everything.
-- DB Engine: MySQL 8+ / MariaDB 10.5+
-- ============================================================

CREATE DATABASE IF NOT EXISTS cctv_monitoring
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cctv_monitoring;

-- ============================================================
-- Table: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255),
  role          ENUM('ADMIN', 'OPERATOR', 'VIEWER') DEFAULT 'VIEWER',
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMP NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_email    (email),
  INDEX idx_role     (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default admin user  (password: admin123 — change immediately)
INSERT INTO users (username, email, password_hash, full_name, role)
VALUES (
  'admin',
  'admin@example.com',
  '$2a$10$sPWmm5xLOruCv.hDLs3BW.RZvgbGa3w32IwEiJKr.q19F7mXQyN/m',
  'System Administrator',
  'ADMIN'
) ON DUPLICATE KEY UPDATE username = username;

-- ============================================================
-- Table: exams
-- Master exam records with date range and skip configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS exams (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  exam_name   VARCHAR(255) NOT NULL,
  exam_body   VARCHAR(255),
  link_type   VARCHAR(255),
  description TEXT,
  start_date  DATE COMMENT 'Exam start date',
  end_date    DATE COMMENT 'Exam end date',
  skip_days   JSON COMMENT 'Array of day names to skip, e.g. ["Saturday","Sunday"]',
  skip_dates  JSON COMMENT 'Array of specific dates to skip, e.g. ["2026-03-15","2026-03-20"]',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exam_body (exam_body),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: exam_shifts
-- Shifts defined at exam level (template for scheduling)
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_shifts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  exam_id     INT NOT NULL,
  shift_name  VARCHAR(255) NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_exam_shifts_exam_id (exam_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: analytics_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_tasks (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  exam_id             INT NOT NULL,
  task_name           VARCHAR(255) NOT NULL,
  description         TEXT,
  script_path         VARCHAR(500) NOT NULL,
  frequency_minutes   INT NOT NULL,
  duration_minutes    INT,
  start_time          TIME,
  end_time            TIME,
  parameters          JSON,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_exam_id   (exam_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Master registry of all available scripts
-- Independent of exams; used for assigning to shifts
-- ============================================================
CREATE TABLE IF NOT EXISTS scripts (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  script_id                 VARCHAR(100) NOT NULL UNIQUE COMMENT 'Technical identifier, e.g. face_detection',
  name                      VARCHAR(255) NOT NULL,
  default_frequency_minutes INT DEFAULT 5,
  default_duration_minutes  INT DEFAULT 1,
  is_active                 BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_script_id (script_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed scripts
INSERT INTO scripts (script_id, name, default_frequency_minutes, default_duration_minutes, is_active) VALUES
  ('server',      'Server Room Detection',  5, 1, 1),
  ('crowd',       'Crowd Detection',        5, 1, 1),
  ('intruder',    'Intruder Detection',     5, 1, 1),
  ('entry_exit',  'Entry Exit Detection',   5, 1, 1),
  ('proximity',   'Proximity Detection',    5, 1, 1),
  ('phone',       'Phone Detection',        5, 1, 1),
  ('invigilator', 'Invigilator Detection',  5, 1, 1)
ON DUPLICATE KEY UPDATE
  name        = VALUES(name);

-- ============================================================
-- Table: shift_script_assignments
-- Links scripts to exam shifts with per-date granularity
-- Unique constraint: (shift_id, script_id, assignment_date)
-- ============================================================
CREATE TABLE IF NOT EXISTS shift_script_assignments (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  shift_id                  INT NOT NULL COMMENT 'FK to exam_shifts.id',
  script_id                 INT NOT NULL COMMENT 'FK to scripts.id',
  analytics_task_id         INT COMMENT 'Backward compatibility, nullable',
  status                    ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') DEFAULT 'PENDING' COMMENT 'Execution status of this assignment',
  assignment_date           DATE NOT NULL COMMENT 'Date on which this assignment should run',
  custom_start_time         TIME,
  custom_end_time           TIME,
  custom_frequency_minutes  INT,
  notes                     TEXT,
  started_at                DATETIME,
  completed_at              DATETIME,
  error_log                 TEXT,
  result_data               JSON,
  is_active                 BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
  UNIQUE KEY unique_shift_task_date (shift_id, script_id, assignment_date),
  INDEX idx_shift_id (shift_id),
  INDEX idx_script_id (script_id),
  INDEX idx_status (status),
  INDEX idx_assignment_date (assignment_date),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: script_executions
-- Tracks script execution records and results
-- ============================================================
CREATE TABLE IF NOT EXISTS script_executions (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  shift_id                  INT COMMENT 'FK to exam_shifts.id',
  camera_link_id            INT COMMENT 'FK to camera_links_hls or camera_links_rtsp',
  script_id                 INT COMMENT 'FK to scripts.id',
  analytics_task_id         INT COMMENT 'Backward compatibility, nullable',
  status                    ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') DEFAULT 'PENDING',
  scheduled_time            DATETIME NOT NULL,
  started_at                DATETIME,
  completed_at              DATETIME,
  error_log                 TEXT,
  result_data               JSON,
  execution_metadata        JSON,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_scheduled_time (scheduled_time),
  INDEX idx_shift_id (shift_id),
  INDEX idx_script_id (script_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: camera_links_hls
-- HLS camera streams with structured metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS camera_links_hls (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  exam_id         INT NOT NULL,
  centre_name     VARCHAR(255) COMMENT 'Test centre name',
  tc_code         VARCHAR(255),
  city            VARCHAR(255),
  state           VARCHAR(255),
  camera_name     VARCHAR(255),
  ch_code         VARCHAR(255) COMMENT 'Unique channel key (ch_no from Excel)',
  cctv_url        TEXT NOT NULL,
  camera_category VARCHAR(255),
  classification  VARCHAR(255),
  exam_date       DATE COMMENT 'Date of assessment',
  shift_id        INT COMMENT 'FK to exam_shifts, NULL means applies to all shifts',
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL,
  INDEX idx_exam_id (exam_id),
  INDEX idx_shift_id (shift_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: camera_links_rtsp
-- RTSP camera streams with structured metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS camera_links_rtsp (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  device_id   VARCHAR(255) NOT NULL UNIQUE COMMENT 'Unique device identifier',
  exam_id     INT NOT NULL,
  centre_name VARCHAR(255),
  tc_code     VARCHAR(255),
  camera_name VARCHAR(255),
  city        VARCHAR(255),
  state       VARCHAR(255),
  cctv_url    TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_exam_id (exam_id),
  INDEX idx_device_id (device_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- View: pending_assignments
-- Shows pending script assignments for today
-- ============================================================
CREATE OR REPLACE VIEW pending_assignments AS
SELECT 
  ssa.id,
  ssa.shift_id,
  ssa.script_id,
  ssa.assignment_date,
  es.start_time,
  es.end_time,
  s.script_id AS script_identifier,
  s.name AS script_name,
  ssa.custom_frequency_minutes,
  s.default_frequency_minutes
FROM shift_script_assignments ssa
JOIN exam_shifts es ON ssa.shift_id = es.id
JOIN scripts s ON ssa.script_id = s.id
WHERE ssa.status = 'PENDING'
  AND ssa.assignment_date = CURDATE()
  AND ssa.is_active = TRUE;

-- ============================================================
-- View: execution_summary
-- Provides execution statistics by exam and script
-- ============================================================
CREATE OR REPLACE VIEW execution_summary AS
SELECT
  e.exam_name,
  s.name        AS script_name,
  COUNT(*)      AS total_executions,
  SUM(CASE WHEN se.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN se.status = 'FAILED'    THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN se.status = 'RUNNING'   THEN 1 ELSE 0 END) AS running,
  SUM(CASE WHEN se.status = 'PENDING'   THEN 1 ELSE 0 END) AS pending
FROM script_executions se
LEFT JOIN scripts s ON se.script_id = s.id
LEFT JOIN exam_shifts es ON se.shift_id = es.id
LEFT JOIN exams e ON es.exam_id = e.id
GROUP BY e.exam_name, s.name;

-- ============================================================
-- View: camera_inventory
-- Shows all cameras (both HLS and RTSP) for each exam
-- ============================================================
CREATE OR REPLACE VIEW camera_inventory AS
SELECT
  e.exam_name,
  'HLS' AS stream_type,
  h.ch_code AS camera_id,
  h.camera_name,
  h.centre_name,
  h.city,
  h.state,
  h.cctv_url AS stream_url,
  h.exam_date,
  h.is_active
FROM camera_links_hls h
JOIN exams e ON h.exam_id = e.id
UNION ALL
SELECT
  e.exam_name,
  'RTSP' AS stream_type,
  r.device_id AS camera_id,
  r.camera_name,
  r.centre_name,
  r.city,
  r.state,
  r.cctv_url AS stream_url,
  NULL AS exam_date,
  r.is_active
FROM camera_links_rtsp r
JOIN exams e ON r.exam_id = e.id;

-- ============================================================
-- Table: camera_report_hls
-- Reports for HLS camera detections
-- ============================================================
CREATE TABLE IF NOT EXISTS camera_report_hls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_id INT NULL,
    shift_id INT NULL,
    city VARCHAR(255) NULL,
    center_name VARCHAR(255) NULL,
    camera_id INT NULL COMMENT 'Reference to camera_links_hls.id',
    camera_name VARCHAR(255) NULL,
    camera_category VARCHAR(255) NULL,
    tc_code VARCHAR(255) NULL,
    ch_code VARCHAR(255) NULL,
    state VARCHAR(255) NULL,
    camera_status VARCHAR(50) NULL,
    events INT DEFAULT 0,
    rejected_events INT DEFAULT 0,
    date_time VARCHAR(100) NULL COMMENT 'Manual entry (dd/mm/yyyy HH:MM:SS)',
    imageurl TEXT NULL,
    detection_type VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL,
    INDEX idx_camera_id (camera_id),
    INDEX idx_exam_shift (exam_id, shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. camera_report_rtsp
-- ============================================================
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
    rejected_events INT DEFAULT 0,
    date_time VARCHAR(100) NULL COMMENT 'Manual entry (dd/mm/yyyy HH:MM:SS)',
    imageurl TEXT NULL,
    detection_type VARCHAR(255) NULL,
    unique_id VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL,
    INDEX idx_device_camera (device_id, camera_no),
    INDEX idx_exam_shift (exam_id, shift_id),
    INDEX idx_unique_id (unique_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Done — Schema created successfully
-- ============================================================
SELECT 'Schema created successfully' AS status;