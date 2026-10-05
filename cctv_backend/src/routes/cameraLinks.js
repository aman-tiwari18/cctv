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

// Stream the classification frame image for one camera.
// Authenticated — falls back to ssh+docker exec on workers when the frame
// only exists inline within a worker container (paths under /app/results/).
router.get(
    "/exams/:examId/cameras/:id/frame",
    authenticate,
    asyncHandler(CameraController.getFrame)
);

// Distinct classification values for the dropdown in the verify dialog.
router.get(
    "/exams/:examId/cameras/classifications",
    authenticate,
    asyncHandler(CameraController.getClassificationOptions)
);

// Distinct region values (RTSP only) for the Cameras tab / Detections page
// region filter dropdown.
router.get(
    "/exams/:examId/cameras/regions",
    authenticate,
    asyncHandler(CameraController.getRegionOptions)
);

// Distinct classification "runs" (vision-classification executions), grouped
// from the classification-history tables by burst gap, for the run-picker dropdown.
router.get(
    "/exams/:examId/cameras/classification-runs",
    authenticate,
    asyncHandler(CameraController.getClassificationRuns)
);

// Operator-driven manual verification of a camera's classification.
// Sets classification + manually_verified=1 + verified_by=<user.id>.
router.post(
    "/exams/:examId/cameras/:id/verify",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(CameraController.verifyClassification)
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
