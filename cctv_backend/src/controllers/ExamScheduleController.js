'use strict';
/**
 * ExamScheduleController — which date / shift / centre runs (RTSP exams).
 * Docs: docs/EXAM_SCHEDULE_AND_THRESHOLDS.md
 *
 *   slot schedule   exam level   (exam_slot_schedule)    "Exam Schedule" sheet: date × shift Yes/No
 *   centre schedule centre level (exam_centre_schedule)  "Centre wise scheduling" sheet: TC code × date+shift YES/NO
 *
 * No rows for an exam = no restriction (old behaviour). Enforcement happens where the
 * workers read their cameras (WorkerDbController.getCameras + the worker's db_client).
 *
 * Every endpoint answers { success:false, message, errors?, warnings? } on failure so the
 * UI can show exactly what is wrong with a sheet.
 */
const fs = require('fs');
const XLSX = require('xlsx');
const { query, sequelize } = require('../config/database');
const logger = require('../utils/logger');
const S = require('../utils/examSchedule');

const CHUNK = 1000;
const MAX_LISTED = 25;

// ── shared helpers ──────────────────────────────────────────────────────────
function cleanup(file) {
    if (file?.path) fs.unlink(file.path, (e) => { if (e) logger.warn(`[examSchedule] temp cleanup failed: ${e.message}`); });
}

function fail(res, err, what) {
    if (err instanceof S.ScheduleError) {
        return res.status(err.status).json({ success: false, message: err.message, ...(err.details || {}) });
    }
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/.test(err.message || ''))) {
        return res.status(503).json({
            success: false,
            message: 'The schedule tables are missing — run migration 044_exam_schedule_and_thresholds.sql on this database.',
        });
    }
    logger.error(`[examSchedule] ${what} failed: ${err && err.stack || err}`);
    return res.status(500).json({ success: false, message: `${what} failed: ${err.message}` });
}

async function getExam(examId) {
    const id = parseInt(examId, 10);
    if (!Number.isInteger(id)) throw new S.ScheduleError('Invalid exam id', 400);
    const [exam] = await query('SELECT id, exam_name, link_type, start_date, end_date, skip_dates FROM exams WHERE id = ? LIMIT 1', [id]);
    if (!exam) throw new S.ScheduleError('Exam not found', 404);
    let skip = exam.skip_dates;
    if (typeof skip === 'string') { try { skip = JSON.parse(skip); } catch { skip = []; } }
    exam.skip_dates = Array.isArray(skip) ? skip : [];
    return exam;
}

// 13 Oct 2026: the centre schedule applies to HLS exams too (UPCISB). HLS camera rows are stored once
// per date + shift, so a camera is counted once per channel (ch_code), not once per row.
const isHls = (exam) => String(exam.link_type).toUpperCase() === 'HLS';
const camTable = (exam) => (isHls(exam) ? 'camera_links_hls' : 'camera_links_rtsp');
const camCountExpr = (exam, alias) => (isHls(exam) ? `COUNT(DISTINCT ${alias ? alias + '.' : ''}ch_code)` : `COUNT(${alias ? alias + '.id' : '*'})`);
async function camerasByTc(exam) {
    return query(`SELECT tc_code, ${camCountExpr(exam)} AS n FROM ${camTable(exam)} WHERE exam_id = ? AND is_active = 1 GROUP BY tc_code`, [exam.id]);
}

const isoDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
const head = (arr) => (arr.length > MAX_LISTED ? `${arr.slice(0, MAX_LISTED).join(', ')} … (+${arr.length - MAX_LISTED} more)` : arr.join(', '));

async function bulkInsert(t, table, cols, rows) {
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await sequelize.query(
            `INSERT INTO ${table} (${cols.join(',')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')}`,
            { replacements: chunk.flat(), transaction: t }
        );
    }
}

/** dry_run=1|true on the query string -> preview only. */
const isDryRun = (req) => ['1', 'true', 'yes'].includes(String(req.query.dry_run || '').toLowerCase());

