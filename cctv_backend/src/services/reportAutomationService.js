/**
 * Report automation: at a chosen time on a chosen day, build the client-side reports assigned to
 * that time and send them as one email (To / Cc set per time). A report with nothing in it is not
 * attached; the email says "No detection in <report name>" instead.
 *
 * Every report matches what a client downloads from the portal:
 *   activation          Cameras > Download > Accessible
 *   offline             Cameras > Download > Not Accessible
 *   camera_detail       Cameras > Download > Total
 *   intruder            Detections > Export detections, Intruder selected
 *   wrongly_positioned  Detections > Export detections, Camera Inversion selected
 *   violations          Detections > Consolidated Report
 *
 * A report that cannot be built fails the whole email (with retries). It is never reported as
 * "no detection", because that would tell the client something false.
 * report_date is the day the reports cover. send_date + send_time is when the email goes out.
 * Camera status always belongs to the report day and shift, never to the moment of sending:
 *   RTSP has one row per camera, so its saved status describes the latest run of any day. Status comes
 *   from the newest classification run of that day and shift. With no such run, it is not available.
 *   HLS has one row per camera, shift and day, so the saved status already is that day's result
 *   (classification history is not reliable for HLS: it can be empty).
 * All times are IST, whatever the server's time zone is.
 */

'use strict';

const XLSX = require('xlsx');
const axios = require('axios');
const cron = require('node-cron');
const { QueryTypes } = require('sequelize');
const { sequelize, query } = require('../config/database');
const emailService = require('./emailService');
const CameraController = require('../controllers/CameraController');
const { buildClientReport } = require('../controllers/ReportController');
const logger = require('../utils/logger');

const REPORT_TYPES = {
    activation: { label: 'Activation Report', kind: 'camera', status: 'accessible' },
    offline: { label: 'Offline / In-accessible Camera Report', kind: 'camera', status: 'notAccessible' },
    camera_detail: { label: 'Camera Detail Report', kind: 'camera', status: 'total' },
    intruder: { label: 'Intruder Report', kind: 'detection', detectionType: 'intruder', detectionLabel: 'Intruder' },
    wrongly_positioned: { label: 'Wrongly Positioned Cameras Report', kind: 'detection', detectionType: 'inversion', detectionLabel: 'Camera Inversion' },
    violations: { label: 'Violations Report', kind: 'violations' },
};

const MAX_ATTEMPTS = 3;
const RETRY_MINUTES = 2;
const MISSED_AFTER_MINUTES = 30;     // server was down at the send time: older than this is not sent late
const STALE_SENDING_MINUTES = 20;    // process died while sending
// Resend allows 40 MB per email after base64 encoding, which is about 29 MB of files.
const MAX_ATTACHMENT_BYTES = 28 * 1024 * 1024;

const PUBLIC_BASE_URL = () => (process.env.REPORT_PUBLIC_BASE_URL || 'http://www.examscctvmonitoring.com').replace(/\/$/, '');
const SCRIPT_SERVER_URL = () => (process.env.SCRIPT_SERVER_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const SIGNATURE = () => process.env.REPORT_EMAIL_SIGNATURE || 'CDIS, IIT Kanpur';

/** Instant of a send time: "2026-11-05" + "06:00" in IST. */
const slotTimeMs = (date, time) => Date.parse(`${date}T${String(time).slice(0, 5)}:00+05:30`);
const ddmmyyyy = (iso) => iso.split('-').reverse().join('-');
const istDay = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(value));
const toRoman = (n) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n] || String(n + 1);
const safeFilename = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
const workbookBuffer = (ws, sheetName) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
};

// ─── Camera reports (same sheet as ClientCameras.jsx downloadStatusSheet) ─────

/** Call a CameraController handler in-process and return its JSON body. */
async function callCameraController(handler, params, reqQuery) {
    let status = 200;
    let payload = null;
    const res = {
        status(code) { status = code; return this; },
        json(body) { payload = body; return this; },
    };
    await handler({ params, query: reqQuery }, res);
    if (status !== 200 || !payload || !payload.success) {
        throw new Error(`Camera data request failed (HTTP ${status})`);
    }
    return JSON.parse(JSON.stringify(payload));
}

/**
 * The classification run that decides RTSP camera status: the newest run of that day and shift.
 * All shifts: the newest run of that day. Null if none ran. Another shift's run is never used.
 */
function pickRun(runs, date, shiftId) {
    const ofDay = runs.filter((r) => istDay(r.started_at) === date);
    const matching = shiftId ? ofDay.filter((r) => Number(r.shift_id) === Number(shiftId)) : ofDay;
    return matching[0] || null;    // runs are newest first
}

