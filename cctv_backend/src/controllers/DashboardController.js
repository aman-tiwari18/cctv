/**
 * DashboardController.js
 * Provides admin dashboard statistics for all exams
 */

'use strict';

const { query } = require('../config/database');

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
