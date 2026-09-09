const { Resend } = require('resend');
const logger = require('../utils/logger');

/**
 * Email service (Resend).
 *
 * All transactional email — OTPs, registration notifications and verification
 * notifications — is sent through Resend from the verified sender domain
 * (EMAIL_FROM, e.g. noreply@examscctvmonitoring.com).
 */

const FROM = () => {
    const addr = process.env.EMAIL_FROM || 'noreply@examscctvmonitoring.com';
    const name = process.env.EMAIL_FROM_NAME || 'Exam CCTV Monitoring';
    return `${name} <${addr}>`;
};

const isEmailConfigured = () => {
    if (!process.env.RESEND_API_KEY) {
        logger.warn('Resend not configured: RESEND_API_KEY missing');
        return false;
    }
    return true;
};

let resend = null;
if (isEmailConfigured()) {
    resend = new Resend(process.env.RESEND_API_KEY);
}

/**
 * Low-level send. Returns { success, skipped?, messageId?, message? } and never
 * throws — callers treat email as best-effort so a mail failure can't break the
 * surrounding auth flow.
 */
async function sendEmail(to, subject, html, { cc = [] } = {}) {
    if (!isEmailConfigured()) {
        logger.warn(`Email service not configured - email to ${to} skipped (subject: ${subject})`);
        return { success: true, skipped: true, message: 'Email service not configured (RESEND_API_KEY missing).' };
    }

    const ccList = (Array.isArray(cc) ? cc : [cc]).filter(Boolean);

    try {
        const { data, error } = await resend.emails.send({
            from: FROM(),
            to: Array.isArray(to) ? to : [to],
            ...(ccList.length ? { cc: ccList } : {}),
            subject,
            html,
        });

        if (error) {
            logger.error(`Resend error sending "${subject}" to ${to}: ${JSON.stringify(error)}`);
            return { success: false, message: error.message || 'Failed to send email' };
        }

        logger.info(`Email sent to ${to}${ccList.length ? ` (cc: ${ccList.join(', ')})` : ''} (subject: ${subject}, id: ${data?.id})`);
        return { success: true, messageId: data?.id };
    } catch (err) {
        logger.error(`Error sending email to ${to}: ${err.message}`);
        return { success: false, message: err.message };
    }
}

