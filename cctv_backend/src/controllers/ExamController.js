const Exam = require("../models/Exam");
const ExamShift = require("../models/ExamShift");
const ExamSchedule = require("../models/ExamSchedule");
const ScheduleShift = require("../models/ScheduleShift");
const { sequelize } = require("../config/db");


exports.createExam = async (req, res) => {
    const {
        exam_name, exam_body, link_type, description,
        start_date, end_date, skip_days, skip_dates, shifts
    } = req.body;

    const result = await sequelize.transaction(async (t) => {
        // Create the exam
        const exam = await Exam.create(
            {
                exam_name,
                exam_body,
                link_type,
                description,
                start_date: start_date || null,
                end_date: end_date || null,
                skip_days: skip_days || [],
                skip_dates: skip_dates || [],
            },
            { transaction: t }
        );

        // Create exam-level shifts if provided
        if (shifts && shifts.length > 0) {
            const shiftData = shifts.map((s) => ({
                exam_id: exam.id,
                shift_name: s.shift_name,
                start_time: s.start_time,
                end_time: s.end_time,
            }));
            await ExamShift.bulkCreate(shiftData, { transaction: t });
        }

        // Re-fetch with shifts
        return await Exam.findByPk(exam.id, {
            include: [{ model: ExamShift, as: "examShifts" }],
            transaction: t,
        });
    });

    res.status(201).json({
        success: true,
        message: "Exam created successfully",
        data: result,
    });
};


exports.getAllExams = async (req, res) => {
    const { is_active, exam_body } = req.query;

    const where = {};

    if (is_active !== undefined)
        where.is_active = is_active === "true";

    if (exam_body)
        where.exam_body = exam_body;

    const exams = await Exam.findAll({
        where,
        include: [{ model: ExamShift, as: "examShifts" }],
        order: [["created_at", "DESC"]],
    });

    res.json({
        success: true,
        count: exams.length,
        data: exams,
    });
};


exports.getExamById = async (req, res) => {
    const id = req.params.id;

    const exam = await Exam.findByPk(id, {
        include: [{ model: ExamShift, as: "examShifts" }],
    });

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    res.json({
        success: true,
        data: exam,
    });
};


exports.updateExam = async (req, res) => {
    const id = req.params.id;
    const { shifts, ...examFields } = req.body;

    const exam = await Exam.findByPk(id);

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    await sequelize.transaction(async (t) => {
        // Update exam fields
        await exam.update(examFields, { transaction: t });

        // If shifts are provided, replace all exam-level shifts
        if (shifts !== undefined) {
            // Deactivate old shifts
            await ExamShift.destroy({
                where: { exam_id: id },
                transaction: t,
            });

            if (shifts && shifts.length > 0) {
                const shiftData = shifts.map((s) => ({
                    exam_id: id,
                    shift_name: s.shift_name,
                    start_time: s.start_time,
                    end_time: s.end_time,
                }));
                await ExamShift.bulkCreate(shiftData, { transaction: t });
            }
        }
    });

    // Re-fetch
    const updatedExam = await Exam.findByPk(id, {
        include: [{ model: ExamShift, as: "examShifts" }],
    });

    res.json({
        success: true,
        message: "Exam updated successfully",
        data: updatedExam,
    });
};


exports.deleteExam = async (req, res) => {
    const id = req.params.id;

    await Exam.update(
        { is_active: false },
        { where: { id } }
    );

    res.json({
        success: true,
        message: "Exam deleted successfully",
    });
};


/**
 * Generate schedules from exam date range configuration.
 * Creates ExamSchedule + ScheduleShift entries for each valid date
 * that falls within [start_date, end_date] and is not skipped.
 */
exports.generateSchedules = async (req, res) => {
    const examId = req.params.id;

    const exam = await Exam.findByPk(examId, {
        include: [{ model: ExamShift, as: "examShifts" }],
    });

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    if (!exam.start_date || !exam.end_date) {
        return res.status(400).json({
            success: false,
            message: "Exam must have start_date and end_date configured",
        });
    }

    if (!exam.examShifts || exam.examShifts.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Exam must have at least one shift defined",
        });
    }

    const skipDays = exam.skip_days || [];
    const skipDates = (exam.skip_dates || []).map((d) => d.toString());

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // Calculate valid dates
    const validDates = [];
    const current = new Date(exam.start_date);
    const end = new Date(exam.end_date);

    while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];
        const dayName = dayNames[current.getDay()];

        const isSkippedDay = skipDays.includes(dayName);
        const isSkippedDate = skipDates.includes(dateStr);

        if (!isSkippedDay && !isSkippedDate) {
            validDates.push(dateStr);
        }

        current.setDate(current.getDate() + 1);
    }

    if (validDates.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No valid dates found after applying skip rules",
        });
    }

    // Check for already existing schedules for this exam
    const existingSchedules = await ExamSchedule.findAll({
        where: { exam_id: examId, is_active: true },
        attributes: ["exam_date"],
    });
    const existingDates = existingSchedules.map((s) => s.exam_date.toString());

    // Filter out dates that already have schedules
    const newDates = validDates.filter((d) => !existingDates.includes(d));

    if (newDates.length === 0) {
        return res.json({
            success: true,
            message: "All valid dates already have schedules",
            generated: 0,
            total_valid_dates: validDates.length,
        });
    }

    // Create schedules + shifts inside a transaction
    const createdSchedules = await sequelize.transaction(async (t) => {
        const results = [];

        for (const dateStr of newDates) {
            const schedule = await ExamSchedule.create(
                {
                    exam_id: examId,
                    exam_date: dateStr,
                    notes: null,
                },
                { transaction: t }
            );

            // Create schedule shifts from exam shifts
            const shiftData = exam.examShifts.map((es) => ({
                schedule_id: schedule.id,
                shift_name: es.shift_name,
                start_time: es.start_time,
                end_time: es.end_time,
            }));
            await ScheduleShift.bulkCreate(shiftData, { transaction: t });

            results.push(schedule);
        }

        return results;
    });

    res.status(201).json({
        success: true,
        message: `Generated ${createdSchedules.length} schedules`,
        generated: createdSchedules.length,
        total_valid_dates: validDates.length,
        skipped_existing: validDates.length - newDates.length,
        dates: newDates,
    });
};
