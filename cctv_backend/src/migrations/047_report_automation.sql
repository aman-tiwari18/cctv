-- Migration: Report automation (admin section)
-- Date: 2026-11-05
-- One row in report_schedules = one email: an exam, a day and a time, with its To / Cc list.
-- report_schedule_items = the reports attached to that email, each with its own shift
-- (shift_id NULL means all shifts). All times are IST.

CREATE TABLE IF NOT EXISTS report_schedules (
    id                  INT NOT NULL AUTO_INCREMENT,
    exam_id             INT NOT NULL,
    report_date         DATE NOT NULL,
    send_time           TIME NOT NULL,
    to_emails           TEXT NOT NULL,
    cc_emails           TEXT NULL,
    subject             VARCHAR(255) NULL,
    status              ENUM('pending','sending','sent','failed','missed') NOT NULL DEFAULT 'pending',
    attempts            INT NOT NULL DEFAULT 0,
    next_attempt_at     TIMESTAMP NULL DEFAULT NULL,
    claimed_at          TIMESTAMP NULL DEFAULT NULL,
    sent_at             TIMESTAMP NULL DEFAULT NULL,
    last_error          TEXT NULL,
    result_summary      TEXT NULL,
    provider_message_id VARCHAR(128) NULL,
    created_by          VARCHAR(120) NULL,
    created_at          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_report_schedule_slot (exam_id, report_date, send_time),
    KEY idx_report_schedule_status (status, report_date),
    CONSTRAINT fk_report_schedule_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_schedule_items (
    id          INT NOT NULL AUTO_INCREMENT,
    schedule_id INT NOT NULL,
    report_type VARCHAR(32) NOT NULL,
    shift_id    INT NULL,
    position    INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_report_item_schedule (schedule_id),
    CONSTRAINT fk_report_item_schedule FOREIGN KEY (schedule_id) REFERENCES report_schedules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