// ── slot schedule (exam level) ──────────────────────────────────────────────
/** Build the preview of a parsed exam-level sheet against an exam. */
async function slotPreview(exam, parsed) {
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];
    const { byNo } = await S.resolveShiftMap(exam.id);
    const missing = [...new Set(parsed.slots.map((s) => s.shift_no))].filter((n) => !byNo.has(n));
    if (missing.length) {
        errors.push(`The exam has no shift for: ${missing.map((n) => `Shift ${n}`).join(', ')}. Add the shifts to the exam first (use "Import schedule" on the exam form), then upload again.`);
    }
    const out = parsed.dates.filter((d) => (exam.start_date && d < isoDay(exam.start_date)) || (exam.end_date && d > isoDay(exam.end_date)));
    if (out.length) warnings.push(`Dates outside the exam period ${isoDay(exam.start_date)} – ${isoDay(exam.end_date)}: ${head(out)}`);
    const skipped = parsed.dates.filter((d) => exam.skip_dates.includes(d));
    if (skipped.length) warnings.push(`Dates the exam lists as skipped but the sheet schedules: ${head(skipped)}`);
    const running = parsed.slots.filter((s) => s.is_running).length;
    return { errors, warnings, summary: { dates: parsed.dates.length, slots: parsed.slots.length, running, not_running: parsed.slots.length - running, shifts: parsed.shifts } };
}

exports.uploadSlotSchedule = async (req, res) => {
    try {
        if (!req.file) throw new S.ScheduleError('No file uploaded (send the Excel file in the "file" field)');
        const exam = await getExam(req.params.examId);
        const parsed = S.parseSlotSchedule(req.file.path);
        const pre = await slotPreview(exam, parsed);
        const canCommit = pre.errors.length === 0;
        if (isDryRun(req)) return res.json({ success: true, dry_run: true, can_commit: canCommit, ...pre });
        if (!canCommit) return res.status(422).json({ success: false, message: 'The sheet has errors — nothing was saved.', ...pre });

        const { byNo } = await S.resolveShiftMap(exam.id);
        const uploadId = await S.recordUpload({
            examId: exam.id, kind: 'slots', fileName: req.file.originalname, user: req.user?.username,
            slots: parsed.slots.length, running: pre.summary.running, warnings: pre.warnings,
        });
        const rows = parsed.slots.map((s) => [exam.id, s.date, byNo.get(s.shift_no).id, s.is_running ? 1 : 0, 'excel', uploadId, req.user?.username || null]);
        await sequelize.transaction(async (t) => {
            await sequelize.query('DELETE FROM exam_slot_schedule WHERE exam_id = ?', { replacements: [exam.id], transaction: t });
            await bulkInsert(t, 'exam_slot_schedule', ['exam_id', 'exam_date', 'shift_id', 'is_running', 'source', 'upload_id', 'updated_by'], rows);
        });
        logger.info(`[examSchedule] exam ${exam.id}: slot schedule loaded (${rows.length} slots) by ${req.user?.username}`);
        return res.json({ success: true, message: `Saved ${rows.length} date + shift slots (${pre.summary.running} running).`, ...pre });
    } catch (e) { return fail(res, e, 'Slot schedule upload'); } finally { cleanup(req.file); }
};

/** POST /exams/schedule-sheet/parse — fills the exam FORM from the sheet (exam need not exist yet). */
exports.parseForForm = async (req, res) => {
    try {
        if (!req.file) throw new S.ScheduleError('No file uploaded (send the Excel file in the "file" field)');
        const parsed = S.parseSlotSchedule(req.file.path);
        if (parsed.errors.length) {
            return res.status(422).json({ success: false, message: 'The sheet has errors.', errors: parsed.errors, warnings: parsed.warnings });
        }
        const start = parsed.dates[0];
        const end = parsed.dates[parsed.dates.length - 1];
        const listed = new Set(parsed.dates);
        // Dates in the period that the sheet does not list = days with no exam; a date whose
        // shifts are all "No" is a skipped day too.
        const allNo = new Set(parsed.dates.filter((d) => parsed.slots.filter((s) => s.date === d).every((s) => !s.is_running)));
        const skip = [];
        for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
            const iso = d.toISOString().slice(0, 10);
            if (!listed.has(iso) || allNo.has(iso)) skip.push(iso);
        }
        const shifts = parsed.shifts
            .sort((a, b) => a.shift_no - b.shift_no)
            .map((s) => ({ shift_name: `Shift ${s.shift_no}`, start_time: s.start_time || '', end_time: s.end_time || '' }));
        return res.json({
            success: true,
            data: { start_date: start, end_date: end, skip_days: [], skip_dates: skip, shifts, dates: parsed.dates,
                    not_running_slots: parsed.slots.filter((s) => !s.is_running && !allNo.has(s.date)).map((s) => `${s.date} Shift ${s.shift_no}`) },
            warnings: parsed.warnings,
        });
    } catch (e) { return fail(res, e, 'Reading the exam schedule sheet'); } finally { cleanup(req.file); }
};

