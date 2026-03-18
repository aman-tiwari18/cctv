const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

/**
 * Script – master registry of all available analytics scripts.
 * Independent of exams. Used as the source of truth when
 * assigning scripts to shifts.
 */
const Script = sequelize.define(
    "Script",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        script_id: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            comment: "Technical identifier, e.g. face_detection",
        },

        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        default_frequency_minutes: {
            type: DataTypes.INTEGER,
            defaultValue: 5,
        },

        default_duration_minutes: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "scripts",
        timestamps: true,
        underscored: true,
    }
);

module.exports = Script;
