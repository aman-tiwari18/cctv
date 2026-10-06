-- 045: proximity repeat chain + client-facing repeat count.
-- violation_chain        : id of the repeating pair (same two people at the same spot), set by
--                          the worker (proximity_repeat.py); every report of that pair shares it.
-- client_violation_count : the count the CLIENT sees, set when an operator pushes the detection.
--                          Continues the pair's pushed count only if the pair's previous detection
--                          was pushed and is close enough in time; otherwise it restarts at 1.
--                          violation_count keeps the worker's raw count for operators.
ALTER TABLE camera_report_rtsp
    ADD COLUMN violation_chain VARCHAR(32) NULL DEFAULT NULL,
    ADD COLUMN client_violation_count INT NULL DEFAULT NULL,
    ALGORITHM=INSTANT;
ALTER TABLE camera_report_hls
    ADD COLUMN violation_chain VARCHAR(32) NULL DEFAULT NULL,
    ADD COLUMN client_violation_count INT NULL DEFAULT NULL,
    ALGORITHM=INSTANT;
CREATE INDEX idx_violation_chain_rtsp ON camera_report_rtsp (violation_chain) ALGORITHM=INPLACE LOCK=NONE;
CREATE INDEX idx_violation_chain_hls  ON camera_report_hls  (violation_chain) ALGORITHM=INPLACE LOCK=NONE;
