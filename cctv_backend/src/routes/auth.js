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
        body("role").optional().isIn(["ADMIN", "OPERATOR", "VIEWER"]),
    ],
    asyncHandler(AuthController.register)
);

router.get(
    "/me",
    authenticate,
    asyncHandler(AuthController.getMe)
);

module.exports = router;
