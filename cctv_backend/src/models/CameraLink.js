const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const CameraLink = sequelize.define(
    "CameraLink",
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

        camera_id: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },

        stream_url: {
            type: DataTypes.TEXT,
            allowNull: false,
        },

        stream_type: {
            type: DataTypes.ENUM("RTSP", "HLS"),
            allowNull: false,
        },

        location: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "camera_links",
        timestamps: true,
        underscored: true,
    }
);

module.exports = CameraLink;
