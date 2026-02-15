const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * LogManager
 * Handles execution log file management
 */
class LogManager {
    constructor() {
        this.logsDir = process.env.LOGS_DIR || './logs/executions';
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
            logger.info(`Created logs directory: ${this.logsDir}`);
        }
    }

    /**
     * Get log file path for an execution
     */
    getLogFilePath(executionId, date = new Date()) {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const dayDir = path.join(this.logsDir, dateStr);

        // Ensure day directory exists
        if (!fs.existsSync(dayDir)) {
            fs.mkdirSync(dayDir, { recursive: true });
        }

        return path.join(dayDir, `execution-${executionId}.log`);
    }

    /**
     * Write log entry for an execution
     */
    writeLog(executionId, message, level = 'INFO') {
        try {
            const logPath = this.getLogFilePath(executionId);
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] [${level}] ${message}\n`;

            fs.appendFileSync(logPath, logEntry);
        } catch (error) {
            logger.error(`Failed to write log for execution ${executionId}:`, error);
        }
    }

    /**
     * Read logs for an execution
     */
    readLogs(executionId, date = new Date()) {
        try {
            const logPath = this.getLogFilePath(executionId, date);

            if (!fs.existsSync(logPath)) {
                return null;
            }

            return fs.readFileSync(logPath, 'utf8');
        } catch (error) {
            logger.error(`Failed to read logs for execution ${executionId}:`, error);
            return null;
        }
    }

    /**
     * Get all log files for a date
     */
    getLogFilesForDate(date = new Date()) {
        const dateStr = date.toISOString().split('T')[0];
        const dayDir = path.join(this.logsDir, dateStr);

        if (!fs.existsSync(dayDir)) {
            return [];
        }

        return fs.readdirSync(dayDir)
            .filter(file => file.endsWith('.log'))
            .map(file => ({
                filename: file,
                path: path.join(dayDir, file),
                executionId: file.match(/execution-(\d+)\.log/)?.[1]
            }));
    }

    /**
     * Clean up old log files (older than specified days)
     */
    cleanupOldLogs(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const allDirs = fs.readdirSync(this.logsDir);

            for (const dir of allDirs) {
                const dirPath = path.join(this.logsDir, dir);
                const stat = fs.statSync(dirPath);

                if (stat.isDirectory()) {
                    const dirDate = new Date(dir);
                    if (dirDate < cutoffDate) {
                        fs.rmSync(dirPath, { recursive: true, force: true });
                        logger.info(`Cleaned up old logs: ${dir}`);
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to cleanup old logs:', error);
        }
    }

    /**
     * Get log summary for an execution
     */
    getLogSummary(executionId, date = new Date()) {
        const logs = this.readLogs(executionId, date);

        if (!logs) {
            return null;
        }

        const lines = logs.split('\n').filter(line => line.trim());
        const errorLines = lines.filter(line => line.includes('[ERROR]'));
        const warnLines = lines.filter(line => line.includes('[WARN]'));

        return {
            totalLines: lines.length,
            errors: errorLines.length,
            warnings: warnLines.length,
            lastLine: lines[lines.length - 1] || '',
            hasErrors: errorLines.length > 0
        };
    }
}

module.exports = new LogManager();
