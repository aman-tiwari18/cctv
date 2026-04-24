const express = require('express');
const router = express.Router();
const ClientDashboardController = require('../controllers/ClientDashboardController');
const { authenticate } = require('../middleware/auth');

// Get overall client dashboard statistics (grouped by exam_body)
router.get('/stats', authenticate, ClientDashboardController.getClientDashboardStats);

// Get camera accessibility statistics
router.get('/camera-accessibility', authenticate, ClientDashboardController.getCameraAccessibility);

// Download camera accessibility Excel report
router.get('/camera-accessibility/download', authenticate, ClientDashboardController.downloadCameraAccessibility);

// Get detailed statistics for a specific exam_body
router.get('/exam-body/:examBody/details', authenticate, ClientDashboardController.getExamBodyDetails);

module.exports = router;
