const { CameraLinkHLS, CameraLinkRTSP, Exam } = require("../models");
const xlsx = require("xlsx");
const fs = require("fs");

/**
 * Helper to get the correct model based on exam link type
 */
const getModelByExam = async (examId) => {
    const exam = await Exam.findByPk(examId);
    if (!exam) throw new Error("Exam not found");
    
    if (exam.link_type && exam.link_type.toUpperCase() === "RTSP") {
        return { Model: CameraLinkRTSP, linkType: "RTSP" };
    }
    // Default to HLS
    return { Model: CameraLinkHLS, linkType: "HLS" };
};

/**
 * Upload cameras via Excel file
 */
exports.uploadCameras = async (req, res) => {
    try {
        const examId = req.params.examId;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded",
            });
        }

        const { Model, linkType } = await getModelByExam(examId);

        // Read Excel file
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

        if (!data || data.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Excel file is empty",
            });
        }

        const validRecords = [];

        // Map Excel columns to DB fields
        for (const row of data) {
            if (linkType === "HLS") {
                // Expected HLS columns based on user instruction:
                // Tc_name, tc_code, camera_name, date_of_assessment, shift_of_assessment, url, camera_category
                const url = row["url"] || row["URL"] || row["CCTV URL"] || row["Link"];
                
                if (url) {
                    validRecords.push({
                        exam_id: examId,
                        tc_name: row["Tc_name"] || row["TC NAME"] || row["TC Name"] || "",
                        tc_code: row["tc_code"] || row["TC Code"] || row["TC code"] || "",
                        camera_name: row["camera_name"] || row["Camera Name"] || "",
                        date_of_assessment: row["date_of_assessment"] || row["Date of Assessment"] || "",
                        shift_of_assessment: row["shift_of_assessment"] || row["Shift of Assessment"] || "",
                        url: url,
                        camera_category: row["camera_category"] || row["camera category"] || row["Camera Category"] || "",
                        is_active: true
                    });
                }
            } else {
                // Expected RTSP columns:
                // Tc_name, tc_code, camera_name, city, state, url, camera_category
                const url = row["url"] || row["URL"] || row["Server Address"] || row["Link"];
                
                if (url) {
                    validRecords.push({
                        exam_id: examId,
                        tc_name: row["Tc_name"] || row["TC NAME"] || row["TC name"] || row["Center Name"] || "",
                        tc_code: row["tc_code"] || row["TC Code"] || row["TC Code"] || "",
                        camera_name: row["camera_name"] || row["Camera Name"] || "",
                        city: row["city"] || row["City"] || "",
                        state: row["state"] || row["State"] || "",
                        url: url,
                        camera_category: row["camera_category"] || row["camera category"] || row["Camera Category"] || "",
                        is_active: true
                    });
                }
            }
        }

        if (validRecords.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid records found. Make sure the excel file contains the required columns including 'url' or 'CCTV URL'.",
            });
        }

        // Bulk insert
        await Model.bulkCreate(validRecords);

        res.status(200).json({
            success: true,
            message: `Successfully uploaded ${validRecords.length} cameras.`,
        });

    } catch (error) {
        throw error;
    }
};

/**
 * Create Camera Link manually
 */
exports.createCamera = async (req, res) => {
    const exam_id = req.params.examId;
    const { Model } = await getModelByExam(exam_id);

    const camera = await Model.create({ ...req.body, exam_id });

    res.status(201).json({
        success: true,
        message: "Camera link created",
        data: camera,
    });
};

/**
 * Get By Exam
 */
exports.getByExam = async (req, res) => {
    const { examId } = req.params;
    const { is_active = true } = req.query;

    const { Model, linkType } = await getModelByExam(examId);

    const cameras = await Model.findAll({
        where: {
            exam_id: examId,
            is_active: is_active === "true" || is_active === true,
        },
        order: [["created_at", "DESC"]],
    });

    res.json({
        success: true,
        count: cameras.length,
        linkType: linkType,
        data: cameras,
    });
};

/**
 * Get By ID
 */
exports.getById = async (req, res) => {
    const { examId, id } = req.params;
    const { Model, linkType } = await getModelByExam(examId);

    const camera = await Model.findByPk(id);

    if (!camera) {
        return res.status(404).json({
            success: false,
            message: "Camera not found",
        });
    }

    res.json({
        success: true,
        type: linkType,
        data: camera,
    });
};

/**
 * Update
 */
exports.updateCamera = async (req, res) => {
    const { examId, id } = req.params;
    const { Model } = await getModelByExam(examId);

    const camera = await Model.findByPk(id);

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
    const { examId, id } = req.params;
    const { Model } = await getModelByExam(examId);

    await Model.update(
        { is_active: false },
        { where: { id: id } }
    );

    res.json({
        success: true,
        message: "Camera deleted",
    });
};
