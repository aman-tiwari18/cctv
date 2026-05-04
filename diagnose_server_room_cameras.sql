-- ============================================================
-- Server Room Detection - Diagnostic SQL Queries
-- ============================================================
-- Run these queries to diagnose why server room detection
-- is not working and not saving to database.
-- ============================================================

-- 1. Check Server Room Camera Configuration
-- ============================================================
SELECT 
    '=== SERVER ROOM CAMERAS (RTSP) ===' as section;

SELECT 
    id,
    device_id,
    camera_no,
    exam_id,
    centre_name,
    camera_name,
    classification,
    status,
    is_active,
    cctv_url,
    username,
    CASE 
        WHEN password IS NOT NULL THEN '***SET***'
        ELSE 'NOT SET'
    END as password_status
FROM camera_links_rtsp
WHERE classification LIKE '%Server%'
   OR classification LIKE '%Strong%'
   OR classification LIKE '%server%'
   OR classification LIKE '%strong%'
ORDER BY device_id, camera_no;

-- 2. Check Specific Failing Cameras
-- ============================================================
SELECT 
    '=== FAILING CAMERAS FROM LOGS ===' as section;

SELECT 
    device_id,
    camera_no,
    exam_id,
    centre_name,
    classification,
    status,
    is_active,
    cctv_url
FROM camera_links_rtsp
WHERE (device_id = '1000648' AND camera_no IN ('6', '8'))
   OR (device_id = '1000728' AND camera_no = '4');

-- 3. Check Recent Server Room Detections
-- ============================================================
SELECT 
    '=== RECENT SERVER ROOM DETECTIONS (RTSP) ===' as section;

SELECT 
    id,
    device_id,
    camera_no,
    center_name,
    detection_type,
    date_time,
    pushed_to_client,
    remove_from_client,
    created_at
FROM camera_report_rtsp
WHERE detection_type = 'server_room_detection'
  AND created_at > NOW() - INTERVAL 24 HOUR
ORDER BY created_at DESC
LIMIT 20;

-- 4. Check Detection Counts by Type (Last 24h)
-- ============================================================
SELECT 
    '=== DETECTION COUNTS (LAST 24H) ===' as section;

SELECT 
    'RTSP' as source,
    detection_type,
    COUNT(*) as total_count,
    SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
    SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
FROM camera_report_rtsp
WHERE created_at > NOW() - INTERVAL 24 HOUR
GROUP BY detection_type

UNION ALL

SELECT 
    'HLS' as source,
    detection_type,
    COUNT(*) as total_count,
    SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
    SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
FROM camera_report_hls
WHERE created_at > NOW() - INTERVAL 24 HOUR
GROUP BY detection_type
ORDER BY source, detection_type;

-- 5. Check Camera Status Distribution
-- ============================================================
SELECT 
    '=== CAMERA STATUS DISTRIBUTION ===' as section;

SELECT 
    'RTSP' as source,
    status,
    COUNT(*) as count
FROM camera_links_rtsp
WHERE is_active = 1
GROUP BY status

UNION ALL

SELECT 
    'HLS' as source,
    status,
    COUNT(*) as count
FROM camera_links_hls
WHERE is_active = 1
GROUP BY status
ORDER BY source, status;

-- 6. Check Cameras by Classification
-- ============================================================
SELECT 
    '=== CAMERAS BY CLASSIFICATION ===' as section;

SELECT 
    classification,
    COUNT(*) as count,
    SUM(CASE WHEN status = 'accessible' THEN 1 ELSE 0 END) as accessible,
    SUM(CASE WHEN status != 'accessible' OR status IS NULL THEN 1 ELSE 0 END) as not_accessible
FROM (
    SELECT classification, status FROM camera_links_rtsp WHERE is_active = 1
    UNION ALL
    SELECT classification, status FROM camera_links_hls WHERE is_active = 1
) as all_cameras
GROUP BY classification
ORDER BY count DESC;

