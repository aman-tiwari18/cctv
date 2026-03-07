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

        analytics_task_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
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
