-- Script to check and populate exam_body data for Client Dashboard

-- 1. Check current exam_body values
SELECT 
    id,
    exam_name,
    exam_body,
    link_type,
    is_active,
    start_date,
    end_date
FROM exams
WHERE is_active = 1
ORDER BY exam_body, exam_name;

-- 2. Count exams by exam_body
SELECT 
    COALESCE(exam_body, 'NULL') as exam_body,
    COUNT(*) as exam_count,
    SUM(is_active) as active_count
FROM exams
GROUP BY exam_body
ORDER BY exam_count DESC;

-- 3. Find exams without exam_body
SELECT 
    id,
    exam_name,
    link_type,
    is_active
FROM exams
WHERE exam_body IS NULL OR exam_body = ''
ORDER BY id;

-- 4. Sample UPDATE statements to populate exam_body
-- Uncomment and modify these based on your actual exam names

-- Example: Update exams with "JE" in name to have exam_body = "JE (SSC)"
-- UPDATE exams 
-- SET exam_body = 'JE (SSC)' 
-- WHERE exam_name LIKE '%JE%' AND (exam_body IS NULL OR exam_body = '');

-- Example: Update exams with "SSC" in name to have exam_body = "SSC"
-- UPDATE exams 
-- SET exam_body = 'SSC' 
-- WHERE exam_name LIKE '%SSC%' AND (exam_body IS NULL OR exam_body = '');

-- Example: Update exams with "UPSC" in name to have exam_body = "UPSC"
-- UPDATE exams 
-- SET exam_body = 'UPSC' 
-- WHERE exam_name LIKE '%UPSC%' AND (exam_body IS NULL OR exam_body = '');

-- Example: Update exams with "Railway" in name to have exam_body = "Railway Board"
-- UPDATE exams 
-- SET exam_body = 'Railway Board' 
-- WHERE exam_name LIKE '%Railway%' AND (exam_body IS NULL OR exam_body = '');

-- 5. Verify the updates
-- SELECT 
--     exam_body,
--     COUNT(*) as exam_count,
--     GROUP_CONCAT(exam_name SEPARATOR ', ') as exams
-- FROM exams
-- WHERE is_active = 1
-- GROUP BY exam_body
-- ORDER BY exam_body;
