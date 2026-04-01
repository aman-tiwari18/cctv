const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const CameraLinkRTSP = sequelize.define(
    "CameraLinkRTSP",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        device_id: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: "Device identifier",
        },
        exam_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: "Foreign key to exams table",
        },
        centre_name: {
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
        camera_no: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: "Camera number from Excel",
        },
        city: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        state: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        cctv_url: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        classification: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "camera_links_rtsp",
        timestamps: true,
        underscored: true,
    }
);

module.exports = CameraLinkRTSP;
