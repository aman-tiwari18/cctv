/**
 * ClientApiController.js
 *
 * External client integration API (spec: CCTV_API_v1.2), read-only GETs.
 * Every query is pinned to clientApi.EXAM_ID — this API never exposes any
 * other exam. Errors use the spec's { "error": "..." } envelope.
 */

'use strict';

const { query } = require('../config/database');
const { scheduledTcCodesNow } = require('../utils/examSchedule');
const logger = require('../utils/logger');
const {
    EXAM_ID,
    VENDOR_NAME,
    CAMERA_TYPES,
    CAMERA_TYPE_BY_LABEL,
    CAMERA_STATUS,
    CAMERA_STATUSES,
} = require('../config/clientApi');

// scripts.script_id values that are not event-raising detections.
const NON_EVENT_SCRIPTS = ['vision', 'vision_neet'];

const CAMERA_TYPE_NAME = new Map(CAMERA_TYPES.map((t) => [t.id, t.name]));
const CAMERA_STATUS_NAME = new Map(CAMERA_STATUSES.map((s) => [s.id, s.name]));

const withVendor = (items) => items.map((i) => ({ ...i, vendor_name: VENDOR_NAME }));

const normLabel = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * Classification (AI / operator-verified) wins; the uploaded camera_category
 * is the fallback for cameras not classified yet. Unmapped → 0 (Other).
 */
function resolveCamType(row) {
    for (const label of [row.classification, row.camera_category]) {
        const id = CAMERA_TYPE_BY_LABEL[normLabel(label)];
        if (id !== undefined) return id;
    }
    return 0;
}

/**
 * First matching rule wins:
 *   inactive row or Invalid type      → 200 Excluded
 *   status 'Not Accessible'           → 9999 Other
 *   no classification / no status yet → 100 ClassificationPending
 *   today outside the exam's dates    → 0 Idle/Ready
 *   otherwise                         → 1 AnalyticsLive
 */
function resolveStatus(row, camType, examRunning, scheduledNow = true) {
    if (!Number(row.is_active) || camType === 9) return CAMERA_STATUS.EXCLUDED;
    // Exam schedule (Exams page): the centre has no exam in the current shift / today ->
    // idle, not "offline" (its stream is not being watched, so accessibility is irrelevant).
    if (!scheduledNow) return CAMERA_STATUS.IDLE;
    if (normLabel(row.status) === 'notaccessible') return CAMERA_STATUS.OTHER;
    if (!row.classification || !row.status) return CAMERA_STATUS.CLASSIFICATION_PENDING;
    if (!examRunning) return CAMERA_STATUS.IDLE;
    return CAMERA_STATUS.LIVE;
}

/** The pinned exam, plus whether today is inside its date range. */
async function getExam() {
    const rows = await query(
        `SELECT id, exam_name, exam_body, link_type, is_active,
                (CURDATE() >= COALESCE(start_date, CURDATE())
                 AND CURDATE() <= COALESCE(end_date, CURDATE())) AS running
           FROM exams WHERE id = ? LIMIT 1`,
        [EXAM_ID]
    );
    return rows && rows[0] ? rows[0] : null;
}