exports.getSlotSchedule = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const rows = await query('SELECT exam_date, shift_id, is_running, source FROM exam_slot_schedule WHERE exam_id = ? ORDER BY exam_date, shift_id', [exam.id]);
        const [last] = await query("SELECT file_name, uploaded_by, created_at FROM exam_schedule_uploads WHERE exam_id = ? AND kind = 'slots' ORDER BY id DESC LIMIT 1", [exam.id]);
        return res.json({ success: true, has_schedule: rows.length > 0, slots: rows.map((r) => ({ date: isoDay(r.exam_date), shift_id: r.shift_id, is_running: !!r.is_running, source: r.source })), last_upload: last || null });
    } catch (e) { return fail(res, e, 'Loading the slot schedule'); }
};

exports.deleteSlotSchedule = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        await query('DELETE FROM exam_slot_schedule WHERE exam_id = ?', [exam.id]);
        return res.json({ success: true, message: 'Exam date/shift schedule cleared — every date and shift runs again.' });
    } catch (e) { return fail(res, e, 'Clearing the slot schedule'); }
};

// ── centre schedule (RTSP + HLS) ──────────────────────────────────────────────────
async function centrePreview(exam, parsed) {
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];
    const { byNo } = await S.resolveShiftMap(exam.id);
    const missing = [...new Set(parsed.slotCols.map((s) => s.shift_no))].filter((n) => !byNo.has(n));
    if (missing.length) errors.push(`The exam has no shift for: ${missing.map((n) => `Shift ${n}`).join(', ')}. Add the shifts to the exam first.`);

    const dates = [...new Set(parsed.slotCols.map((s) => s.date))].sort();
    const out = dates.filter((d) => (exam.start_date && d < isoDay(exam.start_date)) || (exam.end_date && d > isoDay(exam.end_date)));
    if (out.length) warnings.push(`Dates outside the exam period ${isoDay(exam.start_date)} – ${isoDay(exam.end_date)}: ${head(out)}`);
    const skipped = dates.filter((d) => exam.skip_dates.includes(d));
    if (skipped.length) warnings.push(`Dates the exam lists as skipped but the sheet schedules: ${head(skipped)}`);

    const cams = await camerasByTc(exam);
    const camByTc = new Map(cams.map((r) => [S.normalizeTc(r.tc_code), Number(r.n)]));
    const sheetTcs = new Set(parsed.centres.map((c) => c.tc_code));
    let noCams = [];
    let unlisted = [];
    if (camByTc.size === 0) {
        warnings.push(`This exam has no ${exam.link_type} cameras yet, so TC codes could not be checked against cameras. Upload the cameras, then re-check the schedule.`);
    } else {
        noCams = [...sheetTcs].filter((t) => !camByTc.has(t));
        unlisted = [...camByTc.keys()].filter((t) => !sheetTcs.has(t));
        if (noCams.length) warnings.push(`${noCams.length} TC code(s) in the sheet have no cameras: ${head(noCams)}`);
        if (unlisted.length) warnings.push(`${unlisted.length} TC code(s) with cameras are NOT in the sheet and will not run in any shift: ${head(unlisted)}`);
    }

    // Disagreement with the exam-level schedule
    const slotRows = await query('SELECT exam_date, shift_id, is_running FROM exam_slot_schedule WHERE exam_id = ?', [exam.id]);
    if (slotRows.length) {
        const off = new Set(slotRows.filter((r) => !r.is_running).map((r) => `${isoDay(r.exam_date)}#${r.shift_id}`));
        const clash = [];
        for (const s of parsed.slotCols) {
            const sh = byNo.get(s.shift_no);
            if (sh && off.has(`${s.date}#${sh.id}`) && parsed.centres.some((c) => c.slots[`${s.date}#${s.shift_no}`])) clash.push(`${s.date} Shift ${s.shift_no}`);
        }
        if (clash.length) warnings.push(`The exam-level schedule says "No" but some centres are YES for: ${head(clash)} (the exam-level "No" wins at run time)`);
    }

    const perSlot = parsed.slotCols.map((s) => ({
        date: s.date, shift_no: s.shift_no,
        centres: parsed.centres.filter((c) => c.slots[`${s.date}#${s.shift_no}`]).length,
    }));
    const running = perSlot.reduce((n, s) => n + s.centres, 0);
    const neverRun = parsed.centres.filter((c) => !Object.values(c.slots).some(Boolean)).map((c) => c.tc_code);
    if (neverRun.length) warnings.push(`${neverRun.length} centre(s) never run: ${head(neverRun)}`);
    const emptySlots = perSlot.filter((s) => s.centres === 0).map((s) => `${s.date} Shift ${s.shift_no}`);
    if (emptySlots.length) warnings.push(`No centre runs in: ${head(emptySlots)}`);
    const camsRunning = (key) => parsed.centres.reduce((n, c) => n + (c.slots[key] ? camByTc.get(c.tc_code) || 0 : 0), 0);
    return {
        errors, warnings,
        summary: {
            centres: parsed.centres.length, dates: dates.length, slots: parsed.slotCols.length, running_cells: running,
            not_running_cells: parsed.centres.length * parsed.slotCols.length - running,
            cameras_per_slot: Object.fromEntries(parsed.slotCols.map((s) => [`${s.date}#${s.shift_no}`, camsRunning(`${s.date}#${s.shift_no}`)])),
            per_slot: perSlot, tc_without_cameras: noCams.length, cameras_tc_not_in_sheet: unlisted.length,
        },
    };
}

