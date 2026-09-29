/**
 * middleware/clientApiKey.js
 *
 * Bearer API-key check for the external client API (/api/v1/*).
 * Header: Authorization: Bearer <CLIENT_API_KEY>
 *
 * Fails closed: if CLIENT_API_KEY is not configured every request is 401,
 * so the API is never accidentally open. Errors use the spec's
 * { "error": "..." } envelope rather than the internal { success, message }.
 */

'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');

const safeEqual = (a, b) => {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const requireClientApiKey = (req, res, next) => {
    const expected = process.env.CLIENT_API_KEY;
    if (!expected) {
        logger.warn('[clientApi] CLIENT_API_KEY is not set — rejecting request');
        return res.status(401).json({ error: 'API key authentication is not configured' });
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Authorization: Bearer <API_KEY> header' });
    }

    if (!safeEqual(authHeader.substring(7).trim(), expected)) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
};

module.exports = { requireClientApiKey };
