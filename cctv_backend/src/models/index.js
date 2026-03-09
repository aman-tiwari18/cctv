/**
 * Model Index – loads every Sequelize model and sets up associations
 */
const Exam = require("./Exam");
const CameraLink = require("./CameraLink");
const ExamShift = require("./ExamShift");
const Script = require("./Script");
const ShiftScriptAssignment = require("./ShiftScriptAssignment");
const ScriptExecution = require("./ScriptExecution");

// ── Associations ────────────────────────────────────────────
// Exam -> CameraLinks
Exam.hasMany(CameraLink, { foreignKey: "exam_id", as: "cameraLinks" });
CameraLink.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

// Exam -> ExamShifts
Exam.hasMany(ExamShift, { foreignKey: "exam_id", as: "examShifts" });
ExamShift.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

// ExamShift -> ShiftScriptAssignments
ExamShift.hasMany(ShiftScriptAssignment, { foreignKey: "shift_id", as: "scriptAssignments" });
ShiftScriptAssignment.belongsTo(ExamShift, { foreignKey: "shift_id", as: "shift" });

// Script -> ShiftScriptAssignments
Script.hasMany(ShiftScriptAssignment, { foreignKey: "script_id", as: "shiftAssignments" });
ShiftScriptAssignment.belongsTo(Script, { foreignKey: "script_id", as: "script" });

// Script -> ScriptExecutions
Script.hasMany(ScriptExecution, { foreignKey: "script_id", as: "executions" });
ScriptExecution.belongsTo(Script, { foreignKey: "script_id", as: "script" });

// ExamShift -> ScriptExecutions (shift_id)
ExamShift.hasMany(ScriptExecution, { foreignKey: "shift_id", as: "executions" });
ScriptExecution.belongsTo(ExamShift, { foreignKey: "shift_id", as: "shift" });

// CameraLink -> ScriptExecutions (camera_link_id)
CameraLink.hasMany(ScriptExecution, { foreignKey: "camera_link_id", as: "executions" });
ScriptExecution.belongsTo(CameraLink, { foreignKey: "camera_link_id", as: "cameraLink" });

module.exports = {
    Exam,
    CameraLink,
    ExamShift,
    Script,
    ShiftScriptAssignment,
    ScriptExecution,
};
