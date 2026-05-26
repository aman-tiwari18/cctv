/**
 * DashboardController.js
 * Provides admin dashboard statistics for all exams
 */

'use strict';

const { query } = require('../config/database');

/**
 * Local-IST date string "YYYY-MM-DD" from a Date (defaults to now).
 * Mirrors the pattern in ExecutionController.getPending — avoids toISOString()'s UTC offset.
 */
const getLocalDateStr = (d = new Date()) => [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
].join('-');

/**
 * Local "HH:MM:SS" from a Date (defaults to now).
 */
const getLocalTimeStr = (d = new Date()) => d.toTimeString().substring(0, 8);

/**
 * Given "YYYY-MM-DD", return { start: "YYYY-MM-DD 00:00:00", end: "YYYY-MM-(DD+1) 00:00:00" }
 * for use with `created_at >= ? AND created_at < ?` ranges.
 */
const getDateRangeBounds = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    const fmt = (dt) => `${getLocalDateStr(dt)} ${getLocalTimeStr(dt)}`;
    return { start: fmt(start), end: fmt(end) };
};

/**
 * Given "YYYY-MM-DD" start and end (both inclusive), return
 * { start: "<start> 00:00:00", end: "<end+1> 00:00:00" } for
 * `created_at >= ? AND created_at < ?` ranges spanning the whole window.
 */
const getRangeBounds = (startStr, endStr) => {
    const [ys, ms, ds] = startStr.split('-').map(Number);
    const [ye, me, de] = endStr.split('-').map(Number);
    const start = new Date(ys, ms - 1, ds, 0, 0, 0, 0);
    const end = new Date(ye, me - 1, de + 1, 0, 0, 0, 0);
    const fmt = (dt) => `${getLocalDateStr(dt)} ${getLocalTimeStr(dt)}`;
    return { start: fmt(start), end: fmt(end) };
};

/**
 * Validate a YYYY-MM-DD string; return null if invalid.
 */
const validateDateParam = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y, m, d] = raw.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return raw;
};

/**
 * Return the shift-bracket label for a given time.
 * V2.2: applied to the current local time — rows in /live-exams are labeled
 * with the bracket NOW falls into (not the shift's start_time), so a single
 * long shift moves through "Morning" → "Afternoon" → "Evening" as the day
 * progresses. Returns null if outside 09:00:00-18:00:00.
 *
 * String comparison on zero-padded "HH:MM:SS" is lexically equivalent to
 * time order, so no Date parsing is needed.
 *
 * @param {string} time  "HH:MM:SS"
 * @returns {'Morning' | 'Afternoon' | 'Evening' | null}
 */
const bracketForTime = (time) => {
    if (!time) return null;
    const t = String(time).slice(0, 8);
    if (t >= '09:00:00' && t < '12:00:00') return 'Morning';
    if (t >= '12:00:00' && t < '15:00:00') return 'Afternoon';
    if (t >= '15:00:00' && t < '18:00:00') return 'Evening';
    return null;
};

/**
 * GET /api/dashboard/admin-stats
 * Returns detection statistics for admin dashboard (all exams)
 */
