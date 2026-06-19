const Exam = require("../models/Exam");
const ExamShift = require("../models/ExamShift");
const CameraLinkHLS = require("../models/CameraLinkHLS");
const CameraLinkRTSP = require("../models/CameraLinkRTSP");
const ShiftScriptAssignment = require("../models/ShiftScriptAssignment");
const ScriptExecution = require("../models/ScriptExecution");
const { sequelize } = require("../config/db");
const { Op } = require("sequelize");
const { getAssignableDates, toDateOnly } = require("./ShiftScriptController");


exports.createExam = async (req, res) => {
    const {
        exam_name, exam_body, link_type, description,
        start_date, end_date, skip_days, skip_dates, shifts
    } = req.body;

    const result = await sequelize.transaction(async (t) => {
        // Create the exam
        const exam = await Exam.create(
            {
                exam_name,
                exam_body,
                link_type,
                description,
                start_date: start_date || null,
                end_date: end_date || null,
                skip_days: skip_days || [],
                skip_dates: skip_dates || [],
            },
            { transaction: t }
        );

        // Create exam-level shifts if provided
        if (shifts && shifts.length > 0) {
            const shiftData = shifts.map((s) => ({
                exam_id: exam.id,
                shift_name: s.shift_name,
                start_time: s.start_time,
                end_time: s.end_time,
            }));
            await ExamShift.bulkCreate(shiftData, { transaction: t });
        }

        // Re-fetch with shifts
        return await Exam.findByPk(exam.id, {
            include: [{ model: ExamShift, as: "examShifts" }],
            transaction: t,
        });
    });

    res.status(201).json({
        success: true,
        message: "Exam created successfully",
        data: result,
    });
};


exports.getAllExams = async (req, res) => {
    const { is_active, exam_body } = req.query;
    const userCompanyName = req.user?.company_name;
    const userRole = req.user?.role;

    const where = {};

    if (is_active !== undefined)
        where.is_active = is_active === "true";

    if (exam_body)
        where.exam_body = exam_body;

    // Apply company-based filtering for client-style roles only.
    // ADMIN and OPERATOR both get the full exam list — OPERATORs verify
    // camera classifications across every exam, so scoping by company would
    // hide cameras they're supposed to be reviewing.
    if (userRole !== 'ADMIN' && userRole !== 'OPERATOR' && userCompanyName) {
        if (userCompanyName === 'EY') {
            // EY users see both SSC and TCS exams
            where.exam_body = ['SSC', 'TCS'];
        } else {
            // Other users see only their company's exams
            where.exam_body = userCompanyName;
        }
    }

    const exams = await Exam.findAll({
        where,
        include: [{ model: ExamShift, as: "examShifts" }],
        order: [["created_at", "DESC"]],
    });

    const examIds = exams.map((exam) => exam.id);

    let hlsCountMap = new Map();
    let rtspCountMap = new Map();

    if (examIds.length > 0) {
        const [hlsCounts, rtspCounts] = await Promise.all([
            CameraLinkHLS.count({
                where: { exam_id: examIds },
                group: ["exam_id"],
            }),
            CameraLinkRTSP.count({
                where: { exam_id: examIds },
                group: ["exam_id"],
            }),
        ]);

        hlsCountMap = new Map(
            hlsCounts.map((row) => [Number(row.exam_id), Number(row.count)])
        );

        rtspCountMap = new Map(
            rtspCounts.map((row) => [Number(row.exam_id), Number(row.count)])
        );
    }

    const examsWithCameraCount = exams.map((exam) => {
        const plainExam = exam.toJSON();
        const linkType = (plainExam.link_type || "").toUpperCase();

        if (linkType === "HLS") {
            plainExam.camera_count = hlsCountMap.get(plainExam.id) || 0;
        } else if (linkType === "RTSP") {
            plainExam.camera_count = rtspCountMap.get(plainExam.id) || 0;
        } else {
            plainExam.camera_count = 0;
        }

        return plainExam;
    });

    res.json({
        success: true,
        count: exams.length,
        data: examsWithCameraCount,
    });
};


exports.getExamById = async (req, res) => {
    const id = req.params.id;

    const exam = await Exam.findByPk(id, {
        include: [{ model: ExamShift, as: "examShifts" }],
    });

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    res.json({
        success: true,
        data: exam,
    });
};


// Exam fields that may be edited after creation. link_type is intentionally
// excluded — it is immutable because the camera tables (HLS vs RTSP) and all
// downstream detection wiring are tied to it.
const EDITABLE_EXAM_FIELDS = [
    "exam_name", "exam_body", "description",
    "start_date", "end_date", "skip_days", "skip_dates", "is_active",
];

const hhmm = (v) => String(v || "").substring(0, 5);

