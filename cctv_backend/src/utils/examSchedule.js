'use strict';
/**
 * examSchedule.js — Excel parsers + shared helpers for the per-exam schedules and the
 * server-room thresholds (migration 044). See docs/EXAM_SCHEDULE_AND_THRESHOLDS.md.
 *
 * Parsers never throw on bad DATA: they return { …, errors:[], warnings:[] } so the
 * upload preview can show every problem at once. They throw ScheduleError only when the
 * file is unusable as a whole (unreadable, wrong sheet shape).
 */
const XLSX = require('xlsx');
const { query } = require('../config/database');

class ScheduleError extends Error {
    constructor(message, status = 400, details) {
        super(message);
        this.name = 'ScheduleError';
        this.status = status;
        this.details = details;
    }
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

/** "5-10-26", "05/10/2026", "5-Oct-26", "2026-10-05", Excel serial, Date -> "YYYY-MM-DD" or null. */
function toIsoDate(v) {
    if (v == null || v === '') return null;
    const ok = (y, m, d) => {
        if (y < 100) y += 2000;
        const dt = new Date(Date.UTC(y, m - 1, d));
        return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
    };
    if (typeof v === 'number' && Number.isFinite(v)) {
        const p = XLSX.SSF.parse_date_code(v);
        return p ? ok(p.y, p.m, p.d) : null;
    }
    if (v instanceof Date) return ok(v.getFullYear(), v.getMonth() + 1, v.getDate());
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return ok(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
    if (m) return ok(+m[3], +m[2], +m[1]);
    m = s.match(/^(\d{1,2})[-/.\s]([A-Za-z]{3,9})[-/.\s,]*(\d{2,4})$/);
    if (m) {
        const mo = MONTHS[m[2].toLowerCase()] || MONTHS[m[2].toLowerCase().slice(0, 3)];
        if (mo) return ok(+m[3], mo, +m[1]);
    }
    return null;
}

/** TC code as the text stored on camera rows: trim, drop Excel's ".0". */
function normalizeTc(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v).replace(/\.0+$/, '');
    return String(v).trim().replace(/\.0+$/, '');
}

/** YES/NO style cell -> true / false / null (null = not understood). */
function toYesNo(v) {
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    const s = String(v == null ? '' : v).trim().toUpperCase();
    if (['YES', 'Y', 'TRUE', '1', 'RUN', 'RUNNING'].includes(s)) return true;
    if (['NO', 'N', 'FALSE', '0', '-', 'NOT RUNNING'].includes(s)) return false;
    return null;
}

function readSheet(filePath) {
    let wb;
    try {
        wb = XLSX.readFile(filePath, { cellDates: false });
    } catch (e) {
        throw new ScheduleError(`The file could not be read as an Excel workbook (${e.message})`);
    }
    const name = wb.SheetNames[0];
    if (!name) throw new ScheduleError('The workbook has no sheets');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    if (!rows.length) throw new ScheduleError('The first sheet is empty');
    return { rows, sheet: name };
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SLOT_HEADER = /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/.\s][A-Za-z]{3,9}[-/.\s,]*\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\s*[,-]?\s*shift\s*(\d+)/i;

function findHeaderRow(rows, test) {
    for (let i = 0; i < Math.min(rows.length, 12); i++) if (test((rows[i] || []).map(norm))) return i;
    return -1;
}

/**
 * Centre-wise schedule: one row per centre (TC CODE), one column per "<date> Shift <n>"
 * holding YES / NO. Other columns are descriptive only.
 */
function parseCentreSchedule(filePath) {
    const { rows } = readSheet(filePath);
    const hi = findHeaderRow(rows, (h) => h.includes('tc code'));
    if (hi < 0) throw new ScheduleError('No "TC CODE" column found. The first sheet needs a TC CODE column and one column per date + shift (e.g. "30-9-26 Shift 1").');
    const header = rows[hi];
    const hnorm = header.map(norm);
    const col = (...names) => { for (const n of names) { const i = hnorm.indexOf(n); if (i >= 0) return i; } return -1; };
    const c = {
        tc: col('tc code'), name: col('centre name', 'center name'), region: col('region'),
        city: col('actual city', 'city'), state: col('actual state', 'state'), part: col('part of cctv analytics'),
    };

    const errors = [];
    const warnings = [];
    const slotCols = [];
    header.forEach((h, i) => {
        if (h == null) return;
        const m = String(h).match(SLOT_HEADER);
        if (!m) return;
        const date = toIsoDate(m[1]);
        if (!date) { errors.push(`Column ${i + 1}: "${String(h).trim()}" has an unreadable date`); return; }
        slotCols.push({ i, date, shift_no: parseInt(m[2], 10), label: String(h).trim() });
    });
    if (!slotCols.length) throw new ScheduleError('No date + shift columns found. Headers must look like "30-9-26 Shift 1".');
    const seen = new Map();
    for (const s of slotCols) {
        const k = `${s.date}#${s.shift_no}`;
        if (seen.has(k)) errors.push(`Columns "${seen.get(k)}" and "${s.label}" are the same date and shift`);
        else seen.set(k, s.label);
    }

    const centres = [];
    const tcSeen = new Set();
    for (let r = hi + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const tc = normalizeTc(row[c.tc]);
        if (!tc) {
            if (row.some((v) => v != null && String(v).trim() !== '')) warnings.push(`Row ${r + 1}: no TC code — skipped`);
            continue;
        }
        if (tcSeen.has(tc)) { errors.push(`Row ${r + 1}: TC code ${tc} appears more than once`); continue; }
        tcSeen.add(tc);
        const slots = {};
        for (const s of slotCols) {
            const raw = row[s.i];
            const yn = toYesNo(raw);
            if (yn == null) {
                if (raw != null && String(raw).trim() !== '') errors.push(`Row ${r + 1} (${tc}), ${s.label}: "${raw}" is not YES or NO`);
                else warnings.push(`Row ${r + 1} (${tc}), ${s.label}: empty — treated as NO`);
                slots[`${s.date}#${s.shift_no}`] = false;
            } else slots[`${s.date}#${s.shift_no}`] = yn;
        }
        const val = (i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : null);
        const part = c.part >= 0 ? toYesNo(row[c.part]) : null;
        centres.push({
            tc_code: tc, centre_name: val(c.name), region: val(c.region), city: val(c.city), state: val(c.state),
            part_of_analytics: part, slots,
        });
        if (part === false) warnings.push(`${tc}: "Part of CCTV Analytics" is No`);
    }
    if (!centres.length) throw new ScheduleError('No centre rows found under the header');
    return { centres, slotCols, errors, warnings };
}

/**
 * Exam-level schedule: a Date column and one column per shift ("Shift 1 (10:00:00 to 11:00:00)")
 * holding Yes / No — does the exam run in that slot at all.
 */
function parseSlotSchedule(filePath) {
    const { rows } = readSheet(filePath);
    const hi = findHeaderRow(rows, (h) => h.includes('date') && h.some((x) => x.startsWith('shift')));
    if (hi < 0) throw new ScheduleError('No header with a "Date" column and "Shift n" columns found.');
    const header = rows[hi];
    const dateCol = header.findIndex((h) => norm(h) === 'date');
    const errors = [];
    const warnings = [];
    const shifts = [];
    header.forEach((h, i) => {
        const m = String(h == null ? '' : h).match(/shift\s*(\d+)\s*(?:\(\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:to|-)\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*\))?/i);
        if (!m) return;
        shifts.push({
            col: i, shift_no: parseInt(m[1], 10),
            start_time: m[2] ? `${pad(+m[2])}:${m[3]}` : null,
            end_time: m[4] ? `${pad(+m[4])}:${m[5]}` : null,
        });
    });
    if (!shifts.length) throw new ScheduleError('No "Shift n" columns found.');
    if (shifts.some((s) => s.start_time && +s.start_time.slice(0, 2) < 6)) {
        warnings.push('Some shift times are before 06:00 and have no AM/PM (e.g. 01:30). Check them — they may mean the afternoon (13:30).');
    }
    const slots = [];
    const dates = [];
    const seen = new Set();
    for (let r = hi + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const raw = row[dateCol];
        if (raw == null || String(raw).trim() === '') continue;
        const date = toIsoDate(raw);
        if (!date) { errors.push(`Row ${r + 1}: "${raw}" is not a readable date`); continue; }
        if (seen.has(date)) { errors.push(`Row ${r + 1}: date ${date} appears more than once`); continue; }
        seen.add(date); dates.push(date);
        for (const s of shifts) {
            const yn = toYesNo(row[s.col]);
            if (yn == null) {
                errors.push(`Row ${r + 1} (${date}), Shift ${s.shift_no}: "${row[s.col] ?? ''}" is not Yes or No`);
                continue;
            }
            slots.push({ date, shift_no: s.shift_no, is_running: yn });
        }
    }
    if (!slots.length) throw new ScheduleError('No date rows found under the header');
    dates.sort();
    return { slots, dates, shifts: shifts.map(({ col, ...s }) => s), errors, warnings };
}

