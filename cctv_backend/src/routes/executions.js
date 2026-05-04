const express = require("express");
const router = express.Router();
const ExecutionController = require("../controllers/ExecutionController");
const CameraController = require("../controllers/CameraController");
const { asyncHandler } = require("../middleware/errorHandler");
const { executionValidation } = require("../utils/validators");
const { authenticate } = require("../middleware/auth");

// Pending assignments (for script server polling)
router.get(
    "/pending",
    // authenticate,
    asyncHandler(ExecutionController.getPending)
);

// Running assignments (for workers restarting mid-shift — no auth required)
router.get(
    "/running",
    asyncHandler(ExecutionController.getRunning)
);

// Recent assignments
router.get(
    "/recent",
    authenticate,
    asyncHandler(ExecutionController.getRecent)
);

// Execution statistics
router.get(
    "/stats/summary",
    authenticate,
    asyncHandler(ExecutionController.getStats)
);

// Assignments by shift
router.get(
    "/shifts/:shiftId",
    authenticate,
    asyncHandler(ExecutionController.getByShift)
);

// All assignments (with filters)
router.get(
    "/",
    authenticate,
    asyncHandler(ExecutionController.getAll)
);

// Get assignment by ID
router.get(
    "/:id",
    authenticate,
    asyncHandler(ExecutionController.getById)
);

router.get(
    "/:id/cameras",
    authenticate,
    asyncHandler(CameraController.getByAssignment)
);

// Update assignment status (called by script server)
router.put(
    "/:id/status",
    authenticate,
    executionValidation.updateStatus,
    asyncHandler(ExecutionController.updateStatus)
);

module.exports = router;
