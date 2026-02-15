const { pool } = require('../config/database');
const logger = require('../utils/logger');

const verifyTables = async () => {
    try {
        logger.info('Checking database tables...');

        const [tables] = await pool.query('SHOW TABLES');

        console.log('\n=== Database Tables ===');
        console.log(tables);
        console.log(`\nTotal tables: ${tables.length}`);

        process.exit(0);
    } catch (error) {
        logger.error('Verification failed:', error);
        process.exit(1);
    }
};

verifyTables();
