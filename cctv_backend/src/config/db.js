/**
 * DB Config - re-exports sequelize instance from database.js
 * This file exists so models can use require("../config/db")
 */
const { sequelize, query, transaction, testConnection } = require("./database");

module.exports = {
    sequelize,
    query,
    transaction,
    testConnection,
};