exports.uploadCentreSchedule = async (req, res) => {
    try {
        if (!req.file) throw new S.ScheduleError('No file uploaded (send the Excel file in the "file" field)');
        const exam = await getExam(req.params.examId);
        const parsed = S.parseCentreSchedule(req.file.path);
        const pre = await centrePreview(exam, parsed);
        const canCommit = pre.errors.length === 0;
        if (isDryRun(req)) return res.json({ success: true, dry_run: true, can_commit: canCommit, ...pre });
        if (!canCommit) return res.status(422).json({ success: false, message: 'The sheet has errors — nothing was saved.', ...pre });

        const { byNo } = await S.resolveShiftMap(exam.id);
        const uploadId = await S.recordUpload({
            examId: exam.id, kind: 'centres', fileName: req.file.originalname, user: req.user?.username,
            centres: parsed.centres.length, slots: parsed.slotCols.length, running: pre.summary.running_cells, warnings: pre.warnings,
        });
        const who = req.user?.username || null;
        const cells = [];
        for (const c of parsed.centres) {
            for (const s of parsed.slotCols) {
                cells.push([exam.id, c.tc_code, s.date, byNo.get(s.shift_no).id, c.slots[`${s.date}#${s.shift_no}`] ? 1 : 0, 'excel', uploadId, who]);
            }
        }
        const info = parsed.centres.map((c) => [exam.id, c.tc_code, c.centre_name, c.region, c.city, c.state]);
        await sequelize.transaction(async (t) => {
            await sequelize.query('DELETE FROM exam_centre_schedule WHERE exam_id = ?', { replacements: [exam.id], transaction: t });
            await sequelize.query('DELETE FROM exam_centre_info WHERE exam_id = ?', { replacements: [exam.id], transaction: t });
            await bulkInsert(t, 'exam_centre_schedule', ['exam_id', 'tc_code', 'exam_date', 'shift_id', 'is_running', 'source', 'upload_id', 'updated_by'], cells);
            await bulkInsert(t, 'exam_centre_info', ['exam_id', 'tc_code', 'centre_name', 'region', 'city', 'state'], info);
        });
        logger.info(`[examSchedule] exam ${exam.id}: centre schedule loaded (${parsed.centres.length} centres × ${parsed.slotCols.length} slots) by ${who}`);
        return res.json({ success: true, message: `Saved the schedule of ${parsed.centres.length} centres (${pre.summary.running_cells} running cells).`, ...pre });
    } catch (e) { return fail(res, e, 'Centre schedule upload'); } finally { cleanup(req.file); }
};

