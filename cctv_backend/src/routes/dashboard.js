const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
const { authenticate } = require('../middleware/auth');

// Admin dashboard stats
router.get('/admin-stats', authenticate, DashboardController.getAdminDashboardStats);

module.exports = router;
