const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

/**
 * ExamShift – shifts defined at the exam level.
 * Scripts are assigned directly to these shifts
 * via ShiftScriptAssignment.
 */
const ExamShift = sequelize.define(
    "ExamShift",
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

        shift_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        start_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },

        end_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "exam_shifts",
        timestamps: true,
        underscored: true,
    }
);

module.exports = ExamShift;
