const cron = require('node-cron');
const { Op } = require('sequelize');
const { query } = require('../config/database');
const ExamSchedule = require('../models/ExamSchedule');
const AnalyticsTask = require('../models/AnalyticsTask');
const ScriptExecution = require('../models/ScriptExecution');
const CameraLink = require('../models/CameraLink');
const ShiftScriptAssignment = require('../models/ShiftScriptAssignment');
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

            // Get upcoming shifts (raw query against the DB view)
            const upcomingShifts = await query(
                `SELECT * FROM upcoming_shifts
                 WHERE shift_start_datetime BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)
                 ORDER BY shift_start_datetime ASC`
            );

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
     * Scripts are executed based on shift assignments, not cameras
     */
    async scheduleShiftExecutions(shift, prepTimeMinutes) {
        try {
            const shiftStartTime = new Date(shift.shift_start_datetime);
            const shiftEndTime = new Date(shift.shift_end_datetime);
            const now = new Date();

            // Get shift-based script assignments for this shift
            const scriptAssignments = await ShiftScriptAssignment.findAll({
                where: { shift_id: shift.shift_id, is_active: true },
                include: [
                    {
                        model: AnalyticsTask,
                        as: 'analyticsTask',
                        where: { is_active: true },
                    },
                ],
            });

            if (scriptAssignments.length === 0) {
                logger.debug(`No script assignments found for shift ${shift.shift_id}`);
                return;
            }

            // Create execution records for each script assignment
            const executions = [];

            for (const assignment of scriptAssignments) {
                const task = assignment.analyticsTask;

                // Determine the scheduled time for this assignment
                let scheduledTime = shiftStartTime;

                // If custom start time is specified, use it
                if (assignment.custom_start_time) {
                    const [hours, minutes, seconds] = assignment.custom_start_time.split(':');
                    scheduledTime = new Date(shift.shift_start_datetime);
                    scheduledTime.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds || 0));
                }

                // Check if this specific script should be scheduled
                const timeDiff = (scheduledTime - now) / 1000 / 60; // minutes

                // Only schedule if:
                // 1. Script time is within prep window (upcoming)
                // 2. Script time hasn't passed yet
                // 3. Script is before shift end time
                if (timeDiff > prepTimeMinutes || timeDiff < 0 || scheduledTime > shiftEndTime) {
                    continue; // Skip this assignment
                }

                logger.info(`Scheduling script ${task.task_name} for ${scheduledTime.toISOString()}`);

                // Check if execution already exists
                const existing = await this.checkExistingExecution(
                    shift.shift_id,
                    null, // No camera required
                    assignment.analytics_task_id,
                    scheduledTime
                );

                if (!existing) {
                    executions.push({
                        shift_id: shift.shift_id,
                        camera_link_id: null, // Scripts run without specific camera
                        analytics_task_id: assignment.analytics_task_id,
                        scheduled_time: scheduledTime,
                        execution_metadata: {
                            exam_name: shift.exam_name,
                            exam_id: shift.exam_id,
                            shift_name: shift.shift_name,
                            task_name: task.task_name,
                            assignment_id: assignment.id,
                            script_path: task.script_path,
                        },
                    });
                }
            }

            if (executions.length > 0) {
                await ScriptExecution.bulkCreate(executions);
                logger.info(`Created ${executions.length} execution records for shift ${shift.shift_name}`);
            } else {
                logger.debug(`No new executions to create for shift ${shift.shift_name}`);
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
            const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS

            // Get all active tasks for current time
            const activeTasks = await AnalyticsTask.findAll({
                where: {
                    is_active: true,
                    [Op.or]: [
                        { start_time: null },
                        { start_time: { [Op.lte]: timeStr } },
                    ],
                    [Op.or]: [
                        { end_time: null },
                        { end_time: { [Op.gte]: timeStr } },
                    ],
                },
                order: [['exam_id', 'ASC'], ['task_name', 'ASC']],
            });

            for (const task of activeTasks) {
                // Get cameras for this exam
                const cameras = await CameraLink.findAll({
                    where: { exam_id: task.exam_id, is_active: true },
                });

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
                                    scheduled_type: 'continuous',
                                },
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
            where: { analytics_task_id: task.id },
            order: [['scheduled_time', 'DESC']],
            limit: 1,
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

        const where = {
            analytics_task_id: taskId,
            scheduled_time: {
                [Op.between]: [startTime, endTime],
            },
        };

        if (cameraId !== null) where.camera_link_id = cameraId;
        if (shiftId !== null) where.shift_id = shiftId;

        const count = await ScriptExecution.count({ where });
        return count > 0;
    }
}

// Create singleton instance
const schedulerInstance = new Scheduler();

module.exports = schedulerInstance;
