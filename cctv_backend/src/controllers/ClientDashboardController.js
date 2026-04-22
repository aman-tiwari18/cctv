/**
 * ClientDashboardController.js
 * Provides exam-wise (grouped by exam_body) detection statistics for the client dashboard
 */

'use strict';

const { query } = require('../config/database');

/**
 * GET /api/client-dashboard/stats
 * Returns detection statistics grouped by exam_body
 */
exports.getClientDashboardStats = async (req, res) => {
    try {
        // Get all active exams grouped by exam_body
        const exams = await query(`
            SELECT 
                id, exam_name, exam_body, link_type, start_date, end_date, is_active
            FROM exams
            WHERE is_active = 1
            ORDER BY exam_body ASC, exam_name ASC
        `);

        console.log('[ClientDashboard] Total active exams found:', exams?.length || 0);
        
        if (!exams || exams.length === 0) {
            return res.json({
                success: true,
                data: [],
                message: 'No active exams found'
            });
        }

        // Group exams by exam_body
        const examsByBody = {};
        exams.forEach(exam => {
            const body = exam.exam_body || 'Other';
            if (!examsByBody[body]) {
                examsByBody[body] = [];
            }
            examsByBody[body].push(exam);
        });

        console.log('[ClientDashboard] Exam bodies found:', Object.keys(examsByBody));

        // For each exam_body, calculate statistics
        const dashboardData = [];

        for (const [examBody, examList] of Object.entries(examsByBody)) {
            const examIds = examList.map(e => e.id);
            
            console.log(`[ClientDashboard] Processing exam_body: ${examBody}, exam IDs:`, examIds);
            
            // Get total cameras for these exams
            const hlsCameras = await query(`
                SELECT COUNT(*) as count
                FROM camera_links_hls
                WHERE exam_id IN (?) AND is_active = 1
            `, [examIds]);

            const rtspCameras = await query(`
                SELECT COUNT(*) as count
                FROM camera_links_rtsp
                WHERE exam_id IN (?) AND is_active = 1
            `, [examIds]);

            const totalCameras = (hlsCameras[0]?.count || 0) + (rtspCameras[0]?.count || 0);
            console.log(`[ClientDashboard] ${examBody} - Total cameras: ${totalCameras}`);

            // Get total shifts for these exams
            const shifts = await query(`
                SELECT COUNT(*) as count
                FROM exam_shifts
                WHERE exam_id IN (?) AND is_active = 1
            `, [examIds]);

            const totalShifts = shifts[0]?.count || 0;
            console.log(`[ClientDashboard] ${examBody} - Total shifts: ${totalShifts}`);

            // Get detection counts by type for these exams
            const hlsDetections = await query(`
                SELECT 
                    detection_type,
                    COUNT(*) as count
                FROM camera_report_hls
                WHERE exam_id IN (?)
                GROUP BY detection_type
            `, [examIds]);

            const rtspDetections = await query(`
                SELECT 
                    detection_type,
                    COUNT(*) as count
                FROM camera_report_rtsp
                WHERE exam_id IN (?)
                GROUP BY detection_type
            `, [examIds]);

            // Merge detection counts
            const detectionCounts = {};
            let totalDetections = 0;

            [...hlsDetections, ...rtspDetections].forEach(row => {
                const type = row.detection_type || 'unknown';
                detectionCounts[type] = (detectionCounts[type] || 0) + row.count;
                totalDetections += row.count;
            });

            console.log(`[ClientDashboard] ${examBody} - Total detections: ${totalDetections}`);

            // Get accessible/not accessible camera counts
            const hlsAccessible = await query(`
                SELECT 
                    CASE 
                        WHEN status = 'Accessible' THEN 'accessible'
                        WHEN status = 'Not Accessible' THEN 'not_accessible'
                        ELSE 'unknown'
                    END as status_type,
                    COUNT(*) as count
                FROM camera_links_hls
                WHERE exam_id IN (?) AND is_active = 1
                GROUP BY status_type
            `, [examIds]);

            const rtspAccessible = await query(`
                SELECT 
                    CASE 
                        WHEN status = 'Accessible' THEN 'accessible'
                        WHEN status = 'Not Accessible' THEN 'not_accessible'
                        ELSE 'unknown'
                    END as status_type,
                    COUNT(*) as count
                FROM camera_links_rtsp
                WHERE exam_id IN (?) AND is_active = 1
                GROUP BY status_type
            `, [examIds]);

            const cameraStatus = {
                accessible: 0,
                not_accessible: 0,
                unknown: 0
            };

            [...hlsAccessible, ...rtspAccessible].forEach(row => {
                cameraStatus[row.status_type] = (cameraStatus[row.status_type] || 0) + row.count;
            });

            dashboardData.push({
                exam_body: examBody,
                exams: examList.map(e => ({
                    id: e.id,
                    name: e.exam_name,
                    link_type: e.link_type,
                    start_date: e.start_date,
                    end_date: e.end_date
                })),
                stats: {
                    total_exams: examList.length,
                    total_cameras: totalCameras,
                    total_shifts: totalShifts,
                    total_detections: totalDetections,
                    detection_counts: detectionCounts,
                    camera_status: cameraStatus
                }
            });
        }

        console.log('[ClientDashboard] Final dashboard data count:', dashboardData.length);

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('[ClientDashboardController] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch client dashboard statistics',
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
