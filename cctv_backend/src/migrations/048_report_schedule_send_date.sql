-- Migration: separate "which day's data" from "which day to send" on scheduled report emails
-- Date: 2026-11-05
-- report_date = the day the reports cover. send_date + send_time = when the email goes out (IST).

ALTER TABLE report_schedules ADD COLUMN send_date DATE NULL AFTER report_date;
UPDATE report_schedules SET send_date = report_date WHERE send_date IS NULL;
ALTER TABLE report_schedules MODIFY COLUMN send_date DATE NOT NULL;
ALTER TABLE report_schedules ADD UNIQUE KEY uq_report_schedule_send (exam_id, report_date, send_date, send_time);
ALTER TABLE report_schedules DROP INDEX uq_report_schedule_slot;