/**
 * updateExam — STRICT, incremental update. Never destroys-and-recreates.
 *
 * Rules:
 *  - link_type cannot change.
 *  - An existing shift's start/end time cannot change (it would orphan/scramble
 *    every script already scheduled against that shift's window). To re-time a
 *    shift the client must DELETE it (which removes its scheduling) and add a new
 *    one — the frontend warns about this.
 *  - Shifts are reconciled by id: existing kept (name may change), new ones
 *    created, removed ones deleted along with their scheduled assignments +
 *    executions (cascade).
 *  - When the date range / skip schedule changes, scripts already scheduled on a
 *    shift are extended onto newly-added dates, and assignments on dates that are
 *    no longer valid are removed — without touching the untouched dates.
 */
exports.updateExam = async (req, res) => {
    const id = req.params.id;
    const { shifts, link_type, ...rest } = req.body;

    const exam = await Exam.findByPk(id, {
        include: [{ model: ExamShift, as: "examShifts" }],
    });

    if (!exam) {
        return res.status(404).json({ success: false, message: "Exam not found" });
    }

    // ── Guard 1: link_type is immutable ──────────────────────────────────────
    if (link_type !== undefined &&
        String(link_type).toUpperCase() !== String(exam.link_type || "").toUpperCase()) {
        return res.status(400).json({
            success: false,
            message: `Link type cannot be changed (this exam is ${exam.link_type}). Create a new exam to use a different link type.`,
        });
    }

    const existingShifts = exam.examShifts || [];
    const existingById = new Map(existingShifts.map((s) => [Number(s.id), s]));

    // ── Guard 2: an existing shift's timing is immutable ──────────────────────
    // Validate up front so the request fails cleanly before any write.
    if (Array.isArray(shifts)) {
        for (const s of shifts) {
            if (s.id && existingById.has(Number(s.id))) {
                const ex = existingById.get(Number(s.id));
                if ((s.start_time && hhmm(s.start_time) !== hhmm(ex.start_time)) ||
                    (s.end_time && hhmm(s.end_time) !== hhmm(ex.end_time))) {
                    return res.status(400).json({
                        success: false,
                        message: `Shift "${ex.shift_name}" timing cannot be edited. Delete the shift (this also removes all scripts scheduled for it) and add a new shift with the new timing.`,
                    });
                }
            }
            if (!s.id && (!s.shift_name || !s.start_time || !s.end_time)) {
                return res.status(400).json({
                    success: false,
                    message: "New shifts require shift_name, start_time and end_time.",
                });
            }
        }
    }

    // Assignable dates BEFORE the change, to diff against the new schedule.
    const oldDates = new Set(getAssignableDates(exam));

    const summary = {
        shiftsCreated: 0, shiftsRenamed: 0, shiftsDeleted: 0,
        assignmentsAdded: 0, assignmentsRemoved: 0, warnings: [],
    };

    const updatedExam = await sequelize.transaction(async (t) => {
        // ── Update scalar exam fields (never link_type) ──
        const allowed = {};
        for (const f of EDITABLE_EXAM_FIELDS) {
            if (rest[f] !== undefined) allowed[f] = rest[f];
        }
        await exam.update(allowed, { transaction: t });

        // ── Reconcile shifts incrementally (only when provided) ──
        if (Array.isArray(shifts)) {
            const incomingIds = new Set(shifts.filter((s) => s.id).map((s) => Number(s.id)));

            for (const s of shifts) {
                if (s.id && existingById.has(Number(s.id))) {
                    const ex = existingById.get(Number(s.id));
                    if (s.shift_name && s.shift_name !== ex.shift_name) {
                        await ex.update({ shift_name: s.shift_name }, { transaction: t });
                        summary.shiftsRenamed++;
                    }
                } else if (!s.id) {
                    await ExamShift.create({
                        exam_id: id,
                        shift_name: s.shift_name,
                        start_time: s.start_time,
                        end_time: s.end_time,
                    }, { transaction: t });
                    summary.shiftsCreated++;
                }
            }

            // Removed shifts → delete the shift + its scheduling + executions.
            const toDelete = existingShifts.filter((s) => !incomingIds.has(Number(s.id)));
            for (const s of toDelete) {
                const delAssign = await ShiftScriptAssignment.destroy({ where: { shift_id: s.id }, transaction: t });
                const delExec = await ScriptExecution.destroy({ where: { shift_id: s.id }, transaction: t });
                await s.destroy({ transaction: t });
                summary.shiftsDeleted++;
                summary.assignmentsRemoved += delAssign;
                summary.warnings.push(
                    `Deleted shift "${s.shift_name}" and ${delAssign} scheduled assignment(s)` +
                    (delExec ? ` and ${delExec} execution record(s)` : "") + "."
                );
            }
        }

        // ── Re-schedule on date / skip changes ──
        // exam instance now reflects the new dates/skips.
        const newDates = new Set(getAssignableDates(exam));
        const added = [...newDates].filter((d) => !oldDates.has(d));
        const removed = [...oldDates].filter((d) => !newDates.has(d));

        const currentShifts = await ExamShift.findAll({ where: { exam_id: id }, transaction: t, raw: true });
        const shiftIds = currentShifts.map((s) => s.id);

        // Dates no longer valid → drop their assignments.
        if (removed.length && shiftIds.length) {
            summary.assignmentsRemoved += await ShiftScriptAssignment.destroy({
                where: { shift_id: { [Op.in]: shiftIds }, assignment_date: { [Op.in]: removed } },
                transaction: t,
            });
        }

        // Newly-valid dates (e.g. extended end_date) → replicate each shift's
        // existing script set onto the new dates, preserving custom timing.
        if (added.length && shiftIds.length) {
            for (const shiftId of shiftIds) {
                const existing = await ShiftScriptAssignment.findAll({
                    where: { shift_id: shiftId },
                    order: [["assignment_date", "DESC"]],
                    transaction: t, raw: true,
                });
                if (existing.length === 0) continue;

                const repByScript = new Map();
                for (const a of existing) {
                    if (!repByScript.has(a.script_id)) repByScript.set(a.script_id, a);
                }
                const existKeys = new Set(existing.map((a) => `${a.script_id}::${toDateOnly(a.assignment_date)}`));

                const rows = [];
                for (const [scriptId, rep] of repByScript) {
                    for (const date of added) {
                        if (existKeys.has(`${scriptId}::${date}`)) continue;
                        rows.push({
                            shift_id: shiftId,
                            script_id: scriptId,
                            assignment_date: date,
                            custom_start_time: rep.custom_start_time || null,
                            custom_end_time: rep.custom_end_time || null,
                            custom_frequency_minutes: rep.custom_frequency_minutes || null,
                            notes: rep.notes || null,
                            is_active: true,
                        });
                    }
                }
                if (rows.length) {
                    await ShiftScriptAssignment.bulkCreate(rows, { transaction: t });
                    summary.assignmentsAdded += rows.length;
                }
            }
        }

        return await Exam.findByPk(id, {
            include: [{ model: ExamShift, as: "examShifts" }],
            transaction: t,
        });
    });

    res.json({
        success: true,
        message: "Exam updated successfully",
        data: updatedExam,
        summary,
    });
};


