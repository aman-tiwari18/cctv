/**
 * Migration Runner: client "Accept" action tracking
 * Adds camera_report_*.accepted_by_client / accepted_at.
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

        const migrationPath = path.join(__dirname, '029_add_accepted_by_client.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        console.log('Running migration: 029_add_accepted_by_client.sql');

        // Strip comment lines first, THEN split on ';' (same approach as 027).
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

        const dbName = process.env.DB_NAME || 'cctv_monitoring';
        const checks = [
            ['camera_report_hls', 'accepted_by_client'],
            ['camera_report_hls', 'accepted_at'],
            ['camera_report_rtsp', 'accepted_by_client'],
            ['camera_report_rtsp', 'accepted_at'],
        ];
        for (const [table, column] of checks) {
            const [cols] = await connection.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
            `, [dbName, table, column]);
            console.log(`\n${table}.${column}:`);
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
