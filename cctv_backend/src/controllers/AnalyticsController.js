const AnalyticsTask = require("../models/AnalyticsTask");
const Exam = require("../models/Exam");
const scriptRegistry = require("../config/scriptRegistry");
const fs = require("fs");
const ExcelParser = require("../services/excelParser");


/**
 * Create analytics task manually
 */
exports.createTask = async (req, res) => {
    const {
        script_id,
        frequency_minutes,
        duration_minutes,
        start_time,
        end_time,
        parameters,
    } = req.body;
    const exam_id = req.params.examId;

    // Verify exam exists
    const exam = await Exam.findByPk(exam_id);
    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    // Get script details from registry
    const scriptConfig = scriptRegistry[script_id];

    const task = await AnalyticsTask.create({
        exam_id,
        task_name: scriptConfig.name,
        description: scriptConfig.description,
        script_path: scriptConfig.script_path,
        frequency_minutes: frequency_minutes || scriptConfig.default_frequency,
        duration_minutes: duration_minutes || scriptConfig.default_duration,
        start_time: start_time || null,
        end_time: end_time || null,
        parameters: parameters || null,
    });

    res.status(201).json({
        success: true,
        message: "Analytics task created successfully",
        data: task,
    });
};


/**
 * Upload Excel file with analytics tasks
 */
exports.uploadTasks = async (req, res) => {
    const exam_id = req.params.examId;

    // Verify exam exists
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

    // Parse Excel file
    const parseResult = ExcelParser.parseAnalyticsTasks(req.file.path, exam_id);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (!parseResult.success || parseResult.data.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Failed to parse Excel file",
            errors: parseResult.errors,
        });
    }

    // Bulk create analytics tasks
    await AnalyticsTask.bulkCreate(parseResult.data);

    res.status(201).json({
        success: true,
        message: `Successfully imported ${parseResult.count} analytics tasks`,
        count: parseResult.count,
        errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
    });
};


/**
 * Get all analytics tasks for an exam
 */
exports.getByExam = async (req, res) => {
    const { is_active } = req.query;

    const where = { exam_id: req.params.examId };
    if (is_active !== undefined) where.is_active = is_active === "true";

    const tasks = await AnalyticsTask.findAll({
        where,
        order: [["created_at", "DESC"]],
    });

    res.json({
        success: true,
        count: tasks.length,
        data: tasks,
    });
};


/**
 * Get all analytics tasks (across all exams)
 */
exports.getAllTasks = async (req, res) => {
    const { is_active } = req.query;

    const where = {};
    if (is_active !== undefined) where.is_active = is_active === "true";

    const tasks = await AnalyticsTask.findAll({
        where,
        order: [["created_at", "DESC"]],
    });

    res.json({
        success: true,
        count: tasks.length,
        data: tasks,
    });
};


/**
 * Update analytics task
 */
exports.updateTask = async (req, res) => {
    const task = await AnalyticsTask.findByPk(req.params.id);

    if (!task) {
        return res.status(404).json({
            success: false,
            message: "Analytics task not found",
        });
    }

    await task.update(req.body);

    res.json({
        success: true,
        message: "Analytics task updated successfully",
        data: task,
    });
};


/**
 * Delete analytics task (soft delete)
 */
exports.deleteTask = async (req, res) => {
    await AnalyticsTask.update(
        { is_active: false },
        { where: { id: req.params.id } }
    );

    res.json({
        success: true,
        message: "Analytics task deleted successfully",
    });
};
