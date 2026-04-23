const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/database");
const { generateOTP, storeOTP, verifyOTP, clearOTP } = require("../services/otpService");
const { sendOTPEmail } = require("../services/emailService");
const { sendOTPSMS } = require("../services/smsService");
const logger = require("../utils/logger");
/**
 * Login
 */
exports.login = async (req, res) => {
    const { username, password } = req.body;

    // Find user
    const users = await query(
        "SELECT * FROM users WHERE username = ? AND is_active = TRUE",
        [username]
    );

    if (users.length === 0) {
        return res.status(401).json({
            success: false,
            message: "Invalid credentials",
        });
    }

    const user = users[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
        return res.status(401).json({
            success: false,
            message: "Invalid credentials",
        });
    }

    // Check if user is verified
    if (!user.verified) {
        return res.status(401).json({
            success: false,
            message: "Your account is pending verification. Please contact an administrator.",
        });
    }

    // Update last login
    await query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

    console.log("jwt secret", process.env.JWT_SECRET)
    console.log("jwt expire", process.env.JWT_EXPIRES_IN)

    // Generate JWT token
    const token = jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );

    res.json({
        success: true,
        message: "Login successful",
        data: {
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                phone: user.phone,
                company_name: user.company_name,
                verified: user.verified,
                verified_date: user.verified_date,
                role: user.role,
            },
        },
    });
};


/**
 * Register (Admin only)
 */
exports.register = async (req, res) => {
    // Only admins can create users
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Only admins can create users",
        });
    }

    const { username, email, password, full_name, phone, company_name, role } = req.body;

    // Check if user already exists
    const existing = await query(
        "SELECT id FROM users WHERE username = ? OR email = ?",
        [username, email]
    );

    if (existing.length > 0) {
        return res.status(409).json({
            success: false,
            message: "Username or email already exists",
        });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const result = await query(
        "INSERT INTO users (username, email, password_hash, full_name, phone, company_name, role, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [username, email, password_hash, full_name || null, phone || null, company_name || null, role || "VIEWER", false]
    );

    res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
            id: result.insertId,
            username,
            email,
            phone,
            company_name,
            role: role || "VIEWER",
            verified: false,
        },
    });
};


/**
 * Get Current User
 */
exports.getMe = async (req, res) => {
    const users = await query(
        "SELECT id, username, email, full_name, phone, company_name, verified, verified_date, role, last_login, created_at FROM users WHERE id = ?",
        [req.user.id]
    );

    if (users.length === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    res.json({
        success: true,
        data: users[0],
    });
};


exports.verifyUser = async (req, res) => {
    // Only admins can verify users
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Only admins can verify users",
        });
    }

    const { userId } = req.params;
    const { verified, role } = req.body;

    // Validate role if provided
    if (role && !["ADMIN", "OPERATOR", "VIEWER"].includes(role)) {
        return res.status(400).json({
            success: false,
            message: "Invalid role. Must be ADMIN, OPERATOR, or VIEWER",
        });
    }

    // Check if user exists
    const users = await query(
        "SELECT id, username, verified, role FROM users WHERE id = ?",
        [userId]
    );

    if (users.length === 0) {
        return res.status(404).json({
            success: false,
            message: "User not found",
        });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (verified !== undefined) {
        updates.push("verified = ?");
        values.push(verified);
        
        // Set verified_date if verifying, null if unverifying
        updates.push("verified_date = ?");
        values.push(verified ? new Date() : null);
    }

    if (role !== undefined) {
        updates.push("role = ?");
        values.push(role);
    }

    if (updates.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No fields to update. Provide 'verified' and/or 'role'",
        });
    }

    values.push(userId);

    // Update user
    await query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        values
    );

    // Fetch updated user
    const updatedUsers = await query(
        "SELECT id, username, email, full_name, phone, company_name, verified, verified_date, role FROM users WHERE id = ?",
        [userId]
    );

    res.json({
        success: true,
        message: "User updated successfully",
        data: updatedUsers[0],
    });
};

/**
 * Update User Profile
 */
exports.updateProfile = async (req, res) => {
    const { full_name, phone, company_name } = req.body;
    const userId = req.user.id;

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (full_name !== undefined) {
        updates.push("full_name = ?");
        values.push(full_name);
    }
    if (phone !== undefined) {
        updates.push("phone = ?");
        values.push(phone);
    }
    if (company_name !== undefined) {
        updates.push("company_name = ?");
        values.push(company_name);
    }

    if (updates.length === 0) {
        return res.status(400).json({
            success: false,
            message: "No fields to update",
        });
    }

    values.push(userId);

    await query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        values
    );

    // Fetch updated user
    const users = await query(
        "SELECT id, username, email, full_name, phone, company_name, verified, verified_date, role FROM users WHERE id = ?",
        [userId]
    );

    res.json({
        success: true,
        message: "Profile updated successfully",
        data: users[0],
    });
};

