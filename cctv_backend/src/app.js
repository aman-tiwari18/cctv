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
const reportRoutes = require('./routes/report');
const smsRoutes = require('./routes/smsRoutes');

const path = require('path');

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

// ==========================
// Health check
// ==========================
app.get('/cctv_analytics/health', (req, res) => {
    res.json({
        success: true,
        message: 'CCTV Monitoring Backend is running',
        timestamp: new Date().toISOString()
    });
});

// ==========================
// API Routes (MAIN PREFIX)
// ==========================
const BASE = '/cctv_analytics';

app.use(`${BASE}/api/auth`, authRoutes);
app.use(`${BASE}/api`, cameraLinkRoutes);
app.use(`${BASE}/api`, shiftScriptRoutes);
app.use(`${BASE}/api/exams`, examRoutes);
app.use(`${BASE}/api/executions`, executionRoutes);
app.use(`${BASE}/api/scripts`, scriptRoutes);
app.use(`${BASE}/api/report`, reportRoutes);
app.use(`${BASE}/api/sms`, smsRoutes);

// ==========================
// Frontend (optional)
// ==========================
const FRONTEND_PATH = path.join(__dirname, '../../cctv_frontend/dist');

// Serve frontend ONLY under /cctv_analytics
app.use('/cctv_analytics', express.static(FRONTEND_PATH));

// SPA fallback ONLY for this path
app.get('/cctv_analytics/*', (req, res) => {
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// ==========================
// Error handling
// ==========================
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;