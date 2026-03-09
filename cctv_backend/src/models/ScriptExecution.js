const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ScriptExecution = sequelize.define(
    "ScriptExecution",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        shift_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

        camera_link_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

        script_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: "Reference to scripts.id",
        },

        // kept for backward compat
        analytics_task_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

        status: {
            type: DataTypes.ENUM(
                "PENDING",
                "RUNNING",
                "COMPLETED",
                "FAILED",
                "CANCELLED"
            ),
            defaultValue: "PENDING",
        },

        scheduled_time: {
            type: DataTypes.DATE,
            allowNull: false,
        },

        started_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        error_log: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        result_data: {
            type: DataTypes.JSON,
            allowNull: true,
        },

        execution_metadata: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        tableName: "script_executions",
        timestamps: true,
        underscored: true,
    }
);

module.exports = ScriptExecution;
