/**
 * ReportController.js
 * Generates and streams a daily detection report as an Excel (.xlsx) file.
 *
 * GET /api/report/download?date=15-04-2026
 *
 * Excel Sheets:
 *  - Shift 1 / Shift 2 / Shift 3  → aggregated detection count per camera for that shift
 *  - Detection List                → every raw row from camera_report_hls for the date
 *  - Analysis                      → total cameras, online, offline, total detections
 */

'use strict';

const XLSX = require('xlsx');
const { query } = require('../config/database');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "dd-mm-yyyy" or "dd/mm/yyyy" → "yyyy-mm-dd" for MySQL DATE() comparisons.
 * Also accepts "yyyy-mm-dd" passthrough.
 */
function parseDateParam(dateStr) {
    if (!dateStr) return null;
    const dmyMatch = dateStr.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    return null;
}

/**
 * Build a worksheet from a 2-D array [header, ...rows].
 */
function makeSheet(headers, rows, colWidths) {
    const wsData = [
        headers,
        ...rows.map(r => headers.map(h => (r[h] !== undefined && r[h] !== null) ? r[h] : ''))
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
    return ws;
}

// ─── Controller ───────────────────────────────────────────────────────────────

exports.downloadReport = async (req, res) => {
    const rawDate = req.query.date;
    const mysqlDate = parseDateParam(rawDate);

    if (!mysqlDate) {
        return res.status(400).json({
            success: false,
            message: 'Invalid or missing ?date parameter. Use format: dd-mm-yyyy  (e.g. 15-04-2026)'
        });
    }

    // ── 1. Fetch all rows for the date ────────────────────────────────────────
    const allRows = await query(`
        SELECT
            id,
            exam_id,
            shift_id,
            city,
            center_name,
            camera_id,
            camera_name,
            camera_category   AS cam_type,
            tc_code,
            ch_code,
            state,
            camera_status,
            events,
            rejected_events,
            date_time,
            imageurl,
            detection_type,
            created_at
        FROM camera_report_hls
        WHERE DATE(created_at) = ?
        ORDER BY shift_id ASC, ch_code ASC, created_at ASC
    `, [mysqlDate]);

    if (!allRows || allRows.length === 0) {
        return res.status(404).json({
            success: false,
            message: `No detection data found for date: ${rawDate || mysqlDate}`
        });
    }

    // ── 2. Aggregate per shift → per camera ───────────────────────────────────
    // shiftAgg[shiftId][camKey] = { City, Center, Cam ID, ..., Events, Rejected Events }
    const shiftAgg = {};

    for (const row of allRows) {
        const sid = row.shift_id ?? 0;
        const camKey = row.ch_code || String(row.camera_id || 'UNKNOWN');

        if (!shiftAgg[sid]) shiftAgg[sid] = {};

        if (!shiftAgg[sid][camKey]) {
            shiftAgg[sid][camKey] = {
                'City': row.city || '',
                'Center': row.center_name || '',
                'Cam ID': camKey,
                'Camera Name': row.camera_name || '',
                'Cam Type': row.cam_type || '',
                'TC Code': row.tc_code || '',
                'Events': 0,
                'Rejected Events': 0,
                'Camera Status': row.camera_status || '',
            };
        }

        // Each DB row = 1 detection event; sum up the events column (default 1)
        shiftAgg[sid][camKey]['Events'] += (Number(row.events) || 1);
        shiftAgg[sid][camKey]['Rejected Events'] += (Number(row.rejected_events) || 0);
    }

    // ── 3. Analysis ───────────────────────────────────────────────────────────
    // Use dominant camera_status per ch_code (Online wins over Offline)
    const camStatusMap = {};
    for (const row of allRows) {
        const camKey = row.ch_code || String(row.camera_id || 'UNKNOWN');
        const status = (row.camera_status || '').toLowerCase();
        if (!camStatusMap[camKey] || camStatusMap[camKey] !== 'online') {
            camStatusMap[camKey] = status;
        }
    }

    const totalCameras = Object.keys(camStatusMap).length;
    const onlineCameras = Object.values(camStatusMap).filter(s => s === 'online').length;
    const offlineCameras = totalCameras - onlineCameras;
    const totalDetections = allRows.length;

    // ── 4. Build workbook ─────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    const SHIFT_HEADERS = [
        'City', 'Center', 'Cam ID', 'Camera Name',
        'Cam Type', 'TC Code', 'Events', 'Rejected Events', 'Camera Status'
    ];
    const SHIFT_WIDTHS = [15, 28, 14, 32, 14, 10, 10, 16, 15];

    const SHIFT_NAMES = { 1: 'Shift 1', 2: 'Shift 2', 3: 'Shift 3' };

    // Always create Shift 1, 2, 3 sheets (empty if no data for that shift)
    for (const sid of [1, 2, 3]) {
        const camMap = shiftAgg[sid] || {};
        const sheetRows = Object.values(camMap);
        const ws = makeSheet(SHIFT_HEADERS, sheetRows, SHIFT_WIDTHS);
        XLSX.utils.book_append_sheet(wb, ws, SHIFT_NAMES[sid]);
    }

    // Detection List sheet — raw rows, one per detection
    const DET_HEADERS = [
        'ID', 'Exam ID', 'Shift ID', 'City', 'Center', 'Cam ID',
        'Camera Name', 'Cam Type', 'TC Code', 'Ch Code', 'State',
        'Camera Status', 'Events', 'Rejected Events',
        'Date Time', 'Image URL', 'Detection Type', 'Created At'
    ];
    const DET_WIDTHS = [6, 8, 8, 15, 28, 14, 32, 14, 10, 12, 12, 15, 8, 16, 22, 60, 22, 22];

    const detRows = allRows.map(r => ({
        'ID': r.id,
        'Exam ID': r.exam_id,
        'Shift ID': r.shift_id,
        'City': r.city || '',
        'Center': r.center_name || '',
        'Cam ID': r.ch_code || r.camera_id || '',
        'Camera Name': r.camera_name || '',
        'Cam Type': r.cam_type || '',
        'TC Code': r.tc_code || '',
        'Ch Code': r.ch_code || '',
        'State': r.state || '',
        'Camera Status': r.camera_status || '',
        'Events': Number(r.events) || 1,
        'Rejected Events': Number(r.rejected_events) || 0,
        'Date Time': r.date_time || '',
        'Image URL': r.imageurl || '',
        'Detection Type': r.detection_type || '',
        'Created At': r.created_at ? String(r.created_at) : '',
    }));

    const detWs = makeSheet(DET_HEADERS, detRows, DET_WIDTHS);
    XLSX.utils.book_append_sheet(wb, detWs, 'Detection List');

    // Analysis sheet
    const analysisData = [
        ['Report Date', rawDate || mysqlDate],
        [''],
        ['Metric', 'Value'],
        ['Total Cameras', totalCameras],
        ['Online Cameras', onlineCameras],
        ['Offline Cameras', offlineCameras],
        ['Total Detections', totalDetections],
    ];
    const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
    analysisWs['!cols'] = [{ wch: 22 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, analysisWs, 'Analysis');

    // ── 5. Stream Excel to client ─────────────────────────────────────────────
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="detection_report_${mysqlDate}.xlsx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
};

































































































































































































































































































































































































































































































































































































































































































































































































