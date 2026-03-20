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
        },
        centre_name: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: "Test centre / TC name",
        },
        tc_code: {
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
        camera_name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        ch_code: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: "Unique channel key (ch_no from Excel)",
        },
        cctv_url: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        camera_category: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        classification: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        exam_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            comment: "Date of assessment",
        },
        shift_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: "FK to exam_shifts; NULL means applies to all shifts",
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
