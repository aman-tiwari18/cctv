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

module.exports = router;
