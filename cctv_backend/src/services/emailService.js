const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Email Service
 * Handles sending emails using nodemailer
 */

// Check if SMTP credentials are configured
const isEmailConfigured = () => {
    return process.env.SMTP_USER && 
           process.env.SMTP_PASS && 
           process.env.SMTP_USER !== 'your_email@gmail.com' &&
           process.env.SMTP_PASS !== 'your_app_password_here';
};

// Create transporter only if configured
let transporter = null;
if (isEmailConfigured()) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

/**
 * Send OTP email
 */
async function sendOTPEmail(email, otp, purpose = 'verification') {
    try {
        // Check if email is configured
        if (!isEmailConfigured()) {
            logger.warn('Email service not configured - Email will be skipped');
            logger.info(`OTP for ${email}: ${otp} (Email skipped - configure SMTP in .env)`);
            
            return {
                success: true,
                skipped: true,
                message: 'Email service not configured. Please add SMTP credentials to .env file.'
            };
        }

        const subject = purpose === 'reset' 
            ? 'Password Reset OTP - CCTV Analysis System'
            : 'Email Verification OTP - CCTV Analysis System';
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        background-color: #f9f9f9;
                    }
                    .header {
                        background-color: #1976d2;
                        color: white;
                        padding: 20px;
                        text-align: center;
                        border-radius: 5px 5px 0 0;
                    }
                    .content {
                        background-color: white;
                        padding: 30px;
                        border-radius: 0 0 5px 5px;
                    }
                    .otp-box {
                        background-color: #f0f0f0;
                        border: 2px dashed #1976d2;
                        padding: 20px;
                        text-align: center;
                        margin: 20px 0;
                        border-radius: 5px;
                    }
                    .otp-code {
                        font-size: 32px;
                        font-weight: bold;
                        color: #1976d2;
                        letter-spacing: 5px;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 20px;
                        color: #666;
                        font-size: 12px;
                    }
                    .warning {
                        color: #d32f2f;
                        font-weight: bold;
                        margin-top: 15px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>CCTV Analysis System</h1>
                    </div>
                    <div class="content">
                        <h2>${purpose === 'reset' ? 'Password Reset Request' : 'Email Verification'}</h2>
                        <p>Hello,</p>
                        <p>${purpose === 'reset' 
                            ? 'You have requested to reset your password. Use the OTP below to proceed:' 
                            : 'Thank you for registering with CCTV Analysis System. Use the OTP below to verify your email address:'
                        }</p>
                        
                        <div class="otp-box">
                            <div class="otp-code">${otp}</div>
                            <p style="margin: 10px 0 0 0; color: #666;">This OTP is valid for 5 minutes</p>
                        </div>
                        
                        <p>If you didn't request this ${purpose === 'reset' ? 'password reset' : 'verification'}, please ignore this email.</p>
                        
                        <p class="warning">⚠️ Never share this OTP with anyone. Our team will never ask for your OTP.</p>
                        
                        <p>Best regards,<br>CCTV Analysis Team</p>
                    </div>
                    <div class="footer">
                        <p>This is an automated email. Please do not reply to this message.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const mailOptions = {
            from: `"CCTV Analysis System" <${process.env.SMTP_USER}>`,
            to: email,
            subject: subject,
            html: html
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`OTP email sent to ${email}: ${info.messageId}`);
        
        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error) {
        logger.error('Error sending OTP email:', error);
        
        // Log OTP for testing if email fails
        logger.info(`OTP for ${email}: ${otp} (Email failed - check logs above for error)`);
        
        return {
            success: true,
            skipped: true,
            message: 'Email service error. OTP logged to console for testing.'
        };
    }
}

/**
 * Verify email configuration
 */
async function verifyEmailConfig() {
    try {
        if (!isEmailConfigured()) {
            logger.warn('Email service not configured');
            return false;
        }
        await transporter.verify();
        logger.info('Email service is ready');
        return true;
    } catch (error) {
        logger.error('Email service configuration error:', error);
        return false;
    }
}

module.exports = {
    sendOTPEmail,
    verifyEmailConfig,
    isEmailConfigured
};
