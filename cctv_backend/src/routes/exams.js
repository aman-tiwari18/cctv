const express = require("express");
const router = express.Router();
const ExamController = require("../controllers/ExamController");
const { asyncHandler } = require("../middleware/errorHandler");
const { examValidation } = require("../utils/validators");
const { authenticate, authorize } = require("../middleware/auth");
const ExamObserverController = require("../controllers/ExamObserverController");
const { upload, cleanupOnError } = require("../middleware/upload");

// Blank observer-sheet template. Registered before "/:id" so Express doesn't
// read "observers" as an exam id — and exam-independent, because the exam does
// not exist yet while the admin is filling in the create form.
router.get(
    "/observers/template",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ExamObserverController.downloadTemplate)
);

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

module.exports = router;
