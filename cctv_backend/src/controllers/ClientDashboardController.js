/**
 * ClientDashboardController.js
 * Provides dashboard statistics with company-based filtering
 */

'use strict';

const { query } = require('../config/database');

// ============================================================================
// Helpers used by the new client dashboard endpoints (overview, live-exams).
// Date logic mirrors DashboardController.js so "today" is consistent across
// admin and client endpoints. Kept local to this file to avoid cross-controller
// coupling — same pattern as the existing controllers in this codebase.
// ============================================================================

/**
 * Local-IST date string "YYYY-MM-DD" from a Date (defaults to now).
 * Avoids toISOString()'s UTC offset which shifts the date for IST early hours.
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
 * Return the shift-bracket label for a given shift start_time.
 * V2.1: bracket is a per-row display label, not a filter. Returns null if
 * the start_time falls outside the 09:00:00-18:00:00 envelope.
 *
 * String comparison on zero-padded "HH:MM:SS" is lexically equivalent to
 * time order. Mirrors the helper in DashboardController.js.
 *
 * @param {string} startTime  "HH:MM:SS"
 * @returns {'Morning' | 'Afternoon' | 'Evening' | null}
 */
const bracketForStartTime = (startTime) => {
    if (!startTime) return null;
    const t = String(startTime).slice(0, 8);
    if (t >= '09:00:00' && t < '12:00:00') return 'Morning';
    if (t >= '12:00:00' && t < '15:00:00') return 'Afternoon';
    if (t >= '15:00:00' && t < '18:00:00') return 'Evening';
    return null;
};

/**
 * Build the company filter clause + params, mirroring the existing pattern used
 * in getClientDashboardStats / getCameraAccessibility / etc.
 *
 * - ADMIN or missing company_name: no filter (sees all). NULL/empty company_name
 *   case mirrors existing behavior — flagged for separate hardening.
 * - 'EY' company: special-cased to see SSC + TCS exam bodies.
 * - Other companies: exact match on exam_body.
 *
 * @param {string} userRole
 * @param {string} userCompanyName
 * @param {string} examColumnAlias  Optional SQL column reference, e.g. "e.exam_body" when joining.
 *                                  Defaults to "exam_body" for unqualified queries.
 * @returns {{ clause: string, params: any[] }}
 */
const buildCompanyFilter = (userRole, userCompanyName, examColumnAlias = 'exam_body') => {
    if (userRole === 'ADMIN' || !userCompanyName) {
        return { clause: '', params: [] };
    }
    if (userCompanyName === 'EY') {
        return { clause: ` AND ${examColumnAlias} IN ('SSC','TCS')`, params: [] };
    }
    return { clause: ` AND ${examColumnAlias} = ?`, params: [userCompanyName] };
};

/**
 * GET /api/client-dashboard/stats
 * Returns detection statistics for dashboard
 */
