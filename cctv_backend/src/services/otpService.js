const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * OTP Service
 * Handles OTP generation, storage, and verification
 */

// Store OTPs in memory (for production, use Redis or database)
const otpStore = new Map();

// Identifiers whose OTP was entered correctly, kept briefly after the OTP
// itself is consumed. Signup uses this to prove the person completing the form
// actually owns an email that already has an account, before attaching another
// company to it.
const verifiedStore = new Map();
const VERIFIED_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP with expiry (5 minutes)
 */
function storeOTP(identifier, otp, type = 'email') {
    const key = `${type}:${identifier}`;
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    
    otpStore.set(key, {
        otp,
        expiresAt,
        attempts: 0,
        maxAttempts: 3
    });
    
    logger.info(`OTP stored for ${key}, expires at ${new Date(expiresAt).toISOString()}`);
    
    // Auto-cleanup after expiry
    setTimeout(() => {
        otpStore.delete(key);
        logger.info(`OTP expired and removed for ${key}`);
    }, 5 * 60 * 1000);
}

/**
 * Verify OTP
 */
function verifyOTP(identifier, otp, type = 'email') {
    const key = `${type}:${identifier}`;
    const stored = otpStore.get(key);
    
    if (!stored) {
        logger.warn(`OTP not found for ${key}`);
        return { success: false, message: 'OTP not found or expired' };
    }
    
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(key);
        logger.warn(`OTP expired for ${key}`);
        return { success: false, message: 'OTP has expired' };
    }
    
    if (stored.attempts >= stored.maxAttempts) {
        otpStore.delete(key);
        logger.warn(`Max attempts reached for ${key}`);
        return { success: false, message: 'Maximum verification attempts exceeded' };
    }
    
    stored.attempts++;
    
    if (stored.otp !== otp) {
        logger.warn(`Invalid OTP attempt for ${key} (${stored.attempts}/${stored.maxAttempts})`);
        return { 
            success: false, 
            message: `Invalid OTP. ${stored.maxAttempts - stored.attempts} attempts remaining` 
        };
    }
    
    // OTP verified successfully
    otpStore.delete(key);
    logger.info(`OTP verified successfully for ${key}`);
    return { success: true, message: 'OTP verified successfully' };
}

/**
 * Remember that `identifier` passed OTP verification just now.
 */
function markVerified(identifier, type = 'email') {
    const key = `${type}:${identifier}`;
    verifiedStore.set(key, Date.now() + VERIFIED_TTL_MS);
    setTimeout(() => verifiedStore.delete(key), VERIFIED_TTL_MS);
    logger.info(`Verification marked for ${key}`);
}

/**
 * True when `identifier` passed OTP verification within the last 30 minutes.
 */
function isRecentlyVerified(identifier, type = 'email') {
    const key = `${type}:${identifier}`;
    const expiresAt = verifiedStore.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        verifiedStore.delete(key);
        return false;
    }
    return true;
}

/** Drop the marker once it has been spent (one signup per verification). */
function clearVerified(identifier, type = 'email') {
    verifiedStore.delete(`${type}:${identifier}`);
}

/**
 * Clear OTP
 */
function clearOTP(identifier, type = 'email') {
    const key = `${type}:${identifier}`;
    otpStore.delete(key);
    logger.info(`OTP cleared for ${key}`);
}

/**
 * Check if OTP exists and is valid
 */
function hasValidOTP(identifier, type = 'email') {
    const key = `${type}:${identifier}`;
    const stored = otpStore.get(key);
    
    if (!stored) return false;
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(key);
        return false;
    }
    
    return true;
}

module.exports = {
    generateOTP,
    storeOTP,
    verifyOTP,
    clearOTP,
    hasValidOTP,
    markVerified,
    isRecentlyVerified,
    clearVerified
};
