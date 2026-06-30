'use strict';

/**
 * observerList.js
 *
 * Loads the "NTA Observer List" spreadsheet into an in-memory
 *   Map<tc_code(string) → string[] phoneNumbers>
 * lookup. Each centre (TC Code) has one or more observer mobile numbers; when a
 * client ACCEPTS a detection we send the SMS alert to the number(s) mapped to
 * that detection's tc_code here (instead of the per-exam observer_phone).
 *
 * The sheet is read once and cached. Call reload() to pick up a new file
 * without restarting the process.
 */

const path = require('path');
const XLSX = require('xlsx');
const logger = require('./logger');

// Sheet lives next to the source (committed alongside the backend). Override
// with OBSERVER_LIST_PATH in .env if the file is deployed elsewhere.
const SHEET_PATH = process.env.OBSERVER_LIST_PATH
    || path.join(__dirname, '..', 'NTA Observer List - UGC NET June 2026.xlsx');

let _map = null;

function _load() {
    const map = new Map();
    try {
        const wb = XLSX.readFile(SHEET_PATH);
        const ws = wb.Sheets[wb.SheetNames[0]];
        // header:1 → array-of-arrays; row 0 is the "TC Code / Mobile Number" header.
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i] || [];
            const tc = row[0];
            const num = row[1];
            if (tc == null || num == null) continue;
            const key = String(tc).trim();
            const phone = String(num).trim().replace(/[^\d]/g, '');
            if (!key || !phone) continue;
            if (!map.has(key)) map.set(key, []);
            const list = map.get(key);
            if (!list.includes(phone)) list.push(phone);   // de-dupe per tc_code
        }
        logger.info(`[observerList] Loaded ${map.size} TC codes from ${path.basename(SHEET_PATH)}`);
    } catch (e) {
        logger.error(`[observerList] Failed to load observer sheet (${SHEET_PATH}): ${e.message}`);
    }
    return map;
}

/**
 * Return the observer mobile number(s) mapped to a TC code, or [] if none.
 * @param {string|number} tcCode
 * @returns {string[]}
 */
function getObserverNumbers(tcCode) {
    if (!_map) _map = _load();
    if (tcCode == null) return [];
    const list = _map.get(String(tcCode).trim());
    return list ? [...list] : [];
}

/** Force a re-read of the sheet. Returns the new TC-code count. */
function reload() {
    _map = _load();
    return _map.size;
}

module.exports = { getObserverNumbers, reload };
