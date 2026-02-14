require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/database');
const scheduler = require('./services/scheduler');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

/**
 * Start the server
 */
const startServer = async () => {
    try {
        // Test database connection
        logger.info('Testing database connection...');
        await testConnection();

        // Start Express server
        const server = app.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`Health check: http://localhost:${PORT}/health`);
        });

        // Start scheduler service
        logger.info('Starting scheduler service...');
        scheduler.start();

        // Graceful shutdown
        const gracefulShutdown = (signal) => {
            logger.info(`${signal} received. Starting graceful shutdown...`);

            // Stop scheduler
            scheduler.stop();

            // Close server
            server.close(() => {
                logger.info('Server closed');
                process.exit(0);
            });

            // Force close after 10 seconds
            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer();
