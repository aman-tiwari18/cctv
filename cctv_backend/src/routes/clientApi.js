/**
 * routes/clientApi.js
 * External client integration API (spec: CCTV_API_v1.2).
 * Mounted at /cctv_analytics/api/v1. Every route is pinned to
 * clientApi.EXAM_ID and requires Authorization: Bearer <CLIENT_API_KEY>.
 */

const express = require('express');
const router = express.Router();
const ClientApiController = require('../controllers/ClientApiController');
const { requireClientApiKey } = require('../middleware/clientApiKey');

router.use(requireClientApiKey);

/**
 * @route   GET /cctv_analytics/api/v1/cameras
 * @returns { cameras: [{ cam_id, cam_type, cam_type_name, tc_code, center_name,
 *            city, state, status, status_name, vendor_id }] }
 */
router.get('/cameras', ClientApiController.getCameras);

/** @route GET /cctv_analytics/api/v1/master/camera-types */
router.get('/master/camera-types', ClientApiController.getCameraTypes);

/** @route GET /cctv_analytics/api/v1/master/camera-statuses */
router.get('/master/camera-statuses', ClientApiController.getCameraStatuses);

/** @route GET /cctv_analytics/api/v1/master/event-types */
router.get('/master/event-types', ClientApiController.getEventTypes);

/** @route GET /cctv_analytics/api/v1/master/current-schedule */
router.get('/master/current-schedule', ClientApiController.getCurrentSchedule);

module.exports = router;
