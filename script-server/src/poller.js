const axios = require('axios');
const scriptRunner = require('./scriptRunner');
const logger = require('./logger');

class Poller {
    constructor() {
        this.isRunning = false;
        this.pollInterval = null;
        this.backendUrl = process.env.MAIN_BACKEND_URL;
        this.apiKey = process.env.API_KEY;
        this.pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS) || 30000;
        this.runningScripts = new Map();
    }

    /**
     * Start polling for pending assignments
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
     * Poll main backend for pending assignments
     */
    async poll() {
        try {
            logger.debug('Polling for pending assignments...');

            const response = await axios.get(
                `${this.backendUrl}/executions/pending`,
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    params: {
                        limit: 10
                    }
                }
            );

            const pendingAssignments = response.data.data || [];

            if (pendingAssignments.length > 0) {
                logger.info(`Found ${pendingAssignments.length} pending assignments`);

                for (const assignment of pendingAssignments) {
                    await this.processAssignment(assignment);
                }
            } else {
                logger.info('No pending assignments found');
            }

        } catch (error) {
            logger.error('Error polling for assignments:', {
                message: error.message,
                url: error.config?.url
            });
        }
    }

    /**
     * Process a single assignment
     */
    async processAssignment(assignment) {
        const assignmentId = assignment.id;

        // Skip if already running
        if (this.runningScripts.has(assignmentId)) {
            logger.debug(`Assignment ${assignmentId} is already running`);
            return;
        }

        try {
            logger.info(`Processing assignment ${assignmentId}: ${assignment.task_name}`);

            // Mark as running in backend
            await this.updateAssignmentStatus(assignmentId, 'RUNNING');

            // Track as running locally
            this.runningScripts.set(assignmentId, true);

            // Execute the script
            const result = await scriptRunner.executeScript(assignment);

            // Mark as completed
            await this.updateAssignmentStatus(assignmentId, 'COMPLETED', {
                result_data: result
            });

            logger.info(`Assignment ${assignmentId} completed successfully`);

        } catch (error) {
            logger.error(`Assignment ${assignmentId} failed:`, error);

            // Mark as failed
            await this.updateAssignmentStatus(assignmentId, 'FAILED', {
                error_log: error.message
            });

        } finally {
            // Remove from running scripts
            this.runningScripts.delete(assignmentId);
        }
    }

    /**
     * Update assignment status in main backend
     */
    async updateAssignmentStatus(assignmentId, status, data = {}) {
        try {
            await axios.put(
                `${this.backendUrl}/executions/${assignmentId}/status`,
                {
                    status,
                    ...data
                },
                {
                    headers: {
                        'X-API-Key': this.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            logger.debug(`Updated assignment ${assignmentId} status to ${status}`);
        } catch (error) {
            logger.error(`Failed to update assignment ${assignmentId} status:`, error.message);
            throw error;
        }
    }
}

module.exports = new Poller();
