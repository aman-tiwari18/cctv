const { query, transaction } = require('../config/database');

/**
 * ShiftScriptAssignment Model
 * Handles database operations for shift-script assignments
 */
class ShiftScriptAssignment {
    /**
     * Create a new shift-script assignment
     */
    static async create({
        shift_id,
        analytics_task_id,
        custom_start_time,
        custom_end_time,
        custom_frequency_minutes,
        notes
    }) {
        const sql = `
      INSERT INTO shift_script_assignments 
      (shift_id, analytics_task_id, custom_start_time, custom_end_time, 
       custom_frequency_minutes, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        const result = await query(sql, [
            shift_id,
            analytics_task_id,
            custom_start_time || null,
            custom_end_time || null,
            custom_frequency_minutes || null,
            notes || null
        ]);
        return { id: result.insertId, shift_id, analytics_task_id };
    }

    /**
     * Bulk create shift-script assignments
     */
    static async bulkCreate(assignments) {
        const results = [];
        for (const assignment of assignments) {
            try {
                const result = await this.create(assignment);
                results.push(result);
            } catch (error) {
                // Skip duplicates, log others
                if (!error.message.includes('Duplicate')) {
                    console.error('Error creating assignment:', error);
                }
            }
        }
        return results;
    }

    /**
     * Get all script assignments for a shift
     */
    static async findByShiftId(shift_id, { is_active = true } = {}) {
        let sql = `
      SELECT 
        ssa.*,
        at.task_name,
        at.description,
        at.script_path,
        at.frequency_minutes AS default_frequency,
        at.duration_minutes,
        at.start_time AS default_start_time,
        at.end_time AS default_end_time,
        at.parameters,
        COALESCE(ssa.custom_frequency_minutes, at.frequency_minutes) AS effective_frequency,
        COALESCE(ssa.custom_start_time, at.start_time) AS effective_start_time,
        COALESCE(ssa.custom_end_time, at.end_time) AS effective_end_time
      FROM shift_script_assignments ssa
      JOIN analytics_tasks at ON ssa.analytics_task_id = at.id
      WHERE ssa.shift_id = ?
    `;
        const params = [shift_id];

        if (is_active !== null) {
            sql += ' AND ssa.is_active = ? AND at.is_active = ?';
            params.push(is_active, is_active);
        }

        sql += ' ORDER BY at.task_name ASC';
        const results = await query(sql, params);

        return results.map(row => ({
            ...row,
            parameters: row.parameters ? JSON.parse(row.parameters) : null
        }));
    }

    /**
     * Get all shift-script assignments for an exam
     */
    static async findByExamId(exam_id, { is_active = true } = {}) {
        let sql = `
      SELECT 
        ssa.*,
        ss.shift_name,
        ss.start_time AS shift_start_time,
        ss.end_time AS shift_end_time,
        es.exam_date,
        es.id AS schedule_id,
        at.task_name,
        at.script_path,
        at.frequency_minutes AS default_frequency,
        COALESCE(ssa.custom_frequency_minutes, at.frequency_minutes) AS effective_frequency
      FROM shift_script_assignments ssa
      JOIN schedule_shifts ss ON ssa.shift_id = ss.id
      JOIN exam_schedules es ON ss.schedule_id = es.id
      JOIN analytics_tasks at ON ssa.analytics_task_id = at.id
      WHERE es.exam_id = ?
    `;
        const params = [exam_id];

        if (is_active !== null) {
            sql += ' AND ssa.is_active = ? AND ss.is_active = ? AND es.is_active = ? AND at.is_active = ?';
            params.push(is_active, is_active, is_active, is_active);
        }

        sql += ' ORDER BY es.exam_date ASC, ss.start_time ASC, at.task_name ASC';
        return await query(sql, params);
    }

    /**
     * Get assignment by ID
     */
    static async findById(id) {
        const sql = `
      SELECT 
        ssa.*,
        at.task_name,
        at.script_path,
        ss.shift_name,
        es.exam_date
      FROM shift_script_assignments ssa
      JOIN analytics_tasks at ON ssa.analytics_task_id = at.id
      JOIN schedule_shifts ss ON ssa.shift_id = ss.id
      JOIN exam_schedules es ON ss.schedule_id = es.id
      WHERE ssa.id = ?
    `;
        const results = await query(sql, [id]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Update shift-script assignment
     */
    static async update(id, updates) {
        const allowedFields = [
            'custom_start_time',
            'custom_end_time',
            'custom_frequency_minutes',
            'notes',
            'is_active'
        ];
        const fields = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });

        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }

        values.push(id);
        const sql = `UPDATE shift_script_assignments SET ${fields.join(', ')} WHERE id = ?`;
        await query(sql, values);
        return await this.findById(id);
    }

    /**
     * Delete shift-script assignment (soft delete)
     */
    static async delete(id) {
        const sql = 'UPDATE shift_script_assignments SET is_active = FALSE WHERE id = ?';
        await query(sql, [id]);
        return true;
    }

    /**
     * Hard delete shift-script assignment
     */
    static async hardDelete(id) {
        const sql = 'DELETE FROM shift_script_assignments WHERE id = ?';
        await query(sql, [id]);
        return true;
    }

    /**
     * Check if assignment exists
     */
    static async exists(shift_id, analytics_task_id) {
        const sql = 'SELECT id FROM shift_script_assignments WHERE shift_id = ? AND analytics_task_id = ?';
        const results = await query(sql, [shift_id, analytics_task_id]);
        return results.length > 0;
    }
}

module.exports = ShiftScriptAssignment;
