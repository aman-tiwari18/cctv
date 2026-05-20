const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
const { authenticate } = require('../middleware/auth');

// Admin dashboard stats (existing — unchanged)
router.get('/admin-stats', authenticate, DashboardController.getAdminDashboardStats);

// New dashboard endpoints (CCTV Control Center redesign)
router.get('/overview',   authenticate, DashboardController.getOverview);
router.get('/live-exams', authenticate, DashboardController.getLiveExams);

module.exports = router;
