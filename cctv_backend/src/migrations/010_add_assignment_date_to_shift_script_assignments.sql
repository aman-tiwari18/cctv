USE cctv_monitoring;

-- Add date dimension for per-day script assignments.
ALTER TABLE shift_script_assignments
    ADD COLUMN assignment_date DATE NULL AFTER status;

-- Backfill legacy rows so NOT NULL can be enforced.
UPDATE shift_script_assignments
SET assignment_date = CURDATE()
WHERE assignment_date IS NULL;

-- Move uniqueness from (shift_id, script_id) to (shift_id, script_id, assignment_date).
ALTER TABLE shift_script_assignments
    DROP INDEX unique_shift_task,
    MODIFY COLUMN assignment_date DATE NOT NULL,
    ADD UNIQUE KEY unique_shift_task_date (shift_id, script_id, assignment_date),
    ADD INDEX idx_assignment_date (assignment_date);