exports.getClientDashboardStats = async (req, res) => {
    try {
        const userCompanyName = req.user?.company_name;
        const userRole = req.user?.role;
        const { timeRange = '24h' } = req.query;

        console.log('[ClientDashboard] User role:', userRole, 'Company:', userCompanyName, 'TimeRange:', timeRange);

        // Calculate date filter based on timeRange
        let dateFilter = '';
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

        // Build exam filter
        let examQuery = 'SELECT id, exam_name, exam_body, link_type, start_date, end_date FROM exams WHERE is_active = 1';
        let queryParams = [];

        if (userRole !== 'ADMIN' && userCompanyName) {
            if (userCompanyName === 'EY') {
                examQuery += ` AND exam_body IN ('SSC', 'TCS')`;
            } else {
                examQuery += ` AND exam_body = ?`;
                queryParams.push(userCompanyName);
            }
        }

        const exams = await query(examQuery, queryParams);
        
        if (!exams || exams.length === 0) {
            return res.json({
                success: true,
                data: {
                    active_exams: 0,
                    total_shifts: 0,
                    total_cameras: 0,
                    total_detections: 0,
                    detection_distribution: [],
                    exam_status: { completed: 0, in_progress: 0, failed: 0, pending: 0 },
                    script_distribution: []
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

        // Get total cameras - use idx_exam_id index
        const hlsCameras = await query(`SELECT COUNT(*) as count FROM camera_links_hls USE INDEX (idx_exam_id) WHERE exam_id IN (?) AND is_active = 1`, [examIds]);
        const rtspCameras = await query(`SELECT COUNT(*) as count FROM camera_links_rtsp USE INDEX (idx_exam_active_rtsp) WHERE exam_id IN (?) AND is_active = 1`, [examIds]);
        const totalCameras = (hlsCameras[0]?.count || 0) + (rtspCameras[0]?.count || 0);

        // Get detection counts by type with accuracy calculation
        // For clients: only count pushed_to_client = 1 detections
        // Accuracy = (pushed_count - removed_count) / pushed_count * 100
        const detectionDistribution = [];
        
        // Query HLS detections for user's exams (only pushed to client)
        // Uses idx_exam_shift_push (exam_id, shift_id, pushed_to_client, created_at)
        // This is the PERFECT index for this query - covers all WHERE conditions
        const hlsDetections = await query(`
            SELECT 
                detection_type,
                COUNT(*) as pushed_count,
                SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
            FROM camera_report_hls USE INDEX (idx_exam_shift_push)
            WHERE exam_id IN (?) 
              AND pushed_to_client = 1
              ${dateCondition}
            GROUP BY detection_type
        `, [examIds]);
        
        hlsDetections.forEach(row => {
            detectionDistribution.push({
                type: row.detection_type || 'unknown',
                pushed_count: row.pushed_count,
                removed_count: row.removed_count
            });
        });
        
        // Query RTSP detections for user's exams (only pushed to client)
        // Uses idx_exam_shift_time_rtsp (exam_id, shift_id, created_at)
        // This is BETTER than idx_exam_shift because it includes created_at for date filtering
        const rtspDetections = await query(`
            SELECT 
                detection_type,
                COUNT(*) as pushed_count,
                SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
            FROM camera_report_rtsp USE INDEX (idx_exam_shift_time_rtsp)
            WHERE exam_id IN (?) 
              AND pushed_to_client = 1
              ${dateCondition}
            GROUP BY detection_type
        `, [examIds]);
        
        rtspDetections.forEach(row => {
            const existing = detectionDistribution.find(d => d.type === row.detection_type);
            if (existing) {
                existing.pushed_count += row.pushed_count;
                existing.removed_count += row.removed_count;
            } else {
                detectionDistribution.push({
                    type: row.detection_type || 'unknown',
                    pushed_count: row.pushed_count,
                    removed_count: row.removed_count
                });
            }
        });
        
        // Calculate accuracy for each detection type
        // Client-side accuracy = (pushed_count - removed_count) / pushed_count * 100
        const detectionDistributionWithAccuracy = detectionDistribution.map(d => {
            const accurateCount = d.pushed_count - d.removed_count;
            const accuracy = d.pushed_count > 0 ? ((accurateCount / d.pushed_count) * 100).toFixed(2) : 0;
            
            return {
                type: d.type,
                count: d.pushed_count, // Total pushed to client
                pushed_count: d.pushed_count,
                removed_count: d.removed_count,
                accurate_count: accurateCount, // Pushed - Removed
                accuracy: parseFloat(accuracy)
            };
        });
        
        // Total detections = sum of all pushed_to_client
        const totalDetections = detectionDistribution.reduce((sum, d) => sum + d.pushed_count, 0);

        // Get all available scripts
        const allScripts = await query(`
            SELECT id, name, script_id
            FROM scripts
            WHERE is_active = 1
            ORDER BY name
        `);

        // Get script assignments with shift and exam info
        const scriptAssignments = await query(`
            SELECT 
                ssa.id,
                ssa.shift_id,
                ssa.script_id,
                ssa.status,
                ssa.assignment_date,
                ssa.custom_start_time,
                ssa.custom_end_time,
                es.shift_name,
                es.exam_id,
                s.name as script_name,
                s.script_id as script_type,
                e.exam_name,
                e.start_date,
                e.end_date
            FROM shift_script_assignments ssa
            JOIN exam_shifts es ON ssa.shift_id = es.id
            JOIN scripts s ON ssa.script_id = s.id
            JOIN exams e ON es.exam_id = e.id
            WHERE es.exam_id IN (?) AND ssa.is_active = 1
            ORDER BY ssa.assignment_date DESC, es.shift_name
        `, [examIds]);

        // Calculate exam status based on exam dates
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day
        
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
                // Exam has ended
                acc.completed++;
            } else if (today >= startDate && today <= endDate) {
                // Exam is currently running
                acc.in_progress++;
            } else if (today < startDate) {
                // Exam hasn't started yet
                acc.pending++;
            }
            
            return acc;
        }, { completed: 0, in_progress: 0, pending: 0 });

        // Group scripts by shift for distribution
        const scriptsByShift = {};
        scriptAssignments.forEach(sa => {
            const key = sa.shift_name;
            if (!scriptsByShift[key]) {
                scriptsByShift[key] = {
                    shift_name: sa.shift_name,
                    exam_id: sa.exam_id,
                    exam_name: sa.exam_name,
                    scripts: []
                };
            }
            scriptsByShift[key].scripts.push({
                script_name: sa.script_name,
                script_type: sa.script_type,
                status: sa.status,
                assignment_date: sa.assignment_date,
                custom_start_time: sa.custom_start_time,
                custom_end_time: sa.custom_end_time
            });
        });

        // Get unique dates from exams
        const examDates = [];
        exams.forEach(exam => {
            if (exam.start_date && exam.end_date) {
                const start = new Date(exam.start_date);
                const end = new Date(exam.end_date);
                const current = new Date(start);
                
                while (current <= end) {
                    const dateStr = current.toISOString().split('T')[0];
                    if (!examDates.includes(dateStr)) {
                        examDates.push(dateStr);
                    }
                    current.setDate(current.getDate() + 1);
                }
            }
        });
        examDates.sort();

        res.json({
            success: true,
            data: {
                active_exams: exams.length,
                total_shifts: shiftsResult[0]?.count || 0,
                total_cameras: totalCameras,
                total_detections: totalDetections,
                detection_distribution: detectionDistributionWithAccuracy,
                exam_status: examStatus,
                script_distribution: Object.values(scriptsByShift),
                all_scripts: allScripts,
                exam_dates: examDates,
                exams: exams.map(e => ({ 
                    id: e.id, 
                    name: e.exam_name, 
                    body: e.exam_body,
                    link_type: e.link_type,
                    start_date: e.start_date,
                    end_date: e.end_date
                }))
            }
        });

    } catch (error) {
        console.error('[ClientDashboardController] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
};

/**
 * GET /api/client-dashboard/camera-accessibility
 * Returns camera accessibility statistics filtered by exam, shift, and date
 */
exports.getCameraAccessibility = async (req, res) => {
    try {
        const { exam_id, shift_id, exam_date } = req.query;
        const userCompanyName = req.user?.company_name;
        const userRole = req.user?.role;

        console.log('[CameraAccessibility] Filters:', { exam_id, shift_id, exam_date, userCompanyName, userRole });

        // Build exam filter based on user role
        let examFilter = '';
        let examParams = [];

        if (userRole !== 'ADMIN' && userCompanyName) {
            if (userCompanyName === 'EY') {
                examFilter = ` AND e.exam_body IN ('SSC', 'TCS')`;
            } else {
                examFilter = ` AND e.exam_body = ?`;
                examParams.push(userCompanyName);
            }
        }

        // Build additional filters
        let hlsFilters = [];
        let rtspFilters = [];
        let hlsParams = [...examParams];
        let rtspParams = [...examParams];

        if (exam_id && exam_id !== 'all') {
            hlsFilters.push('hls.exam_id = ?');
            rtspFilters.push('rtsp.exam_id = ?');
            hlsParams.push(exam_id);
            rtspParams.push(exam_id);
        }

        if (shift_id && shift_id !== 'all') {
            hlsFilters.push('hls.shift_id = ?');
            hlsParams.push(shift_id);
            // RTSP doesn't have shift_id, so we skip this filter for RTSP
        }

        if (exam_date && exam_date !== 'all') {
            hlsFilters.push('hls.exam_date = ?');
            hlsParams.push(exam_date);
            // RTSP doesn't have exam_date, so we skip this filter for RTSP
        }

        const hlsWhereClause = hlsFilters.length > 0 ? ` AND ${hlsFilters.join(' AND ')}` : '';
        const rtspWhereClause = rtspFilters.length > 0 ? ` AND ${rtspFilters.join(' AND ')}` : '';

        // Query HLS cameras
        const hlsCameras = await query(`
            SELECT 
                hls.id,
                hls.exam_id,
                hls.shift_id,
                hls.exam_date,
                hls.centre_name,
                hls.camera_name,
                hls.city,
                hls.state,
                hls.status,
                e.exam_name,
                e.exam_body
            FROM camera_links_hls hls
            JOIN exams e ON hls.exam_id = e.id
            WHERE hls.is_active = 1 ${examFilter}${hlsWhereClause}
        `, hlsParams);

        // Query RTSP cameras
        const rtspCameras = await query(`
            SELECT 
                rtsp.id,
                rtsp.exam_id,
                rtsp.centre_name,
                rtsp.camera_name,
                rtsp.city,
                rtsp.state,
                rtsp.status,
                e.exam_name,
                e.exam_body
            FROM camera_links_rtsp rtsp
            JOIN exams e ON rtsp.exam_id = e.id
            WHERE rtsp.is_active = 1 ${examFilter}${rtspWhereClause}
        `, rtspParams);

        // Combine both camera types
        const allCameras = [...hlsCameras, ...rtspCameras];

        // Count accessible vs non-accessible
        // Status field: 'accessible' = accessible, anything else = non-accessible
        const accessible = allCameras.filter(cam => 
            cam.status && cam.status.toLowerCase() === 'accessible'
        ).length;
        const nonAccessible = allCameras.length - accessible;

        // Calculate percentages
        const total = allCameras.length;
        const accessiblePercent = total > 0 ? ((accessible / total) * 100).toFixed(1) : 0;
        const nonAccessiblePercent = total > 0 ? ((nonAccessible / total) * 100).toFixed(1) : 0;

        // Get available shifts for the selected exam
        let shifts = [];
        if (exam_id && exam_id !== 'all') {
            shifts = await query(`
                SELECT id, shift_name
                FROM exam_shifts
                WHERE exam_id = ? AND is_active = 1
                ORDER BY shift_name
            `, [exam_id]);
        }

        // Get available dates for the selected exam
        let dates = [];
        if (exam_id && exam_id !== 'all') {
            const examData = await query(`
                SELECT start_date, end_date
                FROM exams
                WHERE id = ?
            `, [exam_id]);

            if (examData.length > 0 && examData[0].start_date && examData[0].end_date) {
                const start = new Date(examData[0].start_date);
                const end = new Date(examData[0].end_date);
                const current = new Date(start);

                while (current <= end) {
                    dates.push(current.toISOString().split('T')[0]);
                    current.setDate(current.getDate() + 1);
                }
            }
        }

        res.json({
            success: true,
            data: {
                total_cameras: total,
                accessible: accessible,
                non_accessible: nonAccessible,
                accessible_percent: parseFloat(accessiblePercent),
                non_accessible_percent: parseFloat(nonAccessiblePercent),
                available_shifts: shifts,
                available_dates: dates,
                cameras: allCameras
            }
        });

    } catch (error) {
        console.error('[CameraAccessibility] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch camera accessibility data',
            error: error.message
        });
    }
};

/**
 * GET /api/client-dashboard/camera-accessibility/download
 * Downloads camera accessibility data as Excel file
 */
exports.downloadCameraAccessibility = async (req, res) => {
    try {
        const { exam_id, shift_id, exam_date, type = 'all' } = req.query;
        const userCompanyName = req.user?.company_name;
        const userRole = req.user?.role;

        console.log('[CameraAccessibilityDownload] Filters:', { exam_id, shift_id, exam_date, type, userCompanyName, userRole });

        // Build exam filter based on user role
        let examFilter = '';
        let examParams = [];

        if (userRole !== 'ADMIN' && userCompanyName) {
            if (userCompanyName === 'EY') {
                examFilter = ` AND e.exam_body IN ('SSC', 'TCS')`;
            } else {
                examFilter = ` AND e.exam_body = ?`;
                examParams.push(userCompanyName);
            }
        }

        // Build additional filters
        let hlsFilters = [];
        let rtspFilters = [];
        let hlsParams = [...examParams];
        let rtspParams = [...examParams];

        if (exam_id && exam_id !== 'all') {
            hlsFilters.push('hls.exam_id = ?');
            rtspFilters.push('rtsp.exam_id = ?');
            hlsParams.push(exam_id);
            rtspParams.push(exam_id);
        }

        if (shift_id && shift_id !== 'all') {
            hlsFilters.push('hls.shift_id = ?');
            hlsParams.push(shift_id);
        }

        if (exam_date && exam_date !== 'all') {
            hlsFilters.push('hls.exam_date = ?');
            hlsParams.push(exam_date);
        }

        const hlsWhereClause = hlsFilters.length > 0 ? ` AND ${hlsFilters.join(' AND ')}` : '';
        const rtspWhereClause = rtspFilters.length > 0 ? ` AND ${rtspFilters.join(' AND ')}` : '';

        // Query HLS cameras
        const hlsCameras = await query(`
            SELECT 
                hls.id,
                hls.exam_id,
                hls.shift_id,
                hls.exam_date,
                hls.centre_name,
                hls.tc_code,
                hls.camera_name,
                hls.ch_code,
                hls.city,
                hls.state,
                hls.status,
                hls.camera_category,
                hls.classification,
                e.exam_name,
                e.exam_body,
                es.shift_name
            FROM camera_links_hls hls
            JOIN exams e ON hls.exam_id = e.id
            LEFT JOIN exam_shifts es ON hls.shift_id = es.id
            WHERE hls.is_active = 1 ${examFilter}${hlsWhereClause}
            ORDER BY hls.exam_date, hls.shift_id, hls.centre_name
        `, hlsParams);

        // Query RTSP cameras (no date/shift filtering for RTSP)
        const rtspCameras = await query(`
            SELECT 
                rtsp.id,
                rtsp.exam_id,
                rtsp.centre_name,
                rtsp.tc_code,
                rtsp.camera_name,
                rtsp.device_id,
                rtsp.city,
                rtsp.state,
                rtsp.status,
                rtsp.classification,
                e.exam_name,
                e.exam_body
            FROM camera_links_rtsp rtsp
            JOIN exams e ON rtsp.exam_id = e.id
            WHERE rtsp.is_active = 1 ${examFilter}${rtspWhereClause}
            ORDER BY rtsp.centre_name
        `, rtspParams);

        // Combine and filter by type
        let allCameras = [...hlsCameras, ...rtspCameras];
        
        if (type === 'accessible') {
            allCameras = allCameras.filter(cam => 
                cam.status && cam.status.toLowerCase() === 'accessible'
            );
        } else if (type === 'non_accessible') {
            allCameras = allCameras.filter(cam => 
                !cam.status || cam.status.toLowerCase() !== 'accessible'
            );
        }

        // Generate Excel file using xlsx
        const XLSX = require('xlsx');
        
        // Prepare data for Excel
        const excelData = allCameras.map(camera => ({
            'Exam Name': camera.exam_name,
            'Exam Body': camera.exam_body,
            'Shift': camera.shift_name || 'N/A',
            'Date': camera.exam_date || 'N/A',
            'Centre Name': camera.centre_name,
            'TC Code': camera.tc_code,
            'Camera Name': camera.camera_name,
            'Camera Code': camera.ch_code || camera.device_id || 'N/A',
            'City': camera.city,
            'State': camera.state,
            'Status': camera.status || 'Unknown',
            'Category': camera.camera_category || 'N/A',
            'Classification': camera.classification || 'N/A',
        }));

        // Create workbook and worksheet
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Camera Accessibility');

        // Set column widths
        const colWidths = [
            { wch: 25 }, // Exam Name
            { wch: 15 }, // Exam Body
            { wch: 15 }, // Shift
            { wch: 12 }, // Date
            { wch: 30 }, // Centre Name
            { wch: 15 }, // TC Code
            { wch: 20 }, // Camera Name
            { wch: 15 }, // Camera Code
            { wch: 15 }, // City
            { wch: 15 }, // State
            { wch: 15 }, // Status
            { wch: 15 }, // Category
            { wch: 15 }, // Classification
        ];
        worksheet['!cols'] = colWidths;

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set response headers
        const filename = `Camera_Accessibility_${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);

        // Send buffer
        res.send(buffer);

    } catch (error) {
        console.error('[CameraAccessibilityDownload] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download camera accessibility data',
            error: error.message
        });
    }
};

/**
 * GET /api/client-dashboard/exam-body/:examBody/details
 * Returns detailed statistics for a specific exam_body
 */
exports.getExamBodyDetails = async (req, res) => {
    try {
        const { examBody } = req.params;
        const { date } = req.query; // Optional date filter (yyyy-mm-dd)
        
        // Get user's company_name and role
        const userCompanyName = req.user?.company_name;
        const userRole = req.user?.role;

        // Check if non-admin user is trying to access unauthorized data
        if (userRole !== 'ADMIN' && userCompanyName) {
            // EY users can access SSC and TCS
            if (userCompanyName === 'EY') {
                if (!['SSC', 'TCS'].includes(examBody)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied. You can only view SSC and TCS data.'
                    });
                }
            } else {
                // Other users can only access their own company data
                if (examBody !== userCompanyName) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied. You can only view your company data.'
                    });
                }
            }
        }

        // Get all exams for this exam_body
        const exams = await query(`
            SELECT 
                id, exam_name, exam_body, link_type, start_date, end_date, is_active
            FROM exams
            WHERE exam_body = ? AND is_active = 1
            ORDER BY exam_name ASC
        `, [examBody]);

        if (!exams || exams.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No active exams found for exam_body: ${examBody}`
            });
        }

        const examIds = exams.map(e => e.id);

        // Build date filter for detections
        let dateFilter = '';
        let dateParams = [examIds];
        if (date) {
            const [y, m, d] = date.split('-');
            const searchDate = `${d}/${m}/${y}`;
            dateFilter = ` AND date_time LIKE CONCAT(?, '%')`;
            dateParams = [examIds, searchDate];
        }

        // Get detections with date filter
        const hlsDetections = await query(`
            SELECT 
                exam_id,
                shift_id,
                detection_type,
                date_time,
                center_name,
                camera_name,
                city,
                state
            FROM camera_report_hls
            WHERE exam_id IN (?)${dateFilter}
        `, dateParams);

        const rtspDetections = await query(`
            SELECT 
                exam_id,
                shift_id,
                detection_type,
                date_time,
                center_name,
                camera_name,
                city,
                state
            FROM camera_report_rtsp
            WHERE exam_id IN (?)${dateFilter}
        `, dateParams);

        const allDetections = [...hlsDetections, ...rtspDetections];

        // Group by exam
        const examDetails = exams.map(exam => {
            const examDetections = allDetections.filter(d => d.exam_id === exam.id);
            
            const detectionCounts = {};
            examDetections.forEach(d => {
                const type = d.detection_type || 'unknown';
                detectionCounts[type] = (detectionCounts[type] || 0) + 1;
            });

            // Group by shift
            const shiftCounts = {};
            examDetections.forEach(d => {
                const shiftId = d.shift_id || 'unknown';
                shiftCounts[shiftId] = (shiftCounts[shiftId] || 0) + 1;
            });

            return {
                exam_id: exam.id,
                exam_name: exam.exam_name,
                link_type: exam.link_type,
                total_detections: examDetections.length,
                detection_counts: detectionCounts,
                shift_counts: shiftCounts
            };
        });

        res.json({
            success: true,
            exam_body: examBody,
            date_filter: date || null,
            exams: examDetails,
            total_detections: allDetections.length
        });

    } catch (error) {
        console.error('[ClientDashboardController] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch exam body details'
        });
    }
};


