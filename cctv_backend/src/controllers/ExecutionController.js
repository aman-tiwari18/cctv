const ShiftScriptAssignment = require("../models/ShiftScriptAssignment");
const Script = require("../models/Script");
const ExamShift = require("../models/ExamShift");
const Exam = require("../models/Exam");
const { Op } = require("sequelize");


/**
 * Get pending assignments (for script server polling)
 * Returns assignments with status=PENDING that are ready to run
 */
exports.getPending = async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    const assignments = await ShiftScriptAssignment.findAll({
        where: {
            status: "PENDING",
            is_active: true,
        },
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "script_id", "script_path", "name", "parameters_schema", "default_duration_minutes"],
            },
            {
                model: ExamShift,
                as: "shift",
                attributes: ["id", "shift_name", "start_time", "end_time"],
                include: [
                    {
                        model: Exam,
                        as: "exam",
                        attributes: ["id", "exam_name"],
                    },
                ],
            },
        ],
        order: [["created_at", "ASC"]],
        limit,
    });

    // Flatten for the script-server poller
    const data = assignments.map((a) => {
        const plain = a.toJSON();
        return {
            id: plain.id,
            script_path: plain.script?.script_path || null,
            task_name: plain.script?.name || null,
            task_parameters: plain.script?.parameters_schema || null,
            duration_minutes: plain.script?.default_duration_minutes || null,
            shift_name: plain.shift?.shift_name || null,
            exam_name: plain.shift?.exam?.exam_name || null,
            execution_metadata: {
                assignment_id: plain.id,
                script_id: plain.script?.id,
                script_name: plain.script?.name,
                shift_id: plain.shift_id,
                shift_name: plain.shift?.shift_name,
                exam_name: plain.shift?.exam?.exam_name,
            },
        };
    });

    res.json({
        success: true,
        count: data.length,
        data,
    });
};


/**
 * Update assignment execution status (called by script server)
 */
exports.updateStatus = async (req, res) => {
    const { status, error_log, result_data } = req.body;

    const assignment = await ShiftScriptAssignment.findByPk(req.params.id);

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: "Assignment not found",
        });
    }

    const updates = { status };

    if (status === "RUNNING" && !assignment.started_at) {
        updates.started_at = new Date();
    }
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(status) && !assignment.completed_at) {
        updates.completed_at = new Date();
    }
    if (error_log) updates.error_log = error_log;
    if (result_data) updates.result_data = result_data;

    await assignment.update(updates);

    res.json({
        success: true,
        message: "Assignment status updated successfully",
        data: assignment,
    });
};


/**
 * Get all assignments with filters (execution history view)
 */
exports.getAll = async (req, res) => {
    const {
        status,
        script_id,
        shift_id,
        exam_id,
        limit,
        offset,
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (script_id) where.script_id = parseInt(script_id);
    if (shift_id) where.shift_id = parseInt(shift_id);

    const includeShift = {
        model: ExamShift,
        as: "shift",
        attributes: ["id", "shift_name", "start_time", "end_time", "exam_id"],
    };

    if (exam_id) {
        includeShift.where = { exam_id: parseInt(exam_id) };
        includeShift.required = true;
    }

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_path", "script_id", "category"],
            },
            includeShift,
        ],
        order: [["updated_at", "DESC"]],
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Get execution statistics
 */
exports.getStats = async (req, res) => {
    const { sequelize } = require("../config/db");

    const [results] = await sequelize.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN ssa.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN ssa.status = 'FAILED' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN ssa.status = 'RUNNING' THEN 1 ELSE 0 END) as running,
            SUM(CASE WHEN ssa.status = 'PENDING' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN ssa.status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
        FROM shift_script_assignments ssa
        WHERE ssa.is_active = TRUE
    `);

    res.json({
        success: true,
        data: results[0],
    });
};


/**
 * Get assignment by ID (with full details)
 */
exports.getById = async (req, res) => {
    const assignment = await ShiftScriptAssignment.findByPk(req.params.id, {
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_path", "script_id", "category", "description"],
            },
            {
                model: ExamShift,
                as: "shift",
                attributes: ["id", "shift_name", "start_time", "end_time"],
                include: [
                    {
                        model: Exam,
                        as: "exam",
                        attributes: ["id", "exam_name", "exam_body"],
                    },
                ],
            },
        ],
    });

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: "Assignment not found",
        });
    }

    res.json({
        success: true,
        data: assignment,
    });
};


/**
 * Get assignments for a specific shift
 */
exports.getByShift = async (req, res) => {
    const { status, limit, offset } = req.query;

    const where = { shift_id: req.params.shiftId };
    if (status) where.status = status;

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_path", "script_id", "category"],
            },
        ],
        order: [["updated_at", "DESC"]],
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Get recent assignments (by most recently updated)
 */
exports.getRecent = async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;

    const assignments = await ShiftScriptAssignment.findAll({
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_path", "script_id"],
            },
            {
                model: ExamShift,
                as: "shift",
                attributes: ["id", "shift_name"],
                include: [
                    {
                        model: Exam,
                        as: "exam",
                        attributes: ["id", "exam_name"],
                    },
                ],
            },
        ],
        order: [["updated_at", "DESC"]],
        limit,
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};
