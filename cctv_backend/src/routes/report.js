/**
 * routes/report.js
 * Route: GET /api/report/download?date=dd-mm-yyyy
 */

const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/ReportController');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /cctv_analytics/api/report/download
 * @query   date  — dd-mm-yyyy  (e.g. 15-04-2026)
 * @access  Authenticated
 * @returns Excel file (.xlsx)
 */
router.get(
    '/download',
    authenticate,
    asyncHandler(ReportController.downloadReport)
);

/**
 * @route   GET /cctv_analytics/api/report/download/client
 * @query   exam_id, date (dd-mm-yyyy)
 * @access  Authenticated (VIEWER / client-facing UI)
 * @returns Excel file (.xlsx) — only pushed_to_client=1 detections, with a
 *          per-row "Rejected" column for remove_from_client=1.
 */
router.get(
    '/download/client',
    authenticate,
    asyncHandler(ReportController.downloadClientReport)
);

module.exports = router;
