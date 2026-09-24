const axios = require('axios');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * Helper to format time
 */
const formatTime = (timeStr) => {
    if (!timeStr) return new Date().toLocaleTimeString('en-IN', { hour12: false });
    if (timeStr.includes(':')) return timeStr;
    if (timeStr.length === 6) {
        return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
    }
    return timeStr;
};

/**
 * 🔥 Detection → Template Mapping (FIXED)
 */
const TYPE_MAP = {
    // ✅ Direct types
    proximity: 'proximity',
    entry_exit: 'entry_exit',
    invigilator: 'invigilator',

    // ✅ Folder-based detection names (IMPORTANT FIX)
    proximity_detection: 'proximity',
    entry_exit_detection: 'entry_exit',
    invigilator_detection: 'invigilator',

    // ✅ Phone
    phone: 'phone',
    phone_detection: 'phone',

    // ✅ Server
    server: 'server',
    server_room_detection: 'server',

    // ✅ Intruder
    intruder: 'intruder',
    intruder_detection: 'intruder',

    // ✅ Crowd — only the entry-gate crowd analytic has a DLT template.
    // The crowd variants (biometric / <5 / zero-person) deliberately have no
    // mapping, so they resolve to their own key, miss SMS_ELIGIBLE_TYPES and
    // are skipped rather than sent under the wrong registered body.
    crowd: 'crowd',
    crowd_detection: 'crowd',

    // ✅ Blind spot
    blind_spot: 'blind_spot',
    blind_spot_detection: 'blind_spot',
};

/**
 * Detection types that can trigger an SMS alert. A type belongs here once a
 * DLT-registered template exists for it; whether a given CLIENT can actually
 * send it still depends on that client's sms_configs row having
 * template_<type> / message_<type> filled in (see sendAlertWithConfig).
 *
 * Single source of truth — SMSController (push path) and
 * ClientDetectionsController (accept path) both import this set. The frontend
 * keeps its own copy in ShiftScriptManager.jsx (SMS_ELIGIBLE_SCRIPTS) to gate
 * the per-assignment toggle; keep the two in sync.
 */
const SMS_ELIGIBLE_TYPES = new Set([
    'invigilator',
    'proximity',
    'server',
    'intruder',
    'crowd',
    'phone',
    'entry_exit',
    'blind_spot',
]);

/**
 * 📩 OTP template (env-based, on the default/SSC account). Alert templates are
 * resolved per-client from the sms_configs DB table — see sendAlertWithConfig.
 */
const SMS_TEMPLATES = {
    otp: {
        templateId: process.env.SMS_TEMPLATE_OTP,
        getMessage: (data) =>
            `Your OTP for CCTV Analysis verification is ${data.otp}. Valid for 5 minutes. Do not share with anyone. - SSC`
    }
};

/**
 * Values a DLT message body can interpolate. The ##var## names registered on the
 * DLT portal map onto these keys — ##camname## → {camname}, ##pplcount## →
 * {pplcount}, ##ppl## → {ppl} — and sms_configs.message_* stores the {…} form.
 *
 * camname/centername/tccode/timestamp always resolve because they fall back, so
 * only the numeric ones can come back empty (a detection captured before the
 * worker started reporting person_count). See missingPlaceholders().
 */
function buildPlaceholderMap(data = {}) {
    return {
        camname: data.camera_name || data.cameraName || 'Camera',
        centername: data.center_name || data.centerName || 'Center',
        timestamp: formatTime(data.time),
        tccode: data.tc_code || data.tcCode || 'N/A',
        count: data.count != null ? String(data.count) : '',
        pplcount: data.person_count != null ? String(data.person_count) : '',
        ppl: data.threshold != null ? String(data.threshold) : '',
    };
}

/**
 * Render a DLT message body by substituting {placeholder} names from the
 * detection metadata.
 */
function renderMessage(text, data = {}) {
    if (!text) return '';
    const map = buildPlaceholderMap(data);
    return text.replace(/\{(\w+)\}/g, (m, key) =>
        Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m
    );
}

/**
 * Placeholders the template asks for that this detection cannot fill — either
 * the value is absent or the name is not one we know.
 *
 * A body must leave here byte-identical to the registered DLT template with its
 * variables filled. A blank {pplcount} or a literal, unsubstituted {ppl} makes
 * it a different text, which the gateway rejects — so the caller skips the send
 * instead of burning a request on a message that cannot deliver.
 */