/**
 * Camera list for this date and shift, from GET /exams/:id/cameras.
 * getRuns is only called for an RTSP exam. Returns { payload, noRun }.
 */
async function fetchCameras(examId, date, shiftId, getRuns, isHls) {
    const reqQuery = { is_active: true, page: 1, limit: 1000000, exam_date: date };
    if (shiftId) reqQuery.shift_id = shiftId;
    let noRun = false;
    if (!isHls) {
        const run = pickRun(await getRuns(), date, shiftId);
        if (run) {
            reqQuery.run_start = run.started_at;
            reqQuery.run_end = run.ended_at;
            if (run.shift_id != null) reqQuery.run_shift_id = run.shift_id;
        } else {
            reqQuery.raw = '1';      // no status from another day
            noRun = true;
        }
    }
    const payload = await callCameraController(CameraController.getByExam, { examId: String(examId) }, reqQuery);
    return { payload, noRun };
}

function frameUrl(framePath) {
    const marker = 'classification_frames/';
    const idx = String(framePath || '').indexOf(marker);
    if (idx === -1) return '';
    return `${PUBLIC_BASE_URL()}/cctv_dev/serve-rtsp-detection-images/${framePath.slice(idx)}`;
}

function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function cameraSheet(rows, isHls, statusKey, allShifts) {
    // Not Accessible cameras have no classification and no frame.
    const drop = statusKey === 'notAccessible';
    let sheetRows, viewCol, cols;
    if (isHls) {
        sheetRows = rows.map((cam) => ({
            'Centre Name': cam.centre_name || '-',
            'TC Code': cam.tc_code || '-',
            'State': cam.state || '-',
            'Camera Name': cam.camera_name || '-',
            'Ch Code': cam.ch_code || '-',
            'Camera Category': cam.camera_category || 'N/A',
            ...(drop ? {} : { 'Classification': cam.classification || '-' }),
            'Status': cam.status || '-',
            'Exam Date': formatDate(cam.exam_date) || '-',
            'Shift': cam.shift_id
                ? (allShifts.find((s) => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`)
                : 'All shifts',
            ...(drop ? {} : { 'View': frameUrl(cam.frame_path) }),
        }));
        viewCol = drop ? -1 : 10;
        cols = drop
            ? [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 }]
            : [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 60 }];
    } else {
        sheetRows = rows.map((cam) => ({
            'Device ID': cam.device_id || '-',
            'Camera No': cam.camera_no ?? '-',
            'TC Code': cam.tc_code || '-',
            'Camera Name': cam.camera_name || '-',
            'Centre Name': cam.centre_name || cam.tc_name || '-',
            'State': cam.state || '-',
            'Region': cam.region || '-',
            ...(drop ? {} : { 'Classification': cam.classification || '-' }),
            'Status': cam.status || '-',
            ...(drop ? {} : { 'View': frameUrl(cam.frame_path) }),
            'CCTV URL': cam.cctv_url || cam.url || '-',
        }));
        viewCol = drop ? -1 : 9;
        cols = drop
            ? [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 60 }]
            : [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 60 }];
    }
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = cols;
    if (viewCol >= 0) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: viewCol });
            const url = sheetRows[R - 1]['View'];
            ws[addr] = url ? { v: 'View', t: 's', l: { Target: url, Tooltip: 'Open frame' } } : { v: '-', t: 's' };
        }
    }
    return workbookBuffer(ws, 'Cameras');
}

async function buildCameraReport({ examId, date, shiftId, shiftLabel, statusKey, allShifts, getRuns, isHls }) {
    const { payload, noRun } = await fetchCameras(examId, date, shiftId, getRuns, isHls);
    // With no classification run that day, nobody knows which cameras were reachable. Saying
    // "no detection" would be false, so the email says what actually happened.
    if (noRun && statusKey !== 'total') {
        return { buffer: null, rows: 0, note: `no classification ran${shiftId ? ` for ${shiftLabel}` : ''} on ${ddmmyyyy(date)}, so camera status is not available` };
    }
    let rows = payload.data || [];
    if (statusKey === 'accessible') rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'accessible');
    if (statusKey === 'notAccessible') rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'not accessible');
    if (!rows.length) return { buffer: null, rows: 0 };
    return { buffer: cameraSheet(rows, payload.linkType === 'HLS', statusKey, allShifts), rows: rows.length };
}

// ─── Detection exports (same sheet as ClientDetections.jsx exportToExcel) ─────

async function fetchClientDetections(params) {
    const res = await axios.get(`${SCRIPT_SERVER_URL()}/client-detections`, { params, timeout: 180000 });
    if (!res.data || res.data.success !== true || !Array.isArray(res.data.data)) {
        throw new Error('Script server returned an unexpected client-detections response');
    }
    return res.data;
}

function detectionTime(detectedAt) {
    const m = /,\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i.exec(detectedAt || '');
    if (!m) return detectedAt || '-';
    let h = parseInt(m[1], 10);
    const ampm = m[4].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}:${m[3]}`;
}

function detectionSheet(items, typeLabel) {
    const rows = items.map((item) => {
        const rawDate = item.date || '';
        const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate.split('-').reverse().join('-') : rawDate;
        return {
            'Detection Type': typeLabel,
            'Center Name': item.centerName || item.centre_name || '-',
            'Camera Name': item.cameraName || item.camera_name || item.camera_id || '-',
            'Location': item.city || '-',
            'Device ID': item.deviceId || item.device_id || '-',
            'Camera No': item.cameraNo || item.camera_no || (item.chNo != null ? String(item.chNo) : '') || '-',
            'Date': formattedDate || '-',
            'Time': detectionTime(item.detected_at),
            'Timestamp': item.detected_at || '-',
            'City': item.city || '-',
            'Frame URL': item.image_url ? `${PUBLIC_BASE_URL()}/cctv_dev${String(item.image_url).replace(/^\/+/, '/')}` : '',
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 40 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 28 }, { wch: 20 }, { wch: 80 }];
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
        const url = rows[R - 1]['Frame URL'];
        if (url) ws[XLSX.utils.encode_cell({ r: R, c: 10 })] = { v: 'View', t: 's', l: { Target: url, Tooltip: 'Click to open image' } };
    }
    return workbookBuffer(ws, 'Detections');
}

async function buildDetectionReport({ examId, date, shiftId, detectionType, detectionLabel }) {
    const params = { page: 1, type: detectionType, date, exam_id: examId };
    if (shiftId) params.shift_id = shiftId;
    const first = await fetchClientDetections({ ...params, limit: 1 });
    const total = Number(first.total) || 0;
    if (!total) return { buffer: null, rows: 0 };
    const full = await fetchClientDetections({ ...params, limit: total });
    if (!full.data.length) return { buffer: null, rows: 0 };
    return { buffer: detectionSheet(full.data, detectionLabel), rows: full.data.length };
}

// ─── One email ────────────────────────────────────────────────────────────────

async function loadSchedule(id) {
    const rows = await query(
        `SELECT s.id, s.exam_id, DATE_FORMAT(s.report_date, '%Y-%m-%d') AS report_date,
                TIME_FORMAT(s.send_time, '%H:%i') AS send_time, s.to_emails, s.cc_emails, s.subject,
                s.status, s.attempts, e.exam_name
         FROM report_schedules s JOIN exams e ON e.id = s.exam_id WHERE s.id = ?`,
        [id]
    );
    if (!rows.length) return null;
    const items = await query(
        'SELECT id, report_type, shift_id FROM report_schedule_items WHERE schedule_id = ? ORDER BY position, id',
        [id]
    );
    return { ...rows[0], items };
}

/** Build every report of a schedule. Returns [{ type, label, shiftLabel, title, filename, buffer, rows }]. */
async function buildReports(schedule) {
    const allShifts = await query(
        'SELECT id, shift_name, is_active FROM exam_shifts WHERE exam_id = ? ORDER BY start_time, id',
        [schedule.exam_id]
    );
    const [exam] = await query('SELECT link_type FROM exams WHERE id = ?', [schedule.exam_id]);
    const isHls = String(exam?.link_type || '').toUpperCase() === 'HLS';
    let runsPromise = null;      // fetched once per email, and only if an earlier day needs it
    const getRuns = () => {
        if (!runsPromise) {
            runsPromise = callCameraController(CameraController.getClassificationRuns, { examId: String(schedule.exam_id) }, {})
                .then((body) => body.data || []);
        }
        return runsPromise;
    };
    const out = [];
    for (const item of schedule.items) {
        const def = REPORT_TYPES[item.report_type];
        if (!def) throw new Error(`Unknown report type "${item.report_type}"`);
        let shiftLabel = 'All Shifts';
        if (item.shift_id) {
            const shift = allShifts.find((s) => s.id === item.shift_id && s.is_active);
            if (!shift) throw new Error(`${def.label}: the selected shift no longer exists on this exam. Edit this time and choose a shift again.`);
            shiftLabel = shift.shift_name || `Shift #${shift.id}`;
        }
        const ctx = { examId: schedule.exam_id, date: schedule.report_date, shiftId: item.shift_id || null };
        let built;
        try {
            if (def.kind === 'camera') {
                built = await buildCameraReport({ ...ctx, shiftLabel, statusKey: def.status, allShifts, getRuns, isHls });
            } else if (def.kind === 'detection') {
                built = await buildDetectionReport({ ...ctx, detectionType: def.detectionType, detectionLabel: def.detectionLabel });
            } else {
                const report = await buildClientReport({ examId: ctx.examId, mysqlDate: ctx.date, shiftId: ctx.shiftId });
                built = { buffer: report.detectionCount > 0 ? report.buffer : null, rows: report.detectionCount };
            }
        } catch (err) {
            throw new Error(`${def.label} (${shiftLabel}): ${err.message}`);
        }
        const title = `${def.label} (${shiftLabel})`;
        out.push({
            type: item.report_type,
            label: def.label,
            shiftLabel,
            title,
            filename: `${safeFilename(`${def.label} - ${shiftLabel} - ${ddmmyyyy(schedule.report_date)}`)}.xlsx`,
            buffer: built.buffer,
            rows: built.rows,
            note: built.note || null,
        });
    }
    return out;
}

function defaultSubject(schedule, reports) {
    const shifts = [...new Set(reports.map((r) => r.shiftLabel))];
    const shiftPart = shifts.length === 1 ? ` ${shifts[0]}` : '';
    return `${schedule.exam_name} Exam Report${shiftPart} (${ddmmyyyy(schedule.report_date)})`;
}

function composeEmail(schedule, reports) {
    const esc = emailService.escapeHtml;
    const attached = reports.filter((r) => r.buffer);
    const empty = reports.filter((r) => !r.buffer);
    const list = attached.map((r, i) => `(${toRoman(i)}) ${esc(r.title)}`).join(', ');
    const notes = empty.map((r) => `<p style="margin:6px 0;">${r.note ? `${esc(r.title)}: ${esc(r.note)}` : `No detection in ${esc(r.title)}`}.</p>`).join('');
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
<p>Dear Sir/Madam,</p>
<p>${attached.length ? 'Please find attached the' : 'Report status for the'}</p>
<h2 style="font-size:18px;margin:8px 0;">${esc(schedule.exam_name)} (${esc(ddmmyyyy(schedule.report_date))})</h2>
${attached.length ? `<p style="margin:6px 0;">${list}</p>` : ''}
${notes}
<p style="margin-top:20px;">Regards,<br/>${esc(SIGNATURE())}</p>
</body></html>`;
    return { subject: schedule.subject || defaultSubject(schedule, reports), html };
}

/** Build and send one schedule that is already claimed (status = sending). */
async function deliver(id) {
    const schedule = await loadSchedule(id);
    if (!schedule) return { sent: false, error: 'Schedule no longer exists' };
    if (!schedule.items.length) throw new Error('No reports are assigned to this time');

    const reports = await buildReports(schedule);
    const attachedBytes = reports.reduce((n, r) => n + (r.buffer ? r.buffer.length : 0), 0);
    if (attachedBytes > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Attachments are ${(attachedBytes / 1048576).toFixed(1)} MB, above the email limit of about 28 MB. Split these reports across two times.`);
    }
    const { subject, html } = composeEmail(schedule, reports);
    const result = await emailService.sendEmail(JSON.parse(schedule.to_emails), subject, html, {
        cc: JSON.parse(schedule.cc_emails || '[]'),
        attachments: reports.filter((r) => r.buffer).map((r) => ({ filename: r.filename, content: r.buffer.toString('base64') })),
    });
    // sendEmail reports success + skipped when no API key is set. Nothing was sent, so that is a failure here.
    if (result.skipped) throw new Error('Email service is not configured: RESEND_API_KEY is missing on the server');
    if (!result.success) throw new Error(result.message || 'Email provider rejected the message');

    const summary = reports.map((r) => ({
        type: r.type, label: r.label, shift: r.shiftLabel, rows: r.rows, attached: !!r.buffer, filename: r.buffer ? r.filename : null, note: r.note,
    }));
    await sequelize.query(
        `UPDATE report_schedules SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL, next_attempt_at = NULL,
                result_summary = ?, provider_message_id = ? WHERE id = ?`,
        { replacements: [JSON.stringify({ subject, reports: summary }), result.messageId || null, id], type: QueryTypes.UPDATE }
    );
    logger.info(`[reportAutomation] schedule ${id} sent: ${summary.filter((r) => r.attached).length} attached, ${summary.filter((r) => !r.attached).length} empty`);
    return { sent: true, subject, html, reports };
}

/** Run a claimed schedule and record the outcome. Never throws. */
async function processClaimed(id) {
    try {
        return await deliver(id);
    } catch (err) {
        const message = String(err && err.message ? err.message : err).slice(0, 2000);
        logger.error(`[reportAutomation] schedule ${id} failed: ${message}`);
        try {
            const rows = await query('SELECT attempts FROM report_schedules WHERE id = ?', [id]);
            const retry = rows.length && rows[0].attempts < MAX_ATTEMPTS;
            await sequelize.query(
                `UPDATE report_schedules SET status = ?, last_error = ?,
                        next_attempt_at = ${retry ? `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${RETRY_MINUTES} MINUTE)` : 'NULL'}
                 WHERE id = ?`,
                { replacements: [retry ? 'pending' : 'failed', message, id], type: QueryTypes.UPDATE }
            );
        } catch (e) {
            logger.error(`[reportAutomation] could not record failure of schedule ${id}: ${e.message}`);
        }
        return { sent: false, error: message };
    }
}

/** Atomic claim, so a schedule can never be sent twice by overlapping runs. */
async function claimDue(id) {
    const [, affected] = await sequelize.query(
        `UPDATE report_schedules SET status = 'sending', claimed_at = CURRENT_TIMESTAMP, attempts = attempts + 1
         WHERE id = ? AND status = 'pending'`,
        { replacements: [id], type: QueryTypes.UPDATE }
    );
    return affected === 1;
}

/** "Send now": any state except one already sending. A failure goes straight to failed, without retries. */
async function claimManual(id) {
    const [, affected] = await sequelize.query(
        `UPDATE report_schedules SET status = 'sending', claimed_at = CURRENT_TIMESTAMP, attempts = ?, next_attempt_at = NULL, last_error = NULL
         WHERE id = ? AND status <> 'sending'`,
        { replacements: [MAX_ATTEMPTS, id], type: QueryTypes.UPDATE }
    );
    return affected === 1;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let cronJob = null;
let ticking = false;
let tablesMissingLogged = false;

async function tick(nowMs = Date.now()) {
    if (ticking) return;
    ticking = true;
    try {
        await sequelize.query(
            `UPDATE report_schedules SET status = 'failed',
                    last_error = 'Interrupted while sending (server restart). The email may or may not have gone out. Check before using Send now.'
             WHERE status = 'sending' AND claimed_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${STALE_SENDING_MINUTES} MINUTE)`,
            { type: QueryTypes.UPDATE }
        );
        const pending = await query(
            `SELECT id, DATE_FORMAT(send_date, '%Y-%m-%d') AS send_date, TIME_FORMAT(send_time, '%H:%i') AS send_time, attempts
             FROM report_schedules
             WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
             ORDER BY send_date, send_time, id`
        );
        for (const row of pending) {
            const due = slotTimeMs(row.send_date, row.send_time);
            if (due > nowMs) continue;
            if (row.attempts === 0 && nowMs - due > MISSED_AFTER_MINUTES * 60000) {
                await sequelize.query(
                    `UPDATE report_schedules SET status = 'missed', last_error = ? WHERE id = ? AND status = 'pending'`,
                    { replacements: [`The server was not running at the send time (over ${MISSED_AFTER_MINUTES} minutes late). Use Send now if it is still needed.`, row.id], type: QueryTypes.UPDATE }
                );
                logger.warn(`[reportAutomation] schedule ${row.id} missed its send time`);
                continue;
            }
            if (await claimDue(row.id)) await processClaimed(row.id);
        }
        tablesMissingLogged = false;
    } catch (err) {
        if (err?.parent?.code === 'ER_NO_SUCH_TABLE' || err?.original?.code === 'ER_NO_SUCH_TABLE') {
            if (!tablesMissingLogged) logger.warn('[reportAutomation] tables missing: run migration 047_report_automation.sql');
            tablesMissingLogged = true;
        } else {
            logger.error(`[reportAutomation] tick failed: ${err.message}`);
        }
    } finally {
        ticking = false;
    }
}

function start() {
    if (cronJob) return;
    cronJob = cron.schedule('* * * * *', () => { tick(); });
    logger.info('Report automation scheduler started');
}

function stop() {
    if (cronJob) { cronJob.stop(); cronJob = null; }
}

module.exports = {
    REPORT_TYPES, slotTimeMs, istDay, start, stop, tick, claimManual, processClaimed, buildReports, composeEmail, loadSchedule,
};
