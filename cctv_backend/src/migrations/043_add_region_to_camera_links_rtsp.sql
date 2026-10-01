-- Migration: region on RTSP camera links
-- Date: 2026-09-30
-- The RTSP camera Excel carries a "Region" column (e.g. CR); store it per camera
-- so it can be shown and exported. NULL for cameras uploaded before this column.

ALTER TABLE camera_links_rtsp
ADD COLUMN region VARCHAR(255) NULL DEFAULT NULL AFTER state;
