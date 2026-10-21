const ShiftScriptAssignment = require("../models/ShiftScriptAssignment");
const Script = require("../models/Script");
const ExamShift = require("../models/ExamShift");
const Exam = require("../models/Exam");
const { CameraLinkHLS, CameraLinkRTSP } = require("../models");
const { Op } = require("sequelize");

const persistVisionClassifications = async (assignment, resultData) => {
    const classifications = Array.isArray(resultData?.classifications)
        ? resultData.classifications
        : [];

    if (classifications.length === 0) {
        return 0;
    }

    const linkType = String(assignment.shift?.exam?.link_type || "").toUpperCase();
    const examId = assignment.shift?.exam?.id;
    const shiftId = assignment.shift_id;
    const assignmentDate = assignment.assignment_date;
    let updatedCount = 0;

    for (const item of classifications) {
        const classification = String(item?.classification || "").trim();
        const cameraId = String(item?.camera_id || "").trim();

        if (!classification || !cameraId || !examId) {
            continue;
        }

        if (linkType === "HLS") {
            const [affectedRows] = await CameraLinkHLS.update(
                { classification },
                {
                    where: {
                        exam_id: examId,
                        ch_code: cameraId,
                        is_active: true,
                        [Op.and]: [
                            {
                                [Op.or]: [
                                    { shift_id: shiftId },
                                    { shift_id: null },
                                ],
                            },
                            {
                                [Op.or]: [
                                    { exam_date: assignmentDate },
                                    { exam_date: null },
                                ],
                            },
                        ],
                    },
                }
            );
            updatedCount += affectedRows;
        } else {
            const [affectedRows] = await CameraLinkRTSP.update(
                { classification },
                {
                    where: {
                        exam_id: examId,
                        device_id: cameraId,
                        is_active: true,
                    },
                }
            );
            updatedCount += affectedRows;
        }
    }

    return updatedCount;
};

/**
 * Get pending assignments (for script server polling)
 *
 * Returns PENDING assignments that are coming up within the next
 * LOOKAHEAD_MINUTES (default: 3) or are up to GRACE_MINUTES (default: 30)
 * overdue — so the poller can schedule them via setTimeout to fire at exactly
 * custom_start_time.
 *
 * Checks:
 *   1. status = PENDING, is_active = TRUE on assignment
 *   2. assignment_date = today (date-first filtering)
 *   3. custom_start_time falls within (NOW - grace) … (NOW + lookahead)
 *      Falls back to shift start_time when custom_start_time is NULL
 *
 * NOTE: No dependency on shift start/end window — the poller owns scheduling.
 */
