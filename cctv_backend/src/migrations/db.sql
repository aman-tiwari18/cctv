-- ============================================================
-- CCTV Exam Monitoring System — Full Database Schema
-- Generated: 2026-03-16
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
-- ============================================================
CREATE TABLE IF NOT EXISTS exams (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  exam_name   VARCHAR(255) NOT NULL,
  exam_body   VARCHAR(100) NOT NULL COMMENT 'e.g. TCS, SSC, etc.',
  link_type   ENUM('RTSP', 'HLS') NOT NULL,
  description TEXT,
  -- date-range fields (migration 003)
  start_date  DATE DEFAULT NULL,
  end_date    DATE DEFAULT NULL,
  skip_days   JSON DEFAULT NULL,
  skip_dates  JSON DEFAULT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_exam_body (exam_body),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: exam_shifts   (template shifts at exam level)
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_shifts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  exam_id    INT NOT NULL,
  shift_name VARCHAR(255) NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_exam_shifts_exam_id (exam_id)
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

-- ============================================================
-- Table: scripts  (master registry — independent of exams)
-- ============================================================
CREATE TABLE IF NOT EXISTS scripts (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  script_id                 VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. face_detection',
  name                      VARCHAR(255) NOT NULL,
  description               TEXT,
  script_path               VARCHAR(500) NOT NULL,
  default_frequency_minutes INT         DEFAULT 5,
  default_duration_minutes  INT         DEFAULT 1,
  category                  VARCHAR(100),
  parameters_schema         JSON,
  version                   VARCHAR(50)  DEFAULT '1.0.0',
  is_active                 BOOLEAN      DEFAULT TRUE,
  created_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_script_id (script_id),
  INDEX idx_category  (category),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed scripts
INSERT INTO scripts (script_id, name, description, script_path, default_frequency_minutes, default_duration_minutes, category) VALUES
  ('face_detection',  'Face Recognition & Detection', 'Detects and recognizes faces in the camera feed. Alerts on unauthorized persons.', 'face_detection.sh',  5,  2, 'Detection'),
  ('motion_detection','Motion Activity Monitoring',   'Detects significant motion in exam halls during restricted times.',               'motion_detection.py', 15, 5, 'Detection'),
  ('object_detection','Object Detection',             'Detects objects of interest in the camera feed.',                                'object_detection.py', 10, 3, 'Detection'),
  ('face_recognition','Face Recognition',             'Recognizes and matches faces against a reference database.',                      'face_recognition.py', 10, 3, 'Detection'),
  ('audio_analysis',  'Audio Level Monitoring',       'Monitors noise levels to detect potential cheating via communication.',           'scripts/audio_analysis.sh', 10, 3, 'Monitoring'),
  ('test_simple',     'System Health Check (Simple)', 'Basic connectivity and system health verification.',                             'test_simple.sh',      60, 1, 'Testing'),
  ('test_param',      'Parameter Validation Test',    'Verifies that parameters are correctly passed to the analysis engine.',           'scripts/test_param.sh', 30, 1, 'Testing'),
  ('test_random',     'Random Result Generator',      'Randomly generates success/failure results to test error handling.',             'scripts/test_random.sh', 10, 1, 'Testing')
ON DUPLICATE KEY UPDATE
  name        = VALUES(name),
  description = VALUES(description),
  script_path = VALUES(script_path);

-- ============================================================
-- Table: shift_script_assignments
-- Links exam shifts → scripts, with per-assignment scheduling
-- ============================================================
CREATE TABLE IF NOT EXISTS shift_script_assignments (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  shift_id                 INT NOT NULL   COMMENT 'Reference to exam_shifts.id',
  script_id                INT NOT NULL   COMMENT 'Reference to scripts.id',
  analytics_task_id        INT NULL       COMMENT 'Legacy — kept for backward compat',
  status                   ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') DEFAULT 'PENDING',
  scheduled_at             DATETIME NULL  COMMENT 'When this assignment is scheduled to run',
  custom_start_time        TIME  NULL,
  custom_end_time          TIME  NULL,
  custom_frequency_minutes INT   NULL,
  notes                    TEXT  NULL,
  started_at               DATETIME NULL,
  completed_at             DATETIME NULL,
  error_log                TEXT  NULL,
  result_data              JSON  NULL,
  is_active                BOOLEAN DEFAULT TRUE,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id)  REFERENCES exam_shifts(id)  ON DELETE CASCADE,
  FOREIGN KEY (script_id) REFERENCES scripts(id)       ON DELETE CASCADE,
  UNIQUE KEY unique_shift_task (shift_id, script_id),
  INDEX idx_shift_id         (shift_id),
  INDEX idx_script_id        (script_id),
  INDEX idx_status           (status),
  INDEX idx_scheduled_at     (scheduled_at),
  INDEX idx_is_active        (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: script_executions
-- Tracks every individual script run
-- ============================================================
CREATE TABLE IF NOT EXISTS script_executions (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  shift_id                  INT  NULL,
  script_id                 INT  NULL  COMMENT 'Reference to scripts.id',
  analytics_task_id         INT  NULL  COMMENT 'Legacy',
  shift_script_assignment_id INT NULL  COMMENT 'Reference to shift_script_assignments.id',
  status                    ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') DEFAULT 'PENDING',
  scheduled_time            DATETIME NOT NULL,
  started_at                DATETIME NULL,
  completed_at              DATETIME NULL,
  error_log                 TEXT NULL,
  result_data               JSON NULL,
  execution_metadata        JSON NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id)  REFERENCES exam_shifts(id)             ON DELETE SET NULL,
  FOREIGN KEY (script_id) REFERENCES scripts(id)                  ON DELETE SET NULL,
  FOREIGN KEY (shift_script_assignment_id) REFERENCES shift_script_assignments(id) ON DELETE SET NULL,
  INDEX idx_status                     (status),
  INDEX idx_scheduled_time             (scheduled_time),
  INDEX idx_shift_id                   (shift_id),
  INDEX idx_exec_script_id             (script_id),
  INDEX idx_shift_script_assignment_id (shift_script_assignment_id),
  INDEX idx_created_at                 (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: camera_links_hls
-- ============================================================
CREATE TABLE IF NOT EXISTS camera_links_hls (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  exam_id             INT NOT NULL,
  tc_name             VARCHAR(255) NULL,
  tc_code             VARCHAR(255) NULL,
  camera_name         VARCHAR(255) NULL,
  date_of_assessment  VARCHAR(255) NULL,
  shift_of_assessment VARCHAR(255) NULL,
  url                 TEXT NOT NULL,
  camera_category     VARCHAR(255) NULL,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_hls_exam_id (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: camera_links_rtsp
-- ============================================================
CREATE TABLE IF NOT EXISTS camera_links_rtsp (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  exam_id         INT NOT NULL,
  tc_name         VARCHAR(255) NULL,
  tc_code         VARCHAR(255) NULL,
  camera_name     VARCHAR(255) NULL,
  city            VARCHAR(255) NULL,
  state           VARCHAR(255) NULL,
  url             TEXT NOT NULL,
  camera_category VARCHAR(255) NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_rtsp_exam_id (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- View: execution_summary
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
LEFT JOIN scripts     s  ON se.script_id  = s.id
LEFT JOIN exam_shifts es ON se.shift_id   = es.id
LEFT JOIN exams       e  ON es.exam_id    = e.id
GROUP BY e.exam_name, s.name;

-- ============================================================
-- Done
-- ============================================================
SELECT 'Schema created successfully' AS status;
