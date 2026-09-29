-- Migration: proximity repeat counter
-- Date: 2026-09-29
-- A proximity detection whose pair of persons is at the same spot as in the
-- camera's previous proximity report is a repeat: the card shows
-- "Proximity Violation N". violation_count is N (1 = first time). NULL for
-- every other detection type. script-server's db_client adds it too.

ALTER TABLE camera_report_hls
ADD COLUMN violation_count INT NULL DEFAULT NULL
COMMENT 'Proximity repeat count: 1 = first report of this pair, 2, 3, ... = repeated';
ALTER TABLE camera_report_rtsp
ADD COLUMN violation_count INT NULL DEFAULT NULL
COMMENT 'Proximity repeat count: 1 = first report of this pair, 2, 3, ... = repeated';
