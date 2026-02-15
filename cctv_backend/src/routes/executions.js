const express = require('express');
const router = express.Router();
const ScriptExecution = require('../models/ScriptExecution');
const { asyncHandler } = require('../middleware/errorHandler');
const { executionValidation } = require('../utils/validators');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * @route   GET /api/executions/pending
 * @desc    Get pending script executions (for script server polling)
 * @access  Private (Script Server)
 */
router.get('/pending',
    authenticate,
    asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const executions = await ScriptExecution.getPendingExecutions(limit);

        res.json({
            success: true,
            count: executions.length,
            data: executions
        });
    })
);

/**
 * @route   PUT /api/executions/:id/status
 * @desc    Update execution status (called by script server)
 * @access  Private (Script Server)
 */
router.put('/:id/status',
    authenticate,
    executionValidation.updateStatus,
    asyncHandler(async (req, res) => {
        const { status, error_log, result_data } = req.body;

        const execution = await ScriptExecution.updateStatus(
            req.params.id,
            status,
            { error_log, result_data }
        );

        if (!execution) {
            return res.status(404).json({
                success: false,
                message: 'Execution not found'
            });
        }

        res.json({
            success: true,
            message: 'Execution status updated successfully',
            data: execution
        });
    })
);

/**
 * @route   GET /api/executions
 * @desc    Get all executions with filters
 * @access  Private
 */
router.get('/',
    authenticate,
    asyncHandler(async (req, res) => {
        const {
            status,
            analytics_task_id,
            shift_id,
            from_date,
            to_date,
            limit,
            offset
        } = req.query;

        const filters = {
            status,
            analytics_task_id: analytics_task_id ? parseInt(analytics_task_id) : null,
            shift_id: shift_id ? parseInt(shift_id) : null,
            from_date,
            to_date,
            limit: limit ? parseInt(limit) : 100,
            offset: offset ? parseInt(offset) : 0
        };

        const executions = await ScriptExecution.findAll(filters);

        res.json({
            success: true,
            count: executions.length,
            data: executions
        });
    })
);

/**
 * @route   GET /api/executions/statistics
 * @desc    Get execution statistics
 * @access  Private
 */
router.get('/stats/summary',
    authenticate,
    asyncHandler(async (req, res) => {
        const { exam_id, from_date, to_date } = req.query;

        const stats = await ScriptExecution.getStatistics({
            exam_id: exam_id ? parseInt(exam_id) : null,
            from_date,
            to_date
        });

        res.json({
            success: true,
            data: stats
        });
    })
);

/**
 * @route   GET /api/executions/:id
 * @desc    Get execution details
 * @access  Private
 */
router.get('/:id',
    authenticate,
    asyncHandler(async (req, res) => {
        const execution = await ScriptExecution.findById(req.params.id);

        if (!execution) {
            return res.status(404).json({
                success: false,
                message: 'Execution not found'
            });
        }

        res.json({
            success: true,
            data: execution
        });
    })
);

/**
 * @route   GET /api/shifts/:shiftId/executions
 * @desc    Get executions for a specific shift
 * @access  Private
 */
router.get('/shifts/:shiftId/executions',
    authenticate,
    asyncHandler(async (req, res) => {
        const {
            status,
            from_date,
            to_date,
            limit,
            offset
        } = req.query;

        const filters = {
            status,
            from_date,
            to_date,
            limit: limit ? parseInt(limit) : 100,
            offset: offset ? parseInt(offset) : 0
        };

        const executions = await ScriptExecution.getExecutionsByShift(
            req.params.shiftId,
            filters
        );

        res.json({
            success: true,
            count: executions.length,
            data: executions
        });
    })
);

/**
 * @route   GET /api/executions/recent
 * @desc    Get recent executions
 * @access  Private
 */
router.get('/recent',
    authenticate,
    asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit) || 20;
        const executions = await ScriptExecution.getRecentExecutions(limit);

        res.json({
            success: true,
            count: executions.length,
            data: executions
        });
    })
);

/**
 * @route   GET /api/shifts/:shiftId/executions
 * @desc    Get executions for a specific shift
 * @access  Private
 */
router.get('/shifts/:shiftId/executions',
    authenticate,
    asyncHandler(async (req, res) => {
        const { limit = 50 } = req.query;
        const executions = await ScriptExecution.findByShiftId(
            req.params.shiftId,
            parseInt(limit)
        );

        res.json({
            success: true,
            count: executions.length,
            data: executions
        });
    })
);

module.exports = router;
