'use strict';

/**
 * examObservers.js
 *
 * Per-exam TC-code → observer mobile lookup, backed by exam_observer_numbers
 * (uploaded as an Excel sheet on the exam form).
 *
 * This is the per-exam replacement for utils/observerList.js, which reads one
 * spreadsheet committed next to the source and is therefore shared by every
 * exam. Callers should try this first and fall back to that sheet, so exams
 * predating the upload keep the numbers they have always used.
 */

const XLSX = require('xlsx');
const { query } = require('../config/database');
const logger = require('./logger');

/** Digits only. Strips +91 / spaces / dashes / brackets so numbers compare equal. */
function normalizePhone(value) {
    const digits = String(value == null ? '' : value).replace(/[^\d]/g, '');
    if (!digits) return '';
    // A leading country code on an Indian mobile — keep the last 10 digits so
    // "+91 98765 43210" and "9876543210" don't become two different recipients.
    if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10);
    return digits;
}

/** Trim + stringify a TC code. Excel hands numeric codes back as numbers. */
function normalizeTcCode(value) {
    if (value == null) return '';
    // 8849 arrives as the number 8849; String() keeps it aligned with the
    // varchar tc_code stored on the report rows.
    return String(value).trim();
}

/**
 * Observer numbers uploaded for one exam + centre.
 * @returns {Promise<string[]>} [] when the exam has no uploaded mapping.
 */
async function getExamObserverNumbers(examId, tcCode) {
    const code = normalizeTcCode(tcCode);
    if (!examId || !code) return [];
    try {
        const rows = await query(
            'SELECT phone FROM exam_observer_numbers WHERE exam_id = ? AND tc_code = ?',
            [examId, code]
        );
        return (rows || []).map((r) => r.phone).filter(Boolean);
    } catch (e) {
        // Table missing (migration 037 not run) must not break the SMS path —
        // the caller falls back to the static sheet.
        logger.error(`[examObservers] lookup failed for exam ${examId} / ${code}: ${e.message}`);
        return [];
    }
}

/** How many centres / numbers an exam currently has uploaded. */
async function getExamObserverSummary(examId) {
    try {
        const rows = await query(
            `SELECT COUNT(*) AS numbers, COUNT(DISTINCT tc_code) AS tc_codes
               FROM exam_observer_numbers WHERE exam_id = ?`,
            [examId]
        );
        const r = (rows && rows[0]) || {};
        return { numbers: Number(r.numbers || 0), tcCodes: Number(r.tc_codes || 0) };
    } catch (e) {
        logger.error(`[examObservers] summary failed for exam ${examId}: ${e.message}`);
        return { numbers: 0, tcCodes: 0 };
    }
}

// Header aliases. The sheet in use is "TC Code | Mobile Number", but centre
// lists arrive from several clients with their own wording.
const TC_HEADERS = ['tccode', 'tc', 'tcno', 'centrecode', 'centercode', 'code'];
const PHONE_HEADERS = ['mobilenumber', 'mobile', 'mobileno', 'phone', 'phonenumber', 'phoneno', 'number', 'contact', 'contactnumber', 'observernumber', 'observermobile'];

const squash = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Parse an uploaded centre sheet into { rows, skipped, duplicates }.
 *
 * Accepts either a header row naming the two columns (in any of the aliases
 * above, in any order) or a bare two-column sheet — a list with no recognised
 * header is read positionally as TC code, number, which is what most of these
 * sheets actually are.
 *
 * One cell may hold several numbers ("9876543210, 9812345678"); each becomes
 * its own recipient.
 */
function parseObserverSheet(filePath) {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { rows: [], skipped: 0, duplicates: 0 };

    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    if (!grid.length) return { rows: [], skipped: 0, duplicates: 0 };

    // Locate the two columns from the header row; fall back to positional.
    const header = (grid[0] || []).map(squash);
    let tcIdx = header.findIndex((h) => TC_HEADERS.includes(h));
    let phoneIdx = header.findIndex((h) => PHONE_HEADERS.includes(h));

    let startRow = 1;
    if (tcIdx === -1 || phoneIdx === -1) {
        // No recognisable header — treat every row as data, columns A and B.
        tcIdx = 0;
        phoneIdx = 1;
        startRow = 0;
    }

    const rows = [];
    const seen = new Set();
    let skipped = 0;
    let duplicates = 0;

    for (let i = startRow; i < grid.length; i++) {
        const row = grid[i] || [];
        const tc = normalizeTcCode(row[tcIdx]);
        const rawPhones = String(row[phoneIdx] == null ? '' : row[phoneIdx]);

        if (!tc || !rawPhones.trim()) { skipped++; continue; }

        // Split multi-number cells on the usual separators.
        const phones = rawPhones
            .split(/[,;/|\n]+/)
            .map(normalizePhone)
            .filter((p) => p.length >= 10);

        if (!phones.length) { skipped++; continue; }

        for (const phone of phones) {
            const key = `${tc}|${phone}`;
            if (seen.has(key)) { duplicates++; continue; }
            seen.add(key);
            rows.push({ tc_code: tc, phone });
        }
    }

    return { rows, skipped, duplicates };
}

module.exports = {
    getExamObserverNumbers,
    getExamObserverSummary,
    parseObserverSheet,
    normalizePhone,
    normalizeTcCode,
};