/**
 * Public User Signup (No authentication required)
 */
exports.signup = async (req, res) => {
    try {
        const { name, email, phone, companyName, password } = req.body;

        // Validate required fields
        if (!name || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, phone, and password are required",
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Invalid email format",
            });
        }

        // Validate phone format (basic validation)
        const phoneRegex = /^[+]?[\d\s-()]+$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: "Invalid phone number format",
            });
        }

        // Check if user already exists
        const existing = await query(
            "SELECT id FROM users WHERE email = ? OR phone = ?",
            [email, phone]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Email or phone number already registered",
            });
        }

        // Use email as username
        const username = email;

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Create unverified user
        const result = await query(
            "INSERT INTO users (username, email, password_hash, full_name, phone, company_name, role, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [username, email, password_hash, name, phone, companyName || null, "VIEWER", false]
        );

        logger.info(`New user signed up: ${email}`);

        res.status(201).json({
            success: true,
            message: "Account created successfully. Please verify your email and phone.",
            data: {
                id: result.insertId,
                email,
                phone,
                full_name: name,
                company_name: companyName,
                verified: false,
            },
        });
    } catch (error) {
        logger.error("Signup error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create account",
        });
    }
};

/**
 * Send OTP (Email or Phone)
 */
exports.sendOTP = async (req, res) => {
    try {
        const { identifier, type } = req.body; // identifier = email or phone, type = 'email' or 'phone'

        if (!identifier || !type) {
            return res.status(400).json({
                success: false,
                message: "Identifier and type are required",
            });
        }

        if (!['email', 'phone'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Type must be 'email' or 'phone'",
            });
        }

        // Check if user exists
        const field = type === 'email' ? 'email' : 'phone';
        const users = await query(
            `SELECT id, ${field}, verified FROM users WHERE ${field} = ?`,
            [identifier]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No account found with this ${type}`,
            });
        }

        // Generate and store OTP
        const otp = generateOTP();
        storeOTP(identifier, otp, type);

        // Send OTP
        if (type === 'email') {
            await sendOTPEmail(identifier, otp, 'verification');
        } else {
            const result = await sendOTPSMS(identifier, otp);
            if (!result.success && !result.skipped) {
                return res.status(500).json({
                    success: false,
                    message: result.message || "Failed to send OTP SMS",
                });
            }
            // If SMS was skipped due to missing template, still return success
            if (result.skipped) {
                logger.warn(`SMS OTP skipped for ${identifier} - template not configured`);
            }
        }

        logger.info(`OTP sent to ${type}: ${identifier}`);

        res.json({
            success: true,
            message: `OTP sent to your ${type}`,
        });
    } catch (error) {
        logger.error("Send OTP error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send OTP",
        });
    }
};

/**
 * Send OTP for Registration (No user check required)
 */
exports.sendRegistrationOTP = async (req, res) => {
    try {
        const { identifier, type } = req.body; // identifier = email or phone, type = 'email' or 'phone'

        if (!identifier || !type) {
            return res.status(400).json({
                success: false,
                message: "Identifier and type are required",
            });
        }

        if (!['email', 'phone'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Type must be 'email' or 'phone'",
            });
        }

        // Validate format
        if (type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(identifier)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid email format",
                });
            }
        } else {
            const phoneRegex = /^[+]?[\d\s-()]+$/;
            if (!phoneRegex.test(identifier)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid phone number format",
                });
            }
        }

        // Check if already registered
        const field = type === 'email' ? 'email' : 'phone';
        const existing = await query(
            `SELECT id FROM users WHERE ${field} = ?`,
            [identifier]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: `This ${type} is already registered`,
            });
        }

        // Generate and store OTP
        const otp = generateOTP();
        storeOTP(identifier, otp, `registration_${type}`);

        // Send OTP
        if (type === 'email') {
            await sendOTPEmail(identifier, otp, 'verification');
        } else {
            const result = await sendOTPSMS(identifier, otp);
            if (!result.success && !result.skipped) {
                return res.status(500).json({
                    success: false,
                    message: result.message || "Failed to send OTP SMS",
                });
            }
            // If SMS was skipped due to missing template, still return success
            if (result.skipped) {
                logger.warn(`SMS OTP skipped for ${identifier} - template not configured`);
            }
        }

        logger.info(`Registration OTP sent to ${type}: ${identifier}`);

        res.json({
            success: true,
            message: `OTP sent to your ${type}`,
        });
    } catch (error) {
        logger.error("Send registration OTP error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send OTP",
        });
    }
};

/**
 * Verify OTP for Registration
 */
exports.verifyRegistrationOTP = async (req, res) => {
    try {
        const { identifier, otp, type } = req.body;

        if (!identifier || !otp || !type) {
            return res.status(400).json({
                success: false,
                message: "Identifier, OTP, and type are required",
            });
        }

        if (!['email', 'phone'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Type must be 'email' or 'phone'",
            });
        }

        // Verify OTP with registration prefix
        const result = verifyOTP(identifier, otp, `registration_${type}`);

        if (!result.success) {
            return res.status(400).json(result);
        }

        logger.info(`Registration ${type} verified for: ${identifier}`);

        res.json({
            success: true,
            message: `${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully`,
        });
    } catch (error) {
        logger.error("Verify registration OTP error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify OTP",
        });
    }
};

/**
 * Verify OTP
 */
exports.verifyOTPEndpoint = async (req, res) => {
    try {
        const { identifier, otp, type } = req.body;

        if (!identifier || !otp || !type) {
            return res.status(400).json({
                success: false,
                message: "Identifier, OTP, and type are required",
            });
        }

        if (!['email', 'phone'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Type must be 'email' or 'phone'",
            });
        }

        // Verify OTP
        const result = verifyOTP(identifier, otp, type);

        if (!result.success) {
            return res.status(400).json(result);
        }

        // Update user verification status
        const field = type === 'email' ? 'email' : 'phone';
        await query(
            `UPDATE users SET verified = TRUE, verified_date = NOW() WHERE ${field} = ?`,
            [identifier]
        );

        logger.info(`${type} verified for: ${identifier}`);

        res.json({
            success: true,
            message: `${type.charAt(0).toUpperCase() + type.slice(1)} verified successfully`,
        });
    } catch (error) {
        logger.error("Verify OTP error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify OTP",
        });
    }
};

/**
 * Forgot Password - Send Reset OTP
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }

        // Check if user exists
        const users = await query(
            "SELECT id, email FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            // Don't reveal if email exists or not for security
            return res.json({
                success: true,
                message: "If the email exists, a password reset OTP has been sent",
            });
        }

        // Generate and store OTP
        const otp = generateOTP();
        storeOTP(email, otp, 'reset');

        // Send OTP email
        await sendOTPEmail(email, otp, 'reset');

        logger.info(`Password reset OTP sent to: ${email}`);

        res.json({
            success: true,
            message: "If the email exists, a password reset OTP has been sent",
        });
    } catch (error) {
        logger.error("Forgot password error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process password reset request",
        });
    }
};

/**
 * Reset Password with OTP
 */
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email, OTP, and new password are required",
            });
        }

        // Validate password strength
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long",
            });
        }

        // Verify OTP
        const result = verifyOTP(email, otp, 'reset');

        if (!result.success) {
            return res.status(400).json(result);
        }

        // Check if user exists
        const users = await query(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(newPassword, salt);

        // Update password
        await query(
            "UPDATE users SET password_hash = ? WHERE email = ?",
            [password_hash, email]
        );

        logger.info(`Password reset successful for: ${email}`);

        res.json({
            success: true,
            message: "Password reset successfully",
        });
    } catch (error) {
        logger.error("Reset password error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reset password",
        });
    }
};

/**
 * Get All Users (Admin only)
 */
exports.getAllUsers = async (req, res) => {
    try {
        // Only admins can view all users
        if (req.user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only admins can view all users",
            });
        }

        const { verified, role, search } = req.query;
        
        let whereClause = "WHERE 1=1";
        const params = [];

        // Filter by verification status
        if (verified !== undefined) {
            whereClause += " AND verified = ?";
            params.push(verified === 'true');
        }

        // Filter by role
        if (role) {
            whereClause += " AND role = ?";
            params.push(role);
        }

        // Search by name or email
        if (search) {
            whereClause += " AND (full_name LIKE ? OR email LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        const users = await query(
            `SELECT id, username, email, full_name, phone, company_name, verified, verified_date, role, last_login, created_at 
             FROM users ${whereClause} 
             ORDER BY created_at DESC`,
            params
        );

        res.json({
            success: true,
            data: users,
        });
    } catch (error) {
        logger.error("Get all users error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch users",
        });
    }
};

/**
 * Get Available Companies (from exam_body)
 * Public endpoint - no authentication required for registration
 */
exports.getAvailableCompanies = async (req, res) => {
    try {
        // Fixed list of available companies
        const companyList = ['EY', 'SSC', 'TCS', 'CDIS'];

        res.json({
            success: true,
            data: companyList,
        });
    } catch (error) {
        logger.error("Get available companies error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch available companies",
        });
    }
};

