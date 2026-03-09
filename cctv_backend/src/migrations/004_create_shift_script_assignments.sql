USE cctv_monitoring;

CREATE TABLE IF NOT EXISTS shift_script_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_id INT NOT NULL COMMENT 'Reference to exam_shifts.id',
  analytics_task_id INT NOT NULL COMMENT 'Reference to analytics_tasks.id',
  custom_start_time TIME COMMENT 'Override start time for this shift',
  custom_end_time TIME COMMENT 'Override end time for this shift',
  custom_frequency_minutes INT COMMENT 'Override frequency for this shift',
  notes TEXT COMMENT 'Additional notes for this assignment',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (analytics_task_id) REFERENCES analytics_tasks(id) ON DELETE CASCADE,
  UNIQUE KEY unique_shift_task (shift_id, analytics_task_id),
  INDEX idx_shift_id (shift_id),
  INDEX idx_analytics_task_id (analytics_task_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Drop foreign keys from script_executions if they point to old table, but it likely never existed.
-- Just update script_executions to correctly point to the new structure if needed, or wait, script_executions already has shift_id which used to point to schedule_shifts.
-- Let's update script_executions.shift_id to point to exam_shifts.
ALTER TABLE script_executions DROP FOREIGN KEY script_executions_ibfk_1;
ALTER TABLE script_executions ADD CONSTRAINT script_executions_ibfk_1 FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL;

-- Drop the old tables since they are deprecated
DROP TABLE IF EXISTS schedule_shifts;
DROP TABLE IF EXISTS exam_schedules;
DROP VIEW IF EXISTS shift_script_overview;
DROP VIEW IF EXISTS upcoming_shifts;
