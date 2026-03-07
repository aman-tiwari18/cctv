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
