/**
 * ClientDashboardController.js
 * Provides dashboard statistics with company-based filtering
 */

'use strict';

const { query } = require('../config/database');

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
        let examQuery = 'SELECT id, exam_name, exam_body, start_date, end_date FROM exams WHERE is_active = 1';
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

        // Get total shifts
        const shiftsResult = await query(`
            SELECT COUNT(DISTINCT id) as count
            FROM exam_shifts
            WHERE exam_id IN (?) AND is_active = 1
        `, [examIds]);

        // Get total cameras
        const hlsCameras = await query(`SELECT COUNT(*) as count FROM camera_links_hls WHERE exam_id IN (?) AND is_active = 1`, [examIds]);
        const rtspCameras = await query(`SELECT COUNT(*) as count FROM camera_links_rtsp WHERE exam_id IN (?) AND is_active = 1`, [examIds]);
        const totalCameras = (hlsCameras[0]?.count || 0) + (rtspCameras[0]?.count || 0);

        // Get detection counts by type with accuracy calculation
        const detectionDistribution = [];
        
        // Group exams by link_type
        const hlsExams = exams.filter(e => e.link_type === 'HLS').map(e => e.id);
        const rtspExams = exams.filter(e => e.link_type === 'RTSP').map(e => e.id);
        
        // Query HLS detections if there are HLS exams
        if (hlsExams.length > 0) {
            const hlsDetections = await query(`
                SELECT 
                    detection_type,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
                    SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
                FROM camera_report_hls
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
        if (rtspExams.length > 0) {
            const rtspDetections = await query(`
                SELECT 
                    detection_type,
                    COUNT(*) as total_count,
                    SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
                    SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
                FROM camera_report_rtsp
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
        // Accuracy = (pushed_to_client / total_count) * 100
        const detectionDistributionWithAccuracy = detectionDistribution.map(d => ({
            type: d.type,
            count: d.total_count,
            pushed_count: d.pushed_count,
            removed_count: d.removed_count,
            accuracy: d.total_count > 0 ? ((d.pushed_count / d.total_count) * 100).toFixed(2) : 0
        }));
        
        const totalDetections = detectionDistribution.reduce((sum, d) => sum + d.total_count, 0);

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
                    start_date: e.start_date,
                    end_date: e.end_date,
                    link_type: e.link_type
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
        // Assuming status field: 'active' or 'online' = accessible, anything else = non-accessible
        const accessible = allCameras.filter(cam => 
            cam.status && (cam.status.toLowerCase() === 'active' || cam.status.toLowerCase() === 'online')
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
                cam.status && (cam.status.toLowerCase() === 'active' || cam.status.toLowerCase() === 'online')
            );
        } else if (type === 'non_accessible') {
            allCameras = allCameras.filter(cam => 
                !cam.status || (cam.status.toLowerCase() !== 'active' && cam.status.toLowerCase() !== 'online')
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
