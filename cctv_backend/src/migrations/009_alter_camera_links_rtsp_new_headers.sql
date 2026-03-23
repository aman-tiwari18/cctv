USE cctv_monitoring;

ALTER TABLE camera_links_rtsp
    ADD COLUMN classification VARCHAR(255) NULL;