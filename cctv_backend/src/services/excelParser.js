const xlsx = require('xlsx');
const logger = require('../utils/logger');

/**
 * Excel Parser Service
 * Handles parsing of Excel files for camera links and exam schedules
 */
class ExcelParser {
    /**
     * Parse camera links from Excel file
     * Expected columns: camera_id, stream_url, location (optional)
     */
    static parseCameraLinks(filePath, exam_id, stream_type) {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet);

            const cameraLinks = [];
            const errors = [];

            data.forEach((row, index) => {
                const rowNum = index + 2; // Excel rows start at 1, header is row 1

                // Validate required fields
                if (!row.camera_id && !row.Camera_ID && !row['Camera ID']) {
                    errors.push(`Row ${rowNum}: Missing camera_id`);
                    return;
                }

                if (!row.stream_url && !row.Stream_URL && !row['Stream URL']) {
                    errors.push(`Row ${rowNum}: Missing stream_url`);
                    return;
                }

                // Normalize field names (handle different casing)
                const camera_id = row.camera_id || row.Camera_ID || row['Camera ID'];
                const stream_url = row.stream_url || row.Stream_URL || row['Stream URL'];
                const location = row.location || row.Location || null;

                cameraLinks.push({
                    exam_id,
                    camera_id: String(camera_id).trim(),
                    stream_url: String(stream_url).trim(),
                    stream_type,
                    location: location ? String(location).trim() : null,
                    metadata: null
                });
            });

            if (errors.length > 0) {
                logger.warn('Camera links parsing had errors:', errors);
            }