exports.getPending = async (req, res) => {
    const limit         = parseInt(req.query.limit)    || 50;
    const lookaheadMins = parseInt(req.query.lookahead) || 3;
    const graceMins     = parseInt(req.query.grace)     || 30;

    const { sequelize } = require("../config/db");

    // Compute window boundaries in JS — avoids unreliable SEC_TO_TIME(:param) in Sequelize
    const toTimeStr = (date) =>
        date.toTimeString().substring(0, 8); // "HH:MM:SS"

    const toDateOnly = (value) => {
        if (!value) return null;
        if (typeof value === "string") return value.split("T")[0];
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
    };

    const now        = new Date();
    const windowStart = new Date(now.getTime() - graceMins      * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + lookaheadMins  * 60 * 1000);

    // Compare FULL datetimes (assignment_date + start time), NOT time-of-day.
    // The old time-only BETWEEN broke across midnight: e.g. polled at 00:28 with
    // grace=30, the window was '23:58'..'00:31' and `'00:26' BETWEEN '23:58' AND
    // '00:31'` is FALSE — so anything scheduled just after midnight was invisible
    // and never dispatched. Full-datetime comparison handles midnight correctly.
    const fmtDT = (d) => {
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
             + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    const windowStartDT = fmtDT(windowStart); // local (IST) "YYYY-MM-DD HH:MM:SS"
    const windowEndDT   = fmtDT(windowEnd);
    // Use LOCAL date (IST) for the data-mapping fallback below.
    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const rows = await sequelize.query(`
        SELECT
            ssa.id,
            ssa.shift_id,
            ssa.script_id,
            ssa.assignment_date,
            s.script_id                AS script_code,
            ssa.custom_start_time,
            ssa.custom_end_time,
            ssa.custom_frequency_minutes,
            ssa.camera_classifications,
            ssa.notes,
            s.name                     AS task_name,
            s.default_duration_minutes AS duration_minutes,
            es.shift_name,
            es.start_time              AS shift_start_time,
            es.end_time                AS shift_end_time,
            e.exam_name,
            e.link_type,
            e.id                       AS exam_id
        FROM shift_script_assignments ssa
        JOIN scripts     s  ON s.id  = ssa.script_id
        JOIN exam_shifts es ON es.id = ssa.shift_id
        JOIN exams       e  ON e.id  = es.exam_id
        WHERE
            ssa.status    = 'PENDING'
            AND ssa.is_active = TRUE
            AND e.is_active   = TRUE
            AND TIMESTAMP(ssa.assignment_date, COALESCE(ssa.custom_start_time, es.start_time))
                BETWEEN ? AND ?
        ORDER BY TIMESTAMP(ssa.assignment_date, COALESCE(ssa.custom_start_time, es.start_time)) ASC
        LIMIT ?
    `, {
        replacements: [windowStartDT, windowEndDT, limit],
        type: sequelize.QueryTypes.SELECT,
    });

    // Attach the resolved scheduled_time string so the poller can compute its delay
    const data = rows.map((row) => {
        const assignmentDate = toDateOnly(row.assignment_date) || todayStr;
        const startTimeStr = row.custom_start_time || row.shift_start_time; // "HH:MM:SS"
        const endTimeStr   = row.custom_end_time   || row.shift_end_time;   // "HH:MM:SS"

        // Detect overnight shift: if end time is earlier than start time,
        // the script runs past midnight → end_at is on the NEXT day.
        let endDateStr = assignmentDate;
        const shiftOvernight = !row.shift_start_time || !row.shift_end_time || row.shift_end_time <= row.shift_start_time;
        if (endTimeStr && startTimeStr && endTimeStr <= startTimeStr && shiftOvernight) {
            const tomorrow = new Date(`${assignmentDate}T00:00:00Z`);
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            endDateStr = tomorrow.toISOString().split("T")[0];
        }

        return {
            id:               row.id,
            task_name:        row.task_name,
            duration_minutes: row.duration_minutes,
            shift_name:       row.shift_name,
            exam_name:        row.exam_name,
            // ISO datetime the poller should fire this assignment at exactly
            scheduled_at:     `${assignmentDate}T${startTimeStr}`,
            // ISO datetime the script should stop at (next day if overnight)
            end_at:           endTimeStr ? `${endDateStr}T${endTimeStr}` : null,
            custom_frequency_minutes: row.custom_frequency_minutes || null,
            camera_classifications: row.camera_classifications || null,
            execution_metadata: {
                assignment_id: row.id,
                assignment_date: assignmentDate,
                script_id:     row.script_id,
                script_code:   row.script_code,
                script_name:   row.task_name,
                shift_id:      row.shift_id,
                shift_name:    row.shift_name,
                exam_name:     row.exam_name,
                exam_id:       row.exam_id,
                link_type: row.link_type,
                custom_frequency_minutes: row.custom_frequency_minutes || null,
                camera_classifications: row.camera_classifications || null,
            },
        };
    });

    res.json({
        success: true,
        count: data.length,
        data,
    });
};


/**
 * Running assignments — for workers that restart mid-shift.
 * Returns all RUNNING assignments today with the same field shape as getPending,
 * so the poller can start them immediately without re-fetching config.
 * No auth required (mirrors getPending).
 */
exports.getRunning = async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    const { sequelize } = require("../config/db");

    const toDateOnly = (value) => {
        if (!value) return null;
        if (typeof value === "string") return value.split("T")[0];
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
    };

    const now = new Date();
    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const rows = await sequelize.query(`
        SELECT
            ssa.id,
            ssa.shift_id,
            ssa.script_id,
            ssa.assignment_date,
            s.script_id                AS script_code,
            ssa.custom_start_time,
            ssa.custom_end_time,
            ssa.custom_frequency_minutes,
            ssa.camera_classifications,
            ssa.notes,
            s.name                     AS task_name,
            s.default_duration_minutes AS duration_minutes,
            es.shift_name,
            es.start_time              AS shift_start_time,
            es.end_time                AS shift_end_time,
            e.exam_name,
            e.link_type,
            e.id                       AS exam_id
        FROM shift_script_assignments ssa
        JOIN scripts     s  ON s.id  = ssa.script_id
        JOIN exam_shifts es ON es.id = ssa.shift_id
        JOIN exams       e  ON e.id  = es.exam_id
        WHERE
            ssa.status    = 'RUNNING'
            AND ssa.is_active = TRUE
            AND e.is_active   = TRUE
            AND ssa.assignment_date = ?
        ORDER BY ssa.started_at ASC
        LIMIT ?
    `, {
        replacements: [todayStr, limit],
        type: sequelize.QueryTypes.SELECT,
    });

    const data = rows.map((row) => {
        const assignmentDate = toDateOnly(row.assignment_date) || todayStr;
        const startTimeStr = row.custom_start_time || row.shift_start_time;
        const endTimeStr   = row.custom_end_time   || row.shift_end_time;

        let endDateStr = assignmentDate;
        const shiftOvernight = !row.shift_start_time || !row.shift_end_time || row.shift_end_time <= row.shift_start_time;
        if (endTimeStr && startTimeStr && endTimeStr <= startTimeStr && shiftOvernight) {
            const tomorrow = new Date(`${assignmentDate}T00:00:00Z`);
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            endDateStr = tomorrow.toISOString().split("T")[0];
        }

        return {
            id:               row.id,
            status:           "RUNNING",
            task_name:        row.task_name,
            duration_minutes: row.duration_minutes,
            shift_name:       row.shift_name,
            exam_name:        row.exam_name,
            scheduled_at:     `${assignmentDate}T${startTimeStr}`,
            end_at:           endTimeStr ? `${endDateStr}T${endTimeStr}` : null,
            custom_frequency_minutes: row.custom_frequency_minutes || null,
            camera_classifications: row.camera_classifications || null,
            execution_metadata: {
                assignment_id: row.id,
                assignment_date: assignmentDate,
                script_id:     row.script_id,
                script_code:   row.script_code,
                script_name:   row.task_name,
                shift_id:      row.shift_id,
                shift_name:    row.shift_name,
                exam_name:     row.exam_name,
                exam_id:       row.exam_id,
                link_type:     row.link_type,
                custom_frequency_minutes: row.custom_frequency_minutes || null,
                camera_classifications: row.camera_classifications || null,
            },
        };
    });

    res.json({
        success: true,
        count: data.length,
        data,
    });
};


