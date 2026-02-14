require('dotenv').config();
const poller = require('./poller');
const logger = require('./logger');

/**
 * Start the script execution server
 */
const startServer = () => {
    try {
        logger.info('Starting CCTV Script Execution Server...');
        logger.info(`Main backend URL: ${process.env.MAIN_BACKEND_URL}`);
        logger.info(`Poll interval: ${process.env.POLL_INTERVAL_MS}ms`);
        logger.info(`Scripts directory: ${process.env.SCRIPTS_DIR || './scripts'}`);

        // Start poller
        poller.start();

        logger.info('Script execution server started successfully');

        // Graceful shutdown
        const gracefulShutdown = (signal) => {
            logger.info(`${signal} received. Shutting down...`);
            poller.stop();
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
