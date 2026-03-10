const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const CameraLinkHLS = sequelize.define(
    "CameraLinkHLS",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        exam_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: "Foreign key to exams table",
        },
        tc_name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        tc_code: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        camera_name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        date_of_assessment: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        shift_of_assessment: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        url: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        camera_category: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "camera_links_hls",
        timestamps: true,
        underscored: true,
    }
);

module.exports = CameraLinkHLS;
