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

        console.log('[ClientDashboard] User role:', userRole, 'Company:', userCompanyName);

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
                WHERE exam_id IN (?)
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
                WHERE exam_id IN (?)
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