exports.getAdminDashboardStats = async (req, res) => {
    try {
        const { timeRange = '24h' } = req.query;

        console.log('[AdminDashboard] TimeRange:', timeRange);

        // Calculate date filter based on timeRange
        let dateCondition = '';
        const now = new Date();
        
        switch (timeRange) {
            case '24h':
                const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                dateCondition = `AND created_at >= '${last24h.toISOString().slice(0, 19).replace('T', ' ')}'`;
                break;
            case '7d':
                const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                dateCondition = `AND created_at >= '${last7d.toISOString().slice(0, 19).replace('T', ' ')}'`;
                break;
            case '30d':
                const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                dateCondition = `AND created_at >= '${last30d.toISOString().slice(0, 19).replace('T', ' ')}'`;
                break;
            case '90d':
                const last90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                dateCondition = `AND created_at >= '${last90d.toISOString().slice(0, 19).replace('T', ' ')}'`;
                break;
            case 'all':
            default:
                dateCondition = ''; // No date filter
                break;
        }

        // Get all active exams (admin sees everything)
        const exams = await query(`
            SELECT id, exam_name, exam_body, start_date, end_date, link_type
            FROM exams
            WHERE is_active = 1
        `);
        
        if (!exams || exams.length === 0) {
            return res.json({
                success: true,
                data: {
                    active_exams: 0,
                    total_shifts: 0,
                    total_cameras: 0,
                    total_detections: 0,
                    detection_distribution: [],
                    exam_status: { completed: 0, in_progress: 0, pending: 0 }
                }
            });
        }

        const examIds = exams.map(e => e.id);

        // Get total shifts - use idx_exam_active_shift index
        const shiftsResult = await query(`
            SELECT COUNT(DISTINCT id) as count
            FROM exam_shifts USE INDEX (idx_exam_active_shift)
            WHERE exam_id IN (?) AND is_active = 1
        `, [examIds]);

        // Get total cameras - use idx_exam_id and idx_exam_active_rtsp indexes
        const hlsCameras = await query(`SELECT COUNT(*) as count FROM camera_links_hls USE INDEX (idx_exam_id) WHERE exam_id IN (?) AND is_active = 1`, [examIds]);
        const rtspCameras = await query(`SELECT COUNT(*) as count FROM camera_links_rtsp USE INDEX (idx_exam_active_rtsp) WHERE exam_id IN (?) AND is_active = 1`, [examIds]);
        const totalCameras = (hlsCameras[0]?.count || 0) + (rtspCameras[0]?.count || 0);

        // Get detection counts by type with accuracy calculation
        const detectionDistribution = [];
        
        // Group exams by link_type
        const hlsExams = exams.filter(e => e.link_type === 'HLS').map(e => e.id);
        const rtspExams = exams.filter(e => e.link_type === 'RTSP').map(e => e.id);
        
        // Query HLS detections if there are HLS exams
        // Uses idx_exam_shift_push (exam_id, shift_id, pushed_to_client, created_at)
        // PERFECT composite index covering all WHERE conditions
        if (hlsExams.length > 0) {
            const hlsDetections = await query(`
                SELECT 
                    detection_type,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
                    SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
                FROM camera_report_hls USE INDEX (idx_exam_shift_push)
                WHERE exam_id IN (?) ${dateCondition}
                GROUP BY detection_type
            `, [hlsExams]);
            
            hlsDetections.forEach(row => {
                const existing = detectionDistribution.find(d => d.type === row.detection_type);
                if (existing) {
                    existing.total_count += row.total_count;
                    existing.pushed_count += row.pushed_count;
                    existing.removed_count += row.removed_count;
                } else {
                    detectionDistribution.push({
                        type: row.detection_type || 'unknown',
                        total_count: row.total_count,
                        pushed_count: row.pushed_count,
                        removed_count: row.removed_count
                    });
                }
            });
        }
        
        // Query RTSP detections if there are RTSP exams
        // Uses idx_exam_shift_time_rtsp (exam_id, shift_id, created_at)
        // BETTER than idx_exam_shift - includes created_at for optimal date filtering
        if (rtspExams.length > 0) {
            const rtspDetections = await query(`
                SELECT 
                    detection_type,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
                    SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
                FROM camera_report_rtsp USE INDEX (idx_exam_shift_time_rtsp)
                WHERE exam_id IN (?) ${dateCondition}
                GROUP BY detection_type
            `, [rtspExams]);
            
            rtspDetections.forEach(row => {
                const existing = detectionDistribution.find(d => d.type === row.detection_type);
                if (existing) {
                    existing.total_count += row.total_count;
                    existing.pushed_count += row.pushed_count;
                    existing.removed_count += row.removed_count;
                } else {
                    detectionDistribution.push({
                        type: row.detection_type || 'unknown',
                        total_count: row.total_count,
                        pushed_count: row.pushed_count,
                        removed_count: row.removed_count
                    });
                }
            });
        }
        
        // Calculate accuracy for each detection type
        const detectionDistributionWithAccuracy = detectionDistribution.map(d => ({
            type: d.type,
            count: d.total_count,
            pushed_count: d.pushed_count,
            removed_count: d.removed_count,
            accuracy: d.total_count > 0 ? ((d.pushed_count / d.total_count) * 100).toFixed(2) : 0
        }));
        
        const totalDetections = detectionDistribution.reduce((sum, d) => sum + d.total_count, 0);

        // Calculate exam status based on exam dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const examStatus = exams.reduce((acc, exam) => {
            if (!exam.start_date || !exam.end_date) {
                acc.pending++;
                return acc;
            }
            
            const startDate = new Date(exam.start_date);
            const endDate = new Date(exam.end_date);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);
            
            if (today > endDate) {
                acc.completed++;
            } else if (today >= startDate && today <= endDate) {
                acc.in_progress++;
            } else if (today < startDate) {
                acc.pending++;
            }
            
            return acc;
        }, { completed: 0, in_progress: 0, pending: 0 });

        res.json({
            success: true,
            data: {
                active_exams: exams.length,
                total_shifts: shiftsResult[0]?.count || 0,
                total_cameras: totalCameras,
                total_detections: totalDetections,
                detection_distribution: detectionDistributionWithAccuracy,
                exam_status: examStatus
            }
        });

    } catch (error) {
        console.error('[DashboardController] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch admin dashboard statistics',
            error: error.message
        });
    }
};


