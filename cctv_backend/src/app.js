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
const clientDashboardRoutes = require('./routes/clientDashboard');
const clientDetectionsRoutes = require('./routes/clientDetections');
const dashboardRoutes = require('./routes/dashboard');
const clientApiRoutes = require('./routes/clientApi');

const path = require('path');

// Create Express app
const app = express();

// Middleware
app.use(cors());

// ==========================
// TC Video Upload Service — reverse proxy  (MUST be before body parsers!)
// Forwards /video-upload/* → http://100.81.36.13:8080/*
// Uses Node's built-in http module (no extra dependency) and
// pipes request/response bodies so multi-GB uploads stream through
// without being buffered in memory.
// ==========================
const http = require('http');
const VIDEO_UPLOAD_TARGET = process.env.VIDEO_UPLOAD_TARGET || 'http://100.81.36.13:8080';
const videoUploadUrl = new URL(VIDEO_UPLOAD_TARGET);

app.all('/video-upload/*', (req, res) => {
    // Strip the /video-upload prefix → upstream path
    const upstreamPath = req.originalUrl.replace(/^\/video-upload\/?/, '/');

    const proxyOpts = {
        hostname: videoUploadUrl.hostname,
        port: videoUploadUrl.port || 80,
        path: upstreamPath,
        method: req.method,
        headers: {
            ...req.headers,
            host: videoUploadUrl.host,
        },
    };
    // Remove headers that shouldn't be forwarded
    delete proxyOpts.headers['host'];
    proxyOpts.headers['host'] = videoUploadUrl.host;

    const proxyReq = http.request(proxyOpts, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        logger.error('Video upload proxy error', { error: err.message, path: upstreamPath });
        if (!res.headersSent) {
            res.status(502).json({
                ok: false,
                error: 'Upload service unreachable',
                detail: err.message,
            });
        }
    });

    // Pipe the incoming request body (multipart uploads) directly to upstream
    req.pipe(proxyReq, { end: true });
});

// Body parsers — placed AFTER the upload proxy so multipart streams are not consumed
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
// API Docs (Swagger UI)
// Must be mounted BEFORE the SPA static + wildcard below,
// otherwise /api-docs* would be hijacked by the React index.html.
// ==========================
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('./docs');

// Runs in the browser on the docs page. Wraps fetch so that whenever a
// POST /api/auth/login returns 200, the token from data.token is fed
// straight into Swagger UI's Authorize state — no manual copy/paste.
const autoAuthScript = `
(function () {
    function attach() {
        if (!window.ui || typeof window.ui.preauthorizeApiKey !== 'function') {
            return setTimeout(attach, 100);
        }
        var origFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            var p = origFetch(input, init);
            if (url.indexOf('/api/auth/login') !== -1) {
                p.then(function (res) {
                    if (!res.ok) return;
                    res.clone().json().then(function (body) {
                        var token = body && body.data && body.data.token;
                        if (token) {
                            window.ui.preauthorizeApiKey('bearerAuth', token);
                            console.log('[swagger] Bearer token captured from /login response');
                        }
                    }).catch(function () {});
                }).catch(function () {});
            }
            return p;
        };
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        attach();
    }
})();
`;

app.use(
    '/cctv_analytics/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
        explorer: false,
        customSiteTitle: 'CCTV Analytics API Docs',
        customJsStr: autoAuthScript,
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
        },
    })
);

app.get('/cctv_analytics/api-docs.json', (req, res) => {
    res.json(openapiSpec);
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
app.use(`${BASE}/api/client-dashboard`, clientDashboardRoutes);
app.use(`${BASE}/api/client-detections`, clientDetectionsRoutes);
app.use(`${BASE}/api/dashboard`, dashboardRoutes);
app.use(`${BASE}/api/v1`, clientApiRoutes); // external client API (CCTV_API_v1.2)

// ==========================
// Frontend (optional)
// ==========================
const FRONTEND_PATH = path.join(__dirname, '../../cctv_frontend/dist');

// Serve frontend ONLY under /cctv_analytics
app.use('/cctv_analytics', express.static(FRONTEND_PATH, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

app.get('/cctv_analytics/assets/*', (req, res) => {
    res.status(404).type('text/plain').send('Asset not found');
});

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
