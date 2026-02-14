const { query } = require('../config/database');

/**
 * ScriptExecution Model
 * Handles database operations for script execution tracking
 */
class ScriptExecution {
    /**
     * Create a new script execution record
     */
    static async create({
        shift_id,
        camera_link_id,
        analytics_task_id,
        scheduled_time,
        execution_metadata
    }) {
        const sql = `
      INSERT INTO script_executions 
      (shift_id, camera_link_id, analytics_task_id, scheduled_time, execution_metadata, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `;
        const metadataJson = execution_metadata ? JSON.stringify(execution_metadata) : null;
        const result = await query(sql, [
            shift_id || null,
            camera_link_id || null,
            analytics_task_id,
            scheduled_time,
            metadataJson
        ]);
        return { id: result.insertId, analytics_task_id, scheduled_time, status: 'PENDING' };
    }

    /**
     * Bulk create execution records
     */
    static async bulkCreate(executions) {
        const results = [];
        for (const execution of executions) {
            const result = await this.create(execution);
            results.push(result);
        }
        return results;
    }

    /**
     * Get pending executions for script server
     */
    static async getPendingExecutions(limit = 50) {
        const sql = `
      SELECT 
        se.*,
        at.script_path,
        at.parameters as task_parameters,
        cl.stream_url,
        cl.stream_type,
        cl.camera_id
      FROM script_executions se
      JOIN analytics_tasks at ON se.analytics_task_id = at.id
      LEFT JOIN camera_links cl ON se.camera_link_id = cl.id
      WHERE se.status = 'PENDING' 
        AND se.scheduled_time <= NOW()
      ORDER BY se.scheduled_time ASC
      LIMIT ?
    `;
        const results = await query(sql, [limit]);

        return results.map(exec => ({
            ...exec,
            execution_metadata: exec.execution_metadata ? JSON.parse(exec.execution_metadata) : null,
            task_parameters: exec.task_parameters ? JSON.parse(exec.task_parameters) : null
        }));
    }

    /**
     * Get execution by ID
     */
    static async findById(id) {
        const sql = `
      SELECT 
        se.*,
        at.task_name,
        at.script_path
      FROM script_executions se
      JOIN analytics_tasks at ON se.analytics_task_id = at.id
      WHERE se.id = ?
    `;
        const results = await query(sql, [id]);
        if (results.length === 0) return null;

        const exec = results[0];
        return {
            ...exec,
            execution_metadata: exec.execution_metadata ? JSON.parse(exec.execution_metadata) : null,
            result_data: exec.result_data ? JSON.parse(exec.result_data) : null
        };
    }

    /**
     * Get executions with filters
     */
    static async findAll({
        status = null,
        analytics_task_id = null,
        shift_id = null,
        from_date = null,
        to_date = null,
        limit = 100,
        offset = 0
    } = {}) {
        let sql = `
      SELECT 
        se.*,
        at.task_name,
        at.script_path
      FROM script_executions se
      JOIN analytics_tasks at ON se.analytics_task_id = at.id
      WHERE 1=1
    `;
        const params = [];

        if (status) {
            sql += ' AND se.status = ?';
            params.push(status);
        }

        if (analytics_task_id) {
            sql += ' AND se.analytics_task_id = ?';
            params.push(analytics_task_id);
        }

        if (shift_id) {
            sql += ' AND se.shift_id = ?';
            params.push(shift_id);
        }

        if (from_date) {
            sql += ' AND se.scheduled_time >= ?';
            params.push(from_date);
        }

        if (to_date) {
            sql += ' AND se.scheduled_time <= ?';
            params.push(to_date);
        }

        sql += ' ORDER BY se.scheduled_time DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const results = await query(sql, params);
        return results.map(exec => ({
            ...exec,
            execution_metadata: exec.execution_metadata ? JSON.parse(exec.execution_metadata) : null,
            result_data: exec.result_data ? JSON.parse(exec.result_data) : null
        }));
    }

    /**
     * Update execution status
     */
    static async updateStatus(id, status, { error_log = null, result_data = null } = {}) {
        const updates = { status };

        if (status === 'RUNNING' && !updates.started_at) {
            updates.started_at = new Date();
        }

        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status) && !updates.completed_at) {
            updates.completed_at = new Date();
        }

        if (error_log) {
            updates.error_log = error_log;
        }

        if (result_data) {
            updates.result_data = JSON.stringify(result_data);
        }

        const fields = Object.keys(updates).map(key => `${key} = ?`);
        const values = Object.values(updates);
        values.push(id);

        const sql = `UPDATE script_executions SET ${fields.join(', ')} WHERE id = ?`;
        await query(sql, values);
        return await this.findById(id);
    }

    /**
     * Get execution statistics
     */
    static async getStatistics({ exam_id = null, from_date = null, to_date = null } = {}) {
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
            sql += ' AND at.exam_id = ?';
            params.push(exam_id);
        }

        if (from_date) {
            sql += ' AND se.scheduled_time >= ?';
            params.push(from_date);
        }

        if (to_date) {
            sql += ' AND se.scheduled_time <= ?';
            params.push(to_date);
        }

        const results = await query(sql, params);
        return results[0];
    }
}

module.exports = ScriptExecution;
