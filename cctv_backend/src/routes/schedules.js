const express = require('express');
const router = express.Router({ mergeParams: true }); // Enable access to params from parent route
const fs = require('fs');
const ExamSchedule = require('../models/ExamSchedule');
const Exam = require('../models/Exam');
const ExcelParser = require('../services/excelParser');
const { asyncHandler } = require('../middleware/errorHandler');
const { scheduleValidation } = require('../utils/validators');
const { authenticate, authorize } = require('../middleware/auth');
const { upload, cleanupOnError } = require('../middleware/upload');

/**
 * @route   POST /api/exams/:examId/schedules
 * @desc    Add schedule manually
 * @access  Private (Admin/Operator)
 */
router.post('/:examId/schedules',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    scheduleValidation.create,
    asyncHandler(async (req, res) => {
        const { exam_date, shifts, notes } = req.body;
        const exam_id = req.params.examId; // From route mount path

        // Verify exam exists
        const exam = await Exam.findById(exam_id);
        if (!exam) {
            return res.status(404).json({
                success: false,
                message: 'Exam not found'
            });
        }

        const schedule = await ExamSchedule.create({
            exam_id,
            exam_date,
            shifts,
            notes
        });

        res.status(201).json({
            success: true,
            message: 'Schedule created successfully',
            data: schedule
        });
    })
);

/**
 * @route   POST /api/exams/:examId/schedules/upload
 * @desc    Upload Excel file with exam schedules
 * @access  Private (Admin/Operator)
 */
router.post('/:examId/schedules/upload',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    upload.single('file'),
    cleanupOnError,
    asyncHandler(async (req, res) => {
        const exam_id = req.params.examId; // From route mount path

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
        const parseResult = ExcelParser.parseExamSchedule(req.file.path, exam_id);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        if (!parseResult.success || parseResult.data.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Failed to parse Excel file',
                errors: parseResult.errors
            });
        }

        // Bulk create schedules
        await ExamSchedule.bulkCreate(parseResult.data);

        res.status(201).json({
            success: true,
            message: `Successfully imported ${parseResult.count} schedules`,
            count: parseResult.count,
            errors: parseResult.errors.length > 0 ? parseResult.errors : undefined
        });
    })
);

/**
 * @route   GET /api/exams/:examId/schedules
 * @desc    Get all schedules for an exam
 * @access  Private
 */
router.get('/:examId/schedules',
    authenticate,
    asyncHandler(async (req, res) => {
        const { is_active, include_shifts } = req.query;

        const options = {
            is_active: is_active !== undefined ? is_active === 'true' : true,
            include_shifts: include_shifts !== 'false'
        };

        const schedules = await ExamSchedule.findByExamId(req.params.examId, options);

        res.json({
            success: true,
            count: schedules.length,
            data: schedules
        });
    })
);

/**
 * @route   GET /api/schedules/upcoming
 * @desc    Get upcoming shifts
 * @access  Private
 */
router.get('/upcoming',
    authenticate,
    asyncHandler(async (req, res) => {
        const hoursAhead = parseInt(req.query.hours) || 24;
        const shifts = await ExamSchedule.getUpcomingShifts(hoursAhead);

        res.json({
            success: true,
            count: shifts.length,
            data: shifts
        });
    })
);

/**
 * @route   PUT /api/schedules/:id
 * @desc    Update schedule
 * @access  Private (Admin/Operator)
 */
router.put('/:id',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    scheduleValidation.update,
    asyncHandler(async (req, res) => {
        const schedule = await ExamSchedule.update(req.params.id, req.body);

        if (!schedule) {
            return res.status(404).json({
                success: false,
                message: 'Schedule not found'
            });
        }

        res.json({
            success: true,
            message: 'Schedule updated successfully',
            data: schedule
        });
    })
);

/**
 * @route   DELETE /api/schedules/:id
 * @desc    Delete schedule (soft delete)
 * @access  Private (Admin/Operator)
 */
router.delete('/:id',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    asyncHandler(async (req, res) => {
        await ExamSchedule.delete(req.params.id);

        res.json({
            success: true,
            message: 'Schedule deleted successfully'
        });
    })
);

module.exports = router;
