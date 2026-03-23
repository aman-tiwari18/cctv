const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ShiftScriptAssignment = sequelize.define(
    "ShiftScriptAssignment",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        shift_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },

        script_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: "Reference to scripts.id",
        },

        // Keep for backward compat, but new assignments use script_id
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
            comment: "Execution status of this assignment",
        },

        assignment_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            comment: "Date on which this assignment should run",
        },

        custom_start_time: {
            type: DataTypes.TIME,
            allowNull: true,
        },

        custom_end_time: {
            type: DataTypes.TIME,
            allowNull: true,
        },

        custom_frequency_minutes: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },

        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
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

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "shift_script_assignments",
        timestamps: true,
        underscored: true,
    }
);

module.exports = ShiftScriptAssignment;
