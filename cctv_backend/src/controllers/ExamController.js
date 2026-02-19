const Exam = require("../models/Exam");


exports.createExam = async (req, res) => {
    const exam = await Exam.create(req.body);

    res.status(201).json({
        success: true,
        message: "Exam created successfully",
        data: exam,
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

    const exam = await Exam.findByPk(id);

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

    const exam = await Exam.findByPk(id);

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    await exam.update(req.body);

    res.json({
        success: true,
        message: "Exam updated successfully",
        data: exam,
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
