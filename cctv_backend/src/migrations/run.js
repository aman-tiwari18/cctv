const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Run database migrations
 */
const runMigrations = async () => {
    try {
        logger.info('Starting database migrations...');

        const migrationFile = path.join(__dirname, '010_add_assignment_date_to_shift_script_assignments.sql');
        const sql = fs.readFileSync(migrationFile, 'utf8');

        // Remove comments and split by semicolons
        const statements = sql
            .replace(/--.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        for (const statement of statements) {
            try {
                await sequelize.query(statement);
            } catch (error) {
                // Ignore "already exists" / "duplicate column" errors
                if (!error.message.includes('already exists') && !error.message.includes('Duplicate column')) {
                    throw error;
                }
                logger.info(`Skipped (already applied): ${statement.substring(0, 60)}...`);
            }
        }

        logger.info('Database migrations completed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
};

// Run migrations if this file is executed directly
if (require.main === module) {
    runMigrations();
}

module.exports = { runMigrations };
