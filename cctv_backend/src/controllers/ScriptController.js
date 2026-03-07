const scriptRegistry = require("../config/scriptRegistry");


/**
 * Get all available analytics scripts from registry
 */
exports.getAllScripts = async (req, res) => {
    const scripts = Object.entries(scriptRegistry).map(([id, config]) => ({
        id,
        name: config.name,
        description: config.description,
        default_frequency: config.default_frequency,
        default_duration: config.default_duration,
    }));

    res.json({
        success: true,
        count: scripts.length,
        data: scripts,
    });
};
