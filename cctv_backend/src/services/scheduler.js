const cron = require('node-cron');
const ExamSchedule = require('../models/ExamSchedule');
const AnalyticsTask = require('../models/AnalyticsTask');
const ScriptExecution = require('../models/ScriptExecution');
const CameraLink = require('../models/CameraLink');
const logger = require('../utils/logger');

/**
 * Scheduler Service
 * Manages automatic scheduling of script executions based on exam schedules and analytics tasks
 */
class Scheduler {
    constructor() {
        this.isRunning = false;
        this.cronJob = null;
    }

    /**
     * Start the scheduler
     */
    start() {
        if (this.isRunning) {
            logger.warn('Scheduler is already running');
            return;
        }

        // Run every minute to check for upcoming shifts and tasks
        const cronExpression = process.env.SCHEDULER_CHECK_INTERVAL || '*/1 * * * *';

        this.cronJob = cron.schedule(cronExpression, async () => {
            await this.checkAndScheduleExecutions();
        });

        this.isRunning = true;
        logger.info('Scheduler service started');
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.isRunning = false;
            logger.info('Scheduler service stopped');
        }
    }

    /**
     * Main scheduling logic
     * Checks for upcoming shifts and creates execution records
     */
    async checkAndScheduleExecutions() {
        try {
            logger.debug('Running scheduler check...');

            // Get preparation time from env (default 5 minutes)
            const prepTimeMinutes = parseInt(process.env.EXECUTION_PREP_TIME_MINUTES || '5');

            // Get upcoming shifts (within next X hours)
            const upcomingShifts = await ExamSchedule.getUpcomingShifts(24);

            for (const shift of upcomingShifts) {
                await this.scheduleShiftExecutions(shift, prepTimeMinutes);
            }

            // Also check for continuous analytics tasks
            await this.scheduleContinuousAnalytics();

            logger.debug('Scheduler check completed');
        } catch (error) {
            logger.error('Error in scheduler check:', error);
        }
    }

    /**
     * Schedule executions for a specific shift
     */
    async scheduleShiftExecutions(shift, prepTimeMinutes) {
        try {
            const shiftStartTime = new Date(shift.shift_start_datetime);
            const now = new Date();
            const timeDiff = (shiftStartTime - now) / 1000 / 60; // minutes

            // Only schedule if shift is starting within prep time window
            if (timeDiff > prepTimeMinutes || timeDiff < 0) {
                return;
            }

            logger.info(`Scheduling executions for shift: ${shift.shift_name} on ${shift.exam_date}`);

            // Get all active analytics tasks for this exam
            const analyticsTasks = await AnalyticsTask.findByExamId(shift.exam_id, { is_active: true });

            // Get all active cameras for this exam
            const cameras = await CameraLink.findByExamId(shift.exam_id, { is_active: true });

            if (cameras.length === 0) {
                logger.warn(`No cameras found for exam ${shift.exam_id}`);
                return;
            }

            // Create execution records for each task-camera combination
            const executions = [];

            for (const task of analyticsTasks) {
                // Check if task should run during this shift time
                if (!this.shouldTaskRunInShift(task, shift)) {
                    continue;
                }

                for (const camera of cameras) {
                    // Check if execution already exists
                    const existing = await this.checkExistingExecution(
                        shift.shift_id,
                        camera.id,
                        task.id,
                        shiftStartTime
                    );

                    if (!existing) {
                        executions.push({
                            shift_id: shift.shift_id,
                            camera_link_id: camera.id,
                            analytics_task_id: task.id,
                            scheduled_time: shiftStartTime,
                            execution_metadata: {
                                exam_name: shift.exam_name,
                                shift_name: shift.shift_name,
                                camera_id: camera.camera_id,
                                task_name: task.task_name
                            }
                        });
                    }
                }
            }

            if (executions.length > 0) {
                await ScriptExecution.bulkCreate(executions);
                logger.info(`Created ${executions.length} execution records for shift ${shift.shift_name}`);
            }
        } catch (error) {
            logger.error(`Error scheduling shift executions:`, error);
        }
    }

    /**
     * Schedule continuous analytics tasks (not tied to specific shifts)
     */
    async scheduleContinuousAnalytics() {
        try {
            const now = new Date();

            // Get all active tasks for current time
            const activeTasks = await AnalyticsTask.getActiveTasksForTime(now);

            for (const task of activeTasks) {
                // Get cameras for this exam
                const cameras = await CameraLink.findByExamId(task.exam_id, { is_active: true });

                for (const camera of cameras) {
                    // Check if we need to schedule based on frequency
                    const shouldSchedule = await this.shouldScheduleContinuousTask(task, camera.id);

                    if (shouldSchedule) {
                        // Schedule for immediate execution
                        const scheduledTime = new Date(now.getTime() + 60000); // 1 minute from now

                        const existing = await this.checkExistingExecution(
                            null,
                            camera.id,
                            task.id,
                            scheduledTime
                        );

                        if (!existing) {
                            await ScriptExecution.create({
                                shift_id: null,
                                camera_link_id: camera.id,
                                analytics_task_id: task.id,
                                scheduled_time: scheduledTime,
                                execution_metadata: {
                                    task_name: task.task_name,
                                    camera_id: camera.camera_id,
                                    scheduled_type: 'continuous'
                                }
                            });

                            logger.debug(`Scheduled continuous task ${task.task_name} for camera ${camera.camera_id}`);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('Error scheduling continuous analytics:', error);
        }
    }

    /**
     * Check if a task should run during a specific shift
     */
    shouldTaskRunInShift(task, shift) {
        // If task has no time restrictions, it runs in all shifts
        if (!task.start_time && !task.end_time) {
            return true;
        }

        const shiftStart = shift.start_time;
        const shiftEnd = shift.end_time;

        // Check if task time window overlaps with shift time
        if (task.start_time && task.start_time > shiftEnd) {
            return false;
        }

        if (task.end_time && task.end_time < shiftStart) {
            return false;
        }

        return true;
    }

    /**
     * Check if a continuous task should be scheduled based on frequency
     */
    async shouldScheduleContinuousTask(task, cameraId) {
        // Get last execution for this task-camera combination
        const executions = await ScriptExecution.findAll({
            analytics_task_id: task.id,
            limit: 1
        });

        if (executions.length === 0) {
            return true; // No previous execution, schedule it
        }

        const lastExecution = executions[0];
        const lastScheduledTime = new Date(lastExecution.scheduled_time);
        const now = new Date();
        const minutesSinceLastSchedule = (now - lastScheduledTime) / 1000 / 60;

        // Schedule if enough time has passed based on frequency
        return minutesSinceLastSchedule >= task.frequency_minutes;
    }

    /**
     * Check if execution already exists
     */
    async checkExistingExecution(shiftId, cameraId, taskId, scheduledTime) {
        const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds
        const startTime = new Date(scheduledTime.getTime() - timeWindow);
        const endTime = new Date(scheduledTime.getTime() + timeWindow);

        const executions = await ScriptExecution.findAll({
            analytics_task_id: taskId,
            from_date: startTime,
            to_date: endTime,
            limit: 10
        });

        return executions.some(exec =>
            exec.camera_link_id === cameraId &&
            (shiftId === null || exec.shift_id === shiftId)
        );
    }
}

// Create singleton instance
const schedulerInstance = new Scheduler();

module.exports = schedulerInstance;