exports.deleteExam = async (req, res) => {
    const id = req.params.id;

    const exam = await Exam.findByPk(id);

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    await sequelize.transaction(async (t) => {
        // Delete related shifts (cascade should handle, but be explicit)
        await ExamShift.destroy({ where: { exam_id: id }, transaction: t });
        // Delete the exam
        await exam.destroy({ transaction: t });
    });

    res.json({
        success: true,
        message: "Exam deleted successfully",
    });
};

exports.getDetectionCount = async (req, res) => {
    const examId = req.params.id;
    const userRole = req.user?.role;

    const exam = await Exam.findByPk(examId);

    if (!exam) {
        return res.status(404).json({
            success: false,
            message: "Exam not found",
        });
    }

    const linkType = (exam.link_type || "").toUpperCase();
    let detectionCount = 0;

    // For VIEWER (client) role, only count detections pushed to client
    const isClientView = userRole === 'VIEWER';
    const clientFilter = isClientView ? 'AND pushed_to_client = 1 AND remove_from_client = 0' : '';

    try {
        if (linkType === "HLS") {
            // Count from camera_report_hls table
            const [results] = await sequelize.query(
                `SELECT COUNT(DISTINCT id) as count 
                 FROM camera_report_hls 
                 WHERE exam_id = :examId ${clientFilter}`,
                {
                    replacements: { examId },
                    type: sequelize.QueryTypes.SELECT,
                }
            );
            detectionCount = results?.count || 0;
        } else if (linkType === "RTSP") {
            // Count from camera_report_rtsp table
            const [results] = await sequelize.query(
                `SELECT COUNT(DISTINCT id) as count 
                 FROM camera_report_rtsp 
                 WHERE exam_id = :examId ${clientFilter}`,
                {
                    replacements: { examId },
                    type: sequelize.QueryTypes.SELECT,
                }
            );
            detectionCount = results?.count || 0;
        }

        res.json({
            success: true,
            data: {
                exam_id: examId,
                link_type: linkType,
                detection_count: parseInt(detectionCount, 10),
                is_client_view: isClientView,
            },
        });
    } catch (error) {
        console.error("Error counting detections:", error);
        res.status(500).json({
            success: false,
            message: "Failed to count detections",
            error: error.message,
        });
    }
};