/**
 * GET /api/dashboard/overview?date=YYYY-MM-DD
 * Feeds the 4 Performance Overview cards + Detection Distribution chart on the new dashboard.
 * date defaults to today (local IST). Filters cards + chart by that calendar day.
 */
exports.getOverview = async (req, res) => {
    try {
        // V2.3: resolve a [startDate, endDate] window (both inclusive YYYY-MM-DD).
        // Priority: start_date+end_date → date → today.
        const startParam = validateDateParam(req.query.start_date);
        const endParam   = validateDateParam(req.query.end_date);
        const dateParam  = validateDateParam(req.query.date);
        let startDate, endDate;
        if (startParam && endParam) {
            startDate = startParam;
            endDate   = endParam;
        } else if (dateParam) {
            startDate = endDate = dateParam;
        } else {
            startDate = endDate = getLocalDateStr();
        }
        if (startDate > endDate) {
            const tmp = startDate;
            startDate = endDate;
            endDate = tmp;
        }
        const nowTime = getLocalTimeStr();
        const { start: dateStart, end: dateEnd } = getRangeBounds(startDate, endDate);

        // Q1: Exam IDs overlapping the queried range (source of `total` AND scope
        // for cameras/detections). An exam overlaps [startDate, endDate] iff its
        // start_date <= endDate AND end_date >= startDate.
        const activeExamsP = query(
            `SELECT id FROM exams
             WHERE is_active = 1
               AND start_date IS NOT NULL AND end_date IS NOT NULL
               AND start_date <= ? AND end_date >= ?`,
            [endDate, startDate]
        );

        // Q1b: Ongoing count — exams overlapping the range that ALSO have a shift
        // currently in time window NOW. BETWEEN start_time AND end_time is inclusive;
        // assumes same-day shifts (no overnight wraparound).
        const ongoingP = query(
            `SELECT COUNT(DISTINCT es.exam_id) AS ongoing
             FROM exam_shifts es
             JOIN exams e ON e.id = es.exam_id
             WHERE e.is_active = 1
               AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
               AND e.start_date <= ? AND e.end_date >= ?
               AND es.is_active = 1
               AND ? BETWEEN es.start_time AND es.end_time`,
            [endDate, startDate, nowTime]
        );

        // Q5: Scripts breakdown for assignments whose assignment_date falls in the range.
        // V2 response renames: run→running, pend→scheduled, done→completed.
        const scriptsP = query(
            `SELECT COUNT(*) AS planned_today,
                    SUM(CASE WHEN status = 'RUNNING'   THEN 1 ELSE 0 END) AS running,
                    SUM(CASE WHEN status = 'PENDING'   THEN 1 ELSE 0 END) AS scheduled,
                    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
             FROM shift_script_assignments
             WHERE assignment_date BETWEEN ? AND ? AND is_active = TRUE`,
            [startDate, endDate]
        );

        const [activeExams, ongoingResult, scripts] = await Promise.all([
            activeExamsP, ongoingP, scriptsP,
        ]);

        const activeExamIds = activeExams.map((e) => e.id);

        // If no live exams, skip the per-exam-scoped queries
        let camerasAgg = { total: 0, acc: 0, failed_to_classify: 0 };
        let detectionsAgg = { pushed: 0, removed: 0 };
        let distribution = [];

        if (activeExamIds.length > 0) {
            // Q3 + Q4: Cameras HLS + RTSP
            const hlsCamsP = query(
                `SELECT COUNT(*) AS total,
                        SUM(CASE WHEN LOWER(status) = 'accessible' THEN 1 ELSE 0 END) AS acc,
                        SUM(CASE WHEN classification IS NULL OR classification = '' THEN 1 ELSE 0 END) AS failed_to_classify
                 FROM camera_links_hls
                 WHERE exam_id IN (?) AND is_active = 1`,
                [activeExamIds]
            );
            const rtspCamsP = query(
                `SELECT COUNT(*) AS total,
                        SUM(CASE WHEN LOWER(status) = 'accessible' THEN 1 ELSE 0 END) AS acc,
                        SUM(CASE WHEN classification IS NULL OR classification = '' THEN 1 ELSE 0 END) AS failed_to_classify
                 FROM camera_links_rtsp
                 WHERE exam_id IN (?) AND is_active = 1`,
                [activeExamIds]
            );

            // Q6 + Q7: Detections HLS + RTSP for date range
            const hlsDetP = query(
                `SELECT SUM(CASE WHEN pushed_to_client = 1   THEN 1 ELSE 0 END) AS pushed,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed
                 FROM camera_report_hls
                 WHERE exam_id IN (?) AND created_at >= ? AND created_at < ?`,
                [activeExamIds, dateStart, dateEnd]
            );
            const rtspDetP = query(
                `SELECT SUM(CASE WHEN pushed_to_client = 1   THEN 1 ELSE 0 END) AS pushed,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed
                 FROM camera_report_rtsp
                 WHERE exam_id IN (?) AND created_at >= ? AND created_at < ?`,
                [activeExamIds, dateStart, dateEnd]
            );

            // Q8: Distribution HLS + RTSP grouped by detection_type
            const hlsDistP = query(
                `SELECT detection_type,
                        COUNT(*) AS total_count,
                        SUM(CASE WHEN pushed_to_client = 1   THEN 1 ELSE 0 END) AS pushed_count,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed_count
                 FROM camera_report_hls
                 WHERE exam_id IN (?) AND created_at >= ? AND created_at < ?
                 GROUP BY detection_type`,
                [activeExamIds, dateStart, dateEnd]
            );
            const rtspDistP = query(
                `SELECT detection_type,
                        COUNT(*) AS total_count,
                        SUM(CASE WHEN pushed_to_client = 1   THEN 1 ELSE 0 END) AS pushed_count,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed_count
                 FROM camera_report_rtsp
                 WHERE exam_id IN (?) AND created_at >= ? AND created_at < ?
                 GROUP BY detection_type`,
                [activeExamIds, dateStart, dateEnd]
            );

            const [hlsCams, rtspCams, hlsDet, rtspDet, hlsDist, rtspDist] = await Promise.all([
                hlsCamsP, rtspCamsP, hlsDetP, rtspDetP, hlsDistP, rtspDistP,
            ]);

            const sumCam = (a, b) => ({
                total: Number(a?.total || 0) + Number(b?.total || 0),
                acc: Number(a?.acc || 0) + Number(b?.acc || 0),
                failed_to_classify: Number(a?.failed_to_classify || 0) + Number(b?.failed_to_classify || 0),
            });
            camerasAgg = sumCam(hlsCams[0], rtspCams[0]);

            detectionsAgg = {
                pushed: Number(hlsDet[0]?.pushed || 0) + Number(rtspDet[0]?.pushed || 0),
                removed: Number(hlsDet[0]?.removed || 0) + Number(rtspDet[0]?.removed || 0),
            };

            // Merge distribution rows by detection_type
            const distMap = new Map();
            const accumulate = (rows) => {
                rows.forEach((r) => {
                    const type = r.detection_type || 'unknown';
                    const cur = distMap.get(type) || { type, count: 0, pushed_count: 0, removed_count: 0 };
                    cur.count += Number(r.total_count || 0);
                    cur.pushed_count += Number(r.pushed_count || 0);
                    cur.removed_count += Number(r.removed_count || 0);
                    distMap.set(type, cur);
                });
            };
            accumulate(hlsDist);
            accumulate(rtspDist);
            distribution = Array.from(distMap.values()).map((d) => ({
                ...d,
                accuracy: d.count > 0 ? ((d.pushed_count / d.count) * 100).toFixed(2) : '0.00',
            }));
        }

        // V2: total = on-today count (= activeExams.length). ongoing = currently live by time.
        const total = activeExams.length;
        const ongoing = Number(ongoingResult[0]?.ongoing || 0);

        res.json({
            success: true,
            data: {
                date: endDate,
                start_date: startDate,
                end_date: endDate,
                total_exams: {
                    total,
                    ongoing,
                },
                cameras: {
                    total: camerasAgg.total,
                    accessible: camerasAgg.acc,
                    unclassified: camerasAgg.failed_to_classify,
                },
                scripts: {
                    planned_today: Number(scripts[0]?.planned_today || 0),
                    running:       Number(scripts[0]?.running       || 0),
                    scheduled:     Number(scripts[0]?.scheduled     || 0),
                    completed:     Number(scripts[0]?.completed     || 0),
                },
                detections: {
                    today: detectionsAgg.pushed + detectionsAgg.removed,
                    pushed_to_client: detectionsAgg.pushed,
                    false_detection: detectionsAgg.removed,
                },
                detection_distribution: distribution,
            },
        });

    } catch (error) {
        console.error('[DashboardController.getOverview] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard overview',
            error: error.message,
        });
    }
};