/**
 * GET /api/client-dashboard/overview?date=YYYY-MM-DD
 * Client (company-scoped) version of /api/dashboard/overview.
 * Returns the 4 Performance Overview cards + Detection Distribution chart,
 * filtered to the requesting user's company (ADMIN sees everything).
 * Response shape is identical to the admin endpoint so the same frontend can swap URLs.
 */
exports.getOverview = async (req, res) => {
    try {
        const userCompanyName = req.user?.company_name;
        const userRole = req.user?.role;
        const date = validateDateParam(req.query.date) || getLocalDateStr();
        const nowTime = getLocalTimeStr();
        const { start: dateStart, end: dateEnd } = getDateRangeBounds(date);

        const companyFilter = buildCompanyFilter(userRole, userCompanyName);
        const companyFilterAliased = buildCompanyFilter(userRole, userCompanyName, 'e.exam_body');

        // Q1: On-today exam IDs scoped to the company filter
        // (V2: source of total_exams.total AND scope for cameras/detections)
        const activeExamsP = query(
            `SELECT id FROM exams
             WHERE is_active = 1
               AND start_date IS NOT NULL AND end_date IS NOT NULL
               AND ? BETWEEN start_date AND end_date${companyFilter.clause}`,
            [date, ...companyFilter.params]
        );

        // Q1b: Ongoing count — exams with at least one shift currently in time window
        const ongoingP = query(
            `SELECT COUNT(DISTINCT es.exam_id) AS ongoing
             FROM exam_shifts es
             JOIN exams e ON e.id = es.exam_id
             WHERE e.is_active = 1
               AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
               AND ? BETWEEN e.start_date AND e.end_date
               AND es.is_active = 1
               AND ? BETWEEN es.start_time AND es.end_time${companyFilterAliased.clause}`,
            [date, nowTime, ...companyFilterAliased.params]
        );

        const [activeExams, ongoingResult] = await Promise.all([activeExamsP, ongoingP]);
        const activeExamIds = activeExams.map((e) => e.id);

        let camerasAgg = { total: 0, acc: 0, failed_to_classify: 0 };
        let detectionsAgg = { pushed: 0, removed: 0 };
        let distribution = [];
        // V2 field names: running/scheduled/completed (was run_count/pend_count/done_count)
        let scriptsAgg = { planned_today: 0, running: 0, scheduled: 0, completed: 0 };

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

            // Q5: Scripts — must JOIN through exam_shifts because shift_script_assignments
            // has no exam_id column. This is the one structural difference from the admin endpoint.
            // V2 renames: run_count→running, pend_count→scheduled, done_count→completed.
            const scriptsP = query(
                `SELECT COUNT(*) AS planned_today,
                        SUM(CASE WHEN ssa.status = 'RUNNING'   THEN 1 ELSE 0 END) AS running,
                        SUM(CASE WHEN ssa.status = 'PENDING'   THEN 1 ELSE 0 END) AS scheduled,
                        SUM(CASE WHEN ssa.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
                 FROM shift_script_assignments ssa
                 JOIN exam_shifts es ON es.id = ssa.shift_id
                 WHERE ssa.assignment_date = ? AND ssa.is_active = TRUE
                   AND es.exam_id IN (?)`,
                [date, activeExamIds]
            );

            // Q6 + Q7: Detections HLS + RTSP for date range.
            // CLIENT VISIBILITY RULE: only rows with pushed_to_client = 1 are visible to a client.
            // Within that set:
            //   - "pushed" (still showing to client) = remove_from_client = 0
            //   - "removed" (retracted after push)   = remove_from_client = 1
            // Total visible today = pushed + removed = strict partition, no double-count.
            const hlsDetP = query(
                `SELECT SUM(CASE WHEN remove_from_client = 0 THEN 1 ELSE 0 END) AS pushed,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed
                 FROM camera_report_hls
                 WHERE exam_id IN (?) AND pushed_to_client = 1
                   AND created_at >= ? AND created_at < ?`,
                [activeExamIds, dateStart, dateEnd]
            );
            const rtspDetP = query(
                `SELECT SUM(CASE WHEN remove_from_client = 0 THEN 1 ELSE 0 END) AS pushed,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed
                 FROM camera_report_rtsp
                 WHERE exam_id IN (?) AND pushed_to_client = 1
                   AND created_at >= ? AND created_at < ?`,
                [activeExamIds, dateStart, dateEnd]
            );

            // Q8: Distribution HLS + RTSP grouped by detection_type — same client visibility rule.
            // total_count = entire pushed-to-client set for that type (= pushed + removed)
            // pushed_count = subset still showing (NOT retracted)
            // removed_count = subset retracted
            const hlsDistP = query(
                `SELECT detection_type,
                        COUNT(*) AS total_count,
                        SUM(CASE WHEN remove_from_client = 0 THEN 1 ELSE 0 END) AS pushed_count,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed_count
                 FROM camera_report_hls
                 WHERE exam_id IN (?) AND pushed_to_client = 1
                   AND created_at >= ? AND created_at < ?
                 GROUP BY detection_type`,
                [activeExamIds, dateStart, dateEnd]
            );
            const rtspDistP = query(
                `SELECT detection_type,
                        COUNT(*) AS total_count,
                        SUM(CASE WHEN remove_from_client = 0 THEN 1 ELSE 0 END) AS pushed_count,
                        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) AS removed_count
                 FROM camera_report_rtsp
                 WHERE exam_id IN (?) AND pushed_to_client = 1
                   AND created_at >= ? AND created_at < ?
                 GROUP BY detection_type`,
                [activeExamIds, dateStart, dateEnd]
            );

            const [hlsCams, rtspCams, scripts, hlsDet, rtspDet, hlsDist, rtspDist] = await Promise.all([
                hlsCamsP, rtspCamsP, scriptsP, hlsDetP, rtspDetP, hlsDistP, rtspDistP,
            ]);

            const sumCam = (a, b) => ({
                total: Number(a?.total || 0) + Number(b?.total || 0),
                acc: Number(a?.acc || 0) + Number(b?.acc || 0),
                failed_to_classify: Number(a?.failed_to_classify || 0) + Number(b?.failed_to_classify || 0),
            });
            camerasAgg = sumCam(hlsCams[0], rtspCams[0]);

            scriptsAgg = {
                planned_today: Number(scripts[0]?.planned_today || 0),
                running:       Number(scripts[0]?.running       || 0),
                scheduled:     Number(scripts[0]?.scheduled     || 0),
                completed:     Number(scripts[0]?.completed     || 0),
            };

            detectionsAgg = {
                pushed: Number(hlsDet[0]?.pushed || 0) + Number(rtspDet[0]?.pushed || 0),
                removed: Number(hlsDet[0]?.removed || 0) + Number(rtspDet[0]?.removed || 0),
            };

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
                date,
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
                    planned_today: scriptsAgg.planned_today,
                    running:       scriptsAgg.running,
                    scheduled:     scriptsAgg.scheduled,
                    completed:     scriptsAgg.completed,
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
        console.error('[ClientDashboardController.getOverview] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch client dashboard overview',
            error: error.message,
        });
    }
};


