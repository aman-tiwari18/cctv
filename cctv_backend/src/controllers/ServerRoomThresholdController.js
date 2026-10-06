'use strict';
/**
 * ServerRoomThresholdController — the server-room analytic's person limit per TC code,
 * uploaded per exam (HLS and RTSP) instead of living in worker/.../server_room_constants.py.
 * Docs: docs/EXAM_SCHEDULE_AND_THRESHOLDS.md
 *
 * A row means: raise a server-room detection when person_count > max_persons.
 *   exam_date NULL            -> every sitting of the exam   (flat sheet, e.g. CGLE)
 *   exam_date + shift_id set  -> that sitting only            (per-sitting sheet, e.g. UGC / UPCISB)
 * Lookup order on the worker: exact sitting, then the exam-wide row, then (only while the
 * exam has no uploaded sheet) the legacy constants file.
 */
const fs = require('fs');
const XLSX = require('xlsx');
const { query, sequelize } = require('../config/database');
const logger = require('../utils/logger');
const S = require('../utils/examSchedule');

const CHUNK = 1000;
const MAX_LISTED = 25;
const head = (arr) => (arr.length > MAX_LISTED ? `${arr.slice(0, MAX_LISTED).join(', ')} … (+${arr.length - MAX_LISTED} more)` : arr.join(', '));
const isoDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
const isDryRun = (req) => ['1', 'true', 'yes'].includes(String(req.query.dry_run || '').toLowerCase());
const SERVER_ROOM_LABELS = ['server room', 'strong room'];   // SCRIPT_CLASSIFICATION_MAP["server"]

function cleanup(file) {
    if (file?.path) fs.unlink(file.path, (e) => { if (e) logger.warn(`[serverRoom] temp cleanup failed: ${e.message}`); });
}

function fail(res, err, what) {
    if (err instanceof S.ScheduleError) return res.status(err.status).json({ success: false, message: err.message, ...(err.details || {}) });
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/.test(err.message || ''))) {
        return res.status(503).json({ success: false, message: 'The threshold tables are missing — run migration 044_exam_schedule_and_thresholds.sql on this database.' });
    }
    logger.error(`[serverRoom] ${what} failed: ${err && err.stack || err}`);
    return res.status(500).json({ success: false, message: `${what} failed: ${err.message}` });
}

async function getExam(examId) {
    const id = parseInt(examId, 10);
    if (!Number.isInteger(id)) throw new S.ScheduleError('Invalid exam id', 400);
    const [exam] = await query('SELECT id, exam_name, link_type FROM exams WHERE id = ? LIMIT 1', [id]);
    if (!exam) throw new S.ScheduleError('Exam not found', 404);
    return exam;
}

/** TC codes of the exam that have server-room cameras (what the analytic actually runs on). */
async function serverRoomTcCodes(exam) {
    const labels = SERVER_ROOM_LABELS.map(() => '?').join(',');
    const rtsp = String(exam.link_type).toUpperCase() === 'RTSP';
    const rows = rtsp
        ? await query(`SELECT DISTINCT tc_code FROM camera_links_rtsp WHERE exam_id = ? AND is_active = 1 AND LOWER(classification) IN (${labels})`, [exam.id, ...SERVER_ROOM_LABELS])
        : await query(
            `SELECT DISTINCT tc_code FROM camera_links_hls WHERE exam_id = ? AND is_active = 1
                AND (LOWER(classification) IN (${labels}) OR (classification IS NULL AND LOWER(camera_category) IN (${labels})))`,
            [exam.id, ...SERVER_ROOM_LABELS, ...SERVER_ROOM_LABELS]);
    return new Set(rows.map((r) => S.normalizeTc(r.tc_code)).filter(Boolean));
}

