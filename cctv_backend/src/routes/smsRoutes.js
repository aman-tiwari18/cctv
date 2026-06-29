const express = require('express');
const router = express.Router();
const SMSController = require('../controllers/SMSController');

/**
 * SMS Alert Routes
 * Base Path: /cctv_analytics/api/sms
 */

// Internal endpoint for Python script-server to trigger SMS
router.post('/send-push-alert', (req, res) => SMSController.sendPushAlert(req, res));

// Lists exam_body clients with an enabled SMS config (frontend gating)
router.get('/clients', (req, res) => SMSController.getSmsClients(req, res));

module.exports = router;
