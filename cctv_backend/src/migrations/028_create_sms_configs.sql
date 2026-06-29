-- Migration: per-client (exam_body) SMS gateway configuration
-- Date: 2026-06-25
-- Each client (e.g. NTA, SSC) has its own SMSGatewayHub account + DLT templates.
-- The push-alert flow resolves the row by exams.exam_body at send time.
-- NOTE: this migration only creates the table. Credentials (API keys, etc.) are
-- seeded directly into the target DB out-of-band so secrets never live in git.

CREATE TABLE IF NOT EXISTS sms_configs (
  id INT NOT NULL AUTO_INCREMENT,
  exam_body VARCHAR(64) NOT NULL COMMENT 'Client key, matches exams.exam_body',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  api_key VARCHAR(128) DEFAULT NULL,
  sender_id VARCHAR(32) DEFAULT NULL,
  entity_id VARCHAR(64) DEFAULT NULL,
  route VARCHAR(16) DEFAULT '47',
  channel VARCHAR(8) DEFAULT '2',
  dcs VARCHAR(8) DEFAULT '0',
  flashsms VARCHAR(8) DEFAULT '0',
  default_recipients VARCHAR(255) DEFAULT NULL COMMENT 'Comma-separated fallback when exam.observer_phone is empty',
  template_invigilator VARCHAR(64) DEFAULT NULL,
  message_invigilator TEXT,
  template_proximity VARCHAR(64) DEFAULT NULL,
  message_proximity TEXT,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_exam_body (exam_body)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
