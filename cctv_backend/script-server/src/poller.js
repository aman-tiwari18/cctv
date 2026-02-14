const axios = require('axios');
const scriptRunner = require('./scriptRunner');
const logger = require('./logger');

class Poller {
    constructor() {
        this.isRunning = false;
        this.pollInterval = null;
        this.backendUrl = process.env.MAIN_BACKEND_URL;
        this.jwtToken = process.env.JWT_TOKEN;
        this.pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS) || 30000;
        this.runningScripts = new Map();
    }

    /**
     * Start polling for pending executions
     */
    start() {
        if (this.isRunning) {
            logger.warn('Poller is already running');
            return;
        }

        logger.info('Starting poller service...');
        this.isRunning = true;

        // Poll immediately, then at intervals
        this.poll();
        this.pollInterval = setInterval(() => this.poll(), this.pollIntervalMs);

        logger.info(`Poller started with interval: ${this.pollIntervalMs}ms`);
    }

    /**
     * Stop polling
     */
    stop() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.isRunning = false;
        logger.info('Poller stopped');
    }

    /**
     * Poll main backend for pending executions
     */
    async poll() {
        try {
            logger.debug('Polling for pending executions...');

            const response = await axios.get(
                `${this.backendUrl}/api/executions/pending`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.jwtToken}`
                    },
                    params: {
                        limit: 10
                    }
                }
            );

            const pendingExecutions = response.data.data || [];

            if (pendingExecutions.length > 0) {
                logger.info(`Found ${pendingExecutions.length} pending executions`);

                for (const execution of pendingExecutions) {
                    await this.processExecution(execution);
                }
            } else {
                logger.debug('No pending executions found');
            }

        } catch (error) {
            logger.error('Error polling for executions:', {
                message: error.message,
                url: error.config?.url
            });
        }
    }

    /**
     * Process a single execution
     */
    async processExecution(execution) {
        const executionId = execution.id;

        // Skip if already running
        if (this.runningScripts.has(executionId)) {
            logger.debug(`Execution ${executionId} is already running`);
            return;
        }

        try {
            logger.info(`Processing execution ${executionId}: ${execution.task_name}`);

            // Mark as running in backend
            await this.updateExecutionStatus(executionId, 'RUNNING');

            // Track as running locally
            this.runningScripts.set(executionId, true);

            // Execute the script
            const result = await scriptRunner.executeScript(execution);

            // Mark as completed
            await this.updateExecutionStatus(executionId, 'COMPLETED', {
                result_data: result
            });

            logger.info(`Execution ${executionId} completed successfully`);

        } catch (error) {
            logger.error(`Execution ${executionId} failed:`, error);

            // Mark as failed
            await this.updateExecutionStatus(executionId, 'FAILED', {
                error_log: error.message
            });

        } finally {
            // Remove from running scripts
            this.runningScripts.delete(executionId);
        }
    }

    /**
     * Update execution status in main backend
     */
    async updateExecutionStatus(executionId, status, data = {}) {
        try {
            await axios.put(
                `${this.backendUrl}/api/executions/${executionId}/status`,
                {
                    status,
                    ...data
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.jwtToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            logger.debug(`Updated execution ${executionId} status to ${status}`);
        } catch (error) {
            logger.error(`Failed to update execution ${executionId} status:`, error.message);
            throw error;
        }
    }
}

module.exports = new Poller();