/** Matrix for the UI: centres × (date, shift). */
exports.getCentreSchedule = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const { shifts } = await S.resolveShiftMap(exam.id);
        const cells = await query('SELECT tc_code, exam_date, shift_id, is_running, source FROM exam_centre_schedule WHERE exam_id = ?', [exam.id]);
        const info = await query('SELECT tc_code, centre_name, region, city, state FROM exam_centre_info WHERE exam_id = ?', [exam.id]);
        const cams = await camerasByTc(exam);
        const camBy = new Map(cams.map((r) => [S.normalizeTc(r.tc_code), Number(r.n)]));
        const infoBy = new Map(info.map((r) => [r.tc_code, r]));
        // Centres missing from exam_centre_info (or listed there without a region) take region / name /
        // city / state from their cameras, so the Region filter covers every centre.
        const camInfo = await query(
            `SELECT tc_code, ${camTable(exam) === 'camera_links_rtsp' ? 'MAX(region)' : 'NULL'} AS region, MAX(centre_name) AS centre_name,
                    MAX(city) AS city, MAX(state) AS state
               FROM ${camTable(exam)} WHERE exam_id = ? AND is_active = 1 GROUP BY tc_code`, [exam.id]);
        const camInfoBy = new Map(camInfo.map((r) => [S.normalizeTc(r.tc_code), r]));
        const slotKeys = new Map();
        const byTc = new Map();
        for (const r of cells) {
            const d = isoDay(r.exam_date);
            slotKeys.set(`${d}#${r.shift_id}`, { date: d, shift_id: r.shift_id });
            if (!byTc.has(r.tc_code)) byTc.set(r.tc_code, {});
            byTc.get(r.tc_code)[`${d}#${r.shift_id}`] = r.is_running ? (r.source === 'manual' ? 2 : 1) : (r.source === 'manual' ? -1 : 0);
        }
        const slots = [...slotKeys.values()].sort((a, b) => a.date.localeCompare(b.date) || a.shift_id - b.shift_id);
        const centres = [...byTc.keys()].sort().map((tc) => {
            const inf = infoBy.get(tc) || {};
            const ci = camInfoBy.get(S.normalizeTc(tc)) || {};
            return {
                tc_code: tc, ...inf,
                centre_name: inf.centre_name || ci.centre_name || null, region: inf.region || ci.region || null,
                city: inf.city || ci.city || null, state: inf.state || ci.state || null,
                cameras: camBy.get(tc) || 0, cells: byTc.get(tc),
            };
        });
        const totals = {};
        for (const s of slots) {
            const k = `${s.date}#${s.shift_id}`;
            const run = centres.filter((c) => c.cells[k] > 0);
            totals[k] = { centres: run.length, cameras: run.reduce((n, c) => n + c.cameras, 0) };
        }
        const [last] = await query("SELECT file_name, uploaded_by, created_at FROM exam_schedule_uploads WHERE exam_id = ? AND kind = 'centres' ORDER BY id DESC LIMIT 1", [exam.id]);
        return res.json({
            success: true, exam: { id: exam.id, name: exam.exam_name, link_type: exam.link_type },
            has_schedule: centres.length > 0, shifts: shifts.map((s) => ({ id: s.id, name: s.shift_name, start_time: s.start_time, end_time: s.end_time })),
            slots, centres, totals, cameras_not_in_schedule: [...camBy.keys()].filter((t) => !byTc.has(t)).length, last_upload: last || null,
        });
    } catch (e) { return fail(res, e, 'Loading the centre schedule'); }
};

