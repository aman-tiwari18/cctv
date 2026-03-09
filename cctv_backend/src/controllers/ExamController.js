const Exam = require("../models/Exam");
const ExamShift = require("../models/ExamShift");
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
            // Delete old shifts
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

    const exam = await Exam.findByPk(id);

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    await sequelize.transaction(async (t) => {
        // Delete related shifts (cascade should handle, but be explicit)
        await ExamShift.destroy({ where: { exam_id: id }, transaction: t });
        // Delete the exam
        await exam.destroy({ transaction: t });
    });

    res.json({
        success: true,
        message: "Exam deleted successfully",
    });
};
