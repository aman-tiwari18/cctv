/**
 * Model Index – loads every Sequelize model and sets up associations
 */
const Exam = require("./Exam");
const CameraLink = require("./CameraLink");
const ExamSchedule = require("./ExamSchedule");
const ExamShift = require("./ExamShift");
const ScheduleShift = require("./ScheduleShift");
const AnalyticsTask = require("./AnalyticsTask");
const ShiftScriptAssignment = require("./ShiftScriptAssignment");
const ScriptExecution = require("./ScriptExecution");

// ── Associations ────────────────────────────────────────────
// Exam -> CameraLinks
Exam.hasMany(CameraLink, { foreignKey: "exam_id", as: "cameraLinks" });
CameraLink.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

// Exam -> ExamSchedules
Exam.hasMany(ExamSchedule, { foreignKey: "exam_id", as: "schedules" });
ExamSchedule.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

// Exam -> ExamShifts (template shifts at exam level)
Exam.hasMany(ExamShift, { foreignKey: "exam_id", as: "examShifts" });
ExamShift.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

// ExamSchedule -> ScheduleShifts
ExamSchedule.hasMany(ScheduleShift, { foreignKey: "schedule_id", as: "shifts" });
ScheduleShift.belongsTo(ExamSchedule, { foreignKey: "schedule_id", as: "schedule" });

// Exam -> AnalyticsTasks
Exam.hasMany(AnalyticsTask, { foreignKey: "exam_id", as: "analyticsTasks" });
AnalyticsTask.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

// ScheduleShift -> ShiftScriptAssignments
ScheduleShift.hasMany(ShiftScriptAssignment, { foreignKey: "shift_id", as: "scriptAssignments" });
ShiftScriptAssignment.belongsTo(ScheduleShift, { foreignKey: "shift_id", as: "shift" });

// AnalyticsTask -> ShiftScriptAssignments
AnalyticsTask.hasMany(ShiftScriptAssignment, { foreignKey: "analytics_task_id", as: "shiftAssignments" });
ShiftScriptAssignment.belongsTo(AnalyticsTask, { foreignKey: "analytics_task_id", as: "analyticsTask" });

// AnalyticsTask -> ScriptExecutions
AnalyticsTask.hasMany(ScriptExecution, { foreignKey: "analytics_task_id", as: "executions" });
ScriptExecution.belongsTo(AnalyticsTask, { foreignKey: "analytics_task_id", as: "analyticsTask" });

// ScheduleShift -> ScriptExecutions  (shift_id)
ScheduleShift.hasMany(ScriptExecution, { foreignKey: "shift_id", as: "executions" });
ScriptExecution.belongsTo(ScheduleShift, { foreignKey: "shift_id", as: "shift" });

// CameraLink -> ScriptExecutions  (camera_link_id)
CameraLink.hasMany(ScriptExecution, { foreignKey: "camera_link_id", as: "executions" });
ScriptExecution.belongsTo(CameraLink, { foreignKey: "camera_link_id", as: "cameraLink" });

module.exports = {
    Exam,
    CameraLink,
    ExamSchedule,
    ExamShift,
    ScheduleShift,
    AnalyticsTask,
    ShiftScriptAssignment,
    ScriptExecution,
};
