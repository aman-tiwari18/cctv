-- Migration: per-exam schedules (which date/shift/centre runs) + server-room thresholds
-- Date: 2026-10-05
--
-- Uploaded as Excel sheets from the Exams page (see docs/EXAM_SCHEDULE_AND_THRESHOLDS.md):
--   exam_slot_schedule      exam level  : does the exam run on date D, shift S at all?
--   exam_centre_schedule    centre level: does centre (TC code) run on date D, shift S? (RTSP exams)
--   server_room_thresholds  server-room analytic person limit per TC code (HLS + RTSP),
--                           for every sitting of the exam or for one date + shift
--   exam_schedule_uploads   audit of every upload (who, what, warnings)
--
-- No rows for an exam = old behaviour (everything runs; legacy constants for thresholds),
-- so existing exams are unaffected until a sheet is uploaded.

CREATE TABLE IF NOT EXISTS exam_schedule_uploads (
    id          INT NOT NULL AUTO_INCREMENT,
    exam_id     INT NOT NULL,
    kind        ENUM('slots','centres','thresholds') NOT NULL,
    file_name   VARCHAR(255) NULL,
    uploaded_by VARCHAR(120) NULL,
    centres     INT NULL,
    slots       INT NULL,
    running     INT NULL,
    warnings    JSON NULL,
    created_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_upload_exam (exam_id, kind, created_at),
    CONSTRAINT fk_upload_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_slot_schedule (
    exam_id     INT NOT NULL,
    exam_date   DATE NOT NULL,
    shift_id    INT NOT NULL COMMENT 'exam_shifts.id',
    is_running  TINYINT(1) NOT NULL,
    source      ENUM('excel','manual') NOT NULL DEFAULT 'excel',
    upload_id   INT NULL,
    updated_by  VARCHAR(120) NULL,
    updated_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (exam_id, exam_date, shift_id),
    CONSTRAINT fk_slot_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_centre_schedule (
    id          BIGINT NOT NULL AUTO_INCREMENT,
    exam_id     INT NOT NULL,
    tc_code     VARCHAR(64) NOT NULL,
    exam_date   DATE NOT NULL,
    shift_id    INT NOT NULL COMMENT 'exam_shifts.id',
    is_running  TINYINT(1) NOT NULL,
    source      ENUM('excel','manual') NOT NULL DEFAULT 'excel',
    upload_id   INT NULL,
    updated_by  VARCHAR(120) NULL,
    updated_at  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_centre_slot (exam_id, tc_code, exam_date, shift_id),
    KEY idx_centre_slot (exam_id, exam_date, shift_id, is_running),
    CONSTRAINT fk_centre_sched_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extra per-centre facts from the centre sheet (shown in the matrix, never used to decide)
CREATE TABLE IF NOT EXISTS exam_centre_info (
    exam_id     INT NOT NULL,
    tc_code     VARCHAR(64) NOT NULL,
    centre_name VARCHAR(255) NULL,
    region      VARCHAR(64) NULL,
    city        VARCHAR(128) NULL,
    state       VARCHAR(128) NULL,
    PRIMARY KEY (exam_id, tc_code),
    CONSTRAINT fk_centre_info_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS server_room_thresholds (
    id            BIGINT NOT NULL AUTO_INCREMENT,
    exam_id       INT NOT NULL,
    tc_code       VARCHAR(64) NOT NULL,
    exam_date     DATE NULL COMMENT 'NULL = every sitting of the exam',
    shift_id      INT NULL COMMENT 'exam_shifts.id; NULL = every sitting',
    sitting_key   VARCHAR(24) GENERATED ALWAYS AS (IF(exam_date IS NULL, 'ALL', CONCAT(exam_date, '#', COALESCE(shift_id, 0)))) STORED,
    max_persons   DECIMAL(7,2) NOT NULL COMMENT 'alert when person_count > max_persons',
    min_required  DECIMAL(7,2) NULL,
    exam_nodes    INT NULL,
    additional_it DECIMAL(7,2) NULL,
    centre_name   VARCHAR(255) NULL,
    region        VARCHAR(64) NULL,
    source        ENUM('excel','manual','legacy') NOT NULL DEFAULT 'excel',
    upload_id     INT NULL,
    updated_by    VARCHAR(120) NULL,
    updated_at    TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_threshold (exam_id, tc_code, sitting_key),
    KEY idx_threshold_exam (exam_id, exam_date, shift_id),
    CONSTRAINT fk_threshold_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
