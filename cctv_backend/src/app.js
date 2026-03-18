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
const executionRoutes = require('./routes/executions');
const shiftScriptRoutes = require('./routes/shiftScripts');
const scriptRoutes = require('./routes/scripts');

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
app.use('/api', cameraLinkRoutes);
app.use('/api', shiftScriptRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/scripts', scriptRoutes);

// Support for /cctv prefixed routes as requested
app.use('/cctv/api/auth', authRoutes);
app.use('/cctv/api', cameraLinkRoutes);
app.use('/cctv/api', shiftScriptRoutes);
app.use('/cctv/api/exams', examRoutes);
app.use('/cctv/api/executions', executionRoutes);
app.use('/cctv/api/scripts', scriptRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