/** PUT — one cell {tc_code,date,shift_id,is_running} or a whole slot {date,shift_id,is_running,all:true}. */
exports.setCentreCell = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const b = req.body || {};
        const date = S.toIsoDate(b.date);
        const shiftId = parseInt(b.shift_id, 10);
        if (!date) throw new S.ScheduleError('A valid "date" is required');
        if (!Number.isInteger(shiftId)) throw new S.ScheduleError('A valid "shift_id" is required');
        if (typeof b.is_running !== 'boolean') throw new S.ScheduleError('"is_running" must be true or false');
        const [shift] = await query('SELECT id FROM exam_shifts WHERE id = ? AND exam_id = ?', [shiftId, exam.id]);
        if (!shift) throw new S.ScheduleError('That shift does not belong to this exam', 404);
        const existing = await query('SELECT COUNT(*) AS n FROM exam_centre_schedule WHERE exam_id = ?', [exam.id]);
        if (!Number(existing[0].n)) throw new S.ScheduleError('Upload a centre schedule first — there is nothing to edit yet.', 409);
        const who = req.user?.username || null;
        if (b.all) {
            const r = await query(
                `UPDATE exam_centre_schedule SET is_running = ?, source = 'manual', updated_by = ?
                  WHERE exam_id = ? AND exam_date = ? AND shift_id = ?`, [b.is_running ? 1 : 0, who, exam.id, date, shiftId]);
            return res.json({ success: true, message: `Set every centre to ${b.is_running ? 'YES' : 'NO'} for ${date}.`, affected: r?.affectedRows ?? undefined });
        }
        const tc = S.normalizeTc(b.tc_code);
        if (!tc) throw new S.ScheduleError('"tc_code" is required');
        const r = await query(
            `INSERT INTO exam_centre_schedule (exam_id, tc_code, exam_date, shift_id, is_running, source, updated_by)
             VALUES (?,?,?,?,?, 'manual', ?)
             ON DUPLICATE KEY UPDATE is_running = VALUES(is_running), source = 'manual', updated_by = VALUES(updated_by)`,
            [exam.id, tc, date, shiftId, b.is_running ? 1 : 0, who]);
        logger.info(`[examSchedule] exam ${exam.id}: ${tc} ${date} shift ${shiftId} -> ${b.is_running ? 'YES' : 'NO'} by ${who}`);
        return res.json({ success: true, affected: r?.affectedRows ?? undefined });
    } catch (e) { return fail(res, e, 'Editing the centre schedule'); }
};

exports.deleteCentreSchedule = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        await query('DELETE FROM exam_centre_schedule WHERE exam_id = ?', [exam.id]);
        await query('DELETE FROM exam_centre_info WHERE exam_id = ?', [exam.id]);
        return res.json({ success: true, message: 'Centre schedule cleared — every centre runs in every shift again.' });
    } catch (e) { return fail(res, e, 'Clearing the centre schedule'); }
};

/** Quick facts for a date + shift (Schedule Analysis page): is it running, which centres, how many cameras. */
exports.getSlotSummary = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const date = S.toIsoDate(req.query.date);
        const shiftId = parseInt(req.query.shift_id, 10);
        if (!date || !Number.isInteger(shiftId)) throw new S.ScheduleError('"date" and "shift_id" are required');
        const [slotAny] = await query('SELECT COUNT(*) AS n FROM exam_slot_schedule WHERE exam_id = ?', [exam.id]);
        const [slot] = await query('SELECT is_running FROM exam_slot_schedule WHERE exam_id = ? AND exam_date = ? AND shift_id = ?', [exam.id, date, shiftId]);
        const slotRestricted = Number(slotAny.n) > 0;
        const examRuns = !slotRestricted || !!slot?.is_running;
        const [cAny] = await query('SELECT COUNT(*) AS n FROM exam_centre_schedule WHERE exam_id = ?', [exam.id]);
        const centreRestricted = Number(cAny.n) > 0;
        let centres = null; let cameras = null;
        const [tot] = await query(`SELECT ${camCountExpr(exam)} AS n FROM ${camTable(exam)} WHERE exam_id = ? AND is_active = 1`, [exam.id]);
        if (centreRestricted) {
            const [r] = await query(
                `SELECT COUNT(DISTINCT cs.tc_code) AS centres, ${camCountExpr(exam, 'c')} AS cameras
                   FROM exam_centre_schedule cs
                   LEFT JOIN ${camTable(exam)} c ON c.exam_id = cs.exam_id AND c.tc_code = cs.tc_code AND c.is_active = 1
                  WHERE cs.exam_id = ? AND cs.exam_date = ? AND cs.shift_id = ? AND cs.is_running = 1`, [exam.id, date, shiftId]);
            centres = Number(r.centres); cameras = Number(r.cameras);
        }
        return res.json({
            success: true, restricted: slotRestricted || centreRestricted, exam_runs: examRuns,
            running_centres: examRuns ? centres : 0, running_cameras: examRuns ? (centreRestricted ? cameras : Number(tot.n)) : 0, total_cameras: Number(tot.n),
        });
    } catch (e) { return fail(res, e, 'Loading the slot summary'); }
};

// ── Excel out: template + export ────────────────────────────────────────────
const headerLabel = (iso, no) => { const [y, m, d] = iso.split('-'); return `${+d}-${+m}-${y.slice(2)} Shift ${no}`; };
function sendWorkbook(res, aoa, sheetName, fileName, widths) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buf);
}

