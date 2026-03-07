const express = require("express");
const router = express.Router();
const CameraController = require("../controllers/CameraController");
const { asyncHandler } = require("../middleware/errorHandler");
const { authenticate, authorize } = require("../middleware/auth");

router.post(
    "/",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(CameraController.createCamera)
);

router.post(
    "/bulk",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(CameraController.bulkCreateCamera)
);

router.get(
    "/exam/:examId",
    authenticate,
    asyncHandler(CameraController.getByExam)
);

router.get(
    "/:id",
    authenticate,
    asyncHandler(CameraController.getById)
);

router.get(
    "/exam/:examId/type/:type",
    authenticate,
    asyncHandler(CameraController.getByExamAndType)
);

router.put(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(CameraController.updateCamera)
);

router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN"),
    asyncHandler(CameraController.deleteCamera)
);

module.exports = router;
