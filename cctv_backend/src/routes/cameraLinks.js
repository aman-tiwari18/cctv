// const express = require('express');
// const router = express.Router({ mergeParams: true }); // Enable access to params from parent route
// const fs = require('fs');
// const CameraLink = require('../models/CameraLink');
// const Exam = require('../models/Exam');
// const ExcelParser = require('../services/excelParser');
// const { asyncHandler } = require('../middleware/errorHandler');
// const { cameraLinkValidation } = require('../utils/validators');
// const { authenticate, authorize } = require('../middleware/auth');
// const { upload, cleanupOnError } = require('../middleware/upload');

// /**
//  * @route   POST /api/exams/:examId/cameras
//  * @desc    Add camera link manually
//  * @access  Private (Admin/Operator)
//  */
// router.post('/:examId/cameras',
//     authenticate,
//     authorize('ADMIN', 'OPERATOR'),
//     cameraLinkValidation.create,
//     asyncHandler(async (req, res) => {
//         const { camera_id, stream_url, stream_type, location, metadata } = req.body;
//         const exam_id = req.params.examId; // From route mount path

//         // Verify exam exists
//         const exam = await Exam.findById(exam_id);
//         if (!exam) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Exam not found'
//             });
//         }

//         const cameraLink = await CameraLink.create({
//             exam_id,
//             camera_id,
//             stream_url,
//             stream_type,
//             location,
//             metadata
//         });

//         res.status(201).json({
//             success: true,
//             message: 'Camera link added successfully',
//             data: cameraLink
//         });
//     })
// );

// /**
//  * @route   POST /api/exams/:examId/cameras/upload
//  * @desc    Upload Excel file with camera links
//  * @access  Private (Admin/Operator)
//  */
// router.post('/:examId/cameras/upload',
//     authenticate,
//     authorize('ADMIN', 'OPERATOR'),
//     upload.single('file'),
//     cleanupOnError,
//     asyncHandler(async (req, res) => {
//         const exam_id = req.params.examId; // From route mount path

//         // Verify exam exists
//         const exam = await Exam.findById(exam_id);
//         if (!exam) {
//             // Clean up uploaded file
//             if (req.file) fs.unlinkSync(req.file.path);
//             return res.status(404).json({
//                 success: false,
//                 message: 'Exam not found'
//             });
//         }

//         if (!req.file) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'No file uploaded'
//             });
//         }

//         // Parse Excel file
//         const parseResult = ExcelParser.parseCameraLinks(
//             req.file.path,
//             exam_id,
//             exam.link_type
//         );

//         // Clean up uploaded file
//         fs.unlinkSync(req.file.path);

//         if (!parseResult.success || parseResult.data.length === 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Failed to parse Excel file',
//                 errors: parseResult.errors
//             });
//         }

//         // Bulk insert camera links
//         await CameraLink.bulkCreate(parseResult.data);

//         res.status(201).json({
//             success: true,
//             message: `Successfully imported ${parseResult.count} camera links`,
//             count: parseResult.count,
//             errors: parseResult.errors.length > 0 ? parseResult.errors : undefined
//         });
//     })
// );

// /**
//  * @route   GET /api/exams/:examId/cameras
//  * @desc    Get all camera links for an exam
//  * @access  Private
//  */
// router.get('/:examId/cameras',
//     authenticate,
//     asyncHandler(async (req, res) => {
//         const { is_active } = req.query;
//         const filters = {};
//         if (is_active !== undefined) filters.is_active = is_active === 'true';

//         const cameras = await CameraLink.findByExamId(req.params.examId, filters);

//         res.json({
//             success: true,
//             count: cameras.length,
//             data: cameras
//         });
//     })
// );

// /**
//  * @route   PUT /api/cameras/:id
//  * @desc    Update camera link
//  * @access  Private (Admin/Operator)
//  */
// router.put('/:id',
//     authenticate,
//     authorize('ADMIN', 'OPERATOR'),
//     cameraLinkValidation.update,
//     asyncHandler(async (req, res) => {
//         const camera = await CameraLink.update(req.params.id, req.body);

//         if (!camera) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Camera link not found'
//             });
//         }

//         res.json({
//             success: true,
//             message: 'Camera link updated successfully',
//             data: camera
//         });
//     })
// );

// /**
//  * @route   DELETE /api/cameras/:id
//  * @desc    Delete camera link (soft delete)
//  * @access  Private (Admin/Operator)
//  */
// router.delete('/:id',
//     authenticate,
//     authorize('ADMIN', 'OPERATOR'),
//     asyncHandler(async (req, res) => {
//         await CameraLink.delete(req.params.id);

//         res.json({
//             success: true,
//             message: 'Camera link deleted successfully'
//         });
//     })
// );

// module.exports = router;

const express = require("express");
const router = express.Router();

const controller = require("../controllers/cameraLink.controller");

const { authenticate, authorize } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

router.post(
    "/",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(controller.createCamera)
);

router.post(
    "/bulk",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(controller.bulkCreateCamera)
);

router.get(
    "/exam/:examId",
    authenticate,
    asyncHandler(controller.getByExam)
);

router.get(
    "/:id",
    authenticate,
    asyncHandler(controller.getById)
);

router.get(
    "/exam/:examId/type/:type",
    authenticate,
    asyncHandler(controller.getByExamAndType)
);

router.put(
    "/:id",
    authenticate,
    authorize("ADMIN", "OPERATOR"),
    asyncHandler(controller.updateCamera)
);

router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN"),
    asyncHandler(controller.deleteCamera)
);

module.exports = router;

