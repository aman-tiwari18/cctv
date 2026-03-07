const express = require("express");
const router = express.Router({ mergeParams: true });
const AnalyticsController = require("../controllers/AnalyticsController");
const { asyncHandler } = require("../middleware/errorHandler");
const { analyticsTaskValidation } = require("../utils/validators");
const { authenticate, authorize } = require("../middleware/auth");
const { upload, cleanupOnError } = require("../middleware/upload");

// ── Nested under /api/exams ──────────────────────────────────
router.post(
    "/:examId/analytics",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    analyticsTaskValidation.create,
    asyncHandler(AnalyticsController.createTask)
);

router.post(
    "/:examId/analytics/upload",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    upload.single("file"),
    cleanupOnError,
    asyncHandler(AnalyticsController.uploadTasks)
);

router.get(
    "/:examId/analytics",
    authenticate,
    asyncHandler(AnalyticsController.getByExam)
);

// ── Direct access routes (/api/analytics) ────────────────────
router.get(
    "/allTask",
    authenticate,
    asyncHandler(AnalyticsController.getAllTasks)
);

router.put(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    analyticsTaskValidation.update,
    asyncHandler(AnalyticsController.updateTask)
);

router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(AnalyticsController.deleteTask)
);

module.exports = router;
