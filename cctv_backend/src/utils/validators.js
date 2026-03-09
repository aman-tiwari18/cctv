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
        body('start_date').optional({ nullable: true }).isDate().withMessage('Start date must be a valid date (YYYY-MM-DD)'),
        body('end_date').optional({ nullable: true }).isDate().withMessage('End date must be a valid date (YYYY-MM-DD)'),
        body('skip_days').optional().isArray().withMessage('skip_days must be an array'),
        body('skip_days.*').optional().isIn(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).withMessage('Invalid day name'),
        body('skip_dates').optional().isArray().withMessage('skip_dates must be an array'),
        body('skip_dates.*').optional().isDate().withMessage('Each skip date must be a valid date'),
        body('shifts').optional().isArray().withMessage('shifts must be an array'),
        body('shifts.*.shift_name').optional().trim().notEmpty().withMessage('Shift name is required'),
        body('shifts.*.start_time')
            .optional()
            .customSanitizer(value => {
                if (value && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                    return value + ':00';
                }
                return value;
            })
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
            .withMessage('Valid start time is required'),
        body('shifts.*.end_time')
            .optional()
            .customSanitizer(value => {
                if (value && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                    return value + ':00';
                }
                return value;
            })
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
            .withMessage('Valid end time is required'),
        validate
    ],
    update: [
        param('id').isInt().withMessage('Invalid exam ID'),
        body('exam_name').optional().trim().notEmpty(),
        body('exam_body').optional().trim().notEmpty(),
        body('link_type').optional().isIn(['RTSP', 'HLS']),
        body('description').optional().trim(),
        body('is_active').optional().isBoolean(),
        body('start_date').optional({ nullable: true }).isDate().withMessage('Start date must be a valid date (YYYY-MM-DD)'),
        body('end_date').optional({ nullable: true }).isDate().withMessage('End date must be a valid date (YYYY-MM-DD)'),
        body('skip_days').optional().isArray().withMessage('skip_days must be an array'),
        body('skip_days.*').optional().isIn(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).withMessage('Invalid day name'),
        body('skip_dates').optional().isArray().withMessage('skip_dates must be an array'),
        body('skip_dates.*').optional().isDate().withMessage('Each skip date must be a valid date'),
        body('shifts').optional().isArray().withMessage('shifts must be an array'),
        body('shifts.*.shift_name').optional().trim().notEmpty().withMessage('Shift name is required'),
        body('shifts.*.start_time')
            .optional()
            .customSanitizer(value => {
                if (value && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                    return value + ':00';
                }
                return value;
            })
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
            .withMessage('Valid start time is required'),
        body('shifts.*.end_time')
            .optional()
            .customSanitizer(value => {
                if (value && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                    return value + ':00';
                }
                return value;
            })
            .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/)
            .withMessage('Valid end time is required'),
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
 * Validation rules for scripts
 */
const scriptValidation = {
    create: [
        body('script_id').trim().notEmpty().withMessage('Script ID is required'),
        body('name').trim().notEmpty().withMessage('Script name is required'),
        body('script_path').trim().notEmpty().withMessage('Script path is required'),
        body('description').optional().trim(),
        body('default_frequency_minutes').optional().isInt({ min: 1 }),
        body('default_duration_minutes').optional().isInt({ min: 1 }),
        body('category').optional().trim(),
        body('parameters_schema').optional().isObject(),
        body('version').optional().trim(),
        validate
    ],
    update: [
        param('id').isInt().withMessage('Invalid script ID'),
        body('name').optional().trim().notEmpty(),
        body('script_path').optional().trim().notEmpty(),
        body('description').optional().trim(),
        body('default_frequency_minutes').optional().isInt({ min: 1 }),
        body('default_duration_minutes').optional().isInt({ min: 1 }),
        body('category').optional().trim(),
        body('parameters_schema').optional().isObject(),
        body('version').optional().trim(),
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
    scriptValidation,
    executionValidation
};
