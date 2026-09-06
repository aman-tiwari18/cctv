'use strict';

const { query } = require('../config/database');

/**
 * userCompanies.js
 *
 * An account can belong to more than one company (see migration 035). The
 * memberships live in user_companies; users.company_name stays as the account's
 * primary company so existing queries and the admin UI keep working.
 *
 * Only ADMIN-verified memberships widen what a user can see — an unverified
 * one is a pending request, not access.
 */

/**
 * Companies this user may see data for.
 * Falls back to users.company_name when the account has no membership rows
 * (e.g. a row created before this table existed and never backfilled).
 *
 * @param {number} userId
 * @param {string|null} primaryCompany  users.company_name, used as the fallback
 * @returns {Promise<string[]>}
 */
async function getUserCompanies(userId, primaryCompany = null) {
    let rows = [];
    try {
        rows = await query(
            'SELECT company_name FROM user_companies WHERE user_id = ? AND verified = 1',
            [userId]
        );
    } catch (e) {
        // Table missing (migration not run yet) — fall back to the single column.
        rows = [];
    }
    const names = rows.map((r) => String(r.company_name || '').trim()).filter(Boolean);
    const primary = String(primaryCompany || '').trim();
    if (primary && !names.includes(primary)) names.push(primary);
    return names;
}

/** All memberships incl. pending ones — for the admin user list. */
async function getUserCompanyRows(userId) {
    try {
        return await query(
            `SELECT company_name, verified, verified_date
               FROM user_companies WHERE user_id = ? ORDER BY created_at`,
            [userId]
        );
    } catch (e) {
        return [];
    }
}

/**
 * Add a membership. Idempotent — a second signup for a company the user already
 * has leaves the existing row (and its verified state) alone.
 */
async function addUserCompany(userId, companyName, verified = 0) {
    const name = String(companyName || '').trim();
    if (!name || !userId) return false;
    await query(
        `INSERT IGNORE INTO user_companies (user_id, company_name, verified, verified_date)
         VALUES (?, ?, ?, ?)`,
        [userId, name, verified ? 1 : 0, verified ? new Date() : null]
    );
    return true;
}

/** True when the user already has this company (verified or pending). */
async function hasUserCompany(userId, companyName) {
    const name = String(companyName || '').trim();
    if (!name) return false;
    const rows = await query(
        'SELECT id FROM user_companies WHERE user_id = ? AND company_name = ? LIMIT 1',
        [userId, name]
    );
    return !!(rows && rows.length);
}

/** Approve/revoke every membership of a user, alongside users.verified. */
async function setUserCompaniesVerified(userId, verified) {
    try {
        await query(
            'UPDATE user_companies SET verified = ?, verified_date = ? WHERE user_id = ?',
            [verified ? 1 : 0, verified ? new Date() : null, userId]
        );
    } catch (e) {
        /* table missing — nothing to sync */
    }
}

module.exports = {
    getUserCompanies,
    getUserCompanyRows,
    addUserCompany,
    hasUserCompany,
    setUserCompaniesVerified,
};