async function preview(exam, parsed) {
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];
    const { byNo } = await S.resolveShiftMap(exam.id);
    if (parsed.shape === 'sitting') {
        const missing = [...new Set(parsed.entries.map((e) => e.shift_no))].filter((n) => !byNo.has(n));
        if (missing.length) errors.push(`The exam has no shift for: ${missing.map((n) => `Shift ${n}`).join(', ')}. Add the shifts to the exam first.`);
    }
    const sheetTcs = new Set(parsed.entries.map((e) => e.tc_code));
    const cams = await serverRoomTcCodes(exam);
    let noThreshold = [];
    let noCameras = [];
    if (cams.size === 0) {
        warnings.push('This exam has no server-room cameras yet (nothing classified "Server Room"/"Strong Room"), so the TC codes could not be checked against cameras.');
    } else {
        noThreshold = [...cams].filter((t) => !sheetTcs.has(t));
        noCameras = [...sheetTcs].filter((t) => !cams.has(t));
        if (noThreshold.length) warnings.push(`${noThreshold.length} centre(s) with server-room cameras have NO threshold in the sheet — no server-room alerts there: ${head(noThreshold)}`);
        if (noCameras.length) warnings.push(`${noCameras.length} TC code(s) in the sheet have no server-room cameras: ${head(noCameras)}`);
    }
    const values = parsed.entries.map((e) => e.max_persons);
    return {
        errors, warnings,
        summary: {
            shape: parsed.shape, centres: parsed.centres, rows: parsed.entries.length,
            min: Math.min(...values), max: Math.max(...values),
            centres_with_cameras_but_no_threshold: noThreshold.length, tc_without_server_room_cameras: noCameras.length,
        },
    };
}

async function bulkInsert(t, rows) {
    const cols = ['exam_id', 'tc_code', 'exam_date', 'shift_id', 'max_persons', 'min_required', 'exam_nodes', 'additional_it', 'centre_name', 'region', 'source', 'upload_id', 'updated_by'];
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        await sequelize.query(
            `INSERT INTO server_room_thresholds (${cols.join(',')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')}`,
            { replacements: chunk.flat(), transaction: t }
        );
    }
}

exports.upload = async (req, res) => {
    try {
        if (!req.file) throw new S.ScheduleError('No file uploaded (send the Excel file in the "file" field)');
        const exam = await getExam(req.params.examId);
        const parsed = S.parseThresholds(req.file.path);
        const pre = await preview(exam, parsed);
        const canCommit = pre.errors.length === 0;
        if (isDryRun(req)) return res.json({ success: true, dry_run: true, can_commit: canCommit, ...pre });
        if (!canCommit) return res.status(422).json({ success: false, message: 'The sheet has errors — nothing was saved.', ...pre });

        const { byNo } = await S.resolveShiftMap(exam.id);
        const who = req.user?.username || null;
        const uploadId = await S.recordUpload({
            examId: exam.id, kind: 'thresholds', fileName: req.file.originalname, user: who,
            centres: parsed.centres, slots: parsed.entries.length, warnings: pre.warnings,
        });
        const rows = parsed.entries.map((e) => [
            exam.id, e.tc_code, e.exam_date, e.shift_no != null ? byNo.get(e.shift_no).id : null, e.max_persons,
            e.min_required, e.exam_nodes != null ? Math.round(e.exam_nodes) : null, e.additional_it, e.centre_name, e.region, 'excel', uploadId, who,
        ]);
        await sequelize.transaction(async (t) => {
            await sequelize.query('DELETE FROM server_room_thresholds WHERE exam_id = ?', { replacements: [exam.id], transaction: t });
            await bulkInsert(t, rows);
        });
        logger.info(`[serverRoom] exam ${exam.id}: ${rows.length} thresholds (${parsed.shape}) loaded by ${who}`);
        return res.json({ success: true, message: `Saved ${rows.length} threshold(s) for ${parsed.centres} centre(s).`, ...pre });
    } catch (e) { return fail(res, e, 'Threshold upload'); } finally { cleanup(req.file); }
};

