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
 * 📩 SMS Templates (DLT Approved)
 */
const SMS_TEMPLATES = {
    entry_exit: {
        templateId: process.env.SMS_TEMPLATE_MOVEMENT,
        getMessage: (data) =>
            `Movement Detected in ${data.center_name || 'Center'} at ${formatTime(data.time)}. TC Code: ${data.tc_code || 'N/A'} - SSC`
    },

    proximity: {
        templateId: process.env.SMS_TEMPLATE_PROXIMITY,
        getMessage: (data) =>
            `Two or more people are in close proximity in ${data.center_name || 'Center'} at ${formatTime(data.time)}. TC Code: ${data.tc_code || 'N/A'} - SSC`
    },

    phone: {
        templateId: process.env.SMS_TEMPLATE_MOBILE,
        getMessage: (data) =>
            `Mobile Detected in ${data.center_name || 'Center'} at ${formatTime(data.time)}. TC Code: ${data.tc_code || 'N/A'} - SSC`
    },

    server: {
        templateId: process.env.SMS_TEMPLATE_SERVERROOM,
        getMessage: (data) =>
            `Max people threshold crossed: ${data.count || 'Multiple'} persons are in ${data.center_name || 'Server Room'} at ${formatTime(data.time)}. TC Code: ${data.tc_code || 'N/A'} - SSC`
    },

    invigilator: {
        templateId: process.env.SMS_TEMPLATE_INVIGILATOR,
        getMessage: (data) =>
            `Invigilator not moving in ${data.center_name || 'Center'} at ${formatTime(data.time)}. TC Code: ${data.tc_code || 'N/A'} - SSC`
    },

    otp: {
        templateId: process.env.SMS_TEMPLATE_OTP,
        getMessage: (data) =>
            `Your OTP for CCTV Analysis verification is ${data.otp}. Valid for 5 minutes. Do not share with anyone. - SSC`
    }
};

/**
 * 🚀 Send SMS (SMSGatewayHub)
 */
async function sendSMS(phoneNumber, message, templateId) {
    try {
        const smsUrl = 'https://www.smsgatewayhub.com/api/mt/SendSMS';

        if (!process.env.SMS_API_KEY || !process.env.SMS_SENDER_ID || !process.env.SMS_ENTITY_ID) {
            logger.error('SMS Service: Missing credentials');
            return { success: false };
        }

        const params = {
            APIKey: process.env.SMS_API_KEY,
            senderid: process.env.SMS_SENDER_ID,
            channel: process.env.SMS_CHANNEL || '2',
            DCS: process.env.SMS_DCS || '0',
            flashsms: process.env.SMS_FLASH || '0',
            number: phoneNumber,
            text: message,
            route: process.env.SMS_ROUTE || '47',
            EntityId: process.env.SMS_ENTITY_ID,
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
 * 🎯 MAIN FUNCTION
 */
async function sendAlertSMS(detectionType, metadata) {
    try {
        const typeKey = TYPE_MAP[detectionType] || detectionType;

        logger.info(`Detection: ${detectionType} → ${typeKey}`);

        if (!typeKey) {
            logger.info(`SMS SKIPPED → No mapping for '${detectionType}'`);
            return { success: true, skipped: true };
        }

        const template = SMS_TEMPLATES[typeKey];

        if (!template || !template.templateId) {
            logger.info(`SMS SKIPPED → No template for '${typeKey}'`);
            return { success: true, skipped: true };
        }

        const numbers = process.env.ALERT_PHONE_NUMBERS;
        if (!numbers) {
            logger.error('No phone numbers configured');
            return { success: false };
        }

        const recipients = numbers.split(',').map(n => n.trim());
        const message = template.getMessage(metadata);

        const results = [];

        for (const number of recipients) {
            const res = await sendSMS(number, message, template.templateId);
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
    sendAlertSMS,
    sendSMS,
    sendOTPSMS,
    SMS_TEMPLATES
};