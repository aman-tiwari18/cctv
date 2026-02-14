const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const cameraLinkRoutes = require('./routes/cameraLinks');
const scheduleRoutes = require('./routes/schedules');
const analyticsRoutes = require('./routes/analytics');
const executionRoutes = require('./routes/executions');

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
app.use('/api/exams', examRoutes);
app.use('/api/exams', cameraLinkRoutes);  // Camera links are nested under exams
app.use('/api/cameras', cameraLinkRoutes); // Also allow direct camera access
app.use('/api/exams', scheduleRoutes);     // Schedules are nested under exams
app.use('/api/schedules', scheduleRoutes); // Also allow direct schedule access
app.use('/api/exams', analyticsRoutes);    // Analytics are nested under exams
app.use('/api/analytics', analyticsRoutes); // Also allow direct analytics access
app.use('/api/executions', executionRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
