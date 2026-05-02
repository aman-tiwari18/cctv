/**
 * Migration Runner: Add Biometric Crowd Detection and QP Box Detection Scripts
 * Run this script to add new detection scripts to the scripts table
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

        console.log('✓ Connected to database');

        // Read migration file
        const migrationPath = path.join(__dirname, '019_add_biometric_and_qpbox_scripts.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        console.log('\n📋 Running migration: 019_add_biometric_and_qpbox_scripts.sql\n');

        // Split by semicolon and execute each statement
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

        for (const statement of statements) {
            try {
                const [result] = await connection.query(statement);
                if (result.affectedRows > 0) {
                    console.log('✓ Inserted:', statement.substring(0, 80).replace(/\s+/g, ' ') + '...');
                } else {
                    console.log('⚠ Already exists:', statement.substring(0, 80).replace(/\s+/g, ' ') + '...');
                }
            } catch (error) {
                // Ignore errors for duplicate entries
                if (error.code === 'ER_DUP_ENTRY' || error.code === 'ER_DUP_KEY') {
                    console.log('⚠ Script already exists, skipping...');
                } else {
                    throw error;
                }
            }
        }

        console.log('\n✅ Migration completed successfully!\n');

        // Verify the changes
        console.log('📊 Verifying scripts table...\n');
        const [scripts] = await connection.query(`
            SELECT 
                script_id,
                name,
                default_frequency_minutes,
                default_duration_minutes,
                is_active,
                created_at
            FROM scripts
            WHERE script_id IN ('qp_box', 'crowd_biometric')
            ORDER BY script_id
        `);

        if (scripts.length > 0) {
            console.table(scripts);
            console.log(`\n✓ Found ${scripts.length} new script(s)\n`);
        } else {
            console.log('⚠ No new scripts found. They may already exist.\n');
        }

        // Show all scripts
        console.log('📋 All scripts in database:\n');
        const [allScripts] = await connection.query(`
            SELECT 
                script_id,
                name,
                default_frequency_minutes as freq_min,
                default_duration_minutes as dur_min,
                is_active
            FROM scripts
            ORDER BY script_id
        `);
        console.table(allScripts);

        console.log('\n✅ Verification complete!\n');

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

// Run migration
console.log('\n' + '='.repeat(70));
console.log('  Migration 019: Add Biometric and QP Box Detection Scripts');
console.log('='.repeat(70) + '\n');

runMigration();
