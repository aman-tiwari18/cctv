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

// Config fields a caller may set on an assignment. Anything outside this list
// (status, timestamps, is_active, ...) is owned by the runtime, not the UI.
const CONFIG_FIELDS = [
    "custom_start_time",
    "custom_end_time",
    "custom_frequency_minutes",
    "camera_classifications",
    "notes",
    "sms_enabled",
];

const normalizeConfigValue = (field, value) => {
    if (field === "sms_enabled") return !!value;
    if (field === "custom_frequency_minutes") {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    if (field === "camera_classifications") {
        const list = safeArray(value);
        return list.length > 0 ? list : null;
    }
    return value === undefined || value === "" ? null : value;
};

// Only the keys the caller actually sent, so a partial payload never blanks out
// settings it did not mention.
const pickConfigFields = (source) =>
    CONFIG_FIELDS.reduce((acc, field) => {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            acc[field] = normalizeConfigValue(field, source[field]);
        }
        return acc;
    }, {});

// Re-exported so ExamController can reuse the exact same date-expansion logic
// when an exam's date range / skip schedule changes.
exports.getAssignableDates = getAssignableDates;
exports.toDateOnly = toDateOnly;


/**
 * Assign a script to a shift
 */
exports.assignScript = async (req, res) => {
    const {
        script_id,
        custom_start_time,
        custom_end_time,
        notes,
        sms_enabled,
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
            notes: notes || null,
            sms_enabled: !!sms_enabled,
        }));

    if (newRecords.length > 0) {
        await ShiftScriptAssignment.bulkCreate(newRecords);
    }

    // If SMS toggle was provided, apply it to ALL matching assignments (including
    // ones that already existed for some dates) so the switch reflects intent.
    if (sms_enabled !== undefined) {
        await ShiftScriptAssignment.update(
            { sms_enabled: !!sms_enabled },
            {
                where: {
                    shift_id,
                    script_id,
                    assignment_date: { [Op.in]: assignableDates },
                },
            }
        );
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
    const { scripts, date_from, date_to, specific_dates, all_days } = req.body;
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

    const allAssignableDates = getAssignableDates(exam);
    if (allAssignableDates.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No assignable dates found. Please set exam start_date/end_date and verify skip_days/skip_dates.",
        });
    }

    // Determine which dates to schedule for
    let targetDates;
    if (all_days || (!date_from && !date_to && !specific_dates)) {
        // No filter = all exam dates
        targetDates = allAssignableDates;
    } else if (Array.isArray(specific_dates) && specific_dates.length > 0) {
        // Specific dates array
        const valid = new Set(allAssignableDates);
        targetDates = specific_dates.map(toDateOnly).filter((d) => d && valid.has(d));
    } else {
        // Date range filter
        const from = toDateOnly(date_from);
        const to = toDateOnly(date_to);
        targetDates = allAssignableDates.filter((d) => {
            if (from && d < from) return false;
            if (to && d > to) return false;
            return true;
        });
    }

    if (targetDates.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No valid dates in the selected range.",
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
            assignment_date: { [Op.in]: targetDates },
        },
        raw: true,
    });

    // Dates that already have a row, per script — those get updated in place
    // instead of skipped, so re-submitting the dialog edits the schedule.
    const existingDatesByScript = new Map();
    for (const row of existingAssignments) {
        const date = toDateOnly(row.assignment_date);
        if (!date) continue;
        if (!existingDatesByScript.has(row.script_id)) {
            existingDatesByScript.set(row.script_id, new Set());
        }
        existingDatesByScript.get(row.script_id).add(date);
    }

    const assignments = [];
    for (const s of prepared) {
        const fields = pickConfigFields(s);
        const existingDates = existingDatesByScript.get(s.script_id) || new Set();
        for (const date of targetDates) {
            if (existingDates.has(date)) continue;

            assignments.push({
                shift_id,
                script_id: s.script_id,
                assignment_date: date,
                custom_start_time: null,
                custom_end_time: null,
                custom_frequency_minutes: null,
                camera_classifications: null,
                notes: null,
                sms_enabled: false,
                ...fields,
            });
        }
    }

    if (assignments.length > 0) {
        await ShiftScriptAssignment.bulkCreate(assignments);
    }

    // Push the submitted config onto the rows that already existed.
    let updatedCount = 0;
    for (const s of prepared) {
        const fields = pickConfigFields(s);
        if (Object.keys(fields).length === 0) continue;

        const existingDates = [...(existingDatesByScript.get(s.script_id) || [])];
        if (existingDates.length === 0) continue;

        await ShiftScriptAssignment.update(fields, {
            where: {
                shift_id,
                script_id: s.script_id,
                assignment_date: { [Op.in]: existingDates },
            },
        });
        updatedCount += existingDates.length;
    }

    res.status(201).json({
        success: true,
        message: `Successfully created ${assignments.length} and updated ${updatedCount} assignment(s) across ${targetDates.length} date(s).`,
        count: assignments.length + updatedCount,
        data: {
            created: assignments.length,
            updated: updatedCount,
            skippedExisting: 0,
            validDates: targetDates.length,
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

    // Also return ALL active shifts of the exam (regardless of whether they have
    // assignments) so the UI can label columns Shift 1 / 2 / 3 by chronological
    // position even when some shifts have no scripts on the queried date.
    const [assignments, shifts] = await Promise.all([
        ShiftScriptAssignment.findAll({
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
        }),
        ExamShift.findAll({
            where: { exam_id: req.params.examId, is_active: true },
            attributes: ["id", "shift_name", "start_time", "end_time"],
            order: [["start_time", "ASC"]],
        }),
    ]);

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
        shifts,
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
 * Delete shift-script assignment (single row)
 */
exports.deleteAssignment = async (req, res) => {
    await ShiftScriptAssignment.destroy(
        { where: { id: req.params.id } }
    );

    res.json({
        success: true,
        message: "Assignment deleted successfully",
    });
};


/**
 * Bulk-delete assignments for a script on a shift, scoped by date range
 * Body: { script_id, shift_id, all_days?, date_from?, date_to? }
 */
exports.bulkDelete = async (req, res) => {
    let { script_id, shift_id, all_days, date_from, date_to } = req.body;

    if (!script_id || !shift_id) {
        return res.status(400).json({
            success: false,
            message: "script_id and shift_id are required",
        });
    }

    // If script_id is a string that is NOT a number, it might be a technical identifier (like 'phone').
    // We should resolve it to the primary key (id).
    if (typeof script_id === "string" && isNaN(Number(script_id))) {
        const found = await Script.findOne({ where: { script_id } });
        if (found) {
            script_id = found.id;
        } else {
            return res.status(404).json({ success: false, message: `Script identifier '${script_id}' not found.` });
        }
    }

    const where = { script_id, shift_id };

    if (!all_days && (date_from || date_to)) {
        const from = toDateOnly(date_from);
        const to = toDateOnly(date_to);
        if (from && to) {
            where.assignment_date = { [Op.between]: [from, to] };
        } else if (from) {
            where.assignment_date = { [Op.gte]: from };
        } else if (to) {
            where.assignment_date = { [Op.lte]: to };
        }
    }
    // if all_days is true or no date filter → delete all rows for this script+shift

    const deleted = await ShiftScriptAssignment.destroy({ where });

    res.json({
        success: true,
        message: `Deleted ${deleted} assignment(s) successfully.`,
        deleted,
    });
};
