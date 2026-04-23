const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/AuthController");
const { asyncHandler } = require("../middleware/errorHandler");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");

router.post(
    "/login",
    [
        body("username").trim().notEmpty().withMessage("Username is required"),
        body("password").notEmpty().withMessage("Password is required"),
    ],
    asyncHandler(AuthController.login)
);

router.post(
    "/register",
    authenticate,
    [
        body("username").trim().notEmpty().withMessage("Username is required"),
        body("email").isEmail().withMessage("Valid email is required"),
        body("password")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters"),
        body("full_name").optional().trim(),
        body("phone").optional().trim(),
        body("company_name").optional().trim(),
        body("role").optional().isIn(["ADMIN", "OPERATOR", "VIEWER"]),
    ],
    asyncHandler(AuthController.register)
);

router.get(
    "/me",
    authenticate,
    asyncHandler(AuthController.getMe)
);

router.put(
    "/profile",
    authenticate,
    [
        body("full_name").optional().trim(),
        body("phone").optional().trim(),
        body("company_name").optional().trim(),
    ],
    asyncHandler(AuthController.updateProfile)
);

router.put(
    "/verify/:userId",
    authenticate,
    [
        body("verified").optional().isBoolean().withMessage("Verified must be a boolean"),
        body("role").optional().isIn(["ADMIN", "OPERATOR", "VIEWER"]).withMessage("Role must be ADMIN, OPERATOR, or VIEWER"),
    ],
    asyncHandler(AuthController.verifyUser)
);

// Public signup endpoint (no authentication required)
router.post(
    "/signup",
    [
        body("name").trim().notEmpty().withMessage("Name is required"),
        body("email").isEmail().withMessage("Valid email is required"),
        body("phone").trim().notEmpty().withMessage("Phone number is required"),
        body("password")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters"),
        body("companyName").optional().trim(),
    ],
    asyncHandler(AuthController.signup)
);

// Send OTP endpoint (no authentication required)
router.post(
    "/send-otp",
    [
        body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
        body("type").isIn(["email", "phone"]).withMessage("Type must be 'email' or 'phone'"),
    ],
    asyncHandler(AuthController.sendOTP)
);

// Send OTP for registration (no authentication required)
router.post(
    "/send-registration-otp",
    [
        body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
        body("type").isIn(["email", "phone"]).withMessage("Type must be 'email' or 'phone'"),
    ],
    asyncHandler(AuthController.sendRegistrationOTP)
);

// Verify OTP endpoint (no authentication required)
router.post(
    "/verify-otp",
    [
        body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
        body("otp").trim().notEmpty().withMessage("OTP is required"),
        body("type").isIn(["email", "phone"]).withMessage("Type must be 'email' or 'phone'"),
    ],
    asyncHandler(AuthController.verifyOTPEndpoint)
);

// Verify OTP for registration (no authentication required)
router.post(
    "/verify-registration-otp",
    [
        body("identifier").trim().notEmpty().withMessage("Email or phone is required"),
        body("otp").trim().notEmpty().withMessage("OTP is required"),
        body("type").isIn(["email", "phone"]).withMessage("Type must be 'email' or 'phone'"),
    ],
    asyncHandler(AuthController.verifyRegistrationOTP)
);

// Forgot password endpoint (no authentication required)
router.post(
    "/forgot-password",
    [
        body("email").isEmail().withMessage("Valid email is required"),
    ],
    asyncHandler(AuthController.forgotPassword)
);

// Reset password endpoint (no authentication required)
router.post(
    "/reset-password",
    [
        body("email").isEmail().withMessage("Valid email is required"),
        body("otp").trim().notEmpty().withMessage("OTP is required"),
        body("newPassword")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters"),
    ],
    asyncHandler(AuthController.resetPassword)
);

// Get all users endpoint (Admin only)
router.get(
    "/users",
    authenticate,
    asyncHandler(AuthController.getAllUsers)
);

// Get available companies endpoint (Public - for registration)
router.get(
    "/companies",
    asyncHandler(AuthController.getAvailableCompanies)
);

module.exports = router;
