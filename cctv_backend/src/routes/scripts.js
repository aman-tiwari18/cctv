const express = require("express");
const router = express.Router();
const ScriptController = require("../controllers/ScriptController");
const { authenticate } = require("../middleware/auth");

router.get(
    "/",
    authenticate,
    ScriptController.getAllScripts
);

module.exports = router;
