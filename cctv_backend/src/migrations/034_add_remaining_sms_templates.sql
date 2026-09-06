-- Migration: SMS alert templates for the remaining detection analytics
-- Date: 2026-09-04
-- Adds per-client DLT template + message columns for the five detection types
-- that had no SMS slot yet (intruder, crowd, phone, entry_exit, blind_spot),
-- mirroring the invigilator/proximity columns from 028 and server from 032.
--
-- Driven by a client whose DLT registration covers all eight analytics, not
-- just the three we had columns for.
--
-- NOTE: like 028 and 032, this only adds the columns. The DLT-approved template
-- ids, message bodies and gateway credentials are seeded per client (exam_body)
-- out-of-band so client DLT ids never live in git. Until a client is seeded,
-- sendAlertWithConfig() resolves no template for these types and skips the
-- alert — nothing breaks, nothing sends.

ALTER TABLE sms_configs
ADD COLUMN template_intruder VARCHAR(64) DEFAULT NULL
AFTER message_server;

ALTER TABLE sms_configs
ADD COLUMN message_intruder TEXT
AFTER template_intruder;

ALTER TABLE sms_configs
ADD COLUMN template_crowd VARCHAR(64) DEFAULT NULL
AFTER message_intruder;

ALTER TABLE sms_configs
ADD COLUMN message_crowd TEXT
AFTER template_crowd;

ALTER TABLE sms_configs
ADD COLUMN template_phone VARCHAR(64) DEFAULT NULL
AFTER message_crowd;

ALTER TABLE sms_configs
ADD COLUMN message_phone TEXT
AFTER template_phone;

ALTER TABLE sms_configs
ADD COLUMN template_entry_exit VARCHAR(64) DEFAULT NULL
AFTER message_phone;

ALTER TABLE sms_configs
ADD COLUMN message_entry_exit TEXT
AFTER template_entry_exit;

ALTER TABLE sms_configs
ADD COLUMN template_blind_spot VARCHAR(64) DEFAULT NULL
AFTER message_entry_exit;

ALTER TABLE sms_configs
ADD COLUMN message_blind_spot TEXT
AFTER template_blind_spot;
