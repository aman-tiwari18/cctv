const express = require('express');
const router = express.Router({ mergeParams: true });
const ShiftScriptAssignment = require('../models/ShiftScriptAssignment');
const ExamSchedule = require('../models/ExamSchedule');
const AnalyticsTask = require('../models/AnalyticsTask');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @route   POST /api/shifts/:shiftId/scripts
 * @desc    Assign a script to a shift
 * @access  Private (Admin/Operator)
 */
router.post('/:shiftId/scripts',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    asyncHandler(async (req, res) => {
        const {
            analytics_task_id,
            custom_start_time,
            custom_end_time,
            custom_frequency_minutes,
            notes
        } = req.body;
        const shift_id = req.params.shiftId;

        // Verify analytics task exists
        const task = await AnalyticsTask.findById(analytics_task_id);
        console.log(task);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Analytics task not found'
            });
        }

        // Check if assignment already exists
        const exists = await ShiftScriptAssignment.exists(shift_id, analytics_task_id);
        if (exists) {
            return res.status(400).json({
                success: false,
                message: 'Script already assigned to this shift'
            });
        }

        const assignment = await ShiftScriptAssignment.create({
            shift_id,
            analytics_task_id,
            custom_start_time,
            custom_end_time,
            custom_frequency_minutes,
            notes
        });

        res.status(201).json({
            success: true,
            message: 'Script assigned to shift successfully',
            data: assignment
        });
    })
);

/**
 * @route   POST /api/shifts/:shiftId/scripts/bulk
 * @desc    Bulk assign scripts to a shift
 * @access  Private (Admin/Operator)
 */
router.post('/:shiftId/scripts/bulk',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    asyncHandler(async (req, res) => {
        const { scripts } = req.body;
        const shift_id = req.params.shiftId;

        if (!Array.isArray(scripts) || scripts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Scripts array is required'
            });
        }

        // Add shift_id to each script assignment
        const assignments = scripts.map(script => ({
            shift_id,
            ...script
        }));

        const results = await ShiftScriptAssignment.bulkCreate(assignments);

        res.status(201).json({
            success: true,
            message: `Successfully assigned ${results.length} scripts to shift`,
            count: results.length,
            data: results
        });
    })
);

/**
 * @route   GET /api/shifts/:shiftId/scripts
 * @desc    Get all scripts assigned to a shift
 * @access  Private
 */
router.get('/:shiftId/scripts',
    authenticate,
    asyncHandler(async (req, res) => {
        const { is_active } = req.query;
        const filters = {};
        if (is_active !== undefined) filters.is_active = is_active === 'true';

        const assignments = await ShiftScriptAssignment.findByShiftId(
            req.params.shiftId,
            filters
        );

        res.json({
            success: true,
            count: assignments.length,
            data: assignments
        });
    })
);

/**
 * @route   GET /api/exams/:examId/shift-scripts
 * @desc    Get all shift-script assignments for an exam
 * @access  Private
 */
router.get('/:examId/shift-scripts',
    authenticate,
    asyncHandler(async (req, res) => {
        const { is_active } = req.query;
        const filters = {};
        if (is_active !== undefined) filters.is_active = is_active === 'true';

        const assignments = await ShiftScriptAssignment.findByExamId(
            req.params.examId,
            filters
        );

        res.json({
            success: true,
            count: assignments.length,
            data: assignments
        });
    })
);

/**
 * @route   PUT /api/shift-scripts/:id
 * @desc    Update shift-script assignment
 * @access  Private (Admin/Operator)
 */
router.put('/shift-scripts/:id',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    asyncHandler(async (req, res) => {
        const assignment = await ShiftScriptAssignment.update(req.params.id, req.body);

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }

        res.json({
            success: true,
            message: 'Assignment updated successfully',
            data: assignment
        });
    })
);

/**
 * @route   DELETE /api/shift-scripts/:id
 * @desc    Delete shift-script assignment
 * @access  Private (Admin/Operator)
 */
router.delete('/shift-scripts/:id',
    authenticate,
    authorize('ADMIN', 'OPERATOR'),
    asyncHandler(async (req, res) => {
        await ShiftScriptAssignment.delete(req.params.id);

        res.json({
            success: true,
            message: 'Assignment deleted successfully'
        });
    })
);

module.exports = router;