exports.list = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const search = String(req.query.search || '').trim();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const where = ['exam_id = ?'];
        const params = [exam.id];
        if (search) { where.push('(tc_code LIKE ? OR centre_name LIKE ? OR region LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
        const rows = await query(
            `SELECT id, tc_code, exam_date, shift_id, max_persons, min_required, exam_nodes, additional_it, centre_name, region, source, updated_by, updated_at
               FROM server_room_thresholds WHERE ${where.join(' AND ')} ORDER BY tc_code, exam_date, shift_id LIMIT ${limit} OFFSET ${offset}`, params);
        const [tot] = await query(`SELECT COUNT(*) AS n, COUNT(DISTINCT tc_code) AS centres, SUM(exam_date IS NOT NULL) AS sitting FROM server_room_thresholds WHERE ${where.join(' AND ')}`, params);
        const [all] = await query('SELECT COUNT(*) AS n, COUNT(DISTINCT tc_code) AS centres, SUM(exam_date IS NOT NULL) AS sitting FROM server_room_thresholds WHERE exam_id = ?', [exam.id]);
        const [last] = await query("SELECT file_name, uploaded_by, created_at FROM exam_schedule_uploads WHERE exam_id = ? AND kind = 'thresholds' ORDER BY id DESC LIMIT 1", [exam.id]);
        let missing = [];
        if (Number(all.n)) {
            const have = new Set((await query('SELECT DISTINCT tc_code FROM server_room_thresholds WHERE exam_id = ?', [exam.id])).map((r) => r.tc_code));
            missing = [...(await serverRoomTcCodes(exam))].filter((t) => !have.has(t)).sort();
        }
        const { shifts } = await S.resolveShiftMap(exam.id);
        return res.json({
            success: true, has_thresholds: Number(all.n) > 0, shape: !Number(all.n) ? null : Number(all.sitting) ? (Number(all.sitting) === Number(all.n) ? 'sitting' : 'mixed') : 'flat',
            total: Number(tot.n), centres: Number(all.centres), shifts: shifts.map((s) => ({ id: s.id, name: s.shift_name })),
            centres_without_threshold: missing, last_upload: last || null,
            data: rows.map((r) => ({ ...r, exam_date: r.exam_date ? isoDay(r.exam_date) : null, max_persons: Number(r.max_persons) })),
        });
    } catch (e) { return fail(res, e, 'Loading the thresholds'); }
};

/** PUT — upsert one row (manual edit): { tc_code, max_persons, exam_date?, shift_id? } */
exports.upsert = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const b = req.body || {};
        const tc = S.normalizeTc(b.tc_code);
        if (!tc) throw new S.ScheduleError('"tc_code" is required');
        const max = S.wholeLimit(Number(b.max_persons));
        if (!Number.isFinite(max) || max <= 0 || max > 10000) throw new S.ScheduleError('"max_persons" must be a whole number of at least 1');
        let date = null; let shiftId = null;
        if (b.exam_date) {
            date = S.toIsoDate(b.exam_date);
            shiftId = parseInt(b.shift_id, 10);
            if (!date || !Number.isInteger(shiftId)) throw new S.ScheduleError('A per-sitting row needs a valid "exam_date" and "shift_id"');
            const [sh] = await query('SELECT id FROM exam_shifts WHERE id = ? AND exam_id = ?', [shiftId, exam.id]);
            if (!sh) throw new S.ScheduleError('That shift does not belong to this exam', 404);
        }
        const who = req.user?.username || null;
        await query(
            `INSERT INTO server_room_thresholds (exam_id, tc_code, exam_date, shift_id, max_persons, centre_name, region, source, updated_by)
             VALUES (?,?,?,?,?,?,?, 'manual', ?)
             ON DUPLICATE KEY UPDATE max_persons = VALUES(max_persons), source = 'manual', updated_by = VALUES(updated_by)`,
            [exam.id, tc, date, shiftId, max, b.centre_name || null, b.region || null, who]);
        logger.info(`[serverRoom] exam ${exam.id}: ${tc}${date ? ` ${date}#${shiftId}` : ''} -> ${max} by ${who}`);
        return res.json({ success: true, message: `Threshold for ${tc} set to ${max}.` });
    } catch (e) { return fail(res, e, 'Saving the threshold'); }
};

