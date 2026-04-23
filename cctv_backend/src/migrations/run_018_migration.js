/**
 * Migration Runner: Add client push fields to camera report tables
 * Run this script to update camera_report_hls and camera_report_rtsp tables
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function runMigration() {
    let connection;
    
    try {
        // Create database connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'cctv_monitoring',
            multipleStatements: true
        });

        console.log('Connected to database');

        // Read migration file
        const migrationPath = path.join(__dirname, '018_add_client_push_fields_to_reports.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        console.log('Running migration: 018_add_client_push_fields_to_reports.sql');

        // Split by semicolon and execute each statement
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            try {
                await connection.query(statement);
                console.log('✓ Executed:', statement.substring(0, 60) + '...');
            } catch (error) {
                // Ignore errors for "IF NOT EXISTS" statements that already exist
                if (error.code === 'ER_DUP_KEYNAME' || error.code === 'ER_DUP_INDEX') {
                    console.log('⚠ Already exists:', statement.substring(0, 60) + '...');
                } else {
                    throw error;
                }
            }
        }

        console.log('\n✅ Migration completed successfully!');

        // Verify the changes
        console.log('\nVerifying camera_report_hls schema...');
        const [hlsColumns] = await connection.query(`
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'camera_report_hls'
            AND COLUMN_NAME IN ('pushed_to_client', 'remove_from_client')
        `, [process.env.DB_NAME || 'cctv_monitoring']);
        console.table(hlsColumns);

        console.log('\nVerifying camera_report_rtsp schema...');
        const [rtspColumns] = await connection.query(`
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'camera_report_rtsp'
            AND COLUMN_NAME IN ('pushed_to_client', 'remove_from_client')
        `, [process.env.DB_NAME || 'cctv_monitoring']);
        console.table(rtspColumns);

        console.log('\nVerifying indexes...');
        const [hlsIndexes] = await connection.query(`
            SHOW INDEX FROM camera_report_hls 
            WHERE Key_name LIKE '%pushed%' OR Key_name LIKE '%exam_detection%'
        `);
        console.log('HLS Indexes:', hlsIndexes.map(i => i.Key_name).join(', '));

        const [rtspIndexes] = await connection.query(`
            SHOW INDEX FROM camera_report_rtsp 
            WHERE Key_name LIKE '%pushed%' OR Key_name LIKE '%exam_detection%'
        `);
        console.log('RTSP Indexes:', rtspIndexes.map(i => i.Key_name).join(', '));

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

// Run migration
runMigration();
