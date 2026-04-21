const { query } = require('../config/database');
const { sendAlertSMS } = require('../services/smsService');
const logger = require('../utils/logger');

/**
 * SMS Controller handles triggering alerts based on database reports
 */
class SMSController {
    /**
     * Handle push-to-client alert trigger
     * @param {Request} req - JSON body { uid, source }
     */
    async sendPushAlert(req, res) {
        const { uid, source } = req.body;

        if (!uid || !source) {
            return res.status(400).json({
                success: false,
                message: 'UID and Source (hls/rtsp) are required'
            });
        }

        try {
            logger.info(`Processing SMS alert for UID: ${uid} (Source: ${source})`);

            // Determine correct table
            const tableName = source.toLowerCase() === 'rtsp' ? 'camera_report_rtsp' : 'camera_report_hls';

            // Query metadata from DB
            const sql = `SELECT center_name, tc_code, camera_name, detection_type, date_time
                   FROM ${tableName} 
                   WHERE unique_id = ? LIMIT 1`;

            const results = await query(sql, [uid]);

            if (!results || results.length === 0) {
                logger.warn(`No metadata found in ${tableName} for UID: ${uid}`);
                return res.status(404).json({
                    success: false,
                    message: 'Detection report not found'
                });
            }

            const metadata = results[0];
            const detectionType = metadata.detection_type;

            // Trigger the SMS Service
            const alertResult = await sendAlertSMS(detectionType, {
                center_name: metadata.center_name,
                tc_code: metadata.tc_code,
                camera_name: metadata.camera_name,
                detected_at: metadata.date_time
            });

            return res.json({
                success: alertResult.success,
                message: alertResult.skipped ? 'Alert skipped (disabled in config)' : 'Alert processed',
                details: alertResult.results || null
            });

        } catch (error) {
            logger.error(`Error in sendPushAlert for UID ${uid}:`, error.message);
            return res.status(500).json({
                success: false,
                message: 'Internal server error while processing SMS'
            });
        }
    }

    /**
     * Manual test endpoint for SMS
     */
    // async testSMSSending(req, res) {
    //     const { type, phone } = req.body;

    //     try {
    //         const metadata = {
    //             center_name: 'Test Center',
    //             tc_code: 'TC001',
    //             camera_name: 'Camera 01',
    //             time: '120000',
    //             count: 5,
    //             detected_at: '21 Apr 2026, 12:00:00 PM'
    //         };

    //         const result = await sendAlertSMS(type || 'proximity', metadata);
    //         return res.json(result);
    //     } catch (error) {
    //         return res.status(500).json({ success: false, error: error.message });
    //     }
    // }
}

module.exports = new SMSController();
