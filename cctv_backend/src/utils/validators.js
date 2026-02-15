const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation helper to check for errors
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

/**
 * Validation rules for exams
 */
const examValidation = {
    create: [
        body('exam_name').trim().notEmpty().withMessage('Exam name is required'),
        body('exam_body').trim().notEmpty().withMessage('Exam body is required'),
        body('link_type').isIn(['RTSP', 'HLS']).withMessage('Link type must be RTSP or HLS'),
        body('description').optional().trim(),
        validate
    ],
    update: [
        param('id').isInt().withMessage('Invalid exam ID'),
        body('exam_name').optional().trim().notEmpty(),
        body('exam_body').optional().trim().notEmpty(),
        body('link_type').optional().isIn(['RTSP', 'HLS']),
        body('description').optional().trim(),
        body('is_active').optional().isBoolean(),
        validate
    ]
};

/**
 * Validation rules for camera links
 */
const cameraLinkValidation = {
    create: [
        param('examId').isInt().withMessage('Invalid exam ID'),
        body('camera_id').trim().notEmpty().withMessage('Camera ID is required'),
        body('stream_url').trim().isURL().withMessage('Valid stream URL is required'),
        body('stream_type').isIn(['RTSP', 'HLS']).withMessage('Stream type must be RTSP or HLS'),
        body('location').optional().trim(),
        body('metadata').optional().isObject(),
        validate
    ],
    update: [
        param('id').isInt().withMessage('Invalid camera link ID'),
        body('camera_id').optional().trim().notEmpty(),
        body('stream_url').optional().trim().isURL(),
        body('stream_type').optional().isIn(['RTSP', 'HLS']),
        body('location').optional().trim(),
        body('metadata').optional().isObject(),
        body('is_active').optional().isBoolean(),
        validate
    ]
};

/**
 * Validation rules for schedules
 */
const scheduleValidation = {
    create: [
        param('examId').isInt().withMessage('Invalid exam ID'),
        body('exam_date').isDate().withMessage('Valid exam date is required'),
        body('shifts').isArray({ min: 1 }).withMessage('At least one shift is required'),
        body('shifts.*.shift_name').trim().notEmpty().withMessage('Shift name is required'),
        body('shifts.*.start_time')
            .customSanitizer(value => {
                // Accept both HH:MM and HH:MM:SS formats
                if (value && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                    return value + ':00'; // Add seconds if missing
                }
                return value;
            })
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/)
            .withMessage('Valid start time is required (HH:MM or HH:MM:SS)'),
        body('shifts.*.end_time')
            .customSanitizer(value => {
                // Accept both HH:MM and HH:MM:SS formats
                if (value && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                    return value + ':00'; // Add seconds if missing
                }
                return value;
            })
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/)
            .withMessage('Valid end time is required (HH:MM or HH:MM:SS)'),
        body('notes').optional().trim(),
        validate
    ],
    update: [
        param('id').isInt().withMessage('Invalid schedule ID'),
        body('exam_date').optional().isDate(),
        body('notes').optional().trim(),
        body('is_active').optional().isBoolean(),
        validate
    ]
};

/**
 * Validation rules for analytics tasks
 */
const analyticsTaskValidation = {
    create: [
        param('examId').isInt().withMessage('Invalid exam ID'),
        body('script_id').trim().notEmpty().withMessage('Script ID is required'),
        body('frequency_minutes').optional().isInt({ min: 1 }),
        body('duration_minutes').optional().isInt({ min: 1 }),
        body('start_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
        body('end_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
        body('parameters').optional().isObject(),

        // validate script_id exists in registry
        body('script_id').custom(value => {
            const scriptRegistry = require('../config/scriptRegistry');
            if (!scriptRegistry[value]) {
                throw new Error('Invalid script ID');
            }
            return true;
        }),

        validate
    ],
    update: [
        param('id').isInt().withMessage('Invalid analytics task ID'),
        body('task_name').optional().trim().notEmpty(),
        body('script_path').optional().trim().notEmpty(),
        body('frequency_minutes').optional().isInt({ min: 1 }),
        body('duration_minutes').optional().isInt({ min: 1 }),
        body('start_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/),
        body('end_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/),
        body('description').optional().trim(),
        body('parameters').optional().isObject(),
        body('is_active').optional().isBoolean(),
        validate
    ]
};

/**
 * Validation rules for script executions
 */
const executionValidation = {
    updateStatus: [
        param('id').isInt().withMessage('Invalid execution ID'),
        body('status').isIn(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).withMessage('Invalid status'),
        body('error_log').optional().trim(),
        body('result_data').optional().isObject(),
        validate
    ]
};

module.exports = {
    examValidation,
    cameraLinkValidation,
    scheduleValidation,
    analyticsTaskValidation,
    executionValidation
};
