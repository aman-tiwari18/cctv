-- Migration: Shift-Script Assignments
-- Created: 2026-02-15
-- Purpose: Enable shift-based script scheduling

USE cctv_monitoring;

-- ============================================
-- Table: shift_script_assignments
-- Links analytics tasks to specific shifts with custom parameters
-- ============================================
CREATE TABLE IF NOT EXISTS shift_script_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_id INT NOT NULL COMMENT 'Reference to schedule_shifts.id',
  analytics_task_id INT NOT NULL COMMENT 'Reference to analytics_tasks.id',
  custom_start_time TIME COMMENT 'Override start time for this shift',
  custom_end_time TIME COMMENT 'Override end time for this shift',
  custom_frequency_minutes INT COMMENT 'Override frequency for this shift',
  notes TEXT COMMENT 'Additional notes for this assignment',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES schedule_shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (analytics_task_id) REFERENCES analytics_tasks(id) ON DELETE CASCADE,
  UNIQUE KEY unique_shift_task (shift_id, analytics_task_id),
  INDEX idx_shift_id (shift_id),
  INDEX idx_analytics_task_id (analytics_task_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Update script_executions to better track shift assignments
-- ============================================

-- Check and add shift_script_assignment_id column
SET @col_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = 'cctv_monitoring' 
  AND TABLE_NAME = 'script_executions' 
  AND COLUMN_NAME = 'shift_script_assignment_id'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE script_executions ADD COLUMN shift_script_assignment_id INT COMMENT "Reference to shift_script_assignments.id", ADD INDEX idx_shift_script_assignment_id (shift_script_assignment_id)',
  'SELECT "Column already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key if it doesn't exist
SET @fk_exists = (
  SELECT COUNT(*) 
  FROM information_schema.TABLE_CONSTRAINTS 
  WHERE CONSTRAINT_SCHEMA = 'cctv_monitoring' 
  AND TABLE_NAME = 'script_executions' 
  AND CONSTRAINT_NAME = 'fk_shift_script_assignment'
);

SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE script_executions ADD CONSTRAINT fk_shift_script_assignment FOREIGN KEY (shift_script_assignment_id) REFERENCES shift_script_assignments(id) ON DELETE SET NULL',
  'SELECT "Foreign key already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- Create view for shift-script overview
-- ============================================
CREATE OR REPLACE VIEW shift_script_overview AS
SELECT 
  ssa.id AS assignment_id,
  e.id AS exam_id,
  e.exam_name,
  e.exam_body,
  es.id AS schedule_id,
  es.exam_date,
  ss.id AS shift_id,
  ss.shift_name,
  ss.start_time AS shift_start_time,
  ss.end_time AS shift_end_time,
  at.id AS analytics_task_id,
  at.task_name,
  at.script_path,
  COALESCE(ssa.custom_frequency_minutes, at.frequency_minutes) AS effective_frequency,
  COALESCE(ssa.custom_start_time, at.start_time, ss.start_time) AS effective_start_time,
  COALESCE(ssa.custom_end_time, at.end_time, ss.end_time) AS effective_end_time,
  ssa.is_active AS assignment_active,
  at.is_active AS task_active
FROM shift_script_assignments ssa
JOIN schedule_shifts ss ON ssa.shift_id = ss.id
JOIN exam_schedules es ON ss.schedule_id = es.id
JOIN exams e ON es.exam_id = e.id
JOIN analytics_tasks at ON ssa.analytics_task_id = at.id
WHERE ssa.is_active = TRUE
  AND ss.is_active = TRUE
  AND es.is_active = TRUE
  AND e.is_active = TRUE;
