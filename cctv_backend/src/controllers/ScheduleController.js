const ExamSchedule = require("../models/ExamSchedule");
const ScheduleShift = require("../models/ScheduleShift");
const Exam = require("../models/Exam");
const { sequelize } = require("../config/db");
const fs = require("fs");
const ExcelParser = require("../services/excelParser");


/**
 * Create schedule with shifts
 */
exports.createSchedule = async (req, res) => {
    const { exam_date, shifts, notes } = req.body;
    const exam_id = req.params.examId;

    // Verify exam exists
    const exam = await Exam.findByPk(exam_id);
    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    // Use transaction for schedule + shifts
    const result = await sequelize.transaction(async (t) => {
        const schedule = await ExamSchedule.create(
            { exam_id, exam_date, notes: notes || null },
            { transaction: t }
        );

        if (shifts && shifts.length > 0) {
            const shiftData = shifts.map((s) => ({
                schedule_id: schedule.id,
                shift_name: s.shift_name,
                start_time: s.start_time,
                end_time: s.end_time,
            }));
            await ScheduleShift.bulkCreate(shiftData, { transaction: t });
        }

        // Re-fetch with shifts
        return await ExamSchedule.findByPk(schedule.id, {
            include: [{ model: ScheduleShift, as: "shifts" }],
            transaction: t,
        });
    });

    res.status(201).json({
        success: true,
        message: "Schedule created successfully",
        data: result,
    });
};


/**
 * Upload Excel file with schedules
 */
exports.uploadSchedules = async (req, res) => {
    const exam_id = req.params.examId;

    const exam = await Exam.findByPk(exam_id);
    if (!exam) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "No file uploaded",
        });
    }

    const parseResult = ExcelParser.parseExamSchedule(req.file.path, exam_id);
    fs.unlinkSync(req.file.path);

    if (!parseResult.success || parseResult.data.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Failed to parse Excel file",
            errors: parseResult.errors,
        });
    }

    // Create each schedule with its shifts inside a transaction
    for (const scheduleData of parseResult.data) {
        await sequelize.transaction(async (t) => {
            const schedule = await ExamSchedule.create(
                {
                    exam_id: scheduleData.exam_id,
                    exam_date: scheduleData.exam_date,
                    notes: scheduleData.notes || null,
                },
                { transaction: t }
            );

            if (scheduleData.shifts && scheduleData.shifts.length > 0) {
                const shiftData = scheduleData.shifts.map((s) => ({
                    schedule_id: schedule.id,
                    shift_name: s.shift_name,
                    start_time: s.start_time,
                    end_time: s.end_time,
                }));
                await ScheduleShift.bulkCreate(shiftData, { transaction: t });
            }
        });
    }

    res.status(201).json({
        success: true,
        message: `Successfully imported ${parseResult.count} schedules`,
        count: parseResult.count,
        errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
    });
};


/**
 * Get all schedules for an exam
 */
exports.getByExam = async (req, res) => {
    const { is_active, include_shifts } = req.query;

    const where = { exam_id: req.params.examId };
    if (is_active !== undefined) where.is_active = is_active === "true";

    const include =
        include_shifts !== "false"
            ? [{ model: ScheduleShift, as: "shifts" }]
            : [];

    const schedules = await ExamSchedule.findAll({
        where,
        include,
        order: [["exam_date", "ASC"]],
    });

    res.json({
        success: true,
        count: schedules.length,
        data: schedules,
    });
};


/**
 * Get upcoming shifts (uses raw query for the view)
 */
exports.getUpcoming = async (req, res) => {
    const hoursAhead = parseInt(req.query.hours) || 24;
    const { query: rawQuery } = require("../config/database");

    const shifts = await rawQuery(
        `SELECT * FROM upcoming_shifts
         WHERE shift_start_datetime BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)
         ORDER BY shift_start_datetime ASC`,
        [hoursAhead]
    );

    res.json({
        success: true,
        count: shifts.length,
        data: shifts,
    });
};


/**
 * Update schedule
 */
exports.updateSchedule = async (req, res) => {
    const schedule = await ExamSchedule.findByPk(req.params.id);

    if (!schedule) {
        return res.status(404).json({
            success: false,
            message: "Schedule not found",
        });
    }

    await schedule.update(req.body);

    res.json({
        success: true,
        message: "Schedule updated successfully",
        data: schedule,
    });
};


/**
 * Delete schedule (soft delete)
 */
exports.deleteSchedule = async (req, res) => {
    await ExamSchedule.update(
        { is_active: false },
        { where: { id: req.params.id } }
    );

    res.json({
        success: true,
        message: "Schedule deleted successfully",
    });
};
