/**
 * config/clientApi.js
 *
 * Settings + master catalogs for the external client integration API
 * (/cctv_analytics/api/v1/*, spec: CCTV_API_v1.2).
 *
 * This API serves exactly ONE exam — EXAM_ID below — and never any other.
 * The exam does not exist in the DB yet, so until it is created every
 * endpoint that reads it returns an empty list. VENDOR_ID will be provided
 * by the client later.
 */

'use strict';

const EXAM_ID = 38; // TEMP for testing (RE: UPCISB - 2026) — revert to 1234
const VENDOR_ID = process.env.CLIENT_API_VENDOR_ID || '';

// ── Camera types ─────────────────────────────────────────────
const CAMERA_TYPES = [
    { id: 1, name: 'InsideLabs' },
    { id: 2, name: 'ServerRoom' },
    { id: 4, name: 'Outside' },
    { id: 5, name: 'EntryExit' },
    { id: 9, name: 'Invalid' },
    { id: 0, name: 'Other' },
];

// Our classification / camera_category values → client cam_type id.
// Keys are normalized (lowercase, letters only) so "Entry/ Exit",
// "Entry/Exit" and "Entry/Exit Gate" all resolve. Anything unlisted
// (Strong Room, Biometric, Stairs, …) falls through to 0 = Other.
const CAMERA_TYPE_BY_LABEL = {
    computerlab: 1,
    insideclassroom: 1,
    insidelab: 1,
    serverroom: 2,
    outsidearea: 4,
    outdoorscene: 4,
    parkinglot: 4,
    outside: 4,
    outsidelab: 4,
    outsideroom: 4,
    entry: 5,
    entryexit: 5,
    entryexitgate: 5,
    uncertain: 9,
    uncertainobstructed: 9,
};

// ── Camera statuses ──────────────────────────────────────────
const CAMERA_STATUS = {
    IDLE: 0,
    LIVE: 1,
    CLASSIFICATION_PENDING: 100,
    EXCLUDED: 200,
    OTHER: 9999,
};

const CAMERA_STATUSES = [
    { id: CAMERA_STATUS.IDLE, name: 'Idle/Ready' },
    { id: CAMERA_STATUS.LIVE, name: 'AnalyticsLive' },
    { id: CAMERA_STATUS.CLASSIFICATION_PENDING, name: 'ClassificationPending' },
    { id: CAMERA_STATUS.EXCLUDED, name: 'Excluded' },
    { id: CAMERA_STATUS.OTHER, name: 'Other' },
];

module.exports = {
    EXAM_ID,
    VENDOR_ID,
    CAMERA_TYPES,
    CAMERA_TYPE_BY_LABEL,
    CAMERA_STATUS,
    CAMERA_STATUSES,
};
