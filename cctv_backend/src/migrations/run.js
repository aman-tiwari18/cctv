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

        const migrationFiles = fs.readdirSync(__dirname)
            .filter(file => /^\d{3}_.*\.sql$/.test(file))
            .sort();

        for (const file of migrationFiles) {
            logger.info(`\n--- Processing migration file: ${file} ---`);
            const migrationFile = path.join(__dirname, file);
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
                    logger.info(`✓ Executed from ${file}: ${statement.substring(0, 60)}...`);
                } catch (error) {
                    // Ignore "already exists" / "duplicate column" / "duplicate key" errors
                    if (error.message.includes('Duplicate column name') ||
                        error.message.includes('Duplicate key name') ||
                        error.message.includes('already exists') ||
                        error.message.includes('Unknown column') ||
                        error.parent?.code === 'ER_DUP_FIELDNAME' ||
                        error.parent?.code === 'ER_DUP_KEYNAME' ||
                        error.parent?.errno === 1060 || // Duplicate column
                        error.parent?.errno === 1061 || // Duplicate key name
                        error.parent?.errno === 1091) { // Can't DROP, check that column/key exists
                        logger.info(`⚠ Skipped (already exists/not found): ${statement.substring(0, 60)}...`);
                    } else {
                        throw error;
                    }
                }
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
