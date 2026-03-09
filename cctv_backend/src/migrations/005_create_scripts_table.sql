USE cctv_monitoring;

-- ============================================
-- Table: scripts
-- Independent registry of all available scripts
-- Not tied to any exam — used as a master list
-- ============================================
CREATE TABLE IF NOT EXISTS scripts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  script_id VARCHAR(100) NOT NULL UNIQUE COMMENT 'Technical identifier, e.g. face_detection',
  name VARCHAR(255) NOT NULL COMMENT 'Human-readable name',
  description TEXT COMMENT 'What this script does',
  script_path VARCHAR(500) NOT NULL COMMENT 'Path to the script on the script-server',
  default_frequency_minutes INT DEFAULT 5 COMMENT 'Default run frequency in minutes',
  default_duration_minutes INT DEFAULT 1 COMMENT 'Default run duration in minutes',
  category VARCHAR(100) COMMENT 'e.g. Detection, Monitoring, Testing',
  parameters_schema JSON COMMENT 'JSON schema describing accepted parameters',
  version VARCHAR(50) DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_script_id (script_id),
  INDEX idx_category (category),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed with existing script registry data
INSERT INTO scripts (script_id, name, description, script_path, default_frequency_minutes, default_duration_minutes, category) VALUES
  ('face_detection', 'Face Recognition & Detection', 'Detects and recognizes faces in the camera feed. Alerts on unauthorized persons.', 'scripts/face_detection.sh', 5, 2, 'Detection'),
  ('motion_detection', 'Motion Activity Monitoring', 'Detects significant motion in exam halls during restricted times.', 'scripts/motion_detection.sh', 15, 5, 'Detection'),
  ('audio_analysis', 'Audio Level Monitoring', 'Monitors noise levels to detect potential cheating via communication.', 'scripts/audio_analysis.sh', 10, 3, 'Monitoring'),
  ('test_simple', 'System Health Check (Simple)', 'Basic connectivity and system health verification.', 'scripts/test_simple.sh', 60, 1, 'Testing'),
  ('test_param', 'Parameter Validation Test', 'Verifies that parameters are correctly passed to the analysis engine.', 'scripts/test_param.sh', 30, 1, 'Testing'),
  ('test_random', 'Random Result Generator', 'Randomly generates success/failure results to test error handling.', 'scripts/test_random.sh', 10, 1, 'Testing')
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), script_path=VALUES(script_path);

-- Update shift_script_assignments to reference scripts table instead of analytics_tasks
-- Add script_id column
ALTER TABLE shift_script_assignments ADD COLUMN script_id INT COMMENT 'Reference to scripts.id';
ALTER TABLE shift_script_assignments ADD INDEX idx_script_id (script_id);
ALTER TABLE shift_script_assignments ADD CONSTRAINT fk_ssa_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE;

-- Make analytics_task_id nullable (we are migrating away from it)
ALTER TABLE shift_script_assignments MODIFY analytics_task_id INT NULL;

-- Update script_executions to reference scripts table
ALTER TABLE script_executions ADD COLUMN script_id INT COMMENT 'Reference to scripts.id';
ALTER TABLE script_executions ADD INDEX idx_exec_script_id (script_id);
ALTER TABLE script_executions ADD CONSTRAINT fk_exec_script FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL;

-- Make analytics_task_id nullable in script_executions
ALTER TABLE script_executions MODIFY analytics_task_id INT NULL;