/** Escape user-supplied values so they cannot break out of the HTML body. */
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Shared layout wrapper so every email looks consistent. */
function layout(title, bodyHtml) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8" />
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: white; padding: 30px; border-radius: 0 0 5px 5px; }
            .otp-box { background-color: #f0f0f0; border: 2px dashed #1976d2; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #1976d2; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .warning { color: #d32f2f; font-weight: bold; margin-top: 15px; }
            .badge { display: inline-block; background: #10b981; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header"><h1>CCTV Analysis System</h1></div>
            <div class="content">
                <h2>${title}</h2>
                ${bodyHtml}
                <p>Best regards,<br>CCTV Analysis Team</p>
            </div>
            <div class="footer">
                <p>This is an automated email. Please do not reply to this message.</p>
            </div>
        </div>
    </body>
    </html>`;
}

/**
 * Send an OTP email (used for email verification, registration and password reset).
 */
async function sendOTPEmail(email, otp, purpose = 'verification') {
    const subject = purpose === 'reset'
        ? 'Password Reset OTP - CCTV Analysis System'
        : 'Email Verification OTP - CCTV Analysis System';

    const intro = purpose === 'reset'
        ? 'You have requested to reset your password. Use the OTP below to proceed:'
        : 'Thank you for registering with CCTV Analysis System. Use the OTP below to verify your email address:';

    const html = layout(purpose === 'reset' ? 'Password Reset Request' : 'Email Verification', `
        <p>Hello,</p>
        <p>${intro}</p>
        <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <p style="margin: 10px 0 0 0; color: #666;">This OTP is valid for 5 minutes</p>
        </div>
        <p>If you didn't request this ${purpose === 'reset' ? 'password reset' : 'verification'}, please ignore this email.</p>
        <p class="warning">⚠️ Never share this OTP with anyone. Our team will never ask for your OTP.</p>
    `);

    const result = await sendEmail(email, subject, html);
    if (!result.success) {
        logger.warn(`OTP email to ${email} failed to send`);
    }
    return result;
}

/**
 * Send a "registration received" notification after a user signs up.
 */
async function sendRegistrationNotification(email, name) {
    const html = layout('Registration Received', `
        <p>Hello ${name || 'there'},</p>
        <p>Your account has been created successfully with the CCTV Analysis System.</p>
        <p>Your registration is currently <strong>pending approval</strong> by an administrator.
           You will receive another email once your account has been verified and activated.</p>
    `);
    return sendEmail(email, 'Registration Received - CCTV Analysis System', html);
}

/**
 * Send an "account verified / approved" notification when an admin verifies a user.
 */
async function sendVerificationNotification(email, name) {
    const html = layout('Account Verified', `
        <p>Hello ${name || 'there'},</p>
        <p><span class="badge">✓ Verified</span></p>
        <p>Good news — your account has been verified and activated by an administrator.
           You can now log in and access the CCTV Analysis System.</p>
    `);
    return sendEmail(email, 'Your Account Has Been Verified - CCTV Analysis System', html);
}

/** Login page the credentials in the verification mail point at. */
const DASHBOARD_URL = () =>
    process.env.DASHBOARD_URL || 'http://www.examscctvmonitoring.com/cctv_analytics/login';

/**
 * Who is copied on the verification mail, comma-separated.
 * Set VERIFICATION_EMAIL_CC to a different list, or to an empty value to copy
 * nobody. Note that the mail carries the user's password, so anyone listed here
 * receives it too.
 */
const VERIFICATION_CC = () => {
    const raw = process.env.VERIFICATION_EMAIL_CC ?? 'akpathak@iitk.ac.in';
    return raw.split(',').map((a) => a.trim()).filter(Boolean);
};

/**
 * Send the "you are verified — here are your credentials" email.
 *
 * Quotes the username, the password to sign in with, the dashboard login URL
 * and the exam body/bodies the account has been approved for. `password` is null
 * when no new one was issued (an already-verified account gaining another exam)
 * — the mail then points the user at the password they already use.
 */
async function sendVerifiedCredentialsEmail(email, { name, username, password, exams = [] } = {}) {
    const list = (Array.isArray(exams) ? exams : [exams]).filter(Boolean);
    const examText = list.length ? list.join(', ') : 'the CCTV Analysis System';
    const url = DASHBOARD_URL();

    const passwordCell = password
        ? `<code style="font-size: 15px;">${escapeHtml(password)}</code>`
        : 'your existing password for this account';

    const html = layout('Account Verified', `
        <p>Hello ${escapeHtml(name || 'there')},</p>
        <p><span class="badge">&#10003; Verified</span></p>
        <p>You have been successfully registered for <strong>${escapeHtml(examText)}</strong>.</p>
        <p>Your account has been verified by an administrator. Use the credentials below to sign in:</p>
        <div class="otp-box" style="text-align: left; border-style: solid;">
            <table style="border-collapse: collapse;">
                <tr>
                    <td style="padding: 6px 0; width: 110px;"><strong>Username:</strong></td>
                    <td style="padding: 6px 0;">${escapeHtml(username || email)}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0;"><strong>Password:</strong></td>
                    <td style="padding: 6px 0;">${passwordCell}</td>
                </tr>
            </table>
        </div>
        <p><strong>Dashboard:</strong> <a href="${url}">${url}</a></p>
        <p class="warning">&#9888;&#65039; For your security, change your password after the first login and never share these credentials.</p>
    `);

    return sendEmail(email, `Account Verified - ${examText}`, html, { cc: VERIFICATION_CC() });
}

/**
 * Verify email configuration (used at startup for a readiness log).
 */
async function verifyEmailConfig() {
    if (!isEmailConfigured()) {
        logger.warn('Email service (Resend) not configured');
        return false;
    }
    logger.info('Email service (Resend) is ready');
    return true;
}

module.exports = {
    sendOTPEmail,
    sendRegistrationNotification,
    sendVerificationNotification,
    sendVerifiedCredentialsEmail,
    verifyEmailConfig,
    isEmailConfigured,
};
