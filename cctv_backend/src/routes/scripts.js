const express = require("express");
const router = express.Router();
const ScriptController = require("../controllers/ScriptController");
const { asyncHandler } = require("../middleware/errorHandler");
const { authenticate, authorize } = require("../middleware/auth");

// Get all scripts (public for dropdowns)
router.get(
    "/",
    authenticate,
    asyncHandler(ScriptController.getAll)
);

// Get script by ID
router.get(
    "/:id",
    authenticate,
    asyncHandler(ScriptController.getById)
);

// Create a new script
router.post(
    "/",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ScriptController.createScript)
);

// Update a script
router.put(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(ScriptController.updateScript)
);

// Delete a script
router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN"),
    asyncHandler(ScriptController.deleteScript)
);

module.exports = router;