exports.centreTemplate = async (req, res) => sendWorkbook(res, [
    ['#', 'REGION', 'TC CODE', 'CENTRE NAME', 'ACTUAL CITY', 'ACTUAL STATE', 'Part of CCTV Analytics', '30-9-26 Shift 1', '30-9-26 Shift 2', '1-10-26 Shift 1', '1-10-26 Shift 2'],
    [1, 'CR', '50106', 'EXAMPLE CENTRE ONE', 'BHAGALPUR', 'BIHAR', 'Yes', 'NO', 'YES', 'YES', 'YES'],
    [2, 'NR', '50204', 'EXAMPLE CENTRE TWO', 'CHHAPRA', 'BIHAR', 'Yes', 'NO', 'NO', 'YES', 'NO'],
], 'Centre schedule', 'centre_schedule_template.xlsx', [5, 8, 12, 34, 16, 16, 12, 16, 16, 16, 16]);

exports.slotTemplate = async (req, res) => sendWorkbook(res, [
    ['Exam Schedule'],
    ['Sr.No.', 'Date', 'Shift 1 (10:00:00 to 11:00:00)', 'Shift 2 (13:30:00 to 14:30:00)', 'Shift 3 (17:00:00 to 18:00:00)'],
    [1, '30-Sep-26', 'No', 'Yes', 'Yes'],
    [2, '1-Oct-26', 'Yes', 'Yes', 'Yes'],
], 'Exam Schedule', 'exam_schedule_template.xlsx', [8, 14, 30, 30, 30]);

exports.exportCentreSchedule = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const { shifts } = await S.resolveShiftMap(exam.id);
        const noById = new Map();
        shifts.forEach((s, i) => { const m = String(s.shift_name || '').match(/(\d+)/); noById.set(s.id, m ? +m[1] : i + 1); });
        const cells = await query('SELECT tc_code, exam_date, shift_id, is_running FROM exam_centre_schedule WHERE exam_id = ?', [exam.id]);
        if (!cells.length) throw new S.ScheduleError('This exam has no centre schedule to export', 404);
        const info = await query('SELECT tc_code, centre_name, region, city, state FROM exam_centre_info WHERE exam_id = ?', [exam.id]);
        const infoBy = new Map(info.map((r) => [r.tc_code, r]));
        const slots = [...new Map(cells.map((r) => [`${isoDay(r.exam_date)}#${r.shift_id}`, { date: isoDay(r.exam_date), shift_id: r.shift_id }])).values()]
            .sort((a, b) => a.date.localeCompare(b.date) || a.shift_id - b.shift_id);
        const by = new Map();
        for (const r of cells) { if (!by.has(r.tc_code)) by.set(r.tc_code, new Map()); by.get(r.tc_code).set(`${isoDay(r.exam_date)}#${r.shift_id}`, r.is_running); }
        const aoa = [['#', 'REGION', 'TC CODE', 'CENTRE NAME', 'ACTUAL CITY', 'ACTUAL STATE', 'Part of CCTV Analytics', ...slots.map((s) => headerLabel(s.date, noById.get(s.shift_id) || s.shift_id))]];
        [...by.keys()].sort().forEach((tc, i) => {
            const n = infoBy.get(tc) || {};
            aoa.push([i + 1, n.region || '', tc, n.centre_name || '', n.city || '', n.state || '', 'Yes', ...slots.map((s) => (by.get(tc).get(`${s.date}#${s.shift_id}`) ? 'YES' : 'NO'))]);
        });
        return sendWorkbook(res, aoa, 'Centre schedule', `centre_schedule_exam_${exam.id}.xlsx`, [5, 8, 12, 34, 16, 16, 12]);
    } catch (e) { return fail(res, e, 'Exporting the centre schedule'); }
};

/** Used by reports / counts: exam + date + shift -> restriction facts (null = no restriction). */
exports.runningCentres = async function runningCentres(examId, date, shiftId) {
    const [cAny] = await query('SELECT COUNT(*) AS n FROM exam_centre_schedule WHERE exam_id = ?', [examId]);
    if (!Number(cAny.n)) return null;
    const rows = await query(
        'SELECT tc_code FROM exam_centre_schedule WHERE exam_id = ? AND exam_date = ? AND shift_id = ? AND is_running = 1', [examId, date, shiftId]);
    return new Set(rows.map((r) => r.tc_code));
};
