-- Operator-driven manual verification of a camera's auto-classification.
--
-- manually_verified : tinyint flag (0 = untouched by humans / VLM-only,
--                                   1 = an operator confirmed/overrode the
--                                   classification through the UI)
-- verified_by       : the user id of the operator who clicked Verify; null
--                     when manually_verified=0. We don't FK-constrain this
--                     so the row survives an unrelated user deletion.

ALTER TABLE camera_links_hls
  ADD COLUMN manually_verified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN verified_by INT NULL;

ALTER TABLE camera_links_rtsp
  ADD COLUMN manually_verified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN verified_by INT NULL;
