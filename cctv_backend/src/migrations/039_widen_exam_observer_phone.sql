-- Migration: widen exams.observer_phone
-- Date: 2026-09-16
--
-- observer_phone is meant to hold a comma-separated list of recipient numbers
-- (see smsService.js), but VARCHAR(64) only fits ~4 ten-digit numbers before
-- MySQL rejects the insert with "Data too long for column 'observer_phone'".
-- Widen it to match default_recipients-style usage.

ALTER TABLE exams
MODIFY COLUMN observer_phone VARCHAR(512) DEFAULT NULL
  COMMENT 'Comma-separated NTA observer phone(s) for SMS alerts; falls back to ALERT_PHONE_NUMBERS env';
