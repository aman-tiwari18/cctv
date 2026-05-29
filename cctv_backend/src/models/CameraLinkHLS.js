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
        status: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        frame_path: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: "Path to last captured classification frame on the script-server",
        },
        manually_verified: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: "1 if an operator confirmed/overrode the classification",
        },
        verified_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: "user_id of the operator who verified; null when manually_verified=0",
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
        indexes: [
            {
                unique: true,
                fields: ['exam_id', 'ch_code'],
                name: 'unique_exam_ch_code'
            }
        ]
    }
);

module.exports = CameraLinkHLS;