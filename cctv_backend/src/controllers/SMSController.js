const { query } = require('../config/database');
const { sendAlertWithConfig, TYPE_MAP } = require('../services/smsService');
const logger = require('../utils/logger');

// Detection types eligible for SMS (DLT-approved templates only).
const SMS_ELIGIBLE_TYPES = new Set(['invigilator', 'proximity', 'server']);

/**
 * SMS Controller handles triggering alerts based on database reports.
 *
 * sendPushAlert is the single gated bridge invoked by the script-server right
 * after a detection is pushed to the client. It applies three gates before any
 * SMS is sent:
 *   1. client gate   — the exam's client (exam_body) must have an enabled
 *                      sms_configs row; that row supplies the gateway account,
 *                      DLT template ids and message wording for this client.
 *   2. template gate — detection type must map to invigilator / proximity
 *   3. toggle gate   — the shift's scheduled script must have sms_enabled = 1
 * On success it records sms_sent / sms_sent_at on the report row (idempotent).
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
            const sql = `SELECT exam_id, shift_id, center_name, tc_code, camera_name,
                                detection_type, date_time, sms_sent,
                                person_count, threshold
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

            // Idempotency — never send twice for the same pushed detection.
            if (Number(metadata.sms_sent) === 1) {
                logger.info(`SMS already sent for UID ${uid} — skipping`);
                return res.json({ success: true, skipped: true, reason: 'already_sent' });
            }

            // ── Gate 2: template gate (only invigilator / proximity) ──────────
            const typeKey = TYPE_MAP[detectionType] || detectionType;
            if (!SMS_ELIGIBLE_TYPES.has(typeKey)) {
                logger.info(`SMS skipped → '${detectionType}' (${typeKey}) not SMS-eligible`);
                return res.json({ success: true, skipped: true, reason: 'type_not_eligible' });
            }

            // ── Gate 1: client gate — resolve the exam's client + SMS config ──
            if (!metadata.exam_id) {
                logger.info(`SMS skipped → no exam_id on report ${uid}`);
                return res.json({ success: true, skipped: true, reason: 'no_exam' });
            }
            const examRows = await query(
                'SELECT exam_body, observer_phone FROM exams WHERE id = ? LIMIT 1',
                [metadata.exam_id]
            );
            const exam = examRows && examRows[0];
            const examBody = exam?.exam_body || null;
            const observerPhone = exam?.observer_phone || null;

            const configRows = await query(
                'SELECT * FROM sms_configs WHERE exam_body = ? AND enabled = 1 LIMIT 1',
                [examBody]
            );
            const clientConfig = configRows && configRows[0];
            if (!clientConfig) {
                logger.info(`SMS skipped → no enabled SMS config for client '${examBody}'`);
                return res.json({ success: true, skipped: true, reason: 'no_client_config' });
            }

            // ── Gate 3: per-assignment toggle (sms_enabled on the shift's script)
            const toggleRows = await query(
                `SELECT 1
                   FROM shift_script_assignments ssa
                   JOIN scripts s ON s.id = ssa.script_id
                  WHERE ssa.shift_id = ?
                    AND s.script_id = ?
                    AND ssa.sms_enabled = 1
                    AND ssa.is_active = 1
                  LIMIT 1`,
                [metadata.shift_id, typeKey]
            );
            if (!toggleRows || toggleRows.length === 0) {
                logger.info(`SMS skipped → sms_enabled off for shift ${metadata.shift_id} / ${typeKey}`);
                return res.json({ success: true, skipped: true, reason: 'toggle_off' });
            }

            // Recipient: per-exam observer_phone wins; else client default_recipients
            // (resolved inside the service).
            const alertResult = await sendAlertWithConfig(clientConfig, typeKey, {
                center_name: metadata.center_name,
                tc_code: metadata.tc_code,
                camera_name: metadata.camera_name,
                time: metadata.date_time,
                count: metadata.count,
                person_count: metadata.person_count,
                threshold: metadata.threshold,
            }, observerPhone);

            // Record sms_sent so the client image shows the badge (and we never resend).
            if (alertResult.success && !alertResult.skipped) {
                try {
                    await query(
                        `UPDATE ${tableName} SET sms_sent = 1, sms_sent_at = NOW() WHERE unique_id = ?`,
                        [uid]
                    );
                } catch (e) {
                    logger.error(`Failed to mark sms_sent for UID ${uid}: ${e.message}`);
                }
            }

            return res.json({
                success: alertResult.success,
                sms_sent: !!(alertResult.success && !alertResult.skipped),
                message: alertResult.skipped ? 'Alert skipped' : 'Alert processed',
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
     * List exam_body clients that have an enabled SMS config. Used by the
     * frontend to decide which exams show the SMS toggle / observer field,
     * instead of hardcoding NTA. Returns only non-sensitive fields.
     */
    async getSmsClients(req, res) {
        try {
            const rows = await query(
                'SELECT exam_body FROM sms_configs WHERE enabled = 1'
            );
            const bodies = (rows || []).map(r => r.exam_body).filter(Boolean);
            return res.json({ success: true, bodies });
        } catch (error) {
            logger.error(`Error in getSmsClients: ${error.message}`);
            return res.status(500).json({ success: false, bodies: [] });
        }
    }
}

module.exports = new SMSController();
