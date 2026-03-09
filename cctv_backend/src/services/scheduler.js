const cron = require('node-cron');
const { Op } = require('sequelize');
const ExamShift = require('../models/ExamShift');
const Exam = require('../models/Exam');
const Script = require('../models/Script');
const ScriptExecution = require('../models/ScriptExecution');
const CameraLink = require('../models/CameraLink');
const ShiftScriptAssignment = require('../models/ShiftScriptAssignment');
const logger = require('../utils/logger');

/**
 * Scheduler Service
 * Manages automatic scheduling of script executions based on exam shifts
 */
class Scheduler {
    constructor() {
        this.isRunning = false;
        this.cronJob = null;
    }

    start() {
        if (this.isRunning) {
            logger.warn('Scheduler is already running');
            return;
        }

        const cronExpression = process.env.SCHEDULER_CHECK_INTERVAL || '*/1 * * * *';

        this.cronJob = cron.schedule(cronExpression, async () => {
            await this.checkAndScheduleExecutions();
        });

        this.isRunning = true;
        logger.info('Scheduler service started');
    }

    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.isRunning = false;
            logger.info('Scheduler service stopped');
        }
    }

    async checkAndScheduleExecutions() {
        try {
            logger.debug('Running scheduler check...');

            const prepTimeMinutes = parseInt(process.env.EXECUTION_PREP_TIME_MINUTES || '5');

            // Get active exam shifts with their exams
            const activeShifts = await ExamShift.findAll({
                where: { is_active: true },
                include: [
                    {
                        model: Exam,
                        as: 'exam',
                        where: { is_active: true },
                        attributes: ['id', 'exam_name', 'start_date', 'end_date', 'skip_days', 'skip_dates'],
                    },
                ],
            });

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDay = dayNames[now.getDay()];

            for (const shift of activeShifts) {
                const exam = shift.exam;

                if (exam.start_date && todayStr < exam.start_date) continue;
                if (exam.end_date && todayStr > exam.end_date) continue;

                const skipDays = exam.skip_days || [];
                if (skipDays.includes(currentDay)) continue;

                const skipDates = (exam.skip_dates || []).map(d => d.toString());
                if (skipDates.includes(todayStr)) continue;

                const shiftData = {
                    shift_id: shift.id,
                    exam_id: exam.id,
                    exam_name: exam.exam_name,
                    shift_name: shift.shift_name,
                    shift_start_datetime: `${todayStr}T${shift.start_time}`,
                    shift_end_datetime: `${todayStr}T${shift.end_time}`,
                };

                await this.scheduleShiftExecutions(shiftData, prepTimeMinutes);
            }

            logger.debug('Scheduler check completed');
        } catch (error) {
            logger.error('Error in scheduler check:', error);
        }
    }

    async scheduleShiftExecutions(shift, prepTimeMinutes) {
        try {
            const shiftStartTime = new Date(shift.shift_start_datetime);
            const shiftEndTime = new Date(shift.shift_end_datetime);
            const now = new Date();

            // Get script assignments for this shift
            const scriptAssignments = await ShiftScriptAssignment.findAll({
                where: { shift_id: shift.shift_id, is_active: true },
                include: [
                    {
                        model: Script,
                        as: 'script',
                        where: { is_active: true },
                    },
                ],
            });

            if (scriptAssignments.length === 0) {
                logger.debug(`No script assignments found for shift ${shift.shift_id}`);
                return;
            }

            const executions = [];

            for (const assignment of scriptAssignments) {
                const script = assignment.script;

                let scheduledTime = shiftStartTime;

                if (assignment.custom_start_time) {
                    const [hours, minutes, seconds] = assignment.custom_start_time.split(':');
                    scheduledTime = new Date(shift.shift_start_datetime);
                    scheduledTime.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds || 0));
                }

                const timeDiff = (scheduledTime - now) / 1000 / 60;

                if (timeDiff > prepTimeMinutes || timeDiff < 0 || scheduledTime > shiftEndTime) {
                    continue;
                }

                logger.info(`Scheduling script ${script.name} for ${scheduledTime.toISOString()}`);

                const existing = await this.checkExistingExecution(
                    shift.shift_id,
                    null,
                    script.id,
                    scheduledTime
                );

                if (!existing) {
                    executions.push({
                        shift_id: shift.shift_id,
                        camera_link_id: null,
                        script_id: script.id,
                        scheduled_time: scheduledTime,
                        execution_metadata: {
                            exam_name: shift.exam_name,
                            exam_id: shift.exam_id,
                            shift_name: shift.shift_name,
                            script_name: script.name,
                            assignment_id: assignment.id,
                            script_path: script.script_path,
                        },
                    });
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

    async checkExistingExecution(shiftId, cameraId, scriptId, scheduledTime) {
        const timeWindow = 5 * 60 * 1000;
        const startTime = new Date(scheduledTime.getTime() - timeWindow);
        const endTime = new Date(scheduledTime.getTime() + timeWindow);

        const where = {
            script_id: scriptId,
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

const schedulerInstance = new Scheduler();

module.exports = schedulerInstance;