const num = (v) => {
    if (v == null || String(v).trim() === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
};

// Server-room limits are whole people, rounded to the nearest the way Excel shows them:
// the CGLE sheet's limit is a formula (=E+F, format "0"), 7.7467 is displayed and meant as 8.
const wholeLimit = (v) => Math.round(v);

/**
 * Server-room thresholds. Two shapes:
 *   flat        — "Maximum Server Room Threshold" column, one limit per centre (CGLE sheet)
 *   per sitting — "<date> Shift <n>" columns holding the limit; 0 = not scheduled (UGC / UPCISB)
 */
function parseThresholds(filePath) {
    const { rows } = readSheet(filePath);
    const hi = findHeaderRow(rows, (h) => h.includes('tc code'));
    if (hi < 0) throw new ScheduleError('No "TC CODE" column found.');
    const header = rows[hi];
    const hnorm = header.map(norm);
    const col = (pred) => hnorm.findIndex(pred);
    const c = {
        tc: col((h) => h === 'tc code'),
        name: col((h) => h === 'centre name' || h === 'center name'),
        region: col((h) => h === 'region'),
        nodes: col((h) => h === 'exam nodes' || h === 'exam node'),
        min: col((h) => h.startsWith('minimum required')),
        it: col((h) => h.startsWith('additional it')),
        max: col((h) => h.startsWith('maximum server room') || h === 'maximum' || h === 'threshold' || h === 'max threshold'),
    };
    const slotCols = [];
    header.forEach((h, i) => {
        const m = String(h == null ? '' : h).match(SLOT_HEADER);
        const date = m && toIsoDate(m[1]);
        if (date) slotCols.push({ i, date, shift_no: parseInt(m[2], 10), label: String(h).trim() });
    });
    const shape = c.max >= 0 ? 'flat' : slotCols.length ? 'sitting' : null;
    if (!shape) throw new ScheduleError('Neither a "Maximum Server Room Threshold" column nor date + shift columns were found.');

    const errors = [];
    const warnings = [];
    const entries = [];
    const tcSeen = new Set();
    for (let r = hi + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const tc = normalizeTc(row[c.tc]);
        if (!tc) {
            if (row.some((v) => v != null && String(v).trim() !== '')) warnings.push(`Row ${r + 1}: no TC code — skipped`);
            continue;
        }
        if (tcSeen.has(tc)) { errors.push(`Row ${r + 1}: TC code ${tc} appears more than once`); continue; }
        tcSeen.add(tc);
        const base = {
            tc_code: tc,
            centre_name: c.name >= 0 && row[c.name] != null ? String(row[c.name]).trim() : null,
            region: c.region >= 0 && row[c.region] != null ? String(row[c.region]).trim() : null,
            exam_nodes: c.nodes >= 0 ? num(row[c.nodes]) : null,
            min_required: c.min >= 0 ? num(row[c.min]) : null,
            additional_it: c.it >= 0 ? num(row[c.it]) : null,
        };
        for (const k of ['exam_nodes', 'min_required', 'additional_it']) {
            if (Number.isNaN(base[k])) { warnings.push(`Row ${r + 1} (${tc}): ${k} is not a number — ignored`); base[k] = null; }
        }
        if (shape === 'flat') {
            const raw = num(row[c.max]);
            if (raw == null) { errors.push(`Row ${r + 1} (${tc}): Maximum Server Room Threshold is empty`); continue; }
            if (Number.isNaN(raw) || raw < 0) { errors.push(`Row ${r + 1} (${tc}): "${row[c.max]}" is not a valid threshold`); continue; }
            const v = wholeLimit(raw);
            if (v === 0) { warnings.push(`Row ${r + 1} (${tc}): threshold is 0 — skipped (0 means not scheduled)`); continue; }
            entries.push({ ...base, exam_date: null, shift_no: null, max_persons: v });
        } else {
            for (const s of slotCols) {
                const raw = num(row[s.i]);
                if (raw == null || raw === 0) continue;                   // 0 / empty = not scheduled
                if (Number.isNaN(raw) || raw < 0) { errors.push(`Row ${r + 1} (${tc}), ${s.label}: "${row[s.i]}" is not a valid threshold`); continue; }
                const v = wholeLimit(raw);
                if (v === 0) continue;
                entries.push({ ...base, exam_date: s.date, shift_no: s.shift_no, max_persons: v });
            }
        }
    }
    if (!entries.length) throw new ScheduleError('No usable threshold rows found');
    return { shape, entries, errors, warnings, centres: tcSeen.size };
}

/**
 * Exam shifts as {no -> {id, name}}. "Shift 3" in a sheet maps to the exam's shift named
 * with that number, else to its n-th shift by start time.
 */
async function resolveShiftMap(examId) {
    const rows = await query(
        'SELECT id, shift_name, start_time, end_time FROM exam_shifts WHERE exam_id = ? AND is_active = 1 ORDER BY start_time, id',
        [examId]
    );
    const byNo = new Map();
    const unnamed = [];
    for (const r of rows) {
        const m = String(r.shift_name || '').match(/(\d+)/);
        if (m && !byNo.has(+m[1])) byNo.set(+m[1], r);
        else unnamed.push(r);
    }
    rows.forEach((r, idx) => { if (!byNo.has(idx + 1) && unnamed.includes(r)) byNo.set(idx + 1, r); });
    return { byNo, shifts: rows };
}

/** Standard upload-result shape + audit row. */
async function recordUpload({ examId, kind, fileName, user, centres, slots, running, warnings }) {
    const r = await query(
        `INSERT INTO exam_schedule_uploads (exam_id, kind, file_name, uploaded_by, centres, slots, running, warnings)
         VALUES (?,?,?,?,?,?,?,?)`,
        [examId, kind, fileName || null, user || null, centres ?? null, slots ?? null, running ?? null, JSON.stringify((warnings || []).slice(0, 200))]
    );
    return typeof r === 'number' ? r : r?.insertId;
}

// ── enforcement: which RTSP cameras run in a date + shift ───────────────────
let _tablesOk = { at: 0, ok: false };
/** Are the schedule tables there? (cached; a missing migration must never break camera reads) */
async function scheduleTablesExist() {
    if (Date.now() - _tablesOk.at < 60000) return _tablesOk.ok;
    try {
        const r = await query("SHOW TABLES LIKE 'exam_centre_schedule'");
        const r2 = await query("SHOW TABLES LIKE 'exam_slot_schedule'");
        _tablesOk = { at: Date.now(), ok: r.length > 0 && r2.length > 0 };
    } catch { _tablesOk = { at: Date.now(), ok: false }; }
    return _tablesOk.ok;
}

/**
 * SQL fragment restricting camera_links_rtsp (alias `c`) to centres that run in date + shift.
 *   - exam has no exam-level rows  -> no restriction from that table
 *   - exam has them                -> the date + shift must be listed with is_running = 1
 *   - same logic per centre (TC code) for the centre schedule
 * (Mirrored for direct DB access in worker/scripts/detection/utils/db_client.py.)
 */
function rtspScheduleClause(alias, date, shiftId) {
    const c = alias || 'c';
    return {
        sql: ` AND (NOT EXISTS (SELECT 1 FROM exam_slot_schedule ss0 WHERE ss0.exam_id = ${c}.exam_id)
                    OR EXISTS (SELECT 1 FROM exam_slot_schedule ss WHERE ss.exam_id = ${c}.exam_id
                                AND ss.exam_date = ? AND ss.shift_id = ? AND ss.is_running = 1))
               AND (NOT EXISTS (SELECT 1 FROM exam_centre_schedule cs0 WHERE cs0.exam_id = ${c}.exam_id)
                    OR EXISTS (SELECT 1 FROM exam_centre_schedule cs WHERE cs.exam_id = ${c}.exam_id AND cs.tc_code = ${c}.tc_code
                                AND cs.exam_date = ? AND cs.shift_id = ? AND cs.is_running = 1)) `,
        params: [date, shiftId, date, shiftId],
    };
}

/**
 * What runs in one date + shift: { restricted:false } (no schedule uploaded) or
 * { restricted:true, examRuns, centres:Set|null } (centres null = every centre).
 */
async function runningScope(examId, date, shiftId) {
    if (!(await scheduleTablesExist())) return { restricted: false };
    const [slotAny] = await query('SELECT COUNT(*) AS n FROM exam_slot_schedule WHERE exam_id = ?', [examId]);
    const [cAny] = await query('SELECT COUNT(*) AS n FROM exam_centre_schedule WHERE exam_id = ?', [examId]);
    const slotRestricted = Number(slotAny.n) > 0;
    const centreRestricted = Number(cAny.n) > 0;
    if (!slotRestricted && !centreRestricted) return { restricted: false };
    let examRuns = true;
    if (slotRestricted) {
        const [r] = await query('SELECT is_running FROM exam_slot_schedule WHERE exam_id = ? AND exam_date = ? AND shift_id = ?', [examId, date, shiftId]);
        examRuns = !!(r && r.is_running);
    }
    let centres = null;
    if (examRuns && centreRestricted) {
        const rows = await query('SELECT tc_code FROM exam_centre_schedule WHERE exam_id = ? AND exam_date = ? AND shift_id = ? AND is_running = 1', [examId, date, shiftId]);
        centres = new Set(rows.map((x) => x.tc_code));
    }
    return { restricted: true, examRuns, centres };
}

/**
 * Same rule as rtspScheduleClause, with the shift taken from a SQL expression (e.g. "s.id"
 * of a joined exam_shifts row). Params: [date, date].
 */
function rtspScheduleClauseShiftExpr(alias, shiftExpr) {
    const c = alias || 'c';
    return ` (NOT EXISTS (SELECT 1 FROM exam_slot_schedule ss0 WHERE ss0.exam_id = ${c}.exam_id)
              OR EXISTS (SELECT 1 FROM exam_slot_schedule ss WHERE ss.exam_id = ${c}.exam_id
                          AND ss.exam_date = ? AND ss.shift_id = ${shiftExpr} AND ss.is_running = 1))
         AND (NOT EXISTS (SELECT 1 FROM exam_centre_schedule cs0 WHERE cs0.exam_id = ${c}.exam_id)
              OR EXISTS (SELECT 1 FROM exam_centre_schedule cs WHERE cs.exam_id = ${c}.exam_id AND cs.tc_code = ${c}.tc_code
                          AND cs.exam_date = ? AND cs.shift_id = ${shiftExpr} AND cs.is_running = 1)) `;
}

/** "RTSP camera (alias) runs on date in any (or one of shiftIds) shift" — SQL + params, or null if tables missing. */
async function rtspRunsOnDateSql(alias, date, shiftIds) {
    if (!(await scheduleTablesExist())) return null;
    const c = alias || 'c';
    const ids = Array.isArray(shiftIds) && shiftIds.length ? shiftIds : null;
    return {
        sql: ` EXISTS (SELECT 1 FROM exam_shifts s_ WHERE s_.exam_id = ${c}.exam_id AND s_.is_active = 1
                       ${ids ? 'AND s_.id IN (?)' : ''} AND ${rtspScheduleClauseShiftExpr(c, 's_.id')}) `,
        params: ids ? [ids, date, date] : [date, date],
    };
}

/** Exams (of examIds) that have an uploaded slot or centre schedule. */
async function scheduledExamIds(examIds) {
    const ids = (examIds || []).filter((x) => x != null);
    if (!ids.length || !(await scheduleTablesExist())) return new Set();
    const rows = await query(
        `SELECT DISTINCT exam_id FROM exam_centre_schedule WHERE exam_id IN (?)
         UNION SELECT DISTINCT exam_id FROM exam_slot_schedule WHERE exam_id IN (?)`, [ids, ids]);
    return new Set(rows.map((r) => Number(r.exam_id)));
}

/**
 * Camera counts for scheduled RTSP exams on one date: distinct cameras that run in at least
 * one of the exam's shifts that day (optionally only shiftIds). { total, acc } over `examIds`.
 */
async function rtspScheduledCounts(examIds, date, shiftIds) {
    if (!examIds?.length) return { total: 0, acc: 0 };
    const runs = await rtspRunsOnDateSql('c', date, shiftIds);
    if (!runs) return null;
    const [r] = await query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN LOWER(c.status) = 'accessible' THEN 1 ELSE 0 END) AS acc
           FROM camera_links_rtsp c WHERE c.exam_id IN (?) AND c.is_active = 1 AND ${runs.sql}`,
        [examIds, ...runs.params]);
    return { total: Number(r?.total || 0), acc: Number(r?.acc || 0) };
}

/** Per (exam, shift) camera counts on one date for scheduled RTSP exams: Map "examId::shiftId" -> {cameras, running}. */
async function rtspScheduledCountsPerShift(examIds, date) {
    const out = new Map();
    const sched = [...(await scheduledExamIds(examIds))];
    if (!sched.length) return out;
    const rows = await query(
        `SELECT c.exam_id, s.id AS shift_id, COUNT(*) AS cameras,
                SUM(CASE WHEN LOWER(c.status) = 'accessible' THEN 1 ELSE 0 END) AS running
           FROM camera_links_rtsp c
           JOIN exam_shifts s ON s.exam_id = c.exam_id AND s.is_active = 1
          WHERE c.exam_id IN (?) AND c.is_active = 1 AND ${rtspScheduleClauseShiftExpr('c', 's.id')}
          GROUP BY c.exam_id, s.id`, [sched, date, date]);
    // shifts with no running camera still get an explicit 0
    const shifts = await query('SELECT id, exam_id FROM exam_shifts WHERE exam_id IN (?) AND is_active = 1', [sched]);
    for (const s of shifts) out.set(`${s.exam_id}::${s.id}`, { cameras: 0, running: 0 });
    for (const r of rows) out.set(`${r.exam_id}::${r.shift_id}`, { cameras: Number(r.cameras), running: Number(r.running || 0) });
    return out;
}

/**
 * TC codes whose exam runs NOW (today; the current shift if the time is inside one, else any
 * shift today). null = the exam has no schedule (everything runs).
 */
async function scheduledTcCodesNow(examId, today, nowTime) {
    if (!(await scheduledExamIds([examId])).size) return null;
    const shifts = await query('SELECT id, start_time, end_time FROM exam_shifts WHERE exam_id = ? AND is_active = 1', [examId]);
    const cur = shifts.filter((s) => String(s.start_time) <= nowTime && nowTime <= String(s.end_time)).map((s) => s.id);
    const ids = cur.length ? cur : shifts.map((s) => s.id);
    if (!ids.length) return new Set();
    const rows = await query(
        `SELECT DISTINCT c.tc_code FROM camera_links_rtsp c
           JOIN exam_shifts s ON s.exam_id = c.exam_id AND s.id IN (?)
          WHERE c.exam_id = ? AND c.is_active = 1 AND ${rtspScheduleClauseShiftExpr('c', 's.id')}`,
        [ids, examId, today, today]);
    return new Set(rows.map((r) => String(r.tc_code)));
}

module.exports = {
    rtspScheduleClauseShiftExpr, rtspRunsOnDateSql, scheduledExamIds, rtspScheduledCounts,
    rtspScheduledCountsPerShift, scheduledTcCodesNow,
    runningScope, scheduleTablesExist, rtspScheduleClause,
    ScheduleError, toIsoDate, normalizeTc, toYesNo, parseCentreSchedule, parseSlotSchedule, parseThresholds, wholeLimit,
    resolveShiftMap, recordUpload,
};