            return {
                success: true,
                data: cameraLinks,
                errors,
                count: cameraLinks.length
            };
        } catch (error) {
            logger.error('Error parsing camera links Excel:', error);
            return {
                success: false,
                data: [],
                errors: [error.message],
                count: 0
            };
        }
    }

    /**
     * Parse exam schedule from Excel file
     * Expected format: Date column, then shift time range columns with Yes/No values
     * Example columns: Date, 09:00:00 to 10:30:00, 13:00:00 to 14:30:00, etc.
     */
    static parseExamSchedule(filePath, exam_id) {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet);

            // Get column headers
            const range = xlsx.utils.decode_range(worksheet['!ref']);
            const headers = [];
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c: col });
                const cell = worksheet[cellAddress];
                headers.push(cell ? String(cell.v) : `Column${col}`);
            }

            const schedules = [];
            const errors = [];

            // Identify date column and shift columns
            const dateColumnIndex = headers.findIndex(h =>
                h.toLowerCase().includes('date') || h.toLowerCase() === 'sr.no.'
            );

            if (dateColumnIndex === -1) {
                return {
                    success: false,
                    data: [],
                    errors: ['Could not find Date column in Excel file'],
                    count: 0
                };
            }

            const dateColumnName = headers[dateColumnIndex];

            // Parse shift time ranges from headers
            const shiftColumns = headers
                .map((header, index) => ({ header, index }))
                .filter(({ header, index }) => {
                    // Skip the date column and look for time range patterns
                    if (index === dateColumnIndex) return false;
                    return header.includes('to') || header.includes(':');
                });

            data.forEach((row, index) => {
                const rowNum = index + 2;

                // Get date value
                let dateValue = row[dateColumnName];
                if (!dateValue) {
                    errors.push(`Row ${rowNum}: Missing date`);
                    return;
                }

                // Parse date (handle Excel date serial numbers)
                let examDate;
                if (typeof dateValue === 'number') {
                    // Excel serial date
                    examDate = this.excelDateToJSDate(dateValue);
                } else {
                    // Try to parse as string
                    examDate = new Date(dateValue);
                }

                if (isNaN(examDate.getTime())) {
                    errors.push(`Row ${rowNum}: Invalid date format`);
                    return;
                }

                // Format as YYYY-MM-DD
                const formattedDate = examDate.toISOString().split('T')[0];

                // Parse shifts for this date
                const shifts = [];
                shiftColumns.forEach(({ header, index: colIndex }) => {
                    const cellValue = row[header];

                    // Check if shift is active (Yes/Y/1/true)
                    const isActive = cellValue &&
                        (String(cellValue).toLowerCase() === 'yes' ||
                            String(cellValue).toLowerCase() === 'y' ||
                            cellValue === 1 ||
                            cellValue === true);

                    if (isActive) {
                        // Extract time range from header
                        const timeMatch = header.match(/(\d{1,2}:\d{2}:\d{2})\s*to\s*(\d{1,2}:\d{2}:\d{2})/i);
                        if (timeMatch) {
                            shifts.push({
                                shift_name: header.trim(),
                                start_time: timeMatch[1],
                                end_time: timeMatch[2]
                            });
                        }
                    }
                });

                if (shifts.length > 0) {
                    schedules.push({
                        exam_id,
                        exam_date: formattedDate,
                        shifts,
                        notes: null
                    });
                }
            });

            if (errors.length > 0) {
                logger.warn('Exam schedule parsing had errors:', errors);
            }

            return {
                success: true,
                data: schedules,
                errors,
                count: schedules.length
            };
        } catch (error) {
            logger.error('Error parsing exam schedule Excel:', error);
            return {
                success: false,
                data: [],
                errors: [error.message],
                count: 0
            };
        }
    }

    /**
     * Parse analytics tasks from Excel file
     * Expected columns: task_name, description, script_path, frequency_minutes, 
     *                   start_time, end_time, duration_minutes
     */
    static parseAnalyticsTasks(filePath, exam_id) {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet);

            const tasks = [];
            const errors = [];

            data.forEach((row, index) => {
                const rowNum = index + 2;

                // Normalize field names
                const task_name = row.task_name || row.Task_Name || row['Task Name'] || row.Analytics;
                const description = row.description || row.Description || task_name;
                const script_path = row.script_path || row.Script_Path || row['Script Path'];
                const frequency = row.frequency_minutes || row.Frequency || row['Frequency Minutes'];
                const start_time = row.start_time || row.Start_Time || row['Start time'];
                const end_time = row.end_time || row.End_Time || row['End time'];
                const duration = row.duration_minutes || row.Duration || row['Duration Minutes'];

                // Validate required fields
                if (!task_name) {
                    errors.push(`Row ${rowNum}: Missing task_name`);
                    return;
                }

                if (!script_path) {
                    errors.push(`Row ${rowNum}: Missing script_path`);
                    return;
                }

                if (!frequency) {
                    errors.push(`Row ${rowNum}: Missing frequency_minutes`);
                    return;
                }

                // Parse time values
                const parseTime = (timeValue) => {
                    if (!timeValue) return null;

                    // If it's already in HH:MM:SS format
                    if (typeof timeValue === 'string' && timeValue.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
                        return timeValue;
                    }

                    // If it's an Excel time serial number (0-1 representing fraction of day)
                    if (typeof timeValue === 'number' && timeValue >= 0 && timeValue < 1) {
                        const totalSeconds = Math.round(timeValue * 24 * 60 * 60);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                    }

                    return null;
                };

                tasks.push({
                    exam_id,
                    task_name: String(task_name).trim(),
                    description: description ? String(description).trim() : null,
                    script_path: String(script_path).trim(),
                    frequency_minutes: parseInt(frequency),
                    duration_minutes: duration ? parseInt(duration) : null,
                    start_time: parseTime(start_time),
                    end_time: parseTime(end_time),
                    parameters: null
                });
            });

            if (errors.length > 0) {
                logger.warn('Analytics tasks parsing had errors:', errors);
            }

            return {
                success: true,
                data: tasks,
                errors,
                count: tasks.length
            };
        } catch (error) {
            logger.error('Error parsing analytics tasks Excel:', error);
            return {
                success: false,
                data: [],
                errors: [error.message],
                count: 0
            };
        }
    }

    /**
     * Convert Excel date serial number to JavaScript Date
     */
    static excelDateToJSDate(serial) {
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);
        return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
    }
}

module.exports = ExcelParser;
