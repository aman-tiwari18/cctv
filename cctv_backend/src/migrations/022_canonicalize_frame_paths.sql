-- One-time normalization of camera_links_rtsp.frame_path.
--
-- Until now, frame_path stored the writer-side absolute path, which differed
-- per worker:
--   /data/cctv_dev/cctv/script-server/scripts/detection/results/classification_frames/…  (main canonical)
--   /data/cctv_dev/cctv/script-server/results/classification_frames/…                   (main alt — symlinked to NFS)
--   /app/scripts/detection/results/classification_frames/…                              (worker, NFS-mounted)
--   /app/results/classification_frames/…                                                (worker, container-local — bytes gone)
--
-- All paths in the first three buckets resolve to the same physical file on
-- NFS at /data/nfs/cctv_images/classification_frames/<suffix>. The Python
-- writer (db_client._canonicalize_frame_path) does this rewrite at the DB
-- boundary going forward; this migration backfills existing rows.
--
-- The /app/results/ rows were written into worker container scratch space
-- before the NFS-mounted FRAMES_FOLDER was introduced; those containers are
-- long gone so the bytes are unrecoverable. We NULL the path so the UI
-- correctly shows "no frame captured" and disables the View button.

-- 1) main canonical legacy → NFS canonical
UPDATE camera_links_rtsp
   SET frame_path = CONCAT(
         '/data/nfs/cctv_images/classification_frames/',
         SUBSTRING(frame_path, LENGTH('/data/cctv_dev/cctv/script-server/scripts/detection/results/classification_frames/') + 1)
       )
 WHERE frame_path LIKE '/data/cctv_dev/cctv/script-server/scripts/detection/results/classification_frames/%';

-- 2) main alt-dir legacy → NFS canonical
UPDATE camera_links_rtsp
   SET frame_path = CONCAT(
         '/data/nfs/cctv_images/classification_frames/',
         SUBSTRING(frame_path, LENGTH('/data/cctv_dev/cctv/script-server/results/classification_frames/') + 1)
       )
 WHERE frame_path LIKE '/data/cctv_dev/cctv/script-server/results/classification_frames/%';

-- 3) worker NFS-mount legacy → NFS canonical
UPDATE camera_links_rtsp
   SET frame_path = CONCAT(
         '/data/nfs/cctv_images/classification_frames/',
         SUBSTRING(frame_path, LENGTH('/app/scripts/detection/results/classification_frames/') + 1)
       )
 WHERE frame_path LIKE '/app/scripts/detection/results/classification_frames/%';

-- 4) worker container-local rows — bytes do not exist on NFS, clear them
UPDATE camera_links_rtsp
   SET frame_path = NULL
 WHERE frame_path LIKE '/app/results/classification_frames/%';

-- Same four passes for the HLS table (frame_path column was just added — most
-- rows are NULL but rewriting any future-or-already-present values keeps the
-- two tables consistent).
UPDATE camera_links_hls
   SET frame_path = CONCAT(
         '/data/nfs/cctv_images/classification_frames/',
         SUBSTRING(frame_path, LENGTH('/data/cctv_dev/cctv/script-server/scripts/detection/results/classification_frames/') + 1)
       )
 WHERE frame_path LIKE '/data/cctv_dev/cctv/script-server/scripts/detection/results/classification_frames/%';

UPDATE camera_links_hls
   SET frame_path = CONCAT(
         '/data/nfs/cctv_images/classification_frames/',
         SUBSTRING(frame_path, LENGTH('/data/cctv_dev/cctv/script-server/results/classification_frames/') + 1)
       )
 WHERE frame_path LIKE '/data/cctv_dev/cctv/script-server/results/classification_frames/%';

UPDATE camera_links_hls
   SET frame_path = CONCAT(
         '/data/nfs/cctv_images/classification_frames/',
         SUBSTRING(frame_path, LENGTH('/app/scripts/detection/results/classification_frames/') + 1)
       )
 WHERE frame_path LIKE '/app/scripts/detection/results/classification_frames/%';

UPDATE camera_links_hls
   SET frame_path = NULL
 WHERE frame_path LIKE '/app/results/classification_frames/%';