/**
 * GET /api/dashboard/live-exams?page=1&limit=10&exam_id=<optional>
 * Feeds the Live Exam Table. V2.2 (2026-05-21): returns (exam, shift) rows
 * where the exam is live by date today AND the current local time falls
 * inside the shift's [start_time, end_time] window. Per-row `shift_bracket`
 * label is computed from the CURRENT TIME (Morning/Afternoon/Evening), so the
 * same shift gets relabeled as the day progresses through the brackets.
 */
exports.getLiveExams = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const offset = (page - 1) * limit;
        const examIdFilter = req.query.exam_id ? parseInt(req.query.exam_id, 10) : null;

        const todayDate = getLocalDateStr();
        const nowTime = getLocalTimeStr();
        const { start: todayStart, end: tomorrowStart } = getDateRangeBounds(todayDate);

        // V2.2: filter to shifts currently in their time window AND
        // label by the bracket the CURRENT time falls in (not the shift's start_time).
        const currentBracket = bracketForTime(nowTime);

        const liveWhere = `
            WHERE e.is_active = 1 AND es.is_active = 1
              AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
              AND ? BETWEEN e.start_date AND e.end_date
              AND ? BETWEEN es.start_time AND es.end_time
              ${examIdFilter ? 'AND e.id = ?' : ''}
        `;

        const baseParams = [todayDate, nowTime];
        if (examIdFilter) baseParams.push(examIdFilter);

        // Count query (parallel with row driver)
        const countP = query(
            `SELECT COUNT(*) AS total
             FROM exam_shifts es
             JOIN exams e ON e.id = es.exam_id
             ${liveWhere}`,
            baseParams
        );

        // Row driver query (paginated)
        const rowsP = query(
            `SELECT e.id            AS exam_id,
                    e.exam_name,
                    e.link_type,
                    es.id           AS shift_id,
                    es.shift_name,
                    es.start_time,
                    es.end_time
             FROM exam_shifts es
             JOIN exams e ON e.id = es.exam_id
             ${liveWhere}
             ORDER BY e.id, es.start_time
             LIMIT ? OFFSET ?`,
            [...baseParams, limit, offset]
        );

        const [countResult, pageRows] = await Promise.all([countP, rowsP]);
        const total = Number(countResult[0]?.total || 0);
        const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

        if (pageRows.length === 0) {
            return res.json({
                success: true,
                data: { page, limit, total, total_pages: totalPages, rows: [] },
            });
        }

        const examIds = [...new Set(pageRows.map((r) => r.exam_id))];
        const shiftIds = [...new Set(pageRows.map((r) => r.shift_id))];

        // Camera aggregates: HLS keyed by (exam_id, shift_id), with NULL shift_id mapped to -1 for "all shifts"
        const hlsCamsP = query(
            `SELECT exam_id,
                    COALESCE(shift_id, -1) AS shift_id,
                    COUNT(*) AS cameras,
                    SUM(CASE WHEN LOWER(status) = 'accessible' THEN 1 ELSE 0 END) AS running
             FROM camera_links_hls
             WHERE exam_id IN (?) AND is_active = 1
             GROUP BY exam_id, COALESCE(shift_id, -1)`,
            [examIds]
        );
        // RTSP cameras have no shift dim
        const rtspCamsP = query(
            `SELECT exam_id,
                    COUNT(*) AS cameras,
                    SUM(CASE WHEN LOWER(status) = 'accessible' THEN 1 ELSE 0 END) AS running
             FROM camera_links_rtsp
             WHERE exam_id IN (?) AND is_active = 1
             GROUP BY exam_id`,
            [examIds]
        );

        // Detection aggregates today: HLS + RTSP keyed by (exam_id, shift_id)
        const hlsDetP = query(
            `SELECT exam_id, shift_id, COUNT(*) AS detections
             FROM camera_report_hls
             WHERE exam_id IN (?) AND created_at >= ? AND created_at < ?
             GROUP BY exam_id, shift_id`,
            [examIds, todayStart, tomorrowStart]
        );
        const rtspDetP = query(
            `SELECT exam_id, shift_id, COUNT(*) AS detections
             FROM camera_report_rtsp
             WHERE exam_id IN (?) AND created_at >= ? AND created_at < ?
             GROUP BY exam_id, shift_id`,
            [examIds, todayStart, tomorrowStart]
        );

        // V2: Scripts count per shift today
        const scriptsP = query(
            `SELECT shift_id, COUNT(*) AS scripts
             FROM shift_script_assignments
             WHERE shift_id IN (?) AND assignment_date = ? AND is_active = TRUE
             GROUP BY shift_id`,
            [shiftIds, todayDate]
        );

        const [hlsCams, rtspCams, hlsDet, rtspDet, scriptsAgg] = await Promise.all([
            hlsCamsP, rtspCamsP, hlsDetP, rtspDetP, scriptsP,
        ]);

        // Build lookup maps
        const hlsCamMap = new Map(); // "examId::shiftId" -> { cameras, running }
        hlsCams.forEach((r) => {
            hlsCamMap.set(`${r.exam_id}::${r.shift_id}`, {
                cameras: Number(r.cameras || 0),
                running: Number(r.running || 0),
            });
        });
        const rtspCamMap = new Map(); // examId -> { cameras, running }
        rtspCams.forEach((r) => {
            rtspCamMap.set(r.exam_id, {
                cameras: Number(r.cameras || 0),
                running: Number(r.running || 0),
            });
        });
        const hlsDetMap = new Map(); // "examId::shiftId" -> count
        hlsDet.forEach((r) => {
            hlsDetMap.set(`${r.exam_id}::${r.shift_id}`, Number(r.detections || 0));
        });
        const rtspDetMap = new Map(); // "examId::shiftId" -> count
        rtspDet.forEach((r) => {
            rtspDetMap.set(`${r.exam_id}::${r.shift_id}`, Number(r.detections || 0));
        });
        // V2: scripts count per shift_id (Number-keyed to avoid string/number coercion bugs)
        const scriptsMap = new Map();
        scriptsAgg.forEach((r) => {
            scriptsMap.set(Number(r.shift_id), Number(r.scripts || 0));
        });

        // Stitch per page row
        const rows = pageRows.map((r) => {
            let cameras = 0;
            let detections = 0;

            if (String(r.link_type || '').toUpperCase() === 'HLS') {
                const shiftSpecific = hlsCamMap.get(`${r.exam_id}::${r.shift_id}`) || { cameras: 0, running: 0 };
                const allShifts = hlsCamMap.get(`${r.exam_id}::-1`) || { cameras: 0, running: 0 };
                cameras = shiftSpecific.cameras + allShifts.cameras;
                detections = hlsDetMap.get(`${r.exam_id}::${r.shift_id}`) || 0;
            } else {
                const c = rtspCamMap.get(r.exam_id) || { cameras: 0, running: 0 };
                cameras = c.cameras;
                detections = rtspDetMap.get(`${r.exam_id}::${r.shift_id}`) || 0;
            }

            return {
                exam_id: r.exam_id,
                shift_id: r.shift_id,
                date: todayDate,
                exam_name: r.exam_name,
                shift_name: r.shift_name,
                link_type: r.link_type,
                shift_bracket: currentBracket,
                shift_start: r.start_time,
                shift_end: r.end_time,
                cameras,
                scripts: scriptsMap.get(Number(r.shift_id)) || 0,
                detections,
            };
        });

        res.json({
            success: true,
            data: { page, limit, total, total_pages: totalPages, rows },
        });

    } catch (error) {
        console.error('[DashboardController.getLiveExams] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch live exams',
            error: error.message,
        });
    }
};
