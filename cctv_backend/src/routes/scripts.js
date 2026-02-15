const express = require('express');
const router = express.Router();
const scriptRegistry = require('../config/scriptRegistry');
const { authenticate } = require('../middleware/auth');

/**
 * @route   GET /api/scripts
 * @desc    Get all available analytics scripts
 * @access  Private
 */
router.get('/',
    authenticate,
    (req, res) => {
        // Convert registry object to array for frontend
        const scripts = Object.entries(scriptRegistry).map(([id, config]) => ({
            id,
            name: config.name,
            description: config.description,
            default_frequency: config.default_frequency,
            default_duration: config.default_duration
        }));

        res.json({
            success: true,
            count: scripts.length,
            data: scripts
        });
    }
);

module.exports = router;
