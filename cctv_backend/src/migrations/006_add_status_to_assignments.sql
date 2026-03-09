USE cctv_monitoring;

-- Add status column to shift_script_assignments
ALTER TABLE shift_script_assignments
  ADD COLUMN status ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') DEFAULT 'PENDING' COMMENT 'Execution status of this assignment';

-- Add execution tracking columns
ALTER TABLE shift_script_assignments
  ADD COLUMN started_at DATETIME NULL COMMENT 'When script execution started';

ALTER TABLE shift_script_assignments
  ADD COLUMN completed_at DATETIME NULL COMMENT 'When script execution completed';

ALTER TABLE shift_script_assignments
  ADD COLUMN error_log TEXT NULL COMMENT 'Error message if execution failed';

ALTER TABLE shift_script_assignments
  ADD COLUMN result_data JSON NULL COMMENT 'Result data from script execution';

-- Add index for fast polling of pending assignments
ALTER TABLE shift_script_assignments
  ADD INDEX idx_status (status);
