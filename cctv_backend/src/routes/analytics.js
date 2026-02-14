const express = require('express');
const router = express.Router();
const fs = require('fs');
const AnalyticsTask = require('../models/AnalyticsTask');
const Exam = require('../models/Exam');
const ExcelParser = require('../services/excelParser');
const { asyncHandler } = require('../middleware/errorHandler');
const { analyticsTaskValidation } = require('../utils/validators');
const { authenticate, authorize } = require('../middleware/auth');
const { upload, cleanupOnError } = require('../middleware/upload');

/**
 * @route   POST /api/exams/:examId/analytics
 * @desc    Add analytics task manually
 * @access  Private (Admin/Operator)
 */
router.post('/:examId',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    analyticsTaskValidation.create,
    asyncHandler(async (req, res) => {
        const {
            task_name,
            description,
            script_path,
            frequency_minutes,
            duration_minutes,
            start_time,
            end_time,
            parameters
        } = req.body;
        const exam_id = req.params.examId;

        // Verify exam exists
        const exam = await Exam.findById(exam_id);
        if (!exam) {
            return res.status(404).json({
                success: false,
                message: 'Exam not found'
            });
        }

        const task = await AnalyticsTask.create({
            exam_id,
            task_name,
            description,
            script_path,
            frequency_minutes,
            duration_minutes,
            start_time,
            end_time,
            parameters
        });

        res.status(201).json({
            success: true,
            message: 'Analytics task created successfully',
            data: task
        });
    })
);

/**
 * @route   POST /api/exams/:examId/analytics/upload
 * @desc    Upload Excel file with analytics tasks
 * @access  Private (Admin/Operator)
 */
router.post('/:examId/upload',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    upload.single('file'),
    cleanupOnError,
    asyncHandler(async (req, res) => {
        const exam_id = req.params.examId;

        // Verify exam exists
        const exam = await Exam.findById(exam_id);
        if (!exam) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'Exam not found'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Parse Excel file
        const parseResult = ExcelParser.parseAnalyticsTasks(req.file.path, exam_id);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        if (!parseResult.success || parseResult.data.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Failed to parse Excel file',
                errors: parseResult.errors
            });
        }

        // Bulk create analytics tasks
        await AnalyticsTask.bulkCreate(parseResult.data);

        res.status(201).json({
            success: true,
            message: `Successfully imported ${parseResult.count} analytics tasks`,
            count: parseResult.count,
            errors: parseResult.errors.length > 0 ? parseResult.errors : undefined
        });
    })
);

/**
 * @route   GET /api/exams/:examId/analytics
 * @desc    Get all analytics tasks for an exam
 * @access  Private
 */
router.get('/:examId',
    authenticate,
    asyncHandler(async (req, res) => {
        const { is_active } = req.query;
        const filters = {};
        if (is_active !== undefined) filters.is_active = is_active === 'true';

        const tasks = await AnalyticsTask.findByExamId(req.params.examId, filters);

        res.json({
            success: true,
            count: tasks.length,
            data: tasks
        });
    })
);

/**
 * @route   PUT /api/analytics/:id
 * @desc    Update analytics task
 * @access  Private (Admin/Operator)
 */
router.put('/:id',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    analyticsTaskValidation.update,
    asyncHandler(async (req, res) => {
        const task = await AnalyticsTask.update(req.params.id, req.body);

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Analytics task not found'
            });
        }

        res.json({
            success: true,
            message: 'Analytics task updated successfully',
            data: task
        });
    })
);

/**
 * @route   DELETE /api/analytics/:id
 * @desc    Delete analytics task (soft delete)
 * @access  Private (Admin/Operator)
 */
router.delete('/:id',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    asyncHandler(async (req, res) => {
        await AnalyticsTask.delete(req.params.id);

        res.json({
            success: true,
            message: 'Analytics task deleted successfully'
        });
    })
);

module.exports = router;
