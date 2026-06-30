-- Migration: client "Accept" action tracking
-- Date: 2026-06-30
-- When a client ACCEPTS a pushed detection we now (a) flag it as accepted and
-- (b) send the SMS alert (moved off the admin push flow). These columns persist
-- the accepted state so the badge survives a reload.

ALTER TABLE camera_report_hls
ADD COLUMN accepted_by_client TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Set to 1 when the client clicks Accept on this pushed detection';
ALTER TABLE camera_report_hls
ADD COLUMN accepted_at DATETIME DEFAULT NULL;

ALTER TABLE camera_report_rtsp
ADD COLUMN accepted_by_client TINYINT(1) NOT NULL DEFAULT 0
COMMENT 'Set to 1 when the client clicks Accept on this pushed detection';
ALTER TABLE camera_report_rtsp
ADD COLUMN accepted_at DATETIME DEFAULT NULL;
