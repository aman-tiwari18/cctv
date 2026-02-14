const { query } = require('../config/database');

/**
 * AnalyticsTask Model
 * Handles database operations for analytics/monitoring tasks
 */
class AnalyticsTask {
    /**
     * Create a new analytics task
     */
    static async create({
        exam_id,
        task_name,
        description,
        script_path,
        frequency_minutes,
        duration_minutes,
        start_time,
        end_time,
        parameters
    }) {
        const sql = `
      INSERT INTO analytics_tasks 
      (exam_id, task_name, description, script_path, frequency_minutes, 
       duration_minutes, start_time, end_time, parameters)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const parametersJson = parameters ? JSON.stringify(parameters) : null;
        const result = await query(sql, [
            exam_id,
            task_name,
            description,
            script_path,
            frequency_minutes,
            duration_minutes || null,
            start_time || null,
            end_time || null,
            parametersJson
        ]);
        return { id: result.insertId, exam_id, task_name, script_path, frequency_minutes };
    }

    /**
     * Bulk create analytics tasks
     */
    static async bulkCreate(tasks) {
        const results = [];
        for (const task of tasks) {
            const result = await this.create(task);
            results.push(result);
        }
        return results;
    }

    /**
     * Get all analytics tasks for an exam
     */
    static async findByExamId(exam_id, { is_active = true } = {}) {
        let sql = 'SELECT * FROM analytics_tasks WHERE exam_id = ?';
        const params = [exam_id];

        if (is_active !== null) {
            sql += ' AND is_active = ?';
            params.push(is_active);
        }

        sql += ' ORDER BY created_at DESC';
        const results = await query(sql, params);

        return results.map(task => ({
            ...task,
            parameters: task.parameters ? JSON.parse(task.parameters) : null
        }));
    }

    /**
     * Get analytics task by ID
     */
    static async findById(id) {
        const sql = 'SELECT * FROM analytics_tasks WHERE id = ?';
        const results = await query(sql, [id]);
        if (results.length === 0) return null;

        const task = results[0];
        return {
            ...task,
            parameters: task.parameters ? JSON.parse(task.parameters) : null
        };
    }

    /**
     * Get active tasks that should run at current time
     */
    static async getActiveTasksForTime(currentTime = new Date()) {
        const timeStr = currentTime.toTimeString().split(' ')[0]; // HH:MM:SS format

        const sql = `
      SELECT * FROM analytics_tasks 
      WHERE is_active = TRUE
        AND (start_time IS NULL OR start_time <= ?)
        AND (end_time IS NULL OR end_time >= ?)
      ORDER BY exam_id, task_name
    `;
        const results = await query(sql, [timeStr, timeStr]);

        return results.map(task => ({
            ...task,
            parameters: task.parameters ? JSON.parse(task.parameters) : null
        }));
    }

    /**
     * Update analytics task
     */
    static async update(id, updates) {
        const allowedFields = [
            'task_name', 'description', 'script_path', 'frequency_minutes',
            'duration_minutes', 'start_time', 'end_time', 'parameters', 'is_active'
        ];
        const fields = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                if (key === 'parameters' && updates[key]) {
                    fields.push(`${key} = ?`);
                    values.push(JSON.stringify(updates[key]));
                } else {
                    fields.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            }
        });

        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }

        values.push(id);
        const sql = `UPDATE analytics_tasks SET ${fields.join(', ')} WHERE id = ?`;
        await query(sql, values);
        return await this.findById(id);
    }

    /**
     * Delete analytics task (soft delete)
     */
    static async delete(id) {
        const sql = 'UPDATE analytics_tasks SET is_active = FALSE WHERE id = ?';
        await query(sql, [id]);
        return true;
    }
}

module.exports = AnalyticsTask;
