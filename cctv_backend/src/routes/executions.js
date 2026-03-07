const express = require("express");
const router = express.Router();
const ExecutionController = require("../controllers/ExecutionController");
const { asyncHandler } = require("../middleware/errorHandler");
const { executionValidation } = require("../utils/validators");
const { authenticate } = require("../middleware/auth");

router.get(
    "/pending",
    authenticate,
    asyncHandler(ExecutionController.getPending)
);

router.get(
    "/recent",
    authenticate,
    asyncHandler(ExecutionController.getRecent)
);

router.get(
    "/stats/summary",
    authenticate,
    asyncHandler(ExecutionController.getStats)
);

router.get(
    "/shifts/:shiftId/executions",
    authenticate,
    asyncHandler(ExecutionController.getByShift)
);

router.get(
    "/",
    authenticate,
    asyncHandler(ExecutionController.getAll)
);

router.get(
    "/:id",
    authenticate,
    asyncHandler(ExecutionController.getById)
);

router.put(
    "/:id/status",
    authenticate,
    executionValidation.updateStatus,
    asyncHandler(ExecutionController.updateStatus)
);

module.exports = router;
