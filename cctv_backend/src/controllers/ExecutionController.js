const ScriptExecution = require("../models/ScriptExecution");
const AnalyticsTask = require("../models/AnalyticsTask");
const CameraLink = require("../models/CameraLink");
const { Op } = require("sequelize");


/**
 * Get pending executions (for script server polling)
 */
exports.getPending = async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    const executions = await ScriptExecution.findAll({
        where: {
            status: "PENDING",
            scheduled_time: { [Op.lte]: new Date() },
        },
        include: [
            {
                model: AnalyticsTask,
                as: "analyticsTask",
                attributes: ["script_path", "parameters"],
            },
            {
                model: CameraLink,
                as: "cameraLink",
                attributes: ["stream_url", "stream_type", "camera_id"],
            },
        ],
        order: [["scheduled_time", "ASC"]],
        limit,
    });

    res.json({
        success: true,
        count: executions.length,
        data: executions,
    });
};


/**
 * Update execution status (called by script server)
 */
exports.updateStatus = async (req, res) => {
    const { status, error_log, result_data } = req.body;

    const execution = await ScriptExecution.findByPk(req.params.id);

    if (!execution) {
        return res.status(404).json({
            success: false,
            message: "Execution not found",
        });
    }

    const updates = { status };

    if (status === "RUNNING" && !execution.started_at) {
        updates.started_at = new Date();
    }
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(status) && !execution.completed_at) {
        updates.completed_at = new Date();
    }
    if (error_log) updates.error_log = error_log;
    if (result_data) updates.result_data = result_data;

    await execution.update(updates);

    res.json({
        success: true,
        message: "Execution status updated successfully",
        data: execution,
    });
};


/**
 * Get all executions with filters
 */
exports.getAll = async (req, res) => {
    const {
        status,
        analytics_task_id,
        shift_id,
        from_date,
        to_date,
        limit,
        offset,
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (analytics_task_id) where.analytics_task_id = parseInt(analytics_task_id);
    if (shift_id) where.shift_id = parseInt(shift_id);
    if (from_date || to_date) {
        where.scheduled_time = {};
        if (from_date) where.scheduled_time[Op.gte] = from_date;
        if (to_date) where.scheduled_time[Op.lte] = to_date;
    }

    const executions = await ScriptExecution.findAll({
        where,
        include: [
            {
                model: AnalyticsTask,
                as: "analyticsTask",
                attributes: ["task_name", "script_path"],
            },
        ],
        order: [["scheduled_time", "DESC"]],
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
    });

    res.json({
        success: true,
        count: executions.length,
        data: executions,
    });
};


/**
 * Get execution statistics
 */
exports.getStats = async (req, res) => {
    const { exam_id, from_date, to_date } = req.query;
    const { query: rawQuery } = require("../config/database");

    let sql = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN se.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN se.status = 'FAILED' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN se.status = 'RUNNING' THEN 1 ELSE 0 END) as running,
            SUM(CASE WHEN se.status = 'PENDING' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN se.status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
        FROM script_executions se
        JOIN analytics_tasks at ON se.analytics_task_id = at.id
        WHERE 1=1
    `;
    const params = [];

    if (exam_id) {
        sql += " AND at.exam_id = ?";
        params.push(parseInt(exam_id));
    }
    if (from_date) {
        sql += " AND se.scheduled_time >= ?";
        params.push(from_date);
    }
    if (to_date) {
        sql += " AND se.scheduled_time <= ?";
        params.push(to_date);
    }

    const results = await rawQuery(sql, params);

    res.json({
        success: true,
        data: results[0],
    });
};


/**
 * Get execution by ID
 */
exports.getById = async (req, res) => {
    const execution = await ScriptExecution.findByPk(req.params.id, {
        include: [
            {
                model: AnalyticsTask,
                as: "analyticsTask",
                attributes: ["task_name", "script_path"],
            },
        ],
    });

    if (!execution) {
        return res.status(404).json({
            success: false,
            message: "Execution not found",
        });
    }

    res.json({
        success: true,
        data: execution,
    });
};


/**
 * Get executions for a specific shift
 */
exports.getByShift = async (req, res) => {
    const { status, from_date, to_date, limit, offset } = req.query;

    const where = { shift_id: req.params.shiftId };
    if (status) where.status = status;
    if (from_date || to_date) {
        where.scheduled_time = {};
        if (from_date) where.scheduled_time[Op.gte] = from_date;
        if (to_date) where.scheduled_time[Op.lte] = to_date;
    }

    const executions = await ScriptExecution.findAll({
        where,
        include: [
            {
                model: AnalyticsTask,
                as: "analyticsTask",
                attributes: ["task_name", "script_path"],
            },
        ],
        order: [["scheduled_time", "DESC"]],
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
    });

    res.json({
        success: true,
        count: executions.length,
        data: executions,
    });
};


/**
 * Get recent executions
 */
exports.getRecent = async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;

    const executions = await ScriptExecution.findAll({
        include: [
            {
                model: AnalyticsTask,
                as: "analyticsTask",
                attributes: ["task_name", "script_path"],
            },
        ],
        order: [["created_at", "DESC"]],
        limit,
    });

    res.json({
        success: true,
        count: executions.length,
        data: executions,
    });
};
