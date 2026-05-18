/**
 * Migration Runner: Composite indexes for new dashboard endpoints
 * Idempotent — checks INFORMATION_SCHEMA.STATISTICS before adding each index.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const INDEXES = [
    {
        table: 'camera_report_hls',
        name: 'idx_created_at_exam_shift',
        sql: 'ALTER TABLE camera_report_hls ADD INDEX idx_created_at_exam_shift (created_at, exam_id, shift_id)',
    },
    {
        table: 'camera_report_rtsp',
        name: 'idx_created_at_exam_shift',
        sql: 'ALTER TABLE camera_report_rtsp ADD INDEX idx_created_at_exam_shift (created_at, exam_id, shift_id)',
    },
    {
        table: 'shift_script_assignments',
        name: 'idx_date_status',
        sql: 'ALTER TABLE shift_script_assignments ADD INDEX idx_date_status (assignment_date, status, is_active)',
    },
];

async function indexExists(connection, dbName, table, indexName) {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [dbName, table, indexName]
    );
    return rows[0].cnt > 0;
}

async function runMigration() {
    let connection;
    const dbName = process.env.DB_NAME || 'cctv_monitoring';

    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: dbName,
        });

        console.log('✓ Connected to database');
        console.log('\n📋 Running migration: 020_add_dashboard_indexes.sql\n');

        for (const idx of INDEXES) {
            const exists = await indexExists(connection, dbName, idx.table, idx.name);
            if (exists) {
                console.log(`⚠  Index ${idx.table}.${idx.name} already exists, skipping`);
                continue;
            }
            await connection.query(idx.sql);
            console.log(`✓  Added index ${idx.table}.${idx.name}`);
        }

        console.log('\n✅ Migration completed successfully!\n');

        // Verify
        console.log('📊 Verifying indexes...\n');
        const [verified] = await connection.query(
            `SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = ?
               AND INDEX_NAME IN ('idx_created_at_exam_shift', 'idx_date_status')
             GROUP BY TABLE_NAME, INDEX_NAME
             ORDER BY TABLE_NAME, INDEX_NAME`,
            [dbName]
        );
        console.table(verified);

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed\n');
        }
    }
}

console.log('\n' + '='.repeat(70));
console.log('  Migration 020: Composite indexes for new dashboard endpoints');
console.log('='.repeat(70) + '\n');

runMigration();
