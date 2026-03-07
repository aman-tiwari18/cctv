const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Load all models & register associations
require('./models');

// Import routes
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const cameraLinkRoutes = require('./routes/cameraLinks');
const scheduleRoutes = require('./routes/schedules');
const analyticsRoutes = require('./routes/analytics');
const executionRoutes = require('./routes/executions');
const shiftScriptRoutes = require('./routes/shiftScripts');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'CCTV Monitoring Backend is running',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/auth', authRoutes);
// IMPORTANT: Nested routes MUST come BEFORE base exam routes
// Otherwise /api/exams/:id will match /api/exams/4/schedules before the schedule router
app.use('/api/exams', scheduleRoutes);     // Handles /api/exams/:examId/schedules/*
app.use('/api/exams', cameraLinkRoutes);   // Handles /api/exams/:examId/cameras/*
app.use('/api/exams', analyticsRoutes);    // Handles /api/exams/:examId/analytics/*
app.use('/api/exams', shiftScriptRoutes);  // Handles /api/exams/:examId/shift-scripts/*
app.use('/api/shifts', shiftScriptRoutes); // Handles /api/shifts/:shiftId/scripts/*
app.use('/api/exams', examRoutes);         // Base exam routes (GET /:id, etc.)
// Direct access routes
app.use('/api/schedules', scheduleRoutes); // Direct schedule access
app.use('/api/cameras', cameraLinkRoutes); // Direct camera access
app.use('/api/analytics', analyticsRoutes); // Direct analytics access
app.use('/api/executions', executionRoutes);
app.use('/api/scripts', require('./routes/scripts')); // Script registry routes
app.use('/api', shiftScriptRoutes);        // Direct shift-script access

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