/**
 * Update assignment execution status (called by script server)
 */
exports.updateStatus = async (req, res) => {
    const { status, error_log, result_data } = req.body;

    const assignment = await ShiftScriptAssignment.findByPk(req.params.id, {
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "script_id", "name"],
            },
            {
                model: ExamShift,
                as: "shift",
                attributes: ["id", "exam_id", "shift_name"],
                include: [
                    {
                        model: Exam,
                        as: "exam",
                        attributes: ["id", "link_type", "exam_name"],
                    },
                ],
            },
        ],
    });

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: "Assignment not found",
        });
    }

    const updates = { status };

    if (status === "RUNNING" && !assignment.started_at) {
        updates.started_at = new Date();
    }
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(status) && !assignment.completed_at) {
        updates.completed_at = new Date();
    }
    if (error_log) updates.error_log = error_log;
    if (result_data) {
        const mergedResultData = { ...result_data };

        if (status === "COMPLETED" && ["vision", "vision_neet"].includes(assignment.script?.script_id)) {
            const updatedClassifications = await persistVisionClassifications(assignment, mergedResultData);
            mergedResultData.persisted_classification_updates = updatedClassifications;
        }

        updates.result_data = mergedResultData;
    }

    await assignment.update(updates);

    res.json({
        success: true,
        message: "Assignment status updated successfully",
        data: assignment,
    });
};


/**
 * Get all assignments with filters (execution history view)
 */
