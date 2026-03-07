const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/database");


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

    // Update last login
    await query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

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

    const { username, email, password, full_name, role } = req.body;

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
        "INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)",
        [username, email, password_hash, full_name || null, role || "VIEWER"]
    );

    res.status(201).json({
        success: true,
        message: "User created successfully",
        data: {
            id: result.insertId,
            username,
            email,
            role: role || "VIEWER",
        },
    });
};


/**
 * Get Current User
 */
exports.getMe = async (req, res) => {
    const users = await query(
        "SELECT id, username, email, full_name, role, last_login, created_at FROM users WHERE id = ?",
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
