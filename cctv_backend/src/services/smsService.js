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
};

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
 * Render a DLT message body by substituting {camname}, {centername},
 * {timestamp}, {tccode}, {count} placeholders from the detection metadata.
 */
function renderMessage(text, data = {}) {
    if (!text) return '';
    const map = {
        camname: data.camera_name || data.cameraName || 'Camera',
        centername: data.center_name || data.centerName || 'Center',
        timestamp: formatTime(data.time),
        tccode: data.tc_code || data.tcCode || 'N/A',
        count: data.count != null ? String(data.count) : '',
    };
    return text.replace(/\{(\w+)\}/g, (m, key) =>
        Object.prototype.hasOwnProperty.call(map, key) ? map[key] : m
    );
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

        if (response.data?.ErrorCode === '000') {
            logger.info(`SMS sent → ${phoneNumber}`);
            return { success: true };
        }

        logger.warn(`SMS failed → ${response.data?.ErrorMessage}`);
        return { success: false, response: response.data };

    } catch (error) {
        logger.error(`SMS error → ${phoneNumber}: ${error.message}`);
        return { success: false };
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
    SMS_TEMPLATES,
    TYPE_MAP
};