function missingPlaceholders(text, data = {}) {
    const map = buildPlaceholderMap(data);
    const keys = [...String(text || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return [...new Set(keys)].filter((key) => !map[key]);
}

/**
 * 🚀 Send SMS (SMSGatewayHub). `creds` (api_key/sender_id/entity_id/route/
 * channel/dcs/flashsms) overrides the env account when provided — used to send
 * on a specific client's gateway account. OTP path passes no creds (env account).
 */
async function sendSMS(phoneNumber, message, templateId, creds = {}) {
    try {
        const smsUrl = 'https://www.smsgatewayhub.com/api/mt/SendSMS';

        const apiKey = creds.api_key || process.env.SMS_API_KEY;
        const senderId = creds.sender_id || process.env.SMS_SENDER_ID;
        const entityId = creds.entity_id || process.env.SMS_ENTITY_ID;

        if (!apiKey || !senderId || !entityId) {
            logger.error('SMS Service: Missing credentials');
            return { success: false };
        }

        const params = {
            APIKey: apiKey,
            senderid: senderId,
            channel: creds.channel || process.env.SMS_CHANNEL || '2',
            DCS: creds.dcs || process.env.SMS_DCS || '0',
            flashsms: creds.flashsms || process.env.SMS_FLASH || '0',
            number: phoneNumber,
            text: message,
            route: creds.route || process.env.SMS_ROUTE || '47',
            EntityId: entityId,
            dlttemplateid: templateId
        };

        logger.info(`Sending SMS → ${phoneNumber} (Template: ${templateId})`);

        const response = await axios.post(smsUrl, null, { params });
        const errorCode = response.data?.ErrorCode;
        const errorMessage = response.data?.ErrorMessage;

        if (errorCode === '000') {
            logger.info(`SMS sent → ${phoneNumber} (DLT ${templateId})`);
            return { success: true };
        }

        // Gateway/DLT rejected the send — errorCode is SMSGatewayHub's own code
        // (not an HTTP status), e.g. mismatched template text, unregistered
        // sender/entity, DND-blocked number. Log both so a failure is
        // diagnosable from the log alone, without re-querying the gateway.
        logger.warn(
            `SMS failed → ${phoneNumber} (DLT ${templateId}) | ` +
            `ErrorCode: ${errorCode ?? 'unknown'} | ErrorMessage: ${errorMessage ?? 'none'}`
        );
        return { success: false, errorCode, errorMessage, response: response.data };

    } catch (error) {
        // Network/HTTP-level failure (timeout, DNS, non-2xx) — distinct from a
        // gateway-level rejection above, which still returns 200 with an
        // ErrorCode. Surface the gateway's response body when axios has one.
        const gatewayBody = error.response?.data;
        logger.error(
            `SMS error → ${phoneNumber} (DLT ${templateId}): ${error.message}` +
            (gatewayBody ? ` | gateway response: ${JSON.stringify(gatewayBody)}` : '')
        );
        return { success: false, errorCode: gatewayBody?.ErrorCode, errorMessage: gatewayBody?.ErrorMessage || error.message };
    }
}

/**
 * 🎯 Send an alert SMS using a per-client config row (from sms_configs).
 *
 * @param {object} config   - sms_configs row for the exam's client (exam_body)
 * @param {string} typeKey  - 'invigilator' | 'proximity'
 * @param {object} metadata - { camera_name, center_name, time, tc_code, count }
 * @param {string|string[]} recipientList - per-exam observer_phone override; falls
 *        back to config.default_recipients when empty.
 */
async function sendAlertWithConfig(config, typeKey, metadata, recipientList) {
    try {
        if (!config || config.enabled === 0) {
            logger.info(`SMS SKIPPED → no/disabled client config`);
            return { success: true, skipped: true };
        }

        // Resolve template id + message body for this detection type. sms_configs
        // stores these as template_<typeKey> / message_<typeKey> (invigilator,
        // proximity, server), so a client that has no DLT template seeded for this
        // type resolves to undefined and is skipped below.
        const templateId = config[`template_${typeKey}`] || null;
        const messageText = config[`message_${typeKey}`] || null;

        if (!templateId || !messageText) {
            logger.info(`SMS SKIPPED → client '${config.exam_body}' has no template for '${typeKey}'`);
            return { success: true, skipped: true };
        }

        const missing = missingPlaceholders(messageText, metadata);
        if (missing.length) {
            logger.warn(
                `SMS SKIPPED → '${typeKey}' template needs ` +
                `${missing.map((k) => `{${k}}`).join(', ')} but this detection has no value for them`
            );
            return { success: true, skipped: true };
        }

        // Recipient: explicit (per-exam observer_phone) wins, else client default.
        const numbers = (
            Array.isArray(recipientList) ? recipientList.join(',') : recipientList
        ) || config.default_recipients;
        if (!numbers) {
            logger.error(`No phone numbers for client '${config.exam_body}'`);
            return { success: false };
        }

        const recipients = String(numbers).split(',').map(n => n.trim()).filter(Boolean);
        const message = renderMessage(messageText, metadata);

        const creds = {
            api_key: config.api_key,
            sender_id: config.sender_id,
            entity_id: config.entity_id,
            route: config.route,
            channel: config.channel,
            dcs: config.dcs,
            flashsms: config.flashsms,
        };

        const results = [];
        for (const number of recipients) {
            const res = await sendSMS(number, message, templateId, creds);
            results.push(res);
        }

        return { success: results.every(r => r.success), results };

    } catch (error) {
        logger.error(`SMS Service Failed: ${error.message}`);
        return { success: false };
    }
}

/**
 * 📱 Send OTP SMS
 */
async function sendOTPSMS(phoneNumber, otp) {
    try {
        const template = SMS_TEMPLATES.otp;
        
        // Check if OTP template is configured
        if (!template || !template.templateId || template.templateId === 'undefined') {
            logger.warn('OTP SMS template not configured in .env - SMS will be skipped');
            logger.info(`OTP for ${phoneNumber}: ${otp} (SMS skipped - configure SMS_TEMPLATE_OTP in .env)`);
            
            // Return success but log that SMS was skipped
            return { 
                success: true, 
                skipped: true,
                message: 'OTP SMS template not configured. Please add SMS_TEMPLATE_OTP to .env file.' 
            };
        }

        const message = template.getMessage({ otp });
        const result = await sendSMS(phoneNumber, message, template.templateId);
        
        if (result.success) {
            logger.info(`OTP SMS sent to ${phoneNumber}`);
            return { success: true };
        } else {
            logger.error(`Failed to send OTP SMS to ${phoneNumber}`);
            return { success: false, message: 'Failed to send OTP SMS' };
        }
    } catch (error) {
        logger.error(`Error sending OTP SMS: ${error.message}`);
        return { success: false, message: 'Error sending OTP SMS' };
    }
}

module.exports = {
    sendAlertWithConfig,
    sendSMS,
    sendOTPSMS,
    renderMessage,
    missingPlaceholders,
    SMS_TEMPLATES,
    TYPE_MAP,
    SMS_ELIGIBLE_TYPES
};