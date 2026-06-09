/**
 * Migration Runner: Add pushed_by field to camera report tables
 * Run this script to update camera_report_hls and camera_report_rtsp tables
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function runMigration() {
    let connection;

    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'cctv_monitoring',
            multipleStatements: true
        });

        console.log('Connected to database');

        const migrationPath = path.join(__dirname, '025_add_pushed_by_to_reports.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        console.log('Running migration: 025_add_pushed_by_to_reports.sql');

        // Strip comment lines first, THEN split on ';'. Splitting first would
        // attach leading "-- comment" lines to the following statement, and the
        // naive `!s.startsWith('--')` check would then drop that whole statement.
        const statements = migrationSQL
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n')
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                await connection.query(statement);
                console.log('✓ Executed:', statement.substring(0, 60) + '...');
            } catch (error) {
                // Ignore "already exists" errors so the migration is idempotent.
                if (
                    error.code === 'ER_DUP_KEYNAME' ||
                    error.code === 'ER_DUP_INDEX' ||
                    error.code === 'ER_DUP_FIELDNAME'
                ) {
                    console.log('⚠ Already exists:', statement.substring(0, 60) + '...');
                } else {
                    throw error;
                }
            }
        }

        console.log('\n✅ Migration completed successfully!');

        for (const table of ['camera_report_hls', 'camera_report_rtsp']) {
            const [cols] = await connection.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                AND COLUMN_NAME = 'pushed_by'
            `, [process.env.DB_NAME || 'cctv_monitoring', table]);
            console.log(`\n${table}.pushed_by:`);
            console.table(cols);
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\nDatabase connection closed');
        }
    }
}

runMigration();
