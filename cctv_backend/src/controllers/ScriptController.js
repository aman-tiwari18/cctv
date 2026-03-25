const Script = require("../models/Script");
const scriptRegistry = require("../config/scriptRegistry");

const syncBuiltInScripts = async () => {
    const builtInScripts = Object.entries(scriptRegistry).map(([script_id, config]) => ({
        script_id,
        name: config.name,
        default_frequency_minutes: config.default_frequency || 5,
        default_duration_minutes: config.default_duration || 1,
        is_active: true,
    }));

    if (builtInScripts.length === 0) {
        return;
    }

    await Script.bulkCreate(builtInScripts, {
        updateOnDuplicate: [
            "name",
            "default_frequency_minutes",
            "default_duration_minutes",
            "is_active",
            "updated_at",
        ],
    });
};

/**
 * Get all available scripts
 */
exports.getAll = async (req, res) => {
    const { is_active } = req.query;

    await syncBuiltInScripts();

    const where = {};
    if (is_active !== undefined) where.is_active = is_active === "true";

    const scripts = await Script.findAll({
        where,
        order: [["name", "ASC"]],
    });

    res.json({
        success: true,
        count: scripts.length,
        data: scripts,
    });
};

/**
 * Get script by ID
 */
exports.getById = async (req, res) => {
    const script = await Script.findByPk(req.params.id);

    if (!script) {
        return res.status(404).json({
            success: false,
            message: "Script not found",
        });
    }

    res.json({
        success: true,
        data: script,
    });
};

/**
 * Create a new script
 */
exports.createScript = async (req, res) => {
    const {
        script_id,
        name,
        default_frequency_minutes,
        default_duration_minutes,
    } = req.body;

    // Check for duplicate script_id
    const existing = await Script.findOne({ where: { script_id } });
    if (existing) {
        return res.status(400).json({
            success: false,
            message: `Script with id "${script_id}" already exists`,
        });
    }

    const script = await Script.create({
        script_id,
        name,
        default_frequency_minutes: default_frequency_minutes || 5,
        default_duration_minutes: default_duration_minutes || 1,
    });

    res.status(201).json({
        success: true,
        message: "Script created successfully",
        data: script,
    });
};

/**
 * Update a script
 */
exports.updateScript = async (req, res) => {
    const script = await Script.findByPk(req.params.id);

    if (!script) {
        return res.status(404).json({
            success: false,
            message: "Script not found",
        });
    }

    await script.update(req.body);

    res.json({
        success: true,
        message: "Script updated successfully",
        data: script,
    });
};

/**
 * Delete a script (soft delete)
 */
exports.deleteScript = async (req, res) => {
    const script = await Script.findByPk(req.params.id);

    if (!script) {
        return res.status(404).json({
            success: false,
            message: "Script not found",
        });
    }

    await script.update({ is_active: false });

    res.json({
        success: true,
        message: "Script deleted successfully",
    });
};
