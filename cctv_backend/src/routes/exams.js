const express = require("express");
const router = express.Router();
const ExamController = require("../controllers/ExamController");
const { asyncHandler } = require("../middleware/errorHandler");
const { examValidation } = require("../utils/validators");
const { authenticate, authorize } = require("../middleware/auth");
const ExamObserverController = require("../controllers/ExamObserverController");
const { upload, cleanupOnError } = require("../middleware/upload");
const ExamScheduleController = require("../controllers/ExamScheduleController");
const ServerRoomThresholdController = require("../controllers/ServerRoomThresholdController");

// multer errors (wrong type, too big) as clear 400s instead of a generic 500
const uploadSheet = (req, res, next) => upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "The file is too large (max 10 MB)"
        : err.code === "LIMIT_UNEXPECTED_FIELD" ? 'Send the Excel file in the "file" field'
        : err.message || "The upload failed";
    return res.status(400).json({ success: false, message });
});
const adminOnly = [authenticate, authorize("ADMIN")];
const adminOrOperator = [authenticate, authorize("ADMIN", "OPERATOR")];

// Blank observer-sheet template. Registered before "/:id" so Express doesn't
// read "observers" as an exam id — and exam-independent, because the exam does
// not exist yet while the admin is filling in the create form.
router.get(
    "/observers/template",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ExamObserverController.downloadTemplate)
);

// ── Exam schedule + server-room thresholds (exam-independent: templates, form fill) ──
router.get("/centre-schedule/template", adminOrOperator, asyncHandler(ExamScheduleController.centreTemplate));
router.get("/slot-schedule/template", adminOrOperator, asyncHandler(ExamScheduleController.slotTemplate));
router.get("/server-room-thresholds/template", adminOrOperator, asyncHandler(ServerRoomThresholdController.template));
// Read an "Exam Schedule" sheet and return the values for the exam FORM (the exam may not exist yet)
router.post("/schedule-sheet/parse", ...adminOnly, uploadSheet, asyncHandler(ExamScheduleController.parseForForm));

router.post(
    "/",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    examValidation.create,
    asyncHandler(ExamController.createExam)
);

router.get(
    "/",
    authenticate,
    asyncHandler(ExamController.getAllExams)
);

router.get(
    "/:id",
    authenticate,
    asyncHandler(ExamController.getExamById)
);

router.put(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    examValidation.update,
    asyncHandler(ExamController.updateExam)
);

router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN"),
    asyncHandler(ExamController.deleteExam)
);

// Get detection count for an exam
router.get(
    "/:id/detections/count",
    authenticate,
    asyncHandler(ExamController.getDetectionCount)
);

// Get all verified VIEWER users available for assignment
router.get(
    "/assignable/users",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ExamController.getAssignableUsers)
);

// Get assigned users for a specific exam
router.get(
    "/:id/assigned-users",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ExamController.getExamAssignedUsers)
);

// ── Per-exam TC code → observer mobile mapping (SMS alert recipients) ──
// Uploaded as a two-column Excel sheet from the exam form; consumed by the
// accept-path alert in ClientDetectionsController. See utils/examObservers.js.

router.post(
    "/:examId/observers/upload",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    upload.single("file"),
    cleanupOnError,
    asyncHandler(ExamObserverController.uploadObservers)
);

router.get(
    "/:examId/observers",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ExamObserverController.getObservers)
);

router.delete(
    "/:examId/observers",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ExamObserverController.deleteObservers)
);

// ── Which date / shift / centre runs (see docs/EXAM_SCHEDULE_AND_THRESHOLDS.md) ──
router.post("/:examId/slot-schedule/upload", ...adminOnly, uploadSheet, asyncHandler(ExamScheduleController.uploadSlotSchedule));
router.get("/:examId/slot-schedule", ...adminOrOperator, asyncHandler(ExamScheduleController.getSlotSchedule));
router.delete("/:examId/slot-schedule", ...adminOnly, asyncHandler(ExamScheduleController.deleteSlotSchedule));
router.post("/:examId/centre-schedule/upload", ...adminOnly, uploadSheet, asyncHandler(ExamScheduleController.uploadCentreSchedule));
router.get("/:examId/centre-schedule/export", ...adminOrOperator, asyncHandler(ExamScheduleController.exportCentreSchedule));
router.put("/:examId/centre-schedule/cell", ...adminOnly, asyncHandler(ExamScheduleController.setCentreCell));
router.get("/:examId/centre-schedule", ...adminOrOperator, asyncHandler(ExamScheduleController.getCentreSchedule));
router.delete("/:examId/centre-schedule", ...adminOnly, asyncHandler(ExamScheduleController.deleteCentreSchedule));
router.get("/:examId/slot-summary", ...adminOrOperator, asyncHandler(ExamScheduleController.getSlotSummary));

// ── Server-room thresholds (HLS + RTSP) ──
router.post("/:examId/server-room-thresholds/upload", ...adminOnly, uploadSheet, asyncHandler(ServerRoomThresholdController.upload));
router.get("/:examId/server-room-thresholds/export", ...adminOrOperator, asyncHandler(ServerRoomThresholdController.exportAll));
router.get("/:examId/server-room-thresholds", ...adminOrOperator, asyncHandler(ServerRoomThresholdController.list));
router.put("/:examId/server-room-thresholds", ...adminOnly, asyncHandler(ServerRoomThresholdController.upsert));
router.delete("/:examId/server-room-thresholds/:id", ...adminOnly, asyncHandler(ServerRoomThresholdController.removeOne));
router.delete("/:examId/server-room-thresholds", ...adminOnly, asyncHandler(ServerRoomThresholdController.removeAll));

module.exports = router;