exports.removeOne = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const r = await query('DELETE FROM server_room_thresholds WHERE exam_id = ? AND id = ?', [exam.id, parseInt(req.params.id, 10)]);
        return (r?.affectedRows ?? 1) ? res.json({ success: true }) : res.status(404).json({ success: false, message: 'Threshold not found' });
    } catch (e) { return fail(res, e, 'Deleting the threshold'); }
};

exports.removeAll = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        await query('DELETE FROM server_room_thresholds WHERE exam_id = ?', [exam.id]);
        return res.json({ success: true, message: 'Thresholds cleared. Until a new sheet is uploaded the legacy constants (if any) apply to this exam.' });
    } catch (e) { return fail(res, e, 'Clearing the thresholds'); }
};

function send(res, aoa, sheet, file, widths) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    return res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

exports.template = async (req, res) => send(res, [
    ['TC CODE', 'CENTRE NAME', 'REGION', 'Exam Nodes', 'Minimum Required', 'Additional IT Manager', 'Maximum Server Room Threshold'],
    ['50106', 'EXAMPLE CENTRE ONE', 'CR', 1052, 4, 7.0133, 11.0133],
    ['50204', 'EXAMPLE CENTRE TWO', 'CR', 562, 4, 3.7467, 7.7467],
], 'Server room threshold', 'server_room_threshold_template.xlsx', [12, 36, 8, 12, 16, 22, 30]);

exports.exportAll = async (req, res) => {
    try {
        const exam = await getExam(req.params.examId);
        const rows = await query('SELECT tc_code, exam_date, shift_id, max_persons, min_required, exam_nodes, additional_it, centre_name, region FROM server_room_thresholds WHERE exam_id = ? ORDER BY tc_code, exam_date, shift_id', [exam.id]);
        if (!rows.length) throw new S.ScheduleError('This exam has no thresholds to export', 404);
        if (!rows.some((r) => r.exam_date)) {
            const aoa = [['TC CODE', 'CENTRE NAME', 'REGION', 'Exam Nodes', 'Minimum Required', 'Additional IT Manager', 'Maximum Server Room Threshold']];
            for (const r of rows) aoa.push([r.tc_code, r.centre_name || '', r.region || '', r.exam_nodes, r.min_required != null ? Number(r.min_required) : null, r.additional_it != null ? Number(r.additional_it) : null, Number(r.max_persons)]);
            return send(res, aoa, 'Server room threshold', `server_room_thresholds_exam_${exam.id}.xlsx`, [12, 36, 8, 12, 16, 22, 30]);
        }
        const { shifts } = await S.resolveShiftMap(exam.id);
        const noById = new Map();
        shifts.forEach((s, i) => { const m = String(s.shift_name || '').match(/(\d+)/); noById.set(s.id, m ? +m[1] : i + 1); });
        const slots = [...new Map(rows.filter((r) => r.exam_date).map((r) => [`${isoDay(r.exam_date)}#${r.shift_id}`, { date: isoDay(r.exam_date), shift_id: r.shift_id }])).values()]
            .sort((a, b) => a.date.localeCompare(b.date) || a.shift_id - b.shift_id);
        const label = (s) => { const [y, m, d] = s.date.split('-'); return `${+d}-${+m}-${y.slice(2)} Shift ${noById.get(s.shift_id) || s.shift_id}`; };
        const byTc = new Map();
        for (const r of rows) {
            if (!byTc.has(r.tc_code)) byTc.set(r.tc_code, { centre: r.centre_name, region: r.region, vals: new Map() });
            if (r.exam_date) byTc.get(r.tc_code).vals.set(`${isoDay(r.exam_date)}#${r.shift_id}`, Number(r.max_persons));
        }
        const aoa = [['TC CODE', 'CENTRE NAME', 'REGION', ...slots.map(label)]];
        for (const [tc, v] of [...byTc.entries()].sort()) aoa.push([tc, v.centre || '', v.region || '', ...slots.map((s) => v.vals.get(`${s.date}#${s.shift_id}`) ?? 0)]);
        return send(res, aoa, 'Server room threshold', `server_room_thresholds_exam_${exam.id}.xlsx`, [12, 36, 8]);
    } catch (e) { return fail(res, e, 'Exporting the thresholds'); }
};
