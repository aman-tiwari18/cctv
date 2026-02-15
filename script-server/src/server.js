require('dotenv').config();
const poller = require('./poller');
const logger = require('./logger');
const httpServer = require('./httpServer');
const logManager = require('./logManager');

/**
 * Start the script execution server
 */
const startServer = async () => {
    try {
        logger.info('Starting CCTV Script Execution Server...');
        logger.info(`Main backend URL: ${process.env.MAIN_BACKEND_URL}`);
        logger.info(`Poll interval: ${process.env.POLL_INTERVAL_MS}ms`);
        logger.info(`Scripts directory: ${process.env.SCRIPTS_DIR || './scripts'}`);
        logger.info(`HTTP server port: ${process.env.HTTP_PORT || 5000}`);

        // Start HTTP server
        await httpServer.start();

        // Start poller
        poller.start();

        // Schedule log cleanup (run daily)
        setInterval(() => {
            logManager.cleanupOldLogs(30); // Keep logs for 30 days
        }, 24 * 60 * 60 * 1000);

        logger.info('Script execution server started successfully');

        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            logger.info(`${signal} received. Shutting down...`);
            poller.stop();
            await httpServer.stop();
            process.exit(0);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        logger.error('Failed to start script server:', error);
        process.exit(1);
    }
};

// Start the server
startServer();
