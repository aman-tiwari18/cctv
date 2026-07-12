-- Adds camera_classifications JSON column to shift_script_assignments.
-- Introduced with "camera type selection per script assignment" (merge #23)
-- but shipped without a migration; the model/controllers reference it.
ALTER TABLE shift_script_assignments
    ADD COLUMN camera_classifications JSON NULL
    COMMENT 'Camera types this script runs on, e.g. ["inside classroom","entry/exit"]'
    AFTER sms_enabled;
