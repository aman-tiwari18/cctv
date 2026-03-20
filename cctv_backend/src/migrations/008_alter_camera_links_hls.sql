USE cctv_monitoring;

-- Alter camera_links_hls: drop old fields, add new structured ones
ALTER TABLE camera_links_hls
    -- Rename tc_name → centre_name to match Excel "Centre Name"
    CHANGE COLUMN tc_name    centre_name  VARCHAR(255) NULL,
    -- Rename url → cctv_url
    CHANGE COLUMN url        cctv_url     TEXT NOT NULL,
    -- Drop old HLS-specific text fields
    DROP COLUMN camera_name,
    DROP COLUMN date_of_assessment,
    DROP COLUMN shift_of_assessment,
    -- Add location fields
    ADD COLUMN city            VARCHAR(255) NULL   AFTER centre_name,
    ADD COLUMN state           VARCHAR(255) NULL   AFTER city,
    -- Add camera identification fields
    ADD COLUMN camera_name     VARCHAR(255) NULL   AFTER state,
    ADD COLUMN ch_code         VARCHAR(255) NULL   COMMENT 'Unique channel key (ch_no)' AFTER camera_name,
    -- Add classification
    ADD COLUMN classification  VARCHAR(255) NULL   AFTER camera_category,
    -- Add scheduling links
    ADD COLUMN exam_date       DATE         NULL   COMMENT 'Date of assessment',
    ADD COLUMN shift_id        INT          NULL   COMMENT 'FK to exam_shifts (NULL = all shifts)';

-- Foreign key for shift_id
ALTER TABLE camera_links_hls
    ADD CONSTRAINT fk_camera_hls_shift
    FOREIGN KEY (shift_id) REFERENCES exam_shifts(id) ON DELETE SET NULL;
