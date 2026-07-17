-- Migration: Server Room SMS alert template
-- Date: 2026-07-16
-- Adds the per-client DLT template + message body for Server Room Detection
-- alerts, mirroring the existing invigilator/proximity columns from 028.
-- NOTE: like 028, this only adds the columns. The DLT-approved template id and
-- message body are seeded per client (exam_body) out-of-band so client DLT ids
-- never live in git. Until they are seeded, sendAlertWithConfig() resolves no
-- template for 'server' and skips the alert — nothing breaks, nothing sends.

ALTER TABLE sms_configs
ADD COLUMN template_server VARCHAR(64) DEFAULT NULL
AFTER message_proximity;

ALTER TABLE sms_configs
ADD COLUMN message_server TEXT
AFTER template_server;
