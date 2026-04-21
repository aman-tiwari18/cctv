const express = require('express');
const router = express.Router();
const SMSController = require('../controllers/SMSController');

/**
 * SMS Alert Routes
 * Base Path: /cctv_analytics/api/sms
 */

// Internal endpoint for Python script-server to trigger SMS
router.post('/send-push-alert', (req, res) => SMSController.sendPushAlert(req, res));

// Manual Test endpoint
router.post('/test', (req, res) => SMSController.testSMSSending(req, res));

module.exports = router;
