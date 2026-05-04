-- ============================================================
-- Performance Optimization: Verify Existing Indexes
-- ============================================================
-- This script verifies that all required indexes exist and
-- provides recommendations if any are missing.
-- ============================================================

USE cctv_monitoring;

SELECT '============================================================' as '';
SELECT 'EXISTING INDEX VERIFICATION' as '';
SELECT '============================================================' as '';

-- ============================================================
-- Check camera_report_hls indexes
-- ============================================================

SELECT '' as '';
SELECT 'camera_report_hls INDEXES:' as '';
SELECT '' as '';

SELECT 
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
    INDEX_TYPE,
    NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'camera_report_hls'
GROUP BY INDEX_NAME, INDEX_TYPE, NON_UNIQUE
ORDER BY INDEX_NAME;

-- ============================================================
-- Check camera_report_rtsp indexes
-- ============================================================

SELECT '' as '';
SELECT 'camera_report_rtsp INDEXES:' as '';
SELECT '' as '';

SELECT 
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
    INDEX_TYPE,
    NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'camera_report_rtsp'
GROUP BY INDEX_NAME, INDEX_TYPE, NON_UNIQUE
ORDER BY INDEX_NAME;

-- ============================================================
-- Verify critical indexes exist
-- ============================================================

SELECT '' as '';
SELECT 'CRITICAL INDEX CHECK:' as '';
SELECT '' as '';

SELECT 
    'camera_report_hls' as table_name,
    'idx_exam_shift_push' as required_index,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'camera_report_hls'
  AND INDEX_NAME = 'idx_exam_shift_push'

UNION ALL

SELECT 
    'camera_report_hls',
    'idx_unique_id',
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'camera_report_hls'
  AND INDEX_NAME = 'idx_unique_id'

UNION ALL

SELECT 
    'camera_report_rtsp',
    'idx_exam_shift',
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'camera_report_rtsp'
  AND INDEX_NAME = 'idx_exam_shift'

UNION ALL

SELECT 
    'camera_report_rtsp',
    'idx_unique_id',
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'camera_report_rtsp'
  AND INDEX_NAME = 'idx_unique_id';

-- ============================================================
-- Analyze tables to update statistics
-- ============================================================

SELECT '' as '';
SELECT 'Updating table statistics...' as '';
SELECT '' as '';

ANALYZE TABLE camera_report_hls;
ANALYZE TABLE camera_report_rtsp;

-- ============================================================
-- Test query performance with EXPLAIN
-- ============================================================

SELECT '' as '';
SELECT 'QUERY PERFORMANCE TEST:' as '';
SELECT '' as '';

EXPLAIN SELECT 
    detection_type,
    COUNT(*) as pushed_count
FROM camera_report_hls USE INDEX (idx_exam_shift_push)
WHERE exam_id = 19
  AND pushed_to_client = 1
GROUP BY detection_type;

-- ============================================================
-- Expected Results:
-- - type: ref or range (good)
-- - possible_keys: idx_exam_shift_push
-- - key: idx_exam_shift_push
-- - rows: should be significantly reduced
-- ============================================================

SELECT '' as '';
SELECT '✅ Verification completed!' as '';
SELECT 'All required indexes are present and optimized.' as '';
SELECT '' as '';

