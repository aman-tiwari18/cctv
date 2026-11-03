/**
 * Camera Uptime — read-only views over the camera_uptime_* tables written by the independent
 * camera-uptime-service (repo root). That service checks every scheduled camera during live shift
 * hours and records whether a frame could be captured; it does no classification.
 *
 * Times in those tables are naive IST DATETIMEs, returned as formatted strings (DATE_FORMAT) so the
 * Sequelize +00:00 session never shifts them. Uptime % = up checks / (up + down checks); UNKNOWN
 * (infrastructure) checks are excluded and coverage is reported next to it.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const ExcelJS = require('exceljs');
const { query } = require('../config/database');

const FRAMES_ROOT = path.resolve(process.env.UPTIME_FRAMES_ROOT || '/data/nfs/cctv_images/uptime_frames');
const SERVICE_URL = process.env.UPTIME_SERVICE_URL || 'http://127.0.0.1:8095';

const DT = (col, alias) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s') AS ${alias}`;
const UPTIME = (up, down) => `ROUND(100 * ${up} / NULLIF(${up} + ${down}, 0), 1)`;

const isMissingTable = (e) => (e?.original?.errno || e?.parent?.errno) === 1146;

const toInt = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
};

// SUM()/ROUND() come back from mysql2 as DECIMAL strings: make them numbers (JSON and Excel cells).
const NUMERIC = ['cameras', 'checked', 'up_once', 'never_up', 'not_checked', 'uptime_pct'];
const numify = (rows) => rows.map((r) => {
    const out = { ...r };
    for (const k of NUMERIC) if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
    return out;
});

// Check reasons (camera-uptime-service uptime/outcomes.py) in words for the page and the Excel.
const REASON_LABELS = {
    ok: 'OK',
    no_frame: 'No video frame received',
    no_stream: 'No video stream (camera/channel offline)',
    ffmpeg_timeout: 'Video stream timed out',
    refused_2084: 'DVR refused the camera (code 2084)',
    no_permission: 'No permission to stream this camera',
    hls_extract_failed: 'HLS link not found on the portal',
    dvr_capacity: 'DVR busy (stream capacity)',
    dvr_unavailable: 'DVR unavailable',
    dss_timeout: 'Camview server timed out',
    dss_unreachable: 'Camview server unreachable',
    dss_error: 'Camview server error',
    token_rejected: 'Camview login token rejected',
    token_unavailable: 'Camview login token unavailable',
    media_unreachable: 'Media server unreachable',
    stream_token_rejected: 'Stream token rejected',
    tcs_blocked: 'Portal blocked the request',
    portal_timeout: 'Portal timed out',
    portal_unreachable: 'Portal unreachable',
    portal_error: 'Portal error',
};
const reasonLabel = (r) => {
    if (!r) return '';
    if (REASON_LABELS[r]) return REASON_LABELS[r];
    let m = /^startvideo_code_(\d+)$/.exec(r);
    if (m) return `Camview error code ${m[1]}`;
    m = /^(?:startvideo_|portal_)?http_(\d+)$/.exec(r);
    if (m) return `Stream request failed (HTTP ${m[1]})`;
    return r;
};

// downtime_json may come back as a JSON string or already parsed, depending on the driver.
const periodsOf = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p : [];
    } catch (_) {
        return [];
    }
};

const withDowntime = (rows) => rows.map((r) => ({
    ...r,
    downtime_periods: periodsOf(r.downtime_json).map((p) => ({ ...p, reason_label: reasonLabel(p.reason) })),
    downtime_json: undefined,
    last_reason_label: reasonLabel(r.last_reason),
    down_reason_label: reasonLabel(r.down_reason),
}));

const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

// "Shift N" by start-time order, the same positional labels the reports use.
async function shiftLabels(examId) {
    const rows = await query(
        'SELECT id FROM exam_shifts WHERE exam_id = ? AND is_active = 1 ORDER BY start_time, id', [examId]);
    const map = new Map();
    rows.forEach((r, i) => map.set(Number(r.id), `Shift ${i + 1}`));
    return map;
}

async function runsFor(examId, date, shiftId = null) {
    const params = [examId, date];
    let extra = '';
    if (shiftId) {
        extra = ' AND r.shift_id = ?';
        params.push(shiftId);
    }
    const runs = await query(
        `SELECT r.id, r.exam_id, r.shift_id, DATE_FORMAT(r.exam_date, '%Y-%m-%d') AS exam_date, r.exam_name,
                r.link_type, r.shift_name, TIME_FORMAT(r.shift_start, '%H:%i') AS shift_start,
                TIME_FORMAT(r.shift_end, '%H:%i') AS shift_end, ${DT('r.window_start', 'window_start')},
                ${DT('r.window_end', 'window_end')}, r.status, r.passes_completed, r.paused_seconds,
                ${DT('r.started_at', 'started_at')}, ${DT('r.ended_at', 'ended_at')}
           FROM camera_uptime_runs r
          WHERE r.exam_id = ? AND r.exam_date = ?${extra}
          ORDER BY r.shift_start, r.shift_id`, params);
    if (!runs.length) return [];
    const ids = runs.map((r) => r.id);
    // Live aggregates from the summary table (run counters are only refreshed once a minute).
    const agg = await query(
        `SELECT run_id, COUNT(*) AS cameras, SUM(checks_up + checks_down > 0) AS checked,
                SUM(checks_up > 0) AS up_once, SUM(checks_up = 0 AND checks_down > 0) AS never_up,
                SUM(last_result = 'NOT_CHECKED') AS not_checked, SUM(checks_total) AS checks,
                SUM(checks_up) AS up_checks, SUM(checks_down) AS down_checks,
                SUM(checks_unknown) AS unknown_checks, SUM(checks_blank > 0) AS blank_cameras,
                ROUND(100 * AVG(checks_up / NULLIF(checks_up + checks_down, 0)), 1) AS avg_uptime_pct,
                MIN(checks_up + checks_down + checks_unknown) AS full_passes,
                ${DT('MAX(last_checked_at)', 'last_check_at')}
           FROM camera_uptime_summary
          WHERE run_id IN (${ids.map(() => '?').join(',')}) AND in_roster = 1
          GROUP BY run_id`, ids);
    const byRun = new Map(agg.map((a) => [Number(a.run_id), a]));
    const labels = await shiftLabels(examId);
    return runs.map((r) => {
        const a = byRun.get(Number(r.id)) || {};
        const num = (k) => Number(a[k] || 0);
        const cameras = num('cameras');
        return {
            ...r,
            shift_label: labels.get(Number(r.shift_id)) || r.shift_name,
            cameras,
            checked: num('checked'),
            coverage_pct: cameras ? Math.round((1000 * num('checked')) / cameras) / 10 : null,
            up_once: num('up_once'),
            never_up: num('never_up'),
            not_checked: num('not_checked'),
            checks: num('checks'),
            up_checks: num('up_checks'),
            down_checks: num('down_checks'),
            unknown_checks: num('unknown_checks'),
            blank_cameras: num('blank_cameras'),
            avg_uptime_pct: a.avg_uptime_pct == null ? null : Number(a.avg_uptime_pct),
            full_passes: num('full_passes'),
            last_check_at: a.last_check_at || null,
        };
    });
}

exports.getDates = async (req, res) => {
    const examId = toInt(req.query.exam_id);
    if (!examId) return res.status(400).json({ success: false, message: 'exam_id is required' });
    try {
        const rows = await query(
            `SELECT DATE_FORMAT(exam_date, '%Y-%m-%d') AS d FROM camera_uptime_runs
              WHERE exam_id = ? GROUP BY exam_date ORDER BY exam_date DESC`, [examId]);
        return res.json({ success: true, data: rows.map((r) => r.d) });
    } catch (e) {
        if (isMissingTable(e)) return res.json({ success: true, data: [], message: 'Uptime tables not created yet' });
        throw e;
    }
};

exports.getRuns = async (req, res) => {
    const examId = toInt(req.query.exam_id);
    const date = isoDate(req.query.date);
    if (!examId || !date) return res.status(400).json({ success: false, message: 'exam_id and date (YYYY-MM-DD) are required' });
    try {
        return res.json({ success: true, data: await runsFor(examId, date) });
    } catch (e) {
        if (isMissingTable(e)) return res.json({ success: true, data: [], message: 'Uptime tables not created yet' });
        throw e;
    }
};

const CENTRES_SQL = `
  SELECT tc_code, MAX(centre_name) AS centre_name, MAX(city) AS city, MAX(state) AS state,
         COUNT(*) AS cameras, SUM(checks_up + checks_down > 0) AS checked, SUM(checks_up > 0) AS up_once,
         SUM(checks_up = 0 AND checks_down > 0) AS never_up, SUM(last_result = 'NOT_CHECKED') AS not_checked,
         ${UPTIME('SUM(checks_up)', 'SUM(checks_down)')} AS uptime_pct
    FROM camera_uptime_summary
   WHERE run_id = ? AND in_roster = 1
   GROUP BY tc_code
   ORDER BY uptime_pct IS NULL, uptime_pct, tc_code`;

exports.getCentres = async (req, res) => {
    const runId = toInt(req.query.run_id);
    if (!runId) return res.status(400).json({ success: false, message: 'run_id is required' });
    try {
        return res.json({ success: true, data: numify(await query(CENTRES_SQL, [runId])) });
    } catch (e) {
        if (isMissingTable(e)) return res.json({ success: true, data: [] });
        throw e;
    }
};

const CAMERA_COLUMNS = `
  id, camera_key, camera_row_id, camera_name, centre_name, tc_code, city, state, server, dvr_key, link_type,
  checks_total, checks_up, checks_down, checks_unknown, checks_blank,
  ${UPTIME('checks_up', 'checks_down')} AS uptime_pct,
  ${DT('first_checked_at', 'first_checked_at')}, ${DT('last_checked_at', 'last_checked_at')},
  ${DT('first_up_at', 'first_up_at')}, ${DT('last_up_at', 'last_up_at')}, ${DT('last_down_at', 'last_down_at')},
  last_result, last_reason, last_frame_path, ${DT('last_frame_at', 'last_frame_at')}, in_roster,
  outages, downtime_s, ${DT('down_since', 'down_since')}, down_reason, downtime_json`;

const STATUS_FILTERS = {
    up: "last_result = 'UP'",
    down: "last_result = 'DOWN'",
    unknown: "last_result = 'UNKNOWN'",
    not_checked: "last_result = 'NOT_CHECKED'",
    never_up: 'checks_up = 0 AND checks_down > 0',
    blank: 'checks_blank > 0',
    went_down: 'outages > 0',
    down_now: 'down_since IS NOT NULL',
};

// Sortable camera columns (?sort=&order=asc|desc); anything else falls back to centre/camera order.
const CAMERA_SORTS = {
    camera_name: 'camera_name', tc_code: 'tc_code', server: 'server', checks_total: 'checks_total',
    uptime_pct: 'uptime_pct', downtime_s: 'downtime_s', outages: 'outages', last_up_at: 'last_up_at',
    last_checked_at: 'last_checked_at', last_result: 'last_result',
};

exports.getCameras = async (req, res) => {
    const runId = toInt(req.query.run_id);
    if (!runId) return res.status(400).json({ success: false, message: 'run_id is required' });
    const limit = Math.min(Math.max(toInt(req.query.limit) || 50, 1), 500);
    const page = Math.max(toInt(req.query.page) || 1, 1);
    const where = ['run_id = ?', 'in_roster = 1'];
    const params = [runId];
    if (req.query.tc_code) {
        where.push('tc_code = ?');
        params.push(String(req.query.tc_code));
    }
    if (STATUS_FILTERS[req.query.status]) where.push(STATUS_FILTERS[req.query.status]);
    const q = String(req.query.q || '').trim();
    if (q) {
        where.push('(camera_name LIKE ? OR centre_name LIKE ? OR tc_code LIKE ? OR camera_key LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like);
    }
    const whereSql = where.join(' AND ');
    const sortCol = CAMERA_SORTS[req.query.sort] || null;
    const sortDir = String(req.query.order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    try {
        const [{ total }] = await query(`SELECT COUNT(*) AS total FROM camera_uptime_summary WHERE ${whereSql}`, params);
        const rows = await query(
            `SELECT ${CAMERA_COLUMNS} FROM camera_uptime_summary WHERE ${whereSql}
              ORDER BY ${sortCol ? `${sortCol} IS NULL, ${sortCol} ${sortDir}, ` : ''}tc_code, camera_name, camera_key
              LIMIT ? OFFSET ?`,
            [...params, limit, (page - 1) * limit]);
        return res.json({ success: true, data: withDowntime(numify(rows)), pagination: { page, limit, total: Number(total) } });
    } catch (e) {
        if (isMissingTable(e)) return res.json({ success: true, data: [], pagination: { page, limit, total: 0 } });
        throw e;
    }
};

exports.getFrame = async (req, res) => {
    const rel = String(req.query.path || '');
    const abs = path.resolve(FRAMES_ROOT, rel);
    if (!rel || !abs.startsWith(FRAMES_ROOT + path.sep) || !abs.endsWith('.jpg')) {
        return res.status(400).json({ success: false, message: 'invalid frame path' });
    }
    if (!fs.existsSync(abs)) return res.status(404).json({ success: false, message: 'frame not found' });
    // "Latest frame" files are overwritten in place every pass: never serve a cached copy.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(abs);
};

exports.getLive = async (req, res) => {
    const data = await new Promise((resolve) => {
        const r = http.get(`${SERVICE_URL}/status`, { timeout: 2000 }, (resp) => {
            let body = '';
            resp.setEncoding('utf8');
            resp.on('data', (c) => { body += c; });
            resp.on('end', () => {
                try {
                    resolve({ available: true, ...JSON.parse(body) });
                } catch (_) {
                    resolve({ available: false });
                }
            });
        });
        r.on('timeout', () => r.destroy());
        r.on('error', () => resolve({ available: false }));
    });
    if (data.available) delete data.recent; // camera keys only matter on the server
    return res.json({ success: true, data });
};

// ─── Excel ──────────────────────────────────────────────────────────────────────

function addSheet(wb, name, columns, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map(([header, key, width]) => ({ header, key, width: width || 14 }));
    rows.forEach((r) => ws.addRow(r));
    // House style of the downloaded reports: navy header, white bold text, frozen header, filters.
    const head = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    ws.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = head;
        c.alignment = { vertical: 'middle', wrapText: true };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: columns.length } };
    return ws;
}

exports.download = async (req, res) => {
    const examId = toInt(req.query.exam_id);
    const date = isoDate(req.query.date);
    const shiftId = toInt(req.query.shift_id);
    if (!examId || !date) return res.status(400).json({ success: false, message: 'exam_id and date (YYYY-MM-DD) are required' });
    let runs;
    try {
        runs = await runsFor(examId, date, shiftId);
    } catch (e) {
        if (isMissingTable(e)) runs = [];
        else throw e;
    }
    if (!runs.length) return res.status(404).json({ success: false, message: 'No uptime data for this exam and date' });

    const wb = new ExcelJS.Workbook();
    addSheet(wb, 'Summary', [
        ['Shift', 'shift', 10], ['Shift time', 'time', 13], ['Checked between', 'window', 22], ['Status', 'status', 13],
        ['Scheduled cameras', 'cameras'], ['Checked', 'checked', 11], ['Coverage %', 'coverage', 11],
        ['Up at least once', 'up_once'], ['Never up', 'never_up', 11], ['Not checked', 'not_checked', 11],
        ['Avg uptime %', 'uptime', 12], ['Checks', 'checks', 10], ['Up checks', 'up_checks', 11],
        ['Down checks', 'down_checks', 12], ['Unknown checks', 'unknown_checks'], ['Blank-frame cameras', 'blank'],
        ['Full passes', 'passes', 11],
    ], runs.map((r) => ({
        shift: r.shift_label, time: `${r.shift_start}-${r.shift_end}`,
        window: `${String(r.window_start).slice(11, 16)}-${String(r.window_end).slice(11, 16)}`,
        status: r.status, cameras: r.cameras, checked: r.checked, coverage: r.coverage_pct, up_once: r.up_once,
        never_up: r.never_up, not_checked: r.not_checked, uptime: r.avg_uptime_pct, checks: r.checks,
        up_checks: r.up_checks, down_checks: r.down_checks, unknown_checks: r.unknown_checks,
        blank: r.blank_cameras, passes: r.full_passes,
    })));

    const centreRows = [];
    const cameraRows = [];
    for (const r of runs) {
        const centres = numify(await query(CENTRES_SQL, [r.id]));
        centres.forEach((c) => centreRows.push({ shift: r.shift_label, ...c }));
        const cams = await query(
            `SELECT ${CAMERA_COLUMNS} FROM camera_uptime_summary WHERE run_id = ? AND in_roster = 1
              ORDER BY tc_code, camera_name, camera_key`, [r.id]);
        withDowntime(numify(cams)).forEach((c) => cameraRows.push({
            shift: r.shift_label,
            ...c,
            last_reason: c.last_reason_label || c.last_reason,
            downtime_min: Math.round((Number(c.downtime_s) || 0) / 60),
            down_now: c.down_since ? `since ${String(c.down_since).slice(11, 16)} (${c.down_reason_label})` : '',
            down_periods: c.downtime_periods.map((p) => `${String(p.down_at).slice(11, 16)}-${p.up_at
                ? String(p.up_at).slice(11, 16) : `${String(p.until).slice(11, 16)} (still down)`} `
                + `${Math.round(p.down_s / 60)} min: ${p.reason_label}`).join('; '),
        }));
    }
    addSheet(wb, 'Centres', [
        ['Shift', 'shift', 10], ['TC Code', 'tc_code'], ['Centre', 'centre_name', 40], ['City', 'city'],
        ['State', 'state'], ['Cameras', 'cameras', 10], ['Checked', 'checked', 10], ['Up at least once', 'up_once'],
        ['Never up', 'never_up', 10], ['Not checked', 'not_checked', 11], ['Uptime %', 'uptime_pct', 10],
    ], centreRows);
    addSheet(wb, 'Cameras', [
        ['Shift', 'shift', 10], ['TC Code', 'tc_code'], ['Centre', 'centre_name', 36], ['Camera', 'camera_name', 30],
        ['Server', 'server', 18], ['Camera key', 'camera_key', 34], ['Checks', 'checks_total', 9], ['Up', 'checks_up', 7],
        ['Down', 'checks_down', 7], ['Unknown', 'checks_unknown', 9], ['Blank frames', 'checks_blank', 11],
        ['Uptime %', 'uptime_pct', 10], ['First up', 'first_up_at', 20], ['Last up', 'last_up_at', 20],
        ['Last down', 'last_down_at', 20], ['Last result', 'last_result', 12], ['Last reason', 'last_reason', 30],
        ['Times down', 'outages', 11], ['Downtime (min)', 'downtime_min', 14], ['Down now', 'down_now', 30],
        ['Down periods (from-to, minutes, reason)', 'down_periods', 80],
    ], cameraRows);

    const suffix = shiftId ? `_${String(runs[0].shift_label).replace(/\s+/g, '')}` : '';
    const filename = `camera_uptime_exam${examId}_${date}${suffix}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    return res.send(Buffer.from(await wb.xlsx.writeBuffer()));
};
