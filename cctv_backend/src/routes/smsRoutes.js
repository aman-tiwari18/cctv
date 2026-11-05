const express = require('express');
const router = express.Router();
const SMSController = require('../controllers/SMSController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * SMS Alert Routes
 * Base Path: /cctv_analytics/api/sms
 */

// Internal endpoint for Python script-server to trigger SMS
router.post('/send-push-alert', (req, res) => SMSController.sendPushAlert(req, res));

// Lists exam_body clients with an enabled SMS config (frontend gating)
router.get('/clients', (req, res) => SMSController.getSmsClients(req, res));

// Credit balance per client gateway account (admin dashboard)
router.get('/balance', authenticate, authorize('ADMIN'), (req, res) => SMSController.getBalances(req, res));

module.exports = router;
