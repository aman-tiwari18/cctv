const ShiftScriptAssignment = require("../models/ShiftScriptAssignment");
const Script = require("../models/Script");
const ExamShift = require("../models/ExamShift");
const Exam = require("../models/Exam");
const { Op } = require("sequelize");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const toDateOnly = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
};

const safeArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
};

const getAssignableDates = (exam) => {
    const start = toDateOnly(exam.start_date);
    const end = toDateOnly(exam.end_date);
    if (!start || !end) return [];

    const skipDays = new Set(safeArray(exam.skip_days));
    const skipDates = new Set(safeArray(exam.skip_dates).map(toDateOnly).filter(Boolean));

    const dates = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);

    while (cursor <= endDate) {
        const dateStr = cursor.toISOString().split("T")[0];
        const dayName = DAY_NAMES[cursor.getUTCDay()];
        if (!skipDays.has(dayName) && !skipDates.has(dateStr)) {
            dates.push(dateStr);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
};


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

    // Verify exam exists and has a date range
    const exam = await Exam.findByPk(shift.exam_id);
    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found for this shift",
        });
    }

    const assignableDates = getAssignableDates(exam);
    if (assignableDates.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No assignable dates found. Please set exam start_date/end_date and verify skip_days/skip_dates.",
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

    const existingAssignments = await ShiftScriptAssignment.findAll({
        attributes: ["assignment_date"],
        where: {
            shift_id,
            script_id,
            assignment_date: { [Op.in]: assignableDates },
        },
        raw: true,
    });

    const existingDateSet = new Set(existingAssignments.map((row) => row.assignment_date));
    const newRecords = assignableDates
        .filter((date) => !existingDateSet.has(date))
        .map((date) => ({
            shift_id,
            script_id,
            assignment_date: date,
            custom_start_time: custom_start_time || null,
            custom_end_time: custom_end_time || null,
            custom_frequency_minutes: custom_frequency_minutes || null,
            notes: notes || null,
        }));

    if (newRecords.length > 0) {
        await ShiftScriptAssignment.bulkCreate(newRecords);
    }

    const results = await ShiftScriptAssignment.findAll({
        where: {
            shift_id,
            script_id,
            assignment_date: { [Op.in]: assignableDates },
        },
        include: [{ model: Script, as: "script" }],
        order: [["assignment_date", "ASC"]],
    });

    res.status(201).json({
        success: true,
        message: `Script assigned for ${newRecords.length} date(s). Skipped ${existingAssignments.length} already assigned date(s).`,
        count: results.length,
        createdCount: newRecords.length,
        skippedCount: existingAssignments.length,
        data: results,
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

    const shift = await ExamShift.findByPk(shift_id);
    if (!shift) {
        return res.status(404).json({
            success: false,
            message: "Shift not found",
        });
    }

    const exam = await Exam.findByPk(shift.exam_id);
    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found for this shift",
        });
    }

    const assignableDates = getAssignableDates(exam);
    if (assignableDates.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No assignable dates found. Please set exam start_date/end_date and verify skip_days/skip_dates.",
        });
    }

    const scriptIds = [...new Set(scripts.map((s) => s.script_id).filter(Boolean))];
    const existingScripts = await Script.findAll({
        attributes: ["id"],
        where: { id: { [Op.in]: scriptIds } },
        raw: true,
    });
    const validScriptIdSet = new Set(existingScripts.map((s) => s.id));

    const prepared = scripts.filter((s) => validScriptIdSet.has(s.script_id));
    if (prepared.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No valid scripts found in request",
        });
    }

    const existingAssignments = await ShiftScriptAssignment.findAll({
        attributes: ["script_id", "assignment_date"],
        where: {
            shift_id,
            script_id: { [Op.in]: prepared.map((s) => s.script_id) },
            assignment_date: { [Op.in]: assignableDates },
        },
        raw: true,
    });

    const existingKeySet = new Set(
        existingAssignments.map((row) => `${row.script_id}::${row.assignment_date}`)
    );

    const assignments = [];
    for (const s of prepared) {
        for (const date of assignableDates) {
            const key = `${s.script_id}::${date}`;
            if (existingKeySet.has(key)) continue;

            assignments.push({
                shift_id,
                script_id: s.script_id,
                assignment_date: date,
                custom_start_time: s.custom_start_time || null,
                custom_end_time: s.custom_end_time || null,
                custom_frequency_minutes: s.custom_frequency_minutes || null,
                notes: s.notes || null,
            });
        }
    }

    if (assignments.length > 0) {
        await ShiftScriptAssignment.bulkCreate(assignments);
    }

    res.status(201).json({
        success: true,
        message: `Successfully created ${assignments.length} assignment(s) across ${assignableDates.length} date(s).`,
        count: assignments.length,
        data: {
            created: assignments.length,
            skippedExisting: existingAssignments.length,
            validDates: assignableDates.length,
            validScripts: prepared.length,
        },
    });
};


/**
 * Get all scripts assigned to a shift
 */
exports.getByShift = async (req, res) => {
    const { is_active, assignment_date } = req.query;

    const where = { shift_id: req.params.shiftId };
    if (is_active !== undefined) where.is_active = is_active === "true";
    if (assignment_date) where.assignment_date = assignment_date;

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
                    "default_frequency_minutes",
                    "default_duration_minutes",
                ],
            },
        ],
        order: [["assignment_date", "ASC"], [{ model: Script, as: "script" }, "name", "ASC"]],
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
    const { is_active, assignment_date } = req.query;

    const where = {};
    if (is_active !== undefined) where.is_active = is_active === "true";
    if (assignment_date) where.assignment_date = assignment_date;

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
                    "default_frequency_minutes",
                ],
            },
        ],
        order: [["assignment_date", "ASC"], [{ model: Script, as: "script" }, "name", "ASC"]],
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
