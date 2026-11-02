-- Migration: "Accepted by CDIS" marker (temporary feature)
-- Date: 2026-10-29
-- A client user can copy a pushed detection into the "Accepted by CDIS" section.
-- The detection stays in the normal list; these columns only record the click.

ALTER TABLE camera_report_hls
ADD COLUMN cdis_accepted TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Set to 1 when the user clicks "Accepted by CDIS" on this detection';
ALTER TABLE camera_report_hls ADD COLUMN cdis_accepted_at DATETIME DEFAULT NULL;
ALTER TABLE camera_report_hls ADD COLUMN cdis_accepted_by INT DEFAULT NULL;

ALTER TABLE camera_report_rtsp
ADD COLUMN cdis_accepted TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Set to 1 when the user clicks "Accepted by CDIS" on this detection';
ALTER TABLE camera_report_rtsp ADD COLUMN cdis_accepted_at DATETIME DEFAULT NULL;
ALTER TABLE camera_report_rtsp ADD COLUMN cdis_accepted_by INT DEFAULT NULL;
