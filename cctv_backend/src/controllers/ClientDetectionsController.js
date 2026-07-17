/**
 * ClientDetectionsController.js
 *
 * Read-only listing of detections from camera_report_hls / camera_report_rtsp
 * for the VIEWER-facing "Removed Detections" page (pushed_to_client = 1 AND
 * remove_from_client = 1). Mirrors the response shape of the script-server's
 * /client-detections endpoint so the existing frontend card/list components
 * keep working unchanged — only the data source moves from script-server to
 * cctv_backend.
 */

'use strict';

const { query } = require('../config/database');
const { sendAlertWithConfig, TYPE_MAP } = require('../services/smsService');
const { getObserverNumbers } = require('../utils/observerList');

// Detection types eligible for SMS (the only DLT-approved templates we have).
const SMS_ELIGIBLE_TYPES = new Set(['invigilator', 'proximity', 'server']);

// Reverse-mapping of script-server's DETECTION_FOLDERS. The detection_type
// column stores the folder name (e.g. "proximity_detection"); the frontend
// uses the short key (e.g. "proximity") to drive icons/labels/filters.
const DETECTION_FOLDERS = {
    proximity: 'proximity_detection',
    crowd: 'crowd_detection',
    crowd_biometric: 'crowd_detection_biometric',
    crowd_five: 'crowd_detection_threshold',
    crowd_zero: 'zero_person_detection',
    server: 'server_room_detection',
    intruder: 'intruder_detection',
    entry_exit: 'entry_exit_detection',
    phone: 'phone_detection',
    blind_spot: 'blind_spot_detection',
    invigilator: 'invigilator_detection',
    inversion: 'camera_inversion_detection',
    tamper: 'camera_tampering_detection',
    tampering: 'camera_tampering_detection',
    strongroom: 'strongroom_detection',
    qp_box: 'qp_box_missing',
    vision: 'scene_classification',
};

const FOLDER_TO_KEY = Object.entries(DETECTION_FOLDERS).reduce((acc, [k, v]) => {
    if (!(v in acc)) acc[v] = k;
    return acc;
}, {});

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Strip protocol+host from a stored imageurl so the frontend can prefix it
 * with API_BASE_1 (script-server base) — matching the script-server's own
 * /client-detections response shape. Idempotent on already-relative paths.
 */
function normalizeImageUrl(stored) {
    if (!stored) return '';
    let path = stored;
    if (/^https?:\/\//i.test(path)) {
        try { path = new URL(path).pathname; } catch (_) { /* leave as-is */ }
    }
    if (path.startsWith('/cctv_dev')) path = path.slice('/cctv_dev'.length);
    if (path.startsWith('/cctv_analytics')) path = path.slice('/cctv_analytics'.length);
    return path || stored;
}

/**
 * Format YYYYMMDD + HHMMSS into the frontend's expected "08 Apr 2026, 03:47:50 PM".
 */
function formatDetectedAt(dateStr, timeStr) {
    if (!dateStr || !timeStr || dateStr.length !== 8 || timeStr.length !== 6) return '';
    const y = parseInt(dateStr.slice(0, 4), 10);
    const m = parseInt(dateStr.slice(4, 6), 10);
    const d = parseInt(dateStr.slice(6, 8), 10);
    let h = parseInt(timeStr.slice(0, 2), 10);
    const min = timeStr.slice(2, 4);
    const sec = timeStr.slice(4, 6);
    const ampm = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    const hh = String(h12).padStart(2, '0');
    return `${String(d).padStart(2, '0')} ${MONTHS[m - 1] || ''} ${y}, ${hh}:${min}:${sec} ${ampm}`;
}

/**
 * Pull (date, time, count, confidence, issueType) from a detection filename
 * the way script-server's parse_detection_filename does. We deliberately only
 * extract the bits the frontend renders — full RTSP/HLS metadata still comes
 * from the DB row, which is more reliable than re-parsing the filename.
 */
