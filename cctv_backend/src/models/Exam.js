const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Exam = sequelize.define(
    "Exam",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        exam_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        exam_body: {
            type: DataTypes.STRING,
        },

        link_type: {
            type: DataTypes.STRING,
        },

        description: {
            type: DataTypes.TEXT,
        },

        start_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },

        end_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },

        skip_days: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: [],
            comment: 'Array of day names to skip, e.g. ["Saturday","Sunday"]',
        },

        skip_dates: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: [],
            comment: 'Array of specific dates to skip, e.g. ["2026-03-15","2026-03-20"]',
        },

        observer_phone: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'NTA observer phone for SMS alerts, falls back to ALERT_PHONE_NUMBERS env',
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "exams",
        timestamps: true,
        underscored: true,
    }
);

module.exports = Exam;
