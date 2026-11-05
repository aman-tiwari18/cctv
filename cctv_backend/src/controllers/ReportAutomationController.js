/**
 * Report automation API (ADMIN): one schedule = an exam, the day the reports cover, the day and time
 * the email goes out, with To / Cc and a list of reports. Sending is done by services/reportAutomationService.js.
 */

'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize, query } = require('../config/database');
const svc = require('../services/reportAutomationService');
const logger = require('../utils/logger');

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MAX_RECIPIENTS = 50;    // Resend's limit per field

class BadRequest extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

function fail(res, err, what) {
    if (err instanceof BadRequest) return res.status(err.status).json({ success: false, message: err.message });
    if (err?.parent?.code === 'ER_NO_SUCH_TABLE' || err?.original?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ success: false, message: 'The report automation tables are missing. Run migration 047_report_automation.sql on this database.' });
    }
    if (err?.parent?.errno === 1062 || err?.original?.errno === 1062) {
        return res.status(409).json({ success: false, message: 'This exam already has an email for this report day at this send time. Edit that one instead.' });
    }
    logger.error(`[reportAutomation] ${what}: ${err.message}`);
    return res.status(500).json({ success: false, message: `${what} failed` });
}

function cleanEmails(value, field) {
    if (!Array.isArray(value)) throw new BadRequest(`${field} must be a list of email addresses`);
    const seen = new Set();
    const out = [];
    for (const raw of value) {
        const email = String(raw || '').trim();
        if (!email) continue;
        if (!EMAIL_RE.test(email)) throw new BadRequest(`${field}: "${email}" is not a valid email address`);
        const key = email.toLowerCase();
        if (!seen.has(key)) { seen.add(key); out.push(email); }
    }
    if (out.length > MAX_RECIPIENTS) throw new BadRequest(`${field}: at most ${MAX_RECIPIENTS} addresses are allowed`);
    return out;
}

/** Validate a create / update body. Returns normalised values. */
async function parseBody(body) {
    const b = body || {};
    const examId = parseInt(b.exam_id, 10);
    if (!examId) throw new BadRequest('Select an exam');
    const exam = await query('SELECT id FROM exams WHERE id = ?', [examId]);
    if (!exam.length) throw new BadRequest('Exam not found', 404);

    const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00+05:30`));
    const date = String(b.report_date || '');
    if (!validDay(date)) throw new BadRequest('Select a valid report day');
    const sendDate = String(b.send_date || '');
    if (!validDay(sendDate)) throw new BadRequest('Select a valid send day');
    if (sendDate < date) throw new BadRequest('The send day cannot be before the report day');
    const time = String(b.send_time || '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BadRequest('Select a valid time');

    const to = cleanEmails(b.to_emails || [], 'To');
    if (!to.length) throw new BadRequest('Add at least one To address');
    const toKeys = new Set(to.map((e) => e.toLowerCase()));
    const cc = cleanEmails(b.cc_emails || [], 'Cc').filter((e) => !toKeys.has(e.toLowerCase()));
    const subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').trim();
    if (subject.length > 200) throw new BadRequest('Subject is too long (200 characters at most)');

    if (!Array.isArray(b.items) || !b.items.length) throw new BadRequest('Assign at least one report to this time');
    const shifts = await query('SELECT id FROM exam_shifts WHERE exam_id = ? AND is_active = 1', [examId]);
    const shiftIds = new Set(shifts.map((s) => s.id));
    const seen = new Set();
    const items = b.items.map((it) => {
        const type = String(it?.report_type || '');
        const def = svc.REPORT_TYPES[type];
        if (!def) throw new BadRequest(`Unknown report "${type}"`);
        const hasShift = it.shift_id !== null && it.shift_id !== undefined && it.shift_id !== '';
        const shiftId = hasShift ? parseInt(it.shift_id, 10) : null;
        if (hasShift && !shiftIds.has(shiftId)) throw new BadRequest(`${def.label}: choose a shift of this exam`);
        const key = `${type}#${shiftId}`;
        if (seen.has(key)) throw new BadRequest(`${def.label} is added twice for the same shift`);
        seen.add(key);
        return { type, shiftId };
    });
    return { examId, date, sendDate, time, to, cc, subject: subject || null, items };
}

async function writeItems(scheduleId, items, transaction) {
    await sequelize.query('DELETE FROM report_schedule_items WHERE schedule_id = ?', { replacements: [scheduleId], type: QueryTypes.DELETE, transaction });
    for (let i = 0; i < items.length; i++) {
        await sequelize.query(
            'INSERT INTO report_schedule_items (schedule_id, report_type, shift_id, position) VALUES (?, ?, ?, ?)',
            { replacements: [scheduleId, items[i].type, items[i].shiftId, i], type: QueryTypes.INSERT, transaction }
        );
    }
}

const parseJson = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

async function listRows(where, params) {
    const rows = await query(
        `SELECT id, exam_id, DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date, DATE_FORMAT(send_date, '%Y-%m-%d') AS send_date,
                TIME_FORMAT(send_time, '%H:%i') AS send_time,
                to_emails, cc_emails, subject, status, attempts, last_error, result_summary,
                UNIX_TIMESTAMP(sent_at) * 1000 AS sent_at_ms, UNIX_TIMESTAMP(next_attempt_at) * 1000 AS next_attempt_ms
         FROM report_schedules WHERE ${where} ORDER BY send_date, send_time, id`,
        params
    );
    if (!rows.length) return [];
    const items = await query(
        `SELECT i.schedule_id, i.report_type, i.shift_id, sh.shift_name
         FROM report_schedule_items i LEFT JOIN exam_shifts sh ON sh.id = i.shift_id
         WHERE i.schedule_id IN (?) ORDER BY i.position, i.id`,
        [rows.map((r) => r.id)]
    );
    return rows.map((r) => ({
        ...r,
        sent_at_ms: r.sent_at_ms == null ? null : Number(r.sent_at_ms),
        next_attempt_ms: r.next_attempt_ms == null ? null : Number(r.next_attempt_ms),
        to_emails: parseJson(r.to_emails, []),
        cc_emails: parseJson(r.cc_emails, []),
        result_summary: parseJson(r.result_summary, null),
        items: items.filter((i) => i.schedule_id === r.id).map((i) => ({
            report_type: i.report_type,
            label: svc.REPORT_TYPES[i.report_type]?.label || i.report_type,
            shift_id: i.shift_id,
            shift_name: i.shift_id ? (i.shift_name || `Shift #${i.shift_id}`) : 'All Shifts',
        })),
    }));
}

