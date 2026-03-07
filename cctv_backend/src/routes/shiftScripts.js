const express = require("express");
const router = express.Router({ mergeParams: true });
const ShiftScriptController = require("../controllers/ShiftScriptController");
const { asyncHandler } = require("../middleware/errorHandler");
const { authenticate, authorize } = require("../middleware/auth");

// ── Nested under /api/shifts ─────────────────────────────────
router.post(
    "/:shiftId/scripts",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ShiftScriptController.assignScript)
);

router.post(
    "/:shiftId/scripts/bulk",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ShiftScriptController.bulkAssign)
);

router.get(
    "/:shiftId/scripts",
    authenticate,
    asyncHandler(ShiftScriptController.getByShift)
);

// ── Nested under /api/exams ──────────────────────────────────
router.get(
    "/:examId/shift-scripts",
    authenticate,
    asyncHandler(ShiftScriptController.getByExam)
);

// ── Direct access (/api/shift-scripts) ───────────────────────
router.put(
    "/shift-scripts/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ShiftScriptController.updateAssignment)
);

router.delete(
    "/shift-scripts/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ShiftScriptController.deleteAssignment)
);

module.exports = router;
