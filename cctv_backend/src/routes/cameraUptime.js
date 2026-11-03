/**
 * routes/cameraUptime.js — admin views of the camera uptime checker's data.
 * Mounted at /cctv_analytics/api/camera-uptime
 */

const express = require('express');
const router = express.Router();
const CameraUptimeController = require('../controllers/CameraUptimeController');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ADMIN'));

// Dates with uptime data for an exam:            ?exam_id
router.get('/dates', asyncHandler(CameraUptimeController.getDates));
// One row per shift run with totals:              ?exam_id&date=YYYY-MM-DD
router.get('/runs', asyncHandler(CameraUptimeController.getRuns));
// Per-centre rollup of one run:                   ?run_id
router.get('/centres', asyncHandler(CameraUptimeController.getCentres));
// Per-camera rows of one run:                     ?run_id&tc_code&status&q&page&limit
router.get('/cameras', asyncHandler(CameraUptimeController.getCameras));
// Latest captured frame (path from last_frame_path): ?path
router.get('/frame', asyncHandler(CameraUptimeController.getFrame));
// Live progress from the service itself (localhost:8095/status)
router.get('/live', asyncHandler(CameraUptimeController.getLive));
// Excel workbook (Summary, Centres, Cameras):     ?exam_id&date[&shift_id]
router.get('/download', asyncHandler(CameraUptimeController.download));

module.exports = router;