/**
 * GET /api/client-dashboard/live-exams?page=1&limit=10&exam_id=<optional>
 * Client (company-scoped) version of /api/dashboard/live-exams. V2.1
 * (2026-05-21): returns ALL (exam, shift) pairs where exam is live by date
 * today (exam.is_active=1, today in date range, exam_shift.is_active=1) AND
 * exam.exam_body matches the company filter. NO time-of-day filter.
 * `shift_bracket` is a per-row display label computed from start_time.
 */
exports.getLiveExams = async (req, res) => {
    try {
        const userCompanyName = req.user?.company_name;
        const userRole = req.user?.role;

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const offset = (page - 1) * limit;
        const examIdFilter = req.query.exam_id ? parseInt(req.query.exam_id, 10) : null;

        const todayDate = getLocalDateStr();
        const { start: todayStart, end: tomorrowStart } = getDateRangeBounds(todayDate);

        // Company filter applied to the exams alias `e` in the row driver
        const companyFilter = buildCompanyFilter(userRole, userCompanyName, 'e.exam_body');

        // V2.1: live-by-date + company filter. Bracket is per-row label, not a filter.
        const liveWhere = `
            WHERE e.is_active = 1 AND es.is_active = 1
              AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
              AND ? BETWEEN e.start_date AND e.end_date
              ${companyFilter.clause}
              ${examIdFilter ? 'AND e.id = ?' : ''}
        `;

        const baseParams = [todayDate, ...companyFilter.params];
        if (examIdFilter) baseParams.push(examIdFilter);

        const countP = query(
            `SELECT COUNT(*) AS total
             FROM exam_shifts es
             JOIN exams e ON e.id = es.exam_id
             ${liveWhere}`,
            baseParams
        );

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

        // Camera aggregates: HLS keyed by (exam_id, shift_id), shift-NULL bucketed as -1
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
        const rtspCamsP = query(
            `SELECT exam_id,
                    COUNT(*) AS cameras,
                    SUM(CASE WHEN LOWER(status) = 'accessible' THEN 1 ELSE 0 END) AS running
             FROM camera_links_rtsp
             WHERE exam_id IN (?) AND is_active = 1
             GROUP BY exam_id`,
            [examIds]
        );

        // Detections per (exam, shift) — CLIENT visibility rule: only pushed_to_client = 1.
        // The "Detections" column on the Live Exam Table shows how many detection events
        // the client received for this shift today (= still-pushed + retracted = entire pushed set).
        const hlsDetP = query(
            `SELECT exam_id, shift_id, COUNT(*) AS detections
             FROM camera_report_hls
             WHERE exam_id IN (?) AND pushed_to_client = 1
               AND created_at >= ? AND created_at < ?
             GROUP BY exam_id, shift_id`,
            [examIds, todayStart, tomorrowStart]
        );
        const rtspDetP = query(
            `SELECT exam_id, shift_id, COUNT(*) AS detections
             FROM camera_report_rtsp
             WHERE exam_id IN (?) AND pushed_to_client = 1
               AND created_at >= ? AND created_at < ?
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

        const hlsCamMap = new Map();
        hlsCams.forEach((r) => {
            hlsCamMap.set(`${r.exam_id}::${r.shift_id}`, {
                cameras: Number(r.cameras || 0),
                running: Number(r.running || 0),
            });
        });
        const rtspCamMap = new Map();
        rtspCams.forEach((r) => {
            rtspCamMap.set(r.exam_id, {
                cameras: Number(r.cameras || 0),
                running: Number(r.running || 0),
            });
        });
        const hlsDetMap = new Map();
        hlsDet.forEach((r) => {
            hlsDetMap.set(`${r.exam_id}::${r.shift_id}`, Number(r.detections || 0));
        });
        const rtspDetMap = new Map();
        rtspDet.forEach((r) => {
            rtspDetMap.set(`${r.exam_id}::${r.shift_id}`, Number(r.detections || 0));
        });
        // V2: scripts count per shift_id (Number-keyed to avoid string/number coercion bugs)
        const scriptsMap = new Map();
        scriptsAgg.forEach((r) => {
            scriptsMap.set(Number(r.shift_id), Number(r.scripts || 0));
        });

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
                shift_bracket: bracketForStartTime(r.start_time),
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
        console.error('[ClientDashboardController.getLiveExams] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch client live exams',
            error: error.message,
        });
    }
};
