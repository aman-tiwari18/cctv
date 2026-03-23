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
            unique: true,
            comment: "Unique device identifier",
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
