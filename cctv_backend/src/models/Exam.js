// const { query } = require('../config/database');
// const logger = require('../utils/logger');

// /**
//  * Exam Model
//  * Handles all database operations for exams
//  */
// class Exam {
//     /**
//      * Create a new exam
//      */
//     static async create({ exam_name, exam_body, link_type, description }) {
//         const sql = `
//       INSERT INTO exams (exam_name, exam_body, link_type, description)
//       VALUES (?, ?, ?, ?)
//     `;
//         const result = await query(sql, [exam_name, exam_body, link_type, description]);
//         return { id: result.insertId, exam_name, exam_body, link_type, description };
//     }

//     /**
//      * Get all exams
//      */
//     static async findAll({ is_active = null, exam_body = null } = {}) {
//         let sql = 'SELECT * FROM exams WHERE 1=1';
//         const params = [];

//         if (is_active !== null) {
//             sql += ' AND is_active = ?';
//             params.push(is_active);
//         }

//         if (exam_body) {
//             sql += ' AND exam_body = ?';
//             params.push(exam_body);
//         }

//         sql += ' ORDER BY created_at DESC';
//         return await query(sql, params);
//     }

//     /**
//      * Get exam by ID
//      */
//     static async findById(id) {
//         const sql = 'SELECT * FROM exams WHERE id = ?';
//         const results = await query(sql, [id]);
//         return results[0] || null;
//     }

//     /**
//      * Get exam with all related data
//      */
//     static async findByIdWithDetails(id) {
//         const exam = await this.findById(id);
//         if (!exam) return null;

//         // Get camera links count
//         const cameraCount = await query(
//             'SELECT COUNT(*) as count FROM camera_links WHERE exam_id = ? AND is_active = TRUE',
//             [id]
//         );
//         exam.camera_count = cameraCount[0].count;

//         // Get schedules count
//         const scheduleCount = await query(
//             'SELECT COUNT(*) as count FROM exam_schedules WHERE exam_id = ? AND is_active = TRUE',
//             [id]
//         );
//         exam.schedule_count = scheduleCount[0].count;

//         // Get analytics tasks count
//         const taskCount = await query(
//             'SELECT COUNT(*) as count FROM analytics_tasks WHERE exam_id = ? AND is_active = TRUE',
//             [id]
//         );
//         exam.analytics_task_count = taskCount[0].count;

//         return exam;
//     }

//     /**
//      * Update exam
//      */
//     static async update(id, updates) {
//         const allowedFields = ['exam_name', 'exam_body', 'link_type', 'description', 'is_active'];
//         const fields = [];
//         const values = [];

//         Object.keys(updates).forEach(key => {
//             if (allowedFields.includes(key)) {
//                 fields.push(`${key} = ?`);
//                 values.push(updates[key]);
//             }
//         });

//         if (fields.length === 0) {
//             throw new Error('No valid fields to update');
//         }

//         values.push(id);
//         const sql = `UPDATE exams SET ${fields.join(', ')} WHERE id = ?`;
//         await query(sql, values);
//         return await this.findById(id);
//     }

//     /**
//      * Delete exam (soft delete)
//      */
//     static async delete(id) {
//         const sql = 'UPDATE exams SET is_active = 0 WHERE id = ?';
//         await query(sql, [id]);
//         return true;
//     }

//     /**
//      * Hard delete exam
//      */
//     static async hardDelete(id) {
//         const sql = 'DELETE FROM exams WHERE id = ?';
//         await query(sql, [id]);
//         return true;
//     }
// }

// module.exports = Exam;
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Exam = sequelize.define(
    "Exam",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        exam_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        exam_body: {
            type: DataTypes.STRING,
        },

        link_type: {
            type: DataTypes.STRING,
        },

        description: {
            type: DataTypes.TEXT,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "exams", // existing table
        timestamps: true,  // if created_at/updated_at exist
        underscored: true, // created_at instead of createdAt
    }
);

module.exports = Exam;
