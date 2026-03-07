const express = require("express");
const router = express.Router({ mergeParams: true });
const ScheduleController = require("../controllers/ScheduleController");
const { asyncHandler } = require("../middleware/errorHandler");
const { scheduleValidation } = require("../utils/validators");
const { authenticate, authorize } = require("../middleware/auth");
const { upload, cleanupOnError } = require("../middleware/upload");

// ── Nested under /api/exams ──────────────────────────────────
router.post(
    "/:examId/schedules",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    scheduleValidation.create,
    asyncHandler(ScheduleController.createSchedule)
);

router.post(
    "/:examId/schedules/upload",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    upload.single("file"),
    cleanupOnError,
    asyncHandler(ScheduleController.uploadSchedules)
);

router.get(
    "/:examId/schedules",
    authenticate,
    asyncHandler(ScheduleController.getByExam)
);

// ── Direct access routes (/api/schedules) ────────────────────
router.get(
    "/upcoming",
    authenticate,
    asyncHandler(ScheduleController.getUpcoming)
);

router.put(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    scheduleValidation.update,
    asyncHandler(ScheduleController.updateSchedule)
);

router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ScheduleController.deleteSchedule)
);

module.exports = router;
