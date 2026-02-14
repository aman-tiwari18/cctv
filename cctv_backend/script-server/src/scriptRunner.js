const { spawn } = require('child_process');
const path = require('path');
const logger = require('./logger');

class ScriptRunner {
    constructor() {
        this.scriptsDir = process.env.SCRIPTS_DIR || './scripts';
        this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_SCRIPTS) || 5;
        this.runningCount = 0;
    }

    /**
     * Execute a monitoring script
     * Note: The actual monitoring scripts are already implemented by the user
     * This just provides the execution framework
     */
    async executeScript(execution) {
        return new Promise((resolve, reject) => {
            const {
                script_path,
                task_parameters,
                stream_url,
                camera_id,
                execution_metadata
            } = execution;

            // Build script path
            const fullScriptPath = path.join(this.scriptsDir, script_path);

            logger.info(`Executing script: ${fullScriptPath}`, {
                camera_id,
                execution_id: execution.id
            });

            // Prepare script arguments
            const args = this.buildScriptArguments(execution);

            // Spawn the script process
            const scriptProcess = spawn('python', [fullScriptPath, ...args], {
                cwd: this.scriptsDir,
                env: {
                    ...process.env,
                    CAMERA_ID: camera_id || '',
                    STREAM_URL: stream_url || '',
                    EXECUTION_ID: execution.id.toString()
                }
            });

            let stdout = '';
            let stderr = '';

            // Capture stdout
            scriptProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                logger.debug(`Script ${execution.id} stdout:`, output.trim());
            });

            // Capture stderr
            scriptProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                logger.warn(`Script ${execution.id} stderr:`, output.trim());
            });

            // Handle script completion
            scriptProcess.on('close', (code) => {
                if (code === 0) {
                    logger.info(`Script ${execution.id} completed successfully`);

                    // Try to parse stdout as JSON for structured results
                    let result;
                    try {
                        result = JSON.parse(stdout);
                    } catch (e) {
                        result = { output: stdout.trim() };
                    }

                    resolve(result);
                } else {
                    logger.error(`Script ${execution.id} exited with code ${code}`);
                    reject(new Error(`Script exited with code ${code}: ${stderr}`));
                }
            });

            // Handle script errors
            scriptProcess.on('error', (error) => {
                logger.error(`Script ${execution.id} error:`, error);
                reject(error);
            });

            // Set timeout if duration is specified
            if (execution.duration_minutes) {
                const timeoutMs = execution.duration_minutes * 60 * 1000;
                setTimeout(() => {
                    if (!scriptProcess.killed) {
                        logger.warn(`Script ${execution.id} timeout, killing process`);
                        scriptProcess.kill('SIGTERM');
                        reject(new Error('Script execution timeout'));
                    }
                }, timeoutMs);
            }
        });
    }

    /**
     * Build command-line arguments for the script
     */
    buildScriptArguments(execution) {
        const args = [];

        // Add camera URL if available
        if (execution.stream_url) {
            args.push('--stream-url', execution.stream_url);
        }

        // Add camera ID if available
        if (execution.camera_id) {
            args.push('--camera-id', execution.camera_id);
        }

        // Add task parameters as JSON
        if (execution.task_parameters) {
            args.push('--params', JSON.stringify(execution.task_parameters));
        }

        // Add execution metadata
        if (execution.execution_metadata) {
            args.push('--metadata', JSON.stringify(execution.execution_metadata));
        }

        return args;
    }
}

module.exports = new ScriptRunner();
