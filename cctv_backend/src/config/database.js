// const mysql = require('mysql2/promise');
// const logger = require('../utils/logger');

// // Create connection pool
// const pool = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   port: process.env.DB_PORT || 3306,
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || 'rootpassword123',
//   database: process.env.DB_NAME || 'cctv_monitoring',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
//   enableKeepAlive: true,
//   keepAliveInitialDelay: 0
// });

// // Test database connection
// const testConnection = async () => {
//   try {
//     const connection = await pool.getConnection();
//     logger.info('Database connection established successfully');
//     connection.release();
//     return true;
//   } catch (error) {
//     logger.error('Database connection failed:', error);
//     throw error;
//   }
// };

// // Execute query with error handling
// const query = async (sql, params = []) => {
//   try {
//     const [results] = await pool.query(sql, params);
//     return results;
//   } catch (error) {
//     logger.error('Database query error:', { sql, error: error.message });
//     throw error;
//   }
// };

// // Execute transaction
// const transaction = async (callback) => {
//   const connection = await pool.getConnection();
//   try {
//     await connection.beginTransaction();
//     const result = await callback(connection);
//     await connection.commit();
//     return result;
//   } catch (error) {
//     await connection.rollback();
//     logger.error('Transaction error:', error);
//     throw error;
//   } finally {
//     connection.release();
//   }
// };

// module.exports = {
//   pool,
//   query,
//   transaction,
//   testConnection
// };


const { Sequelize } = require("sequelize");
const logger = require("../utils/logger");

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME || "cctv_monitoring",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "rootpassword123",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",

    // Pool settings (similar to mysql2 pool)
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },

    logging: (msg) => logger.debug(msg), // Disable: false if needed
  }
);

/**
 * Test database connection
 */
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info("Database connection established successfully");
    return true;
  } catch (error) {
    logger.error("Database connection failed:", error);
    throw error;
  }
};

/**
 * Execute raw SQL query
 */
const query = async (sql, params = []) => {
  try {
    const [results] = await sequelize.query(sql, {
      replacements: params,
    });

    return results;
  } catch (error) {
    logger.error("Database query error:", {
      sql,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Execute transaction
 */
const transaction = async (callback) => {
  const t = await sequelize.transaction();

  try {
    const result = await callback(t);

    await t.commit();
    return result;
  } catch (error) {
    await t.rollback();
    logger.error("Transaction error:", error);
    throw error;
  }
};

module.exports = {
  sequelize,
  query,
  transaction,
  testConnection,
};
