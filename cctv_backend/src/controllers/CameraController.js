const CameraLink = require("../models/CameraLink");

/**
 * Create Camera Link
 */
exports.createCamera = async (req, res) => {
    const camera = await CameraLink.create(req.body);

    res.status(201).json({
        success: true,
        message: "Camera link created",
        data: camera,
    });
};

/**
 * Bulk Create / Update
 */
exports.bulkCreateCamera = async (req, res) => {
    const links = req.body;

    if (!Array.isArray(links) || links.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid data",
        });
    }

    await CameraLink.bulkCreate(links, {
        updateOnDuplicate: [
            "stream_url",
            "stream_type",
            "location",
            "metadata",
            "updated_at",
        ],
    });

    res.json({
        success: true,
        message: "Bulk camera links saved",
    });
};

/**
 * Get By Exam
 */
exports.getByExam = async (req, res) => {
    const { examId } = req.params;
    const { is_active = true } = req.query;

    const cameras = await CameraLink.findAll({
        where: {
            exam_id: examId,
            is_active: is_active === "true",
        },
        order: [["created_at", "DESC"]],
    });

    res.json({
        success: true,
        count: cameras.length,
        data: cameras,
    });
};

/**
 * Get By ID
 */
exports.getById = async (req, res) => {
    const camera = await CameraLink.findByPk(req.params.id);

    if (!camera) {
        return res.status(404).json({
            success: false,
            message: "Camera not found",
        });
    }

    res.json({
        success: true,
        data: camera,
    });
};

/**
 * Update
 */
exports.updateCamera = async (req, res) => {
    const camera = await CameraLink.findByPk(req.params.id);

    if (!camera) {
        return res.status(404).json({
            success: false,
            message: "Camera not found",
        });
    }

    await camera.update(req.body);

    res.json({
        success: true,
        message: "Camera updated",
        data: camera,
    });
};

/**
 * Soft Delete
 */
exports.deleteCamera = async (req, res) => {
    await CameraLink.update(
        { is_active: false },
        { where: { id: req.params.id } }
    );

    res.json({
        success: true,
        message: "Camera deleted",
    });
};

/**
 * Get Active By Exam + Type
 */
exports.getByExamAndType = async (req, res) => {
    const { examId, type } = req.params;

    const cameras = await CameraLink.findAll({
        where: {
            exam_id: examId,
            stream_type: type,
            is_active: true,
        },
        order: [["camera_id", "ASC"]],
    });

    res.json({
        success: true,
        count: cameras.length,
        data: cameras,
    });
};
