const express = require('express');
const logger = require('./logger');
const logManager = require('./logManager');
const poller = require('./poller');

/**
 * HTTP Server for Script Execution Monitoring
 * Provides REST API for monitoring script execution status
 */
class HttpServer {
    constructor() {
        this.app = express();
        this.port = parseInt(process.env.HTTP_PORT) || 5000;
        this.server = null;
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        this.app.use(express.json());

        // Request logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.url}`);
            next();
        });

        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                message: 'Script execution server is running',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // Server status
        this.app.get('/status', (req, res) => {
            const runningScripts = Array.from(poller.runningScripts.keys());

            res.json({
                success: true,
                data: {
                    isPolling: poller.isRunning,
                    pollInterval: poller.pollIntervalMs,
                    runningScripts: runningScripts.length,
                    runningExecutionIds: runningScripts,
                    backendUrl: poller.backendUrl
                }
            });
        });

        // Get currently running executions
        this.app.get('/executions/running', (req, res) => {
            const runningScripts = Array.from(poller.runningScripts.keys());

            res.json({
                success: true,
                count: runningScripts.length,
                data: runningScripts.map(id => ({ executionId: id }))
            });
        });

        // Get recent execution history
        this.app.get('/executions/recent', (req, res) => {
            const limit = parseInt(req.query.limit) || 20;
            const date = req.query.date ? new Date(req.query.date) : new Date();

            const logFiles = logManager.getLogFilesForDate(date);
            const recent = logFiles.slice(0, limit).map(file => ({
                executionId: file.executionId,
                filename: file.filename,
                summary: logManager.getLogSummary(file.executionId, date)
            }));

            res.json({
                success: true,
                count: recent.length,
                data: recent
            });
        });

        // Get logs for specific execution
        this.app.get('/logs/:executionId', (req, res) => {
            const { executionId } = req.params;
            const date = req.query.date ? new Date(req.query.date) : new Date();

            const logs = logManager.readLogs(executionId, date);

            if (!logs) {
                return res.status(404).json({
                    success: false,
                    message: 'Logs not found for this execution'
                });
            }

            res.json({
                success: true,
                data: {
                    executionId,
                    logs,
                    summary: logManager.getLogSummary(executionId, date)
                }
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                message: 'Endpoint not found'
            });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            logger.error('HTTP Server Error:', err);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: err.message
            });
        });
    }

    /**
     * Start HTTP server
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    logger.info(`HTTP server listening on port ${this.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    logger.error('HTTP server error:', error);
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop HTTP server
     */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('HTTP server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = new HttpServer();
