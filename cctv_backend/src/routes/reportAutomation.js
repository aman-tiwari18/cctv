/**
 * routes/reportAutomation.js: scheduled client report emails (ADMIN only).
 * Mounted at /cctv_analytics/api/report-automation
 */

const express = require('express');
const router = express.Router();
const ReportAutomationController = require('../controllers/ReportAutomationController');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ADMIN'));

router.get('/meta', asyncHandler(ReportAutomationController.meta));
router.get('/', asyncHandler(ReportAutomationController.list));              // ?exam_id&date=YYYY-MM-DD
router.post('/', asyncHandler(ReportAutomationController.create));
router.put('/:id', asyncHandler(ReportAutomationController.update));
router.delete('/:id', asyncHandler(ReportAutomationController.remove));
router.post('/:id/send-now', asyncHandler(ReportAutomationController.sendNow));

module.exports = router;
