-- Migration: allow one account to belong to multiple companies
-- Date: 2026-09-07
-- users.email / users.username are UNIQUE, so a person cannot hold one row per
-- company. Instead an account keeps its primary users.company_name (untouched,
-- so every existing query keeps working) and gains extra memberships here.
--
-- verified mirrors users.verified: a membership only widens what the user can
-- see once an admin approves it, so a second company added after signup starts
-- unverified while the account itself stays usable for its first company.

CREATE TABLE IF NOT EXISTS user_companies (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  company_name VARCHAR(255) NOT NULL COMMENT 'Matches exams.exam_body / users.company_name',
  verified TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Admin-approved membership',
  verified_date DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_company (user_id, company_name),
  KEY idx_uc_company (company_name),
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: every existing account's current company becomes its first
-- membership, carrying that account's verified state.
INSERT IGNORE INTO user_companies (user_id, company_name, verified, verified_date)
SELECT id, TRIM(company_name), verified, verified_date
  FROM users
 WHERE company_name IS NOT NULL AND TRIM(company_name) <> '';
