USE cctv_monitoring;

-- camera_links_hls was unique on (exam_id, ch_code, shift_id), which makes a
-- multi-day exam unable to store the same camera for more than one day: day 2's
-- upload collided with day 1's rows and every already-known camera was dropped
-- as a "duplicate". Uniqueness has to include the exam date.
ALTER TABLE camera_links_hls DROP INDEX unique_exam_ch_shift;
ALTER TABLE camera_links_hls
    ADD UNIQUE KEY unique_exam_ch_shift_date (exam_id, ch_code, shift_id, exam_date);
