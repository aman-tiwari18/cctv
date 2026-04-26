const { Sequelize } = require("sequelize");
const logger = require("../utils/logger");

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME || "cctv_monitoring",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "root123",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",

    // Pool settings
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },

    logging: (msg) => logger.debug(msg),
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
