'use strict';

/**
 * ExamObserverController.js
 *
 * Upload / inspect / clear the per-exam TC-code → observer mobile mapping used
 * by the accept-path SMS alert. Backed by exam_observer_numbers (migration
 * 037); see utils/examObservers.js for the parser and the lookup.
 *
 * The sheet is two columns — TC Code, Mobile Number — the same shape as the
 * NTA Observer List that utils/observerList.js reads from disk today.
 */

const fs = require('fs');
const XLSX = require('xlsx');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const { parseObserverSheet, getExamObserverSummary } = require('../utils/examObservers');

/** Best-effort removal of the multer temp file — never fails the request. */
function cleanup(file) {
    if (!file?.path) return;
    fs.unlink(file.path, (err) => {
        if (err) logger.warn(`[examObservers] temp file cleanup failed: ${err.message}`);
    });
}

/**
 * POST /api/exams/:examId/observers/upload   (multipart: file)
 *
 * Replaces the exam's mapping wholesale: a re-upload is the way to correct a
 * sheet, so leaving the previous rows behind would silently keep alerting
 * numbers the client had just removed.
 */
exports.uploadObservers = async (req, res) => {
    const examId = req.params.examId;

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        const exam = await query('SELECT id FROM exams WHERE id = ? LIMIT 1', [examId]);
        if (!exam || exam.length === 0) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }

        const { rows, skipped, duplicates } = parseObserverSheet(req.file.path);

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No usable rows found. The sheet needs a TC Code column and a Mobile Number column.',
            });
        }

        // Replace, don't merge — see the note on this handler.
        await query('DELETE FROM exam_observer_numbers WHERE exam_id = ?', [examId]);

        // Chunked multi-row insert: these sheets run to a few thousand centres
        // and one statement per row would hold the connection far too long.
        const CHUNK = 500;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);
            await query(
                `INSERT IGNORE INTO exam_observer_numbers (exam_id, tc_code, phone)
                 VALUES ${chunk.map(() => '(?,?,?)').join(',')}`,
                chunk.flatMap((r) => [examId, r.tc_code, r.phone])
            );
            inserted += chunk.length;
        }

        const summary = await getExamObserverSummary(examId);
        logger.info(`[examObservers] exam ${examId}: loaded ${summary.numbers} numbers across ${summary.tcCodes} TC codes`);

        return res.json({
            success: true,
            message: `Loaded ${summary.numbers} number(s) across ${summary.tcCodes} TC code(s)`,
            data: { ...summary, inserted, skippedRows: skipped, duplicateRows: duplicates },
        });
    } catch (err) {
        logger.error(`[examObservers] upload failed for exam ${examId}: ${err.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to import observer numbers',
            error: err.message,
        });
    } finally {
        cleanup(req.file);
    }
};

/**
 * GET /api/exams/:examId/observers
 * Summary plus the rows themselves, grouped one entry per TC code so the form
 * can show what is currently loaded.
 */
exports.getObservers = async (req, res) => {
    const examId = req.params.examId;
    try {
        const rows = await query(
            `SELECT tc_code, GROUP_CONCAT(phone ORDER BY phone SEPARATOR ', ') AS phones, COUNT(*) AS count
               FROM exam_observer_numbers
              WHERE exam_id = ?
              GROUP BY tc_code
              ORDER BY tc_code`,
            [examId]
        );
        const summary = await getExamObserverSummary(examId);
        return res.json({ success: true, ...summary, data: rows || [] });
    } catch (err) {
        logger.error(`[examObservers] list failed for exam ${examId}: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Failed to load observer numbers', error: err.message });
    }
};

/**
 * DELETE /api/exams/:examId/observers
 * Clears the mapping; the exam then falls back to the static observer sheet
 * (and, failing that, the client's sms_configs.default_recipients).
 */
exports.deleteObservers = async (req, res) => {
    const examId = req.params.examId;
    try {
        await query('DELETE FROM exam_observer_numbers WHERE exam_id = ?', [examId]);
        return res.json({ success: true, message: 'Observer numbers cleared' });
    } catch (err) {
        logger.error(`[examObservers] delete failed for exam ${examId}: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Failed to clear observer numbers', error: err.message });
    }
};

/**
 * GET /api/exams/:examId/observers/template
 * Blank two-column workbook so the client fills in the shape the parser wants.
 */
exports.downloadTemplate = async (req, res) => {
    const ws = XLSX.utils.aoa_to_sheet([
        ['TC Code', 'Mobile Number'],
        ['8849', '9524533206'],
        ['23754', '9895055252'],
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Observer Numbers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="observer_numbers_template.xlsx"');
    return res.send(buf);
};
