USE cctv_monitoring;

-- Allow the same script to be assigned to a shift more than once on the same
-- date, as long as each assignment has a distinct time window. Uniqueness
-- moves from (shift_id, script_id, assignment_date) to include the custom
-- start/end time as well.
ALTER TABLE shift_script_assignments
    DROP INDEX unique_shift_task_date,
    ADD UNIQUE KEY unique_shift_task_date_time (shift_id, script_id, assignment_date, custom_start_time, custom_end_time);
