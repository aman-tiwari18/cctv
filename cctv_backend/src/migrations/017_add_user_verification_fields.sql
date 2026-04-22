-- ============================================================
-- Migration: 017_add_user_verification_fields
-- Description: Add phone, company_name, verified, and verified_date columns to users table
-- Date: 2026-04-22
-- ============================================================

USE cctv_monitoring;

-- Add phone column
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL COMMENT 'Contact phone number' AFTER full_name;

-- Add company_name column
ALTER TABLE users ADD COLUMN company_name VARCHAR(255) NULL COMMENT 'Company or organization name' AFTER phone;

-- Add verified column
ALTER TABLE users ADD COLUMN verified BOOLEAN DEFAULT FALSE COMMENT 'Account verification status' AFTER company_name;

-- Add verified_date column
ALTER TABLE users ADD COLUMN verified_date DATETIME NULL COMMENT 'Date and time when account was verified' AFTER verified;

-- Add index for verified column
ALTER TABLE users ADD INDEX idx_verified (verified);

-- Add index for company_name column
ALTER TABLE users ADD INDEX idx_company_name (company_name);