exports.getAll = async (req, res) => {
    const {
        status,
        script_id,
        shift_id,
        exam_id,
        assignment_date,
        limit,
        offset,
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (script_id) where.script_id = parseInt(script_id);
    if (shift_id) where.shift_id = parseInt(shift_id);
    if (assignment_date) where.assignment_date = assignment_date;

    const includeShift = {
        model: ExamShift,
        as: "shift",
        attributes: ["id", "shift_name", "start_time", "end_time", "exam_id"],
    };

    if (exam_id) {
        includeShift.where = { exam_id: parseInt(exam_id) };
        includeShift.required = true;
    }

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_id"],
            },
            includeShift,
        ],
        order: [["id", "DESC"]],
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Get execution statistics
 */
exports.getStats = async (req, res) => {
    const { sequelize } = require("../config/db");

    const [results] = await sequelize.query(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN ssa.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN ssa.status = 'FAILED' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN ssa.status = 'RUNNING' THEN 1 ELSE 0 END) as running,
            SUM(CASE WHEN ssa.status = 'PENDING' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN ssa.status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
        FROM shift_script_assignments ssa
        WHERE ssa.is_active = TRUE
    `);

    res.json({
        success: true,
        data: results[0],
    });
};


/**
 * Get assignment by ID (with full details)
 */
exports.getById = async (req, res) => {
    const assignment = await ShiftScriptAssignment.findByPk(req.params.id, {
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_id"],
            },
            {
                model: ExamShift,
                as: "shift",
                attributes: ["id", "shift_name", "start_time", "end_time"],
                include: [
                    {
                        model: Exam,
                        as: "exam",
                        attributes: ["id", "exam_name", "exam_body"],
                    },
                ],
            },
        ],
    });

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: "Assignment not found",
        });
    }

    res.json({
        success: true,
        data: assignment,
    });
};


/**
 * Get assignments for a specific shift
 */
exports.getByShift = async (req, res) => {
    const { status, limit, offset } = req.query;

    const where = { shift_id: req.params.shiftId };
    if (status) where.status = status;

    const assignments = await ShiftScriptAssignment.findAll({
        where,
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_id"],
            },
        ],
        order: [["id", "DESC"]],
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};


/**
 * Get vision classification summary for an exam
 * Returns last vision run: started_at, last worker finished (MAX updated_at in camera_links_rtsp), duration
 */
exports.getVisionSummary = async (req, res) => {
    const { exam_id } = req.query;
    if (!exam_id) {
        return res.status(400).json({ success: false, message: "exam_id is required" });
    }

    const { sequelize } = require("../config/db");

    // Clock alignment: ssa.started_at / completed_at are TIMESTAMPs (read as true
    // UTC because the connection runs at +00:00), but camera_links_rtsp.updated_at
    // is a DATETIME the Python workers write in LOCAL (system / IST) time, so it
    // reads back ~5h30m ahead of UTC. Subtracting one from the other in JS (as the
    // old code did) inflated the duration by the tz offset (e.g. a real 2h31m run
    // showed as 8h1m). Fix: do the duration math in SQL, with started_at converted
    // into the SAME SYSTEM clock as updated_at, then convert the resulting
    // last-finish back to UTC for the response.
    const [rows] = await sequelize.query(`
        SELECT
            assignment_id,
            status,
            started_at,
            completed_at,
            assignment_date,
            TIMESTAMPDIFF(MINUTE, started_local, last_finish_local) AS duration_minutes,
            CONVERT_TZ(last_finish_local, 'SYSTEM', @@session.time_zone) AS last_worker_finished_at
        FROM (
            SELECT
                ssa.id        AS assignment_id,
                ssa.status,
                ssa.started_at,
                ssa.completed_at,
                ssa.assignment_date,
                CONVERT_TZ(ssa.started_at, @@session.time_zone, 'SYSTEM') AS started_local,
                (
                    SELECT MAX(clr.updated_at)
                    FROM camera_links_rtsp clr
                    WHERE clr.exam_id = :exam_id
                      AND clr.updated_at > CONVERT_TZ(ssa.started_at, @@session.time_zone, 'SYSTEM')
                ) AS last_finish_local
            FROM shift_script_assignments ssa
            JOIN scripts s ON s.id = ssa.script_id
            JOIN exam_shifts es ON es.id = ssa.shift_id
            WHERE s.script_id IN ('vision', 'vision_neet')
              AND es.exam_id = :exam_id
              AND ssa.is_active = TRUE
              AND ssa.started_at IS NOT NULL
            ORDER BY ssa.started_at DESC
            LIMIT 1
        ) t
    `, { replacements: { exam_id: parseInt(exam_id) } });

    if (!rows || rows.length === 0) {
        return res.json({ success: true, data: null });
    }

    const row = rows[0];
    let duration_minutes = row.duration_minutes != null ? Number(row.duration_minutes) : null;
    let finishedAt = row.last_worker_finished_at || row.completed_at;
    // Fallback when no camera has been (re)processed yet for this run: use the
    // assignment's own completed_at, which is a TIMESTAMP in the same UTC clock as
    // started_at, so this subtraction is clock-consistent.
    if (duration_minutes == null && row.started_at && row.completed_at) {
        duration_minutes = Math.round(
            (new Date(row.completed_at) - new Date(row.started_at)) / 60000
        );
        finishedAt = row.completed_at;
    }

    // ── Live progress + ETA across ALL workers for this exam's vision run ──
    // Cameras are sharded across the GPU fleet; the run completes only when the
    // slowest worker finishes. Estimate that from overall progress: how many of
    // the exam's cameras have been (re)processed since the run started vs total,
    // projected over elapsed wall-clock. Naturally stretches as the slower 8-GPU
    // workers lag behind.
    let progress = null;
    if (row.started_at) {
        // NOTE on clocks: updated_at is stored in SYSTEM/local (IST) time, and the
        // mysql2 driver binds the :started_at JS Date as a local-time string too,
        // so this comparison is already clock-consistent (both IST) — no CONVERT_TZ
        // needed here. (The duration query above converts because it compares the
        // raw started_at TIMESTAMP *column*, which is read as UTC.)
        const [pr] = await sequelize.query(`
            SELECT
                COUNT(*)                       AS total_cameras,
                SUM(updated_at >= :started_at) AS processed
            FROM camera_links_rtsp
            WHERE exam_id = :exam_id
        `, { replacements: { exam_id: parseInt(exam_id), started_at: row.started_at } });

        if (pr && pr[0] && Number(pr[0].total_cameras) > 0) {
            const total      = Number(pr[0].total_cameras);
            const processed  = Number(pr[0].processed) || 0;
            const elapsedSec = Math.max(0, Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000));
            const percent    = Math.min(100, Math.round((processed * 100) / total));
            // ETA only makes sense while the run is actively RUNNING. Once the
            // assignment is COMPLETED we still report percent/processed (so an
            // incomplete run — e.g. the slow 8-GPU workers cut off — is visible),
            // but no "time remaining" projection.
            const isRunning  = String(row.status || "").toUpperCase() === "RUNNING";
            let eta_seconds  = null;
            if (processed >= total) {
                eta_seconds = 0;                                   // all cameras processed
            } else if (isRunning && processed > 0 && elapsedSec > 0) {
                eta_seconds = Math.round(elapsedSec * (total - processed) / processed);
            }
            progress = {
                total_cameras: total,
                processed_count: processed,
                percent,
                elapsed_seconds: elapsedSec,
                eta_seconds,                                       // est. seconds remaining (null = unknown)
                est_total_seconds: eta_seconds == null ? null : elapsedSec + eta_seconds,
            };
        }
    }

    res.json({
        success: true,
        data: {
            assignment_id: row.assignment_id,
            status: row.status,
            assignment_date: row.assignment_date,
            started_at: row.started_at,
            last_worker_finished_at: finishedAt,
            duration_minutes,
            progress,
        },
    });
};


/**
 * Get recent assignments (by most recently updated)
 */
exports.getRecent = async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;

    const assignments = await ShiftScriptAssignment.findAll({
        include: [
            {
                model: Script,
                as: "script",
                attributes: ["id", "name", "script_id"],
            },
            {
                model: ExamShift,
                as: "shift",
                attributes: ["id", "shift_name"],
                include: [
                    {
                        model: Exam,
                        as: "exam",
                        attributes: ["id", "exam_name"],
                    },
                ],
            },
        ],
        order: [["updated_at", "DESC"]],
        limit,
    });

    res.json({
        success: true,
        count: assignments.length,
        data: assignments,
    });
};