function parseFilename(filename, typeKey) {
    const stem = (filename || '').replace(/\.[^.]+$/, '');
    const out = { date: '', time: '', count: null, confidence: null, issueType: '', issueLabel: '', shiftId: null };
    const dt = /(\d{8})_(\d{6})/.exec(stem);
    if (dt) { out.date = dt[1]; out.time = dt[2]; }
    // shift_id embedded by the detection workers as _shift{id}_ ; "0" = absent.
    const sh = /_shift(\d+)/i.exec(stem);
    if (sh) { const v = parseInt(sh[1], 10); out.shiftId = v > 0 ? v : null; }
    const conf = /conf([\d.]+)/.exec(stem);
    if (conf) out.confidence = parseFloat(conf[1]);
    const cnt = /(?:persons|violations)(\d+)/.exec(stem);
    if (cnt) out.count = parseInt(cnt[1], 10);
    if (typeKey === 'invigilator') {
        const stemL = stem.toLowerCase();
        if (stemL.includes('static_person')) out.issueType = 'static_person';
        else if (stemL.includes('no_targets')) out.issueType = 'no_targets';
        if (out.issueType === 'static_person') out.issueLabel = 'Static Person';
        else if (out.issueType === 'no_targets') out.issueLabel = 'No Targets';
    }
    return out;
}

function emptyCounts() {
    return Object.keys(DETECTION_FOLDERS).reduce((acc, k) => { acc[k] = 0; return acc; }, {});
}

/**
 * POST /cctv_analytics/api/client-detections/undo
 * Body: { uid: string }
 *
 * Reverts a "remove from client" action by setting remove_from_client=0 on
 * the row matching unique_id in either camera_report_hls or camera_report_rtsp.
 * Used by the 15-second undo affordance on the client detections page —
 * symmetrical to the existing /client-detections/remove on script-server.
 */
exports.undoRemoveDetection = async (req, res) => {
    const uid = req.body?.uid;
    if (!uid) {
        return res.status(400).json({ success: false, message: 'uid is required' });
    }
    try {
        // The unique_id lives in exactly one of the two tables; running both
        // updates is cheaper than a SELECT-then-UPDATE and matches the pattern
        // used by the existing remove endpoint on script-server.
        try {
            await query(
                'UPDATE camera_report_hls SET remove_from_client = 0 WHERE unique_id = ?',
                [uid]
            );
        } catch (e) { console.error('[undoRemoveDetection] HLS update failed:', e.message); }

        try {
            await query(
                'UPDATE camera_report_rtsp SET remove_from_client = 0 WHERE unique_id = ?',
                [uid]
            );
        } catch (e) { console.error('[undoRemoveDetection] RTSP update failed:', e.message); }

        return res.json({ success: true, uid });
    } catch (err) {
        console.error('[undoRemoveDetection] error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to undo removal',
            error: err.message,
        });
    }
};

/**
 * POST /cctv_analytics/api/client-detections/accept
 * Body: { uid: string }
 *
 * Client-side "Accept" action. SMS alerts used to fire automatically when the
 * admin pushed a detection; they now fire here, when the CLIENT accepts it.
 * Two effects:
 *   1. Flags the report row accepted_by_client = 1 (persists the badge).
 *   2. Sends the SMS alert to the observer number(s) mapped to this detection's
 *      tc_code in the NTA Observer List sheet (utils/observerList).
 *
 * Gating: the client's explicit Accept is itself the trigger, so the old
 * per-shift sms_enabled toggle gate is NOT applied here. We still require a
 * usable template (type → invigilator/proximity), an enabled client SMS config
 * (gateway creds), and at least one tc_code-mapped recipient — without these
 * the gateway can't deliver. Idempotent on sms_sent.
 */