exports.meta = async (req, res) => res.json({
    success: true,
    email_configured: !!process.env.RESEND_API_KEY,
    report_types: Object.entries(svc.REPORT_TYPES).map(([value, d]) => ({ value, label: d.label })),
});

exports.list = async (req, res) => {
    try {
        const examId = parseInt(req.query.exam_id, 10);
        const date = String(req.query.date || '');
        if (!examId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequest('exam_id and date (YYYY-MM-DD) are required');
        return res.json({ success: true, data: await listRows('exam_id = ? AND report_date = ?', [examId, date]) });
    } catch (e) { return fail(res, e, 'Loading schedules'); }
};

exports.create = async (req, res) => {
    try {
        const v = await parseBody(req.body);
        if (svc.slotTimeMs(v.sendDate, v.time) <= Date.now()) throw new BadRequest('This time has already passed. Choose a later time.');
        const id = await sequelize.transaction(async (transaction) => {
            const [newId] = await sequelize.query(
                `INSERT INTO report_schedules (exam_id, report_date, send_date, send_time, to_emails, cc_emails, subject, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                { replacements: [v.examId, v.date, v.sendDate, `${v.time}:00`, JSON.stringify(v.to), JSON.stringify(v.cc), v.subject, req.user?.username || null], type: QueryTypes.INSERT, transaction }
            );
            await writeItems(newId, v.items, transaction);
            return newId;
        });
        const [row] = await listRows('id = ?', [id]);
        return res.status(201).json({ success: true, data: row });
    } catch (e) { return fail(res, e, 'Saving the schedule'); }
};

exports.update = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existing = await query('SELECT status FROM report_schedules WHERE id = ?', [id]);
        if (!existing.length) throw new BadRequest('Schedule not found', 404);
        if (existing[0].status === 'sending') throw new BadRequest('This email is being sent right now. Try again in a minute.', 409);
        const v = await parseBody(req.body);

        // A future time waits to be sent. A past time keeps its outcome, and only a schedule
        // still waiting to go out must be given a later time.
        const future = svc.slotTimeMs(v.sendDate, v.time) > Date.now();
        if (!future && existing[0].status === 'pending') throw new BadRequest('This time has already passed. Choose a later time.');
        const reset = future
            ? `, status = 'pending', attempts = 0, next_attempt_at = NULL, last_error = NULL, sent_at = NULL, result_summary = NULL, provider_message_id = NULL`
            : '';

        const changed = await sequelize.transaction(async (transaction) => {
            const [, affected] = await sequelize.query(
                `UPDATE report_schedules SET exam_id = ?, report_date = ?, send_date = ?, send_time = ?, to_emails = ?, cc_emails = ?, subject = ?, updated_at = CURRENT_TIMESTAMP${reset}
                 WHERE id = ? AND status <> 'sending'`,
                { replacements: [v.examId, v.date, v.sendDate, `${v.time}:00`, JSON.stringify(v.to), JSON.stringify(v.cc), v.subject, id], type: QueryTypes.UPDATE, transaction }
            );
            if (affected !== 1) return false;
            await writeItems(id, v.items, transaction);
            return true;
        });
        if (!changed) throw new BadRequest('This email is being sent right now. Try again in a minute.', 409);
        const [row] = await listRows('id = ?', [id]);
        return res.json({ success: true, data: row });
    } catch (e) { return fail(res, e, 'Saving the schedule'); }
};

exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [existing] = await query('SELECT status FROM report_schedules WHERE id = ?', [id]);
        if (!existing) throw new BadRequest('Schedule not found', 404);
        await sequelize.query(`DELETE FROM report_schedules WHERE id = ? AND status <> 'sending'`, { replacements: [id], type: QueryTypes.DELETE });
        const [still] = await query('SELECT id FROM report_schedules WHERE id = ?', [id]);
        if (still) throw new BadRequest('This email is being sent right now. Try again in a minute.', 409);
        return res.json({ success: true });
    } catch (e) { return fail(res, e, 'Deleting the schedule'); }
};

/** Send one schedule immediately. Answers at once; the page shows the outcome when it refreshes. */
exports.sendNow = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const [existing] = await query(`SELECT DATE_FORMAT(report_date, '%Y-%m-%d') AS report_date FROM report_schedules WHERE id = ?`, [id]);
        if (!existing) throw new BadRequest('Schedule not found', 404);
        if (existing.report_date > svc.istDay(Date.now())) throw new BadRequest('The report day has not started yet, so there is nothing to send.');
        if (!(await svc.claimManual(id))) throw new BadRequest('This email is already being sent.', 409);
        logger.info(`[reportAutomation] schedule ${id}: Send now by ${req.user?.username}`);
        svc.processClaimed(id);    // never rejects; records its own outcome
        return res.status(202).json({ success: true, message: 'Sending started' });
    } catch (e) { return fail(res, e, 'Sending the email'); }
};
