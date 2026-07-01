const express = require("express");
const router = express.Router();
const ExamController = require("../controllers/ExamController");
const { asyncHandler } = require("../middleware/errorHandler");
const { examValidation } = require("../utils/validators");
const { authenticate, authorize } = require("../middleware/auth");

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

module.exports = router;
