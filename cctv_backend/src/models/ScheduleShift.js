const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ScheduleShift = sequelize.define(
    "ScheduleShift",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        schedule_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },

        shift_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },

        start_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },

        end_time: {
            type: DataTypes.TIME,
            allowNull: false,
        },

        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "schedule_shifts",
        timestamps: true,
        underscored: true,
    }
);

module.exports = ScheduleShift;
