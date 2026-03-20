const express = require("express");
const router = express.Router({ mergeParams: true });
const CameraController = require("../controllers/CameraController");
const { asyncHandler } = require("../middleware/errorHandler");
const { authenticate, authorize } = require("../middleware/auth");

// ── Nested under /api/exams/:examId/cameras ──────────────────
router.post(
    "/exams/:examId/cameras",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(CameraController.createCamera)
);

const { upload, cleanupOnError } = require("../middleware/upload");

router.post(
    "/exams/:examId/cameras/upload",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    upload.single("file"),
    cleanupOnError,
    asyncHandler(CameraController.uploadCameras)
);

// Download blank Excel template (no auth required so user can grab it easily)
router.get(
    "/exams/:examId/cameras/template/:type",
    authenticate,
    asyncHandler(CameraController.downloadTemplate)
);

router.post(
    "/exams/:examId/cameras/bulk",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(CameraController.bulkCreateCamera)
);

router.get(
    "/exams/:examId/cameras",
    authenticate,
    asyncHandler(CameraController.getByExam)
);

router.get(
    "/exams/:examId/cameras/type/:type",
    authenticate,
    asyncHandler(CameraController.getByExamAndType)
);

// ── Direct access routes (/api/cameras) ──────────────────────
router.get(
    "/exams/:examId/cameras/:id",
    authenticate,
    asyncHandler(CameraController.getById)
);

router.put(
    "/exams/:examId/cameras/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(CameraController.updateCamera)
);

router.delete(
    "/exams/:examId/cameras/:id",
    authenticate,
    authorize("ADMIN"),
    asyncHandler(CameraController.deleteCamera)
);

module.exports = router;
