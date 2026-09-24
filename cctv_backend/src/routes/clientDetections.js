/**
 * routes/clientDetections.js
 * Backend-served listing for the VIEWER "Removed Detections" page.
 */

const express = require('express');
const router = express.Router();
const ClientDetectionsController = require('../controllers/ClientDetectionsController');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /cctv_analytics/api/client-detections/removed
 * @query   page, limit, source, type, date, start_time, end_time, search, exam_id
 * @access  Authenticated
 * @returns { success, total, page, limit, counts, data } — rows where
 *          pushed_to_client = 1 AND remove_from_client = 1, scoped to the
 *          caller's company (VIEWER) or unrestricted (ADMIN).
 */
router.get(
    '/removed',
    authenticate,
    asyncHandler(ClientDetectionsController.getRemovedDetections)
);

/**
 * @route   GET /cctv_analytics/api/client-detections/accepted
 * @query   page, limit, source, type, date, start_time, end_time, search, exam_id
 * @access  Authenticated
 * @returns { success, total, page, limit, counts, data } — rows where
 *          pushed_to_client = 1 AND accepted_by_client = 1 AND NOT removed,
 *          scoped to the caller's company (VIEWER) or unrestricted (ADMIN).
 */
router.get(
    '/accepted',
    authenticate,
    asyncHandler(ClientDetectionsController.getAcceptedDetections)
);

/**
 * @route   POST /cctv_analytics/api/client-detections/undo
 * @body    { uid: string }
 * @access  Authenticated
 * @returns { success, uid } — flips remove_from_client back to 0 so the
 *          detection reappears on the client view. Powers the 15-second
 *          undo affordance on ClientDetections.jsx.
 */
router.post(
    '/undo',
    authenticate,
    asyncHandler(ClientDetectionsController.undoRemoveDetection)
);

/**
 * @route   POST /cctv_analytics/api/client-detections/accept
 * @body    { uid: string }
 * @access  Authenticated
 * @returns { success, uid, accepted, sms_sent, sms_reason } — flags the row
 *          accepted_by_client=1 and sends the SMS alert to the observer
 *          number(s) mapped to the detection's tc_code (NTA Observer List).
 */
router.post(
    '/accept',
    authenticate,
    asyncHandler(ClientDetectionsController.acceptDetection)
);

module.exports = router;