const fail = (res, where, err) => {
    logger.error(`[clientApi] ${where} failed:`, { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
};

/**
 * All cameras of the pinned exam, one entry per physical camera, already
 * mapped to the client's cam_type / status. Shared by /cameras and
 * /master/camera-types so the two always agree.
 *
 * camera_links_hls holds one row per camera per shift per exam date, so rows
 * are collapsed to one per ch_code — preferring an active row, then a
 * classified one (a camera classified on any shift/date counts as
 * classified), then today's, then the latest date. RTSP exams have one row
 * per device+camera.
 */
async function loadCameras() {
    const exam = await getExam();
    if (!exam) return [];

    const isRtsp = String(exam.link_type || '').toUpperCase() === 'RTSP';
    const rows = isRtsp
        ? await query(
            `SELECT id, device_id, camera_no, centre_name, tc_code, city, state,
                    NULL AS camera_category, classification, status, is_active
               FROM camera_links_rtsp
              WHERE exam_id = ?
              ORDER BY is_active DESC, (classification IS NOT NULL) DESC, id DESC`,
            [EXAM_ID]
        )
        : await query(
            `SELECT id, ch_code, centre_name, tc_code, city, state,
                    camera_category, classification, status, is_active
               FROM camera_links_hls
              WHERE exam_id = ?
              ORDER BY is_active DESC, (classification IS NOT NULL) DESC,
                       (exam_date = CURDATE()) DESC, exam_date DESC, id DESC`,
            [EXAM_ID]
        );

    // RTSP exam with an uploaded schedule: which centres run now (null = all)
    let runningTcs = null;
    if (isRtsp) {
        try {
            const now = new Date();
            const p2 = (n) => String(n).padStart(2, '0');
            const today = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
            const nowTime = `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
            runningTcs = await scheduledTcCodesNow(EXAM_ID, today, nowTime);
        } catch (e) {
            logger.warn(`[clientApi] schedule lookup failed, treating every centre as running: ${e.message}`);
        }
    }

    const seen = new Set();
    const cameras = [];
    for (const row of rows) {
        const camId = isRtsp
            ? (row.camera_no ? `${row.device_id}$${row.camera_no}` : String(row.device_id || ''))
            : String(row.ch_code || '');
        const key = camId || `row:${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const camType = resolveCamType(row);
        const status = resolveStatus(row, camType, Number(exam.running) === 1,
            !runningTcs || runningTcs.has(String(row.tc_code == null ? '' : row.tc_code).trim()));
        cameras.push({
            cam_id: camId,
            cam_type: camType,
            cam_type_name: CAMERA_TYPE_NAME.get(camType),
            tc_code: row.tc_code || '',
            center_name: row.centre_name || '',
            city: row.city || '',
            state: row.state || '',
            status,
            status_name: CAMERA_STATUS_NAME.get(status),
            vendor_name: VENDOR_NAME,
        });
    }
    return cameras;
}

/** GET /api/v1/cameras */
exports.getCameras = async (req, res) => {
    try {
        return res.json({ cameras: await loadCameras() });
    } catch (err) {
        return fail(res, 'getCameras', err);
    }
};

/**
 * GET /api/v1/master/camera-types
 * Only the types that the pinned exam's cameras actually resolve to (from
 * their classification, or the uploaded camera_category when unclassified),
 * in catalog order. Empty while the exam does not exist.
 */
exports.getCameraTypes = async (req, res) => {
    try {
        const present = new Set((await loadCameras()).map((c) => c.cam_type));
        const types = CAMERA_TYPES.filter((t) => present.has(t.id));
        return res.json({ camera_types: withVendor(types) });
    } catch (err) {
        return fail(res, 'getCameraTypes', err);
    }
};

/** GET /api/v1/master/camera-statuses */
exports.getCameraStatuses = (req, res) => res.json({ statuses: withVendor(CAMERA_STATUSES) });

/**
 * GET /api/v1/master/event-types
 * Distinct scripts scheduled on any shift of the pinned exam (active
 * assignments only), as { id: scripts.id, name: scripts.name }. Scene
 * classification scripts are left out — they classify cameras, they do not
 * raise events.
 */
exports.getEventTypes = async (req, res) => {
    try {
        const rows = await query(
            `SELECT DISTINCT s.id, s.name
               FROM shift_script_assignments a
               JOIN exam_shifts sh ON sh.id = a.shift_id
               JOIN scripts s ON s.id = a.script_id
              WHERE sh.exam_id = ? AND a.is_active = 1
                AND s.script_id NOT IN (?)
              ORDER BY s.id`,
            [EXAM_ID, NON_EVENT_SCRIPTS]
        );
        const types = rows.map((r) => ({ id: r.id, name: r.name }));
        return res.json({ event_types: withVendor(types) });
    } catch (err) {
        return fail(res, 'getEventTypes', err);
    }
};

/**
 * GET /api/v1/master/current-schedule
 * client_name = exams.exam_body, schedule_name = exams.exam_name.
 * Empty while the pinned exam is missing or inactive.
 */
exports.getCurrentSchedule = async (req, res) => {
    try {
        const exam = await getExam();
        const schedules = exam && Number(exam.is_active)
            ? [{ client_name: exam.exam_body || '', schedule_name: exam.exam_name || '', vendor_name: VENDOR_NAME }]
            : [];
        return res.json({ schedules });
    } catch (err) {
        return fail(res, 'getCurrentSchedule', err);
    }
};
