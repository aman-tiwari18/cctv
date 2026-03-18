USE cctv_monitoring;

-- Step 1: Drop unwanted columns from scripts table
ALTER TABLE scripts
  DROP COLUMN script_path,
  DROP COLUMN description,
  DROP COLUMN parameters_schema,
  DROP COLUMN category,
  DROP COLUMN version;

-- Step 2: Drop index that was on category (no longer exists)
ALTER TABLE scripts
  DROP INDEX idx_category;

-- Step 3: Clear all existing seed data
TRUNCATE TABLE scripts;

-- Step 4: Insert new values
INSERT INTO scripts (script_id, name, default_frequency_minutes, default_duration_minutes, is_active) VALUES
  ('server',      'Server Room Detection',  5, 1, 1),
  ('crowd',       'Crowd Detection',        5, 1, 1),
  ('intruder',    'Intruder Detection',     5, 1, 1),
  ('entry_exit',  'Entry Exit Detection',   5, 1, 1),
  ('proximity',   'Proximity Detection',    5, 1, 1),
  ('phone',       'Phone Detection',        5, 1, 1),
  ('invigilator', 'Invigilator Detection',  5, 1, 1);
