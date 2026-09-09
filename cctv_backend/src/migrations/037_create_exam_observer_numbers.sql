-- Migration: per-exam TC-code → observer mobile mapping
-- Date: 2026-09-08
--
-- The accept-path SMS alert already targets "the observer number(s) for this
-- detection's tc_code", but the mapping came from ONE spreadsheet committed
-- next to the source (utils/observerList.js). That file is global, so every
-- exam shared one centre list and a new client meant redeploying the backend.
--
-- This table holds the same mapping per exam, uploaded from the Excel sheet on
-- the exam form. utils/examObservers.js reads it and the static sheet stays as
-- the fallback for exams that have no uploaded rows.

CREATE TABLE IF NOT EXISTS exam_observer_numbers (
  id INT NOT NULL AUTO_INCREMENT,
  exam_id INT NOT NULL,
  tc_code VARCHAR(64) NOT NULL COMMENT 'Centre code, matched against camera_report_*.tc_code',
  phone VARCHAR(20) NOT NULL COMMENT 'Digits only, as normalised on upload',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_exam_tc_phone (exam_id, tc_code, phone),
  KEY idx_exam_tc (exam_id, tc_code),
  CONSTRAINT fk_exam_observer_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