exports.acceptDetection = async (req, res) => {
    const uid = req.body?.uid;
    if (!uid) {
        return res.status(400).json({ success: false, message: 'uid is required' });
    }
    try {
        // The unique_id lives in exactly one of the two report tables. Find it +
        // the metadata we need for the SMS. (sms_sent exists since migration 027.)
        let tableName = null;
        let row = null;
        for (const t of ['camera_report_hls', 'camera_report_rtsp']) {
            try {
                const r = await query(
                    `SELECT exam_id, shift_id, center_name, tc_code, camera_name,
                            detection_type, date_time, sms_sent,
                            person_count, threshold
                       FROM ${t} WHERE unique_id = ? LIMIT 1`,
                    [uid]
                );
                if (r && r.length) { tableName = t; row = r[0]; break; }
            } catch (e) {
                console.error(`[acceptDetection] lookup failed for ${t}:`, e.message);
            }
        }

        if (!row) {
            return res.status(404).json({ success: false, message: 'Detection not found' });
        }

        // 1) Mark accepted (idempotent — keep the first accepted_at). Tolerate the
        //    columns not existing yet (migration 029) so accept still sends SMS.
        try {
            await query(
                `UPDATE ${tableName}
                    SET accepted_by_client = 1,
                        accepted_at = COALESCE(accepted_at, NOW())
                  WHERE unique_id = ?`,
                [uid]
            );
        } catch (e) {
            console.error(`[acceptDetection] mark-accepted failed for ${uid}:`, e.message);
        }

        // 2) Send the SMS alert to the tc_code-mapped observer number(s).
        let smsSent = false;
        let smsReason = null;

        const typeKey = TYPE_MAP[row.detection_type] || row.detection_type;

        if (Number(row.sms_sent) === 1) {
            smsReason = 'already_sent';
        } else if (!SMS_ELIGIBLE_TYPES.has(typeKey)) {
            smsReason = 'type_not_eligible';
        } else if (!row.exam_id) {
            smsReason = 'no_exam';
        } else {
            const examRows = await query(
                'SELECT exam_body FROM exams WHERE id = ? LIMIT 1',
                [row.exam_id]
            );
            const examBody = examRows && examRows[0] ? examRows[0].exam_body : null;

            const configRows = await query(
                'SELECT * FROM sms_configs WHERE exam_body = ? AND enabled = 1 LIMIT 1',
                [examBody]
            );
            const clientConfig = configRows && configRows[0];

            // Recipient(s): the observer number(s) mapped to THIS detection's tc_code.
            const recipients = getObserverNumbers(row.tc_code);

            if (!clientConfig) {
                smsReason = 'no_client_config';
            } else if (recipients.length === 0) {
                smsReason = 'no_observer_number';
            } else {
                const alertResult = await sendAlertWithConfig(clientConfig, typeKey, {
                    center_name: row.center_name,
                    tc_code: row.tc_code,
                    camera_name: row.camera_name,
                    time: row.date_time,
                    person_count: row.person_count,
                    threshold: row.threshold,
                }, recipients);

                if (alertResult.success && !alertResult.skipped) {
                    smsSent = true;
                    try {
                        await query(
                            `UPDATE ${tableName} SET sms_sent = 1, sms_sent_at = NOW() WHERE unique_id = ?`,
                            [uid]
                        );
                    } catch (e) {
                        console.error(`[acceptDetection] mark sms_sent failed for ${uid}:`, e.message);
                    }
                } else {
                    smsReason = alertResult.skipped ? 'config_skipped' : 'send_failed';
                }
            }
        }

        return res.json({
            success: true,
            uid,
            accepted: true,
            sms_sent: smsSent,
            sms_reason: smsReason,
        });
    } catch (err) {
        console.error('[acceptDetection] error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to accept detection',
            error: err.message,
        });
    }
};

/**
 * GET /cctv_analytics/api/client-detections/removed
 *
 * Query params (all optional unless noted):
 *   page, limit         pagination (defaults: 1, 100)
 *   source              'hls' | 'rtsp'    — restrict to one source table
 *   type                comma-sep type keys (e.g. "proximity,crowd")
 *   date                YYYY-MM-DD or DD-MM-YYYY
 *   start_time          HH:MM (24h)
 *   end_time            HH:MM (24h)
 *   search              substring across camera/center/city/tc_code/filename
 *   exam_id             restrict to a single exam (overrides company filter)
 *
 * Auth: required (authenticate middleware). Non-ADMIN users are scoped to
 * exams matching their company_name (EY → SSC+TCS, others → exact match).
 *
 * Response: { success, total, page, limit, counts, data }
 *   counts is the per-type totals BEFORE the type filter is applied (so the
 *   sidebar chips stay stable when the user toggles a type).
 */