-- 7. Check for Missing Indexes (Performance)
-- ============================================================
SELECT 
    '=== INDEX CHECK ===' as section;

SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('camera_report_hls', 'camera_report_rtsp')
  AND INDEX_NAME LIKE '%exam%' OR INDEX_NAME LIKE '%pushed%'
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 8. Check Exam and Shift Configuration
-- ============================================================
SELECT 
    '=== ACTIVE EXAMS ===' as section;

SELECT 
    id,
    exam_name,
    exam_body,
    link_type,
    start_date,
    end_date,
    is_active
FROM exams
WHERE is_active = 1
ORDER BY start_date DESC;

-- 9. Check Script Assignments for Server Room
-- ============================================================
SELECT 
    '=== SERVER ROOM SCRIPT ASSIGNMENTS ===' as section;

SELECT 
    ssa.id,
    e.exam_name,
    es.shift_name,
    s.name as script_name,
    s.script_id,
    ssa.status,
    ssa.assignment_date,
    ssa.custom_start_time,
    ssa.custom_end_time
FROM shift_script_assignments ssa
JOIN exam_shifts es ON ssa.shift_id = es.id
JOIN scripts s ON ssa.script_id = s.id
JOIN exams e ON es.exam_id = e.id
WHERE s.script_id = 'server'
  AND ssa.is_active = 1
ORDER BY ssa.assignment_date DESC, es.shift_name;

-- 10. Check for Duplicate Camera Entries
-- ============================================================
SELECT 
    '=== DUPLICATE CAMERAS (RTSP) ===' as section;

SELECT 
    device_id,
    camera_no,
    COUNT(*) as duplicate_count
FROM camera_links_rtsp
WHERE is_active = 1
GROUP BY device_id, camera_no
HAVING COUNT(*) > 1;

-- 11. Summary Statistics
-- ============================================================
SELECT 
    '=== SUMMARY STATISTICS ===' as section;

SELECT 
    'Total Active RTSP Cameras' as metric,
    COUNT(*) as value
FROM camera_links_rtsp
WHERE is_active = 1

UNION ALL

SELECT 
    'Server Room Cameras (RTSP)',
    COUNT(*)
FROM camera_links_rtsp
WHERE is_active = 1
  AND (classification LIKE '%Server%' OR classification LIKE '%Strong%')

UNION ALL

SELECT 
    'Accessible Server Room Cameras',
    COUNT(*)
FROM camera_links_rtsp
WHERE is_active = 1
  AND (classification LIKE '%Server%' OR classification LIKE '%Strong%')
  AND status = 'accessible'

UNION ALL

SELECT 
    'Server Room Detections (24h)',
    COUNT(*)
FROM camera_report_rtsp
WHERE detection_type = 'server_room_detection'
  AND created_at > NOW() - INTERVAL 24 HOUR

UNION ALL

SELECT 
    'Pushed Server Room Detections (24h)',
    COUNT(*)
FROM camera_report_rtsp
WHERE detection_type = 'server_room_detection'
  AND created_at > NOW() - INTERVAL 24 HOUR
  AND pushed_to_client = 1;

-- ============================================================
-- RECOMMENDED ACTIONS BASED ON RESULTS
-- ============================================================
-- 
-- If "Accessible Server Room Cameras" = 0:
--   → Check DSS server permissions
--   → Verify camera credentials
--   → Test RTSP streams manually
--
-- If "Server Room Detections (24h)" = 0:
--   → Check worker logs: pm2 logs server-room-worker
--   → Verify EXAM_ID and SHIFT_ID environment variables
--   → Restart worker: pm2 restart server-room-worker
--
-- If detections exist but "Pushed Server Room Detections" = 0:
--   → Operator needs to review and push detections
--   → Check backend push endpoint is working
--
-- If duplicate cameras found:
--   → Deactivate duplicates: UPDATE camera_links_rtsp SET is_active = 0 WHERE id = ?
--
-- ============================================================
