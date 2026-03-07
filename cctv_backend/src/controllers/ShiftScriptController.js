const ShiftScriptAssignment = require("../models/ShiftScriptAssignment");
const AnalyticsTask = require("../models/AnalyticsTask");
const ScheduleShift = require("../models/ScheduleShift");
const ExamSchedule = require("../models/ExamSchedule");


/**
 * Assign a script to a shift
 */
exports.assignScript = async (req, res) => {
    const {
        analytics_task_id,
        custom_start_time,
        custom_end_time,
        custom_frequency_minutes,
        notes,
    } = req.body;
    const shift_id = req.params.shiftId;

    // Verify analytics task exists
    const task = await AnalyticsTask.findByPk(analytics_task_id);
    if (!task) {
        return res.status(404).json({
            success: false,
            message: "Analytics task not found",
        });
    }

    // Check if assignment already exists
    const existing = await ShiftScriptAssignment.findOne({
        where: { shift_id, analytics_task_id },
    });
    if (existing) {
        return res.status(400).json({
            success: false,
            message: "Script already assigned to this shift",
        });
    }

    const assignment = await ShiftScriptAssignment.create({
        shift_id,
        analytics_task_id,
        custom_start_time: custom_start_time || null,
        custom_end_time: custom_end_time || null,
        custom_frequency_minutes: custom_frequency_minutes || null,
        notes: notes || null,
    });

    res.status(201).json({
        success: true,
        message: "Script assigned to shift successfully",
        data: assignment,
    });
};


/**
 * Bulk assign scripts to a shift
 */
exports.bulkAssign = async (req, res) => {
    const { scripts } = req.body;
    const shift_id = req.params.shiftId;

    if (!Array.isArray(scripts) || scripts.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Scripts array is required",
        });
    }

    const assignments = scripts.map((script) => ({
        shift_id,
        ...script,
    }));

    const results = await ShiftScriptAssignment.bulkCreate(assignments, {
        ignoreDuplicates: true,
    });

    res.status(201).json({
        success: true,
        message: `Successfully assigned ${results.length} scripts to shift`,
        count: results.length,
        data: results,
    });
};


/**
 * Get all scripts assigned to a shift
 */
exports.getByShift = async (req, res) => {
    const { is_active } = req.query;

    const where = { shift_id: req.params.shiftId };
    if (is_active !== undefined) where.is_active = is_active === "true";

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: AnalyticsTask,
                as: "analyticsTask",
                attributes: [
                    "task_name",
                    "description",
                    "script_path",
                    "frequency_minutes",
                    "duration_minutes",
                    "start_time",
                    "end_time",
                    "parameters",
                ],
            },
        ],
        order: [[{ model: AnalyticsTask, as: "analyticsTask" }, "task_name", "ASC"]],
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Get all shift-script assignments for an exam
 */
exports.getByExam = async (req, res) => {
    const { is_active } = req.query;

    const where = {};
    if (is_active !== undefined) where.is_active = is_active === "true";

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: ScheduleShift,
                as: "shift",
                required: true,
                include: [
                    {
                        model: ExamSchedule,
                        as: "schedule",
                        required: true,
                        where: { exam_id: req.params.examId },
                    },
                ],
            },
            {
                model: AnalyticsTask,
                as: "analyticsTask",
                attributes: [
                    "task_name",
                    "script_path",
                    "frequency_minutes",
                ],
            },
        ],
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Update shift-script assignment
 */
exports.updateAssignment = async (req, res) => {
    const assignment = await ShiftScriptAssignment.findByPk(req.params.id);

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: "Assignment not found",
        });
    }

    await assignment.update(req.body);

    res.json({
        success: true,
        message: "Assignment updated successfully",
        data: assignment,
    });
};


/**
 * Delete shift-script assignment (soft delete)
 */
exports.deleteAssignment = async (req, res) => {
    await ShiftScriptAssignment.update(
        { is_active: false },
        { where: { id: req.params.id } }
    );

    res.json({
        success: true,
        message: "Assignment deleted successfully",
    });
};