exports.getRemovedDetections = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
        const source = (req.query.source || '').toLowerCase();
        const typeParam = req.query.type || '';
        const rawDate = req.query.date || '';
        const startTime = req.query.start_time || '';
        const endTime = req.query.end_time || '';
        const search = (req.query.search || '').trim().toLowerCase();
        const examIdParam = req.query.exam_id;

        const userRole = req.user?.role;

        // Resolve allowed exam_ids for non-ADMIN scoping via user_exam_assignments.
        const { getAllowedExamIds } = require('../utils/examAccess');
        let allowedExamIds = await getAllowedExamIds(req.user);
        if (allowedExamIds !== null && allowedExamIds.length === 0) {
            return res.json({
                success: true, total: 0, page, limit,
                counts: emptyCounts(), data: [],
            });
        }

        // Build shared WHERE clause for both tables.
        const whereConds = ['pushed_to_client = 1', 'remove_from_client = 1'];
        const whereParams = [];
        if (examIdParam) {
            whereConds.push('exam_id = ?');
            whereParams.push(examIdParam);
        } else if (allowedExamIds) {
            whereConds.push(`exam_id IN (${allowedExamIds.map(() => '?').join(',')})`);
            whereParams.push(...allowedExamIds);
        }

        // Date/time/search filter on created_at (indexed TIMESTAMP ~= detection time)
        // so total / per-type counts / pagination are computed exactly in SQL
        // (COUNT, GROUP BY, LIMIT/OFFSET) instead of capping the fetch at 5000 and
        // counting in JS (which under-reported the true total).
        if (rawDate) {
            let y, m, d;
            const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
            const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(rawDate);
            if (iso) { [, y, m, d] = iso; }
            else if (dmy) { [, d, m, y] = dmy; }
            if (y && m && d) {
                whereConds.push('created_at >= ? AND created_at < (? + INTERVAL 1 DAY)');
                whereParams.push(`${y}-${m}-${d} 00:00:00`, `${y}-${m}-${d} 00:00:00`);
            }
        }
        if (startTime) { whereConds.push('TIME(created_at) >= ?'); whereParams.push(`${startTime}:00`); }
        if (endTime)   { whereConds.push('TIME(created_at) <= ?'); whereParams.push(`${endTime}:59`); }
        if (search) {
            whereConds.push('(LOWER(camera_name) LIKE ? OR LOWER(center_name) LIKE ? OR LOWER(city) LIKE ? OR LOWER(state) LIKE ? OR LOWER(tc_code) LIKE ? OR LOWER(imageurl) LIKE ?)');
            const lk = `%${search}%`; whereParams.push(lk, lk, lk, lk, lk, lk);
        }

        const whereClause = whereConds.join(' AND ');

        const tables = [];
        if (source !== 'rtsp') tables.push({ name: 'camera_report_hls', source: 'hls' });
        if (source !== 'hls') tables.push({ name: 'camera_report_rtsp', source: 'rtsp' });

        // Type filter (SQL) applies to total + page data; the counts query omits it
        // so the sidebar stays full when the user toggles a type.
        const typeKeys = typeParam ? typeParam.split(',').map(s => s.trim()).filter(Boolean) : [];
        const folderNames = typeKeys.map(k => DETECTION_FOLDERS[k]).filter(Boolean);
        let whereData = whereClause, paramsData = whereParams;
        if (folderNames.length > 0) {
            whereData = `${whereClause} AND detection_type IN (${folderNames.map(() => '?').join(',')})`;
            paramsData = whereParams.concat(folderNames);
        }

        // ── Accurate total: SQL COUNT(*) summed across active tables ──
        let total = 0;
        for (const tbl of tables) {
            try {
                const r = await query(`SELECT COUNT(*) AS c FROM ${tbl.name} WHERE ${whereData}`, paramsData);
                total += Number((r[0] && r[0].c) || 0);
            } catch (err) {
                console.error(`[getRemovedDetections] count failed for ${tbl.name}:`, err.message);
            }
        }

        // ── Per-type sidebar counts: SQL GROUP BY (type filter excluded) ──
        const counts = emptyCounts();
        for (const tbl of tables) {
            try {
                const grp = await query(
                    `SELECT detection_type, COUNT(*) AS c FROM ${tbl.name} WHERE ${whereClause} GROUP BY detection_type`,
                    whereParams,
                );
                for (const g of grp) {
                    const key = FOLDER_TO_KEY[g.detection_type] || g.detection_type;
                    if (key in counts) counts[key] += Number(g.c || 0);
                }
            } catch (err) {
                console.error(`[getRemovedDetections] counts failed for ${tbl.name}:`, err.message);
            }
        }

        // ── Page data: SQL ORDER BY created_at DESC, fetch up to this page, merge,
        //    slice. No 5000 cap — any page is reachable. ──
        const need = Math.max(1, page * limit);
        let rows = [];
        for (const tbl of tables) {
            const sql = `SELECT id, exam_id, shift_id, city, center_name, camera_id,
                                camera_name, ${tbl.source === 'rtsp' ? 'device_id, camera_no,' : 'camera_category, ch_code,'}
                                tc_code, state, camera_status, events, date_time,
                                imageurl, detection_type, unique_id, created_at,
                                pushed_to_client, remove_from_client, sms_sent, sms_sent_at, updated_at
                         FROM ${tbl.name}
                         WHERE ${whereData}
                         ORDER BY created_at DESC
                         LIMIT ${need}`;
            try {
                const fetched = await query(sql, paramsData);
                fetched.forEach(r => { r._source = tbl.source; });
                rows = rows.concat(fetched);
            } catch (err) {
                console.error(`[getRemovedDetections] fetch failed for ${tbl.name}:`, err.message);
            }
        }
        rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

        const startIdx = (page - 1) * limit;
        const slice = rows.slice(startIdx, startIdx + limit).map(row => {
            const imageUrlRaw = String(row.imageurl || '');
            const filename = imageUrlRaw.includes('/')
                ? imageUrlRaw.slice(imageUrlRaw.lastIndexOf('/') + 1)
                : imageUrlRaw;
            const typeKey = FOLDER_TO_KEY[row.detection_type || ''] || (row.detection_type || '');
            const meta = parseFilename(filename, typeKey);
            return { row, filename, typeKey, meta, source: row._source };
        });

        const data = slice.map(({ row, filename, typeKey, meta, source: src }) => {
            const detectedAt = meta.date && meta.time
                ? formatDetectedAt(meta.date, meta.time)
                : (row.date_time || '');
            const dateDisplay = meta.date
                ? `${meta.date.slice(6, 8)}-${meta.date.slice(4, 6)}-${meta.date.slice(0, 4)}`
                : '';
            return {
                filename,
                relativePath: filename,
                image_url: normalizeImageUrl(row.imageurl),
                imageUrl: normalizeImageUrl(row.imageurl),
                type: typeKey,
                source: src,
                camera_id: row.camera_id || filename.split('_')[0] || '',
                cameraName: row.camera_name || '',
                camera_name: row.camera_name || '',
                centerName: row.center_name || '',
                centre_name: row.center_name || '',
                city: row.city || '',
                state: row.state || '',
                tcCode: row.tc_code || '',
                category: row.camera_category || '',
                exam_id: row.exam_id,
                shift_id: row.shift_id || meta.shiftId || null,
                uid: row.unique_id || null,
                detected_at: detectedAt,
                date: dateDisplay,
                examDate: dateDisplay,
                count: meta.count,
                confidence: meta.confidence,
                issueType: meta.issueType,
                issueLabel: meta.issueLabel,
                updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
                updated_at: row.updated_at ? new Date(row.updated_at).getTime() : null,
                created_at: row.created_at,
                pushed_to_client: row.pushed_to_client,
                remove_from_client: row.remove_from_client,
                sms_sent: row.sms_sent,
                sms_sent_at: row.sms_sent_at,
            };
        });

        // Resolve shift names (exam_shifts) for the page in ONE query so the
        // removed-detection cards (grid + list) show the shift, mirroring the
        // script-server /detections + /client-detections endpoints.
        const shiftIds = [...new Set(data.map(d => d.shift_id).filter(Boolean))];
        if (shiftIds.length > 0) {
            try {
                const ph = shiftIds.map(() => '?').join(',');
                const shiftRows = await query(
                    `SELECT id, shift_name FROM exam_shifts WHERE id IN (${ph})`,
                    shiftIds,
                );
                const nameMap = new Map(shiftRows.map(r => [r.id, r.shift_name]));
                data.forEach(d => {
                    const nm = d.shift_id ? nameMap.get(d.shift_id) : null;
                    if (nm) { d.shiftName = nm; d.shift_name = nm; }
                });
            } catch (err) {
                console.error('[getRemovedDetections] shift name resolve failed:', err.message);
            }
        }

        return res.json({
            success: true,
            total,
            page,
            limit,
            counts,
            data,
        });
    } catch (err) {
        console.error('[getRemovedDetections] error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch removed detections',
            error: err.message,
        });
    }
};
