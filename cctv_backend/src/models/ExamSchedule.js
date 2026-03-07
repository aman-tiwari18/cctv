const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ExamSchedule = sequelize.define(
    "ExamSchedule",
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

        exam_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
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
        tableName: "exam_schedules",
        timestamps: true,
        underscored: true,
    }
);

module.exports = ExamSchedule;
