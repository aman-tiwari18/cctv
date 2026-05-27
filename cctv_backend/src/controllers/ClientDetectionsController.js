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
    const out = { date: '', time: '', count: null, confidence: null, issueType: '', issueLabel: '' };
    const dt = /(\d{8})_(\d{6})/.exec(stem);
    if (dt) { out.date = dt[1]; out.time = dt[2]; }
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
        const userCompany = req.user?.company_name;

        // Resolve allowed exam_ids for non-ADMIN scoping. The 'service' role
        // (script-server API key) bypasses scoping entirely.
        let allowedExamIds = null;
        if (userRole && userRole !== 'ADMIN' && userRole !== 'service') {
            if (userCompany) {
                let examSql = 'SELECT id FROM exams WHERE is_active = 1';
                const examParams = [];
                if (userCompany === 'EY') {
                    examSql += " AND exam_body IN ('SSC','TCS')";
                } else {
                    examSql += ' AND exam_body = ?';
                    examParams.push(userCompany);
                }
                const exams = await query(examSql, examParams);
                allowedExamIds = exams.map(e => e.id);
                if (allowedExamIds.length === 0) {
                    return res.json({
                        success: true, total: 0, page, limit,
                        counts: emptyCounts(), data: [],
                    });
                }
            }
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

        // Normalize date → "dd/mm/yyyy%" for the date_time LIKE filter.
        // The frontend sends either "YYYY-MM-DD" or "DD-MM-YYYY".
        let dateLike = '';
        let dateYYYYMMDD = '';
        if (rawDate) {
            let y, m, d;
            const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
            const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(rawDate);
            if (iso) { [, y, m, d] = iso; }
            else if (dmy) { [, d, m, y] = dmy; }
            if (y && m && d) {
                dateLike = `${d}/${m}/${y}%`;
                dateYYYYMMDD = `${y}${m}${d}`;
                whereConds.push('date_time LIKE ?');
                whereParams.push(dateLike);
            }
        }

        const whereClause = whereConds.join(' AND ');

        // Per-table fetch cap. Mirrors script-server: ORDER BY created_at DESC
        // LIMIT N — we count + paginate in JS over the merged set rather than
        // doing a UNION ALL with proper LIMIT/OFFSET in SQL. Cap keeps memory
        // bounded; 5000 covers a day's worth for the visible-to-client subset.
        const FETCH_CAP = 5000;

        const tables = [];
        if (source !== 'rtsp') tables.push({ name: 'camera_report_hls', source: 'hls' });
        if (source !== 'hls') tables.push({ name: 'camera_report_rtsp', source: 'rtsp' });

        let rows = [];
        for (const tbl of tables) {
            const sql = `SELECT id, exam_id, shift_id, city, center_name, camera_id,
                                camera_name, ${tbl.source === 'rtsp' ? 'device_id, camera_no,' : 'camera_category, ch_code,'}
                                tc_code, state, camera_status, events, date_time,
                                imageurl, detection_type, unique_id, created_at,
                                pushed_to_client, remove_from_client, updated_at
                         FROM ${tbl.name}
                         WHERE ${whereClause}
                         ORDER BY created_at DESC
                         LIMIT ${FETCH_CAP}`;
            try {
                const fetched = await query(sql, whereParams);
                fetched.forEach(r => { r._source = tbl.source; });
                rows = rows.concat(fetched);
            } catch (err) {
                console.error(`[getRemovedDetections] fetch failed for ${tbl.name}:`, err.message);
            }
        }

        // Merge-sort by created_at desc across both tables.
        rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

        // Build counts over ALL types (sidebar should not collapse when the
        // user toggles a type filter), and apply remaining filters in JS.
        const typeKeys = typeParam ? typeParam.split(',').map(s => s.trim()).filter(Boolean) : [];
        const typeKeySet = new Set(typeKeys);
        const counts = emptyCounts();

        const filtered = [];
        for (const row of rows) {
            const imageUrlRaw = String(row.imageurl || '');
            const filename = imageUrlRaw.includes('/')
                ? imageUrlRaw.slice(imageUrlRaw.lastIndexOf('/') + 1)
                : imageUrlRaw;
            const folderName = row.detection_type || '';
            const typeKey = FOLDER_TO_KEY[folderName] || folderName;

            // Parse filename for date/time/count/confidence/issueType
            const meta = parseFilename(filename, typeKey);

            // Date filter via filename (more accurate than date_time on some
            // legacy rows). date_time LIKE already ran in SQL, but a row may
            // have a stale date_time — filename is authoritative when present.
            if (dateYYYYMMDD && meta.date && !meta.date.startsWith(dateYYYYMMDD)) continue;

            // Time range filter (HH:MM strings).
            if ((startTime || endTime) && meta.time && meta.time.length >= 4) {
                const hm = `${meta.time.slice(0, 2)}:${meta.time.slice(2, 4)}`;
                if (startTime && hm < startTime) continue;
                if (endTime && hm > endTime) continue;
            }

            // Search across DB columns + filename
            if (search) {
                const hay = [
                    row.camera_name, row.center_name, row.city, row.state,
                    row.tc_code, row.ch_code, row.device_id, row.camera_no, filename,
                ].map(v => String(v || '').toLowerCase()).join(' ');
                if (!hay.includes(search)) continue;
            }

            // Count BEFORE applying the type filter (so sidebar stays full).
            if (typeKey in counts) counts[typeKey] += 1;
            if (typeKeys.length > 0 && !typeKeySet.has(typeKey)) continue;

            filtered.push({ row, filename, typeKey, meta, source: row._source });
        }

        const total = filtered.length;
        const startIdx = (page - 1) * limit;
        const slice = filtered.slice(startIdx, startIdx + limit);

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
                shift_id: row.shift_id,
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
            };
        });

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
