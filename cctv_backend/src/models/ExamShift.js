const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

/**
 * ExamShift – template shifts defined at the exam level.
 * These are the "master" shifts that apply to every exam date.
 * When schedules are generated, ScheduleShift entries are created
 * from these templates for each valid date.
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
