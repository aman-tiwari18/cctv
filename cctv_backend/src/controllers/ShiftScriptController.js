const ShiftScriptAssignment = require("../models/ShiftScriptAssignment");
const Script = require("../models/Script");
const ExamShift = require("../models/ExamShift");


/**
 * Assign a script to a shift
 */
exports.assignScript = async (req, res) => {
    const {
        script_id,
        custom_start_time,
        custom_end_time,
        custom_frequency_minutes,
        notes,
    } = req.body;
    const shift_id = req.params.shiftId;

    // Verify shift exists
    const shift = await ExamShift.findByPk(shift_id);
    if (!shift) {
        return res.status(404).json({
            success: false,
            message: "Shift not found",
        });
    }

    // Verify script exists
    const script = await Script.findByPk(script_id);
    if (!script) {
        return res.status(404).json({
            success: false,
            message: "Script not found",
        });
    }

    // Check if already assigned
    const existing = await ShiftScriptAssignment.findOne({
        where: { shift_id, script_id },
    });
    if (existing) {
        return res.status(400).json({
            success: false,
            message: "Script already assigned to this shift",
        });
    }

    const assignment = await ShiftScriptAssignment.create({
        shift_id,
        script_id,
        custom_start_time: custom_start_time || null,
        custom_end_time: custom_end_time || null,
        custom_frequency_minutes: custom_frequency_minutes || null,
        notes: notes || null,
    });

    // Reload with script data
    const result = await ShiftScriptAssignment.findByPk(assignment.id, {
        include: [{ model: Script, as: "script" }],
    });

    res.status(201).json({
        success: true,
        message: "Script assigned to shift successfully",
        data: result,
    });
};


/**
 * Bulk assign scripts to a shift
 */
exports.bulkAssign = async (req, res) => {
    const { scripts } = req.body;
    const shift_id = req.params.shiftId;

    if (!Array.isArray(scripts) || scripts.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Scripts array is required",
        });
    }

    const assignments = scripts.map((s) => ({
        shift_id,
        script_id: s.script_id,
        custom_start_time: s.custom_start_time || null,
        custom_end_time: s.custom_end_time || null,
        custom_frequency_minutes: s.custom_frequency_minutes || null,
        notes: s.notes || null,
    }));

    const results = await ShiftScriptAssignment.bulkCreate(assignments, {
        ignoreDuplicates: true,
    });

    res.status(201).json({
        success: true,
        message: `Successfully assigned ${results.length} scripts to shift`,
        count: results.length,
        data: results,
    });
};


/**
 * Get all scripts assigned to a shift
 */
exports.getByShift = async (req, res) => {
    const { is_active } = req.query;

    const where = { shift_id: req.params.shiftId };
    if (is_active !== undefined) where.is_active = is_active === "true";

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: Script,
                as: "script",
                attributes: [
                    "id",
                    "script_id",
                    "name",
                    "description",
                    "script_path",
                    "default_frequency_minutes",
                    "default_duration_minutes",
                    "category",
                ],
            },
        ],
        order: [[{ model: Script, as: "script" }, "name", "ASC"]],
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Get all shift-script assignments for an exam
 */
exports.getByExam = async (req, res) => {
    const { is_active } = req.query;

    const where = {};
    if (is_active !== undefined) where.is_active = is_active === "true";

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: ExamShift,
                as: "shift",
                required: true,
                where: { exam_id: req.params.examId },
            },
            {
                model: Script,
                as: "script",
                attributes: [
                    "id",
                    "script_id",
                    "name",
                    "script_path",
                    "default_frequency_minutes",
                ],
            },
        ],
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Update shift-script assignment
 */
exports.updateAssignment = async (req, res) => {
    const assignment = await ShiftScriptAssignment.findByPk(req.params.id);

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: "Assignment not found",
        });
    }

    await assignment.update(req.body);

    res.json({
        success: true,
        message: "Assignment updated successfully",
        data: assignment,
    });
};


/**
 * Delete shift-script assignment (soft delete)
 */
exports.deleteAssignment = async (req, res) => {
    await ShiftScriptAssignment.update(
        { is_active: false },
        { where: { id: req.params.id } }
    );

    res.json({
        success: true,
        message: "Assignment deleted successfully",
    });
};
