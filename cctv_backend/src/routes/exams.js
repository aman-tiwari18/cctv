const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const { asyncHandler } = require('../middleware/errorHandler');
const { examValidation } = require('../utils/validators');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @route   POST /api/exams
 * @desc    Create a new exam
 * @access  Private (Admin/Operator)
 */
router.post('/',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    examValidation.create,
    asyncHandler(async (req, res) => {
        const { exam_name, exam_body, link_type, description } = req.body;

        const exam = await Exam.create({
            exam_name,
            exam_body,
            link_type,
            description
        });

        res.status(201).json({
            success: true,
            message: 'Exam created successfully',
            data: exam
        });
    })
);

/**
 * @route   GET /api/exams
 * @desc    Get all exams
 * @access  Private
 */
router.get('/',
    authenticate,
    asyncHandler(async (req, res) => {
        const { is_active, exam_body } = req.query;

        const filters = {};
        if (is_active !== undefined) filters.is_active = is_active === 'true';
        if (exam_body) filters.exam_body = exam_body;

        const exams = await Exam.findAll(filters);

        res.json({
            success: true,
            count: exams.length,
            data: exams
        });
    })
);

/**
 * @route   GET /api/exams/:id
 * @desc    Get exam by ID with details
 * @access  Private
 */
router.get('/:id',
    authenticate,
    asyncHandler(async (req, res) => {
        const exam = await Exam.findByIdWithDetails(req.params.id);

        if (!exam) {
            return res.status(404).json({
                success: false,
                message: 'Exam not found'
            });
        }

        res.json({
            success: true,
            data: exam
        });
    })
);

/**
 * @route   PUT /api/exams/:id
 * @desc    Update exam
 * @access  Private (Admin/Operator)
 */
router.put('/:id',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    examValidation.update,
    asyncHandler(async (req, res) => {
        const exam = await Exam.update(req.params.id, req.body);

        res.json({
            success: true,
            message: 'Exam updated successfully',
            data: exam
        });
    })
);

/**
 * @route   DELETE /api/exams/:id
 * @desc    Delete exam (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
    authenticate,
    authorize('ADMIN'),
    asyncHandler(async (req, res) => {
        await Exam.delete(req.params.id);

        res.json({
            success: true,
            message: 'Exam deleted successfully'
        });
    })
);

module.exports = router;
