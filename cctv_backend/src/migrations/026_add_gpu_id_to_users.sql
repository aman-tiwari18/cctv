-- Add gpu_id to users table
ALTER TABLE users ADD COLUMN gpu_id INT DEFAULT NULL;
