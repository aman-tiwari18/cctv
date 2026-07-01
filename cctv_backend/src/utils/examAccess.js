'use strict';

const { query } = require('../config/database');

/**
 * Returns allowed exam IDs for a user based on user_exam_assignments table.
 * - ADMIN / OPERATOR / service: null (no filter — sees all)
 * - VIEWER: only assigned exams; returns [] if none assigned
 */
async function getAllowedExamIds(user) {
    const role = user?.role;
    if (!role || role === 'ADMIN' || role === 'OPERATOR' || role === 'service') {
        return null;
    }
    const rows = await query(
        'SELECT exam_id FROM user_exam_assignments WHERE user_id = ?',
        [user.id]
    );
    return rows.map(r => r.exam_id);
}

module.exports = { getAllowedExamIds };
