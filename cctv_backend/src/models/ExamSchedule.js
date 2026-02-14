const { query, transaction } = require('../config/database');

/**
 * ExamSchedule Model
 * Handles database operations for exam schedules and shifts
 */
class ExamSchedule {
    /**
     * Create a new exam schedule with shifts
     */
    static async create({ exam_id, exam_date, shifts, notes }) {
        return await transaction(async (connection) => {
            // Insert schedule
            const scheduleSql = `
        INSERT INTO exam_schedules (exam_id, exam_date, notes)
        VALUES (?, ?, ?)
      `;
            const [scheduleResult] = await connection.execute(scheduleSql, [exam_id, exam_date, notes || null]);
            const schedule_id = scheduleResult.insertId;

            // Insert shifts if provided
            if (shifts && shifts.length > 0) {
                const shiftSql = `
          INSERT INTO schedule_shifts (schedule_id, shift_name, start_time, end_time)
          VALUES (?, ?, ?, ?)
        `;
                for (const shift of shifts) {
                    await connection.execute(shiftSql, [
                        schedule_id,
                        shift.shift_name,
                        shift.start_time,
                        shift.end_time
                    ]);
                }
            }

            return await this.findById(schedule_id);
        });
    }

    /**
     * Bulk create schedules with shifts
     */
    static async bulkCreate(schedules) {
        const results = [];
        for (const schedule of schedules) {
            const result = await this.create(schedule);
            results.push(result);
        }
        return results;
    }

    /**
     * Get all schedules for an exam
     */
    static async findByExamId(exam_id, { is_active = true, include_shifts = true } = {}) {
        let sql = 'SELECT * FROM exam_schedules WHERE exam_id = ?';
        const params = [exam_id];

        if (is_active !== null) {
            sql += ' AND is_active = ?';
            params.push(is_active);
        }

        sql += ' ORDER BY exam_date ASC';
        const schedules = await query(sql, params);

        if (include_shifts) {
            for (const schedule of schedules) {
                schedule.shifts = await this.getShiftsByScheduleId(schedule.id);
            }
        }

        return schedules;
    }

    /**
     * Get schedule by ID
     */
    static async findById(id, { include_shifts = true } = {}) {
        const sql = 'SELECT * FROM exam_schedules WHERE id = ?';
        const results = await query(sql, [id]);
        if (results.length === 0) return null;

        const schedule = results[0];
        if (include_shifts) {
            schedule.shifts = await this.getShiftsByScheduleId(id);
        }

        return schedule;
    }

    /**
     * Get shifts for a schedule
     */
    static async getShiftsByScheduleId(schedule_id, { is_active = true } = {}) {
        let sql = 'SELECT * FROM schedule_shifts WHERE schedule_id = ?';
        const params = [schedule_id];

        if (is_active !== null) {
            sql += ' AND is_active = ?';
            params.push(is_active);
        }

        sql += ' ORDER BY start_time ASC';
        return await query(sql, params);
    }

    /**
     * Get upcoming shifts
     */
    static async getUpcomingShifts(hoursAhead = 24) {
        const sql = `
      SELECT * FROM upcoming_shifts
      WHERE shift_start_datetime BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)
      ORDER BY shift_start_datetime ASC
    `;
        return await query(sql, [hoursAhead]);
    }

    /**
     * Update schedule
     */
    static async update(id, updates) {
        const allowedFields = ['exam_date', 'notes', 'is_active'];
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
        const sql = `UPDATE exam_schedules SET ${fields.join(', ')} WHERE id = ?`;
        await query(sql, values);
        return await this.findById(id);
    }

    /**
     * Update shift
     */
    static async updateShift(shift_id, updates) {
        const allowedFields = ['shift_name', 'start_time', 'end_time', 'is_active'];
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

        values.push(shift_id);
        const sql = `UPDATE schedule_shifts SET ${fields.join(', ')} WHERE id = ?`;
        await query(sql, values);

        const shiftResult = await query('SELECT * FROM schedule_shifts WHERE id = ?', [shift_id]);
        return shiftResult[0] || null;
    }

    /**
     * Delete schedule (soft delete)
     */
    static async delete(id) {
        const sql = 'UPDATE exam_schedules SET is_active = FALSE WHERE id = ?';
        await query(sql, [id]);
        return true;
    }

    /**
     * Delete shift (soft delete)
     */
    static async deleteShift(shift_id) {
        const sql = 'UPDATE schedule_shifts SET is_active = FALSE WHERE id = ?';
        await query(sql, [shift_id]);
        return true;
    }
}

module.exports = ExamSchedule;
