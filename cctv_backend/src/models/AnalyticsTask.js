const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const AnalyticsTask = sequelize.define(
    "AnalyticsTask",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        exam_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },

        task_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        script_path: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        frequency_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },

        duration_minutes: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

        start_time: {
            type: DataTypes.TIME,
            allowNull: true,
        },

        end_time: {
            type: DataTypes.TIME,
            allowNull: true,
        },

        parameters: {
            type: DataTypes.JSON,
            allowNull: true,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "analytics_tasks",
        timestamps: true,
        underscored: true,
    }
);

module.exports = AnalyticsTask;
