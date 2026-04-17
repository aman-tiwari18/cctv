/**
 * ReportController.js
 * Generates and streams a detection report as an Excel (.xlsx) file.
 *
 * GET /api/report/download?exam_id=7&date=16-04-2026
 *
 * Excel Sheets:
 *  - Shift 1 / Shift 2 / Shift 3  → aggregated event count per camera for that shift
 *  - Detections List               → every raw row from camera_report_hls for the exam+date
 *  - Analysis                      → per-shift stats + top 5 cameras + overall summary
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
 * Formats HLS camera name: 12175/L-01A/C01 -> 12175/C01
 * (Takes 1st and 3rd part of the slash-separated string)
 */
function formatHlsCamId(cameraName, chCode) {
    if (!cameraName) return chCode || '';
    const parts = cameraName.split('/');
    if (parts.length >= 3) {
        return `${parts[0]}/${parts[2]}`;
    }
    return cameraName; // Fallback if no 3 parts found
}

/**
 * Sanitize a string to be safe for use in a filename.
 */
function sanitizeFilename(str) {
    return (str || 'Report').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
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
    const examId = req.query.exam_id;
    const allShifts = req.query.all_shifts === 'true'; // Unified/All Shifts flag
    const mysqlDate = parseDateParam(rawDate);

    if (!mysqlDate || !examId) {
        return res.status(400).json({
            success: false,
            message: 'Missing or invalid parameters. Required: ?exam_id=<id>&date=<dd-mm-yyyy>'
        });
    }

    try {
        // ── 1. Fetch Exam Info (for filename) ─────────────────────────────────
        const examRows = await query(
            `SELECT id, exam_name, link_type FROM exams WHERE id = ? LIMIT 1`,
            [examId]
        );
        if (!examRows || examRows.length === 0) {
            return res.status(404).json({ success: false, message: `Exam with id=${examId} not found.` });
        }
        const examName = examRows[0].exam_name || `Exam_${examId}`;
        const isRTSP = (examRows[0].link_type || '').toLowerCase() === 'rtsp';

        // ── 2. Fetch Shift Metadata for this exam ─────────────────────────────
        const shifts = await query(
            `SELECT id, shift_name, start_time, end_time
             FROM exam_shifts
             WHERE exam_id = ? AND is_active = 1
             ORDER BY id ASC`,
            [examId]
        );
        // shiftMap[shiftId] = { index: 1, name: 'Shift 1 (Shift_Name)' }
        const shiftMap = {};
        shifts.forEach((s, i) => {
            shiftMap[s.id] = {
                index: i + 1,
                label: `Shift ${i + 1}`,
                shift_name: s.shift_name,
                start_time: s.start_time,
                end_time: s.end_time,
            };
        });

        // ── 3. Fetch Master Camera List ───────────────────────────────────────
        const masterCameras = isRTSP ? await query(
            `SELECT id, device_id, camera_no, camera_name, classification, tc_code,
                    centre_name, city, state, null as shift_id, status
             FROM camera_links_rtsp
             WHERE exam_id = ? AND is_active = 1
             ORDER BY device_id ASC, camera_no ASC`,
            [examId]
        ) : await query(
            `SELECT id, ch_code, camera_name, camera_category, tc_code,
                    centre_name, city, state, shift_id, status
             FROM camera_links_hls
             WHERE exam_id = ? AND is_active = 1
             ORDER BY shift_id ASC, ch_code ASC`,
            [examId]
        );

        const [y, m, d] = mysqlDate.split('-');
        const searchDate = `${d}/${m}/${y}`; // 16/04/2026

        // ── 4. Fetch All Detections for exam + date ───────────────────────────
        const detections = isRTSP ? await query(
            `SELECT id, shift_id, city, center_name, camera_id, camera_name, camera_no,
                    '' as camera_category, tc_code, device_id, state, camera_status,
                    events, rejected_events, date_time, imageurl, detection_type,
                    unique_id
             FROM camera_report_rtsp
             WHERE exam_id = ? AND date_time LIKE CONCAT(?, '%')
             ORDER BY shift_id ASC`,
            [examId, searchDate]
        ) : await query(
            `SELECT id, shift_id, city, center_name, camera_id, camera_name,
                    camera_category, tc_code, ch_code, state, camera_status,
                    events, rejected_events, date_time, imageurl, detection_type,
                    unique_id, created_at
             FROM camera_report_hls
             WHERE exam_id = ? AND date_time LIKE CONCAT(?, '%')
             ORDER BY shift_id ASC, created_at ASC`,
            [examId, searchDate]
        );

        // ── 5. Aggregate detections: aggregated[shiftId][key] ───────────────
        const aggregated = {};
        const shiftsWithData = new Set(); // To track which shifts exist in reports table

        detections.forEach(d => {
            const sid = d.shift_id;
            shiftsWithData.add(sid);

            // RTSP key: device_id_camera_no | HLS key: ch_code
            const key = isRTSP ? `${d.device_id}_${d.camera_no}` : d.ch_code;

            if (!aggregated[sid]) aggregated[sid] = {};
            if (!aggregated[sid][key]) {
                aggregated[sid][key] = {
                    events: 0,
                    rejected: 0,
                    status: (d.camera_status || 'Online'),
                    details: {
                        city: d.city,
                        center: d.center_name,
                        cam_id: key,
                        camera_name: d.camera_name,
                        cam_type: d.camera_category,
                        tc_code: d.tc_code,
                    }
                };
            }
            aggregated[sid][key].events += (Number(d.events) || 0);
            aggregated[sid][key].rejected += (Number(d.rejected_events) || 0);
        });

        // ── 6. Build Workbook ─────────────────────────────────────────────────
        const wb = XLSX.utils.book_new();

        const SHIFT_HEADERS = [
            'City', 'Center', 'Cam ID', 'Camera Name',
            'Cam Type', 'TC Code', 'Events (Excluding Rejected)', 'Rejected Events', 'Camera Status'
        ];
        const SHIFT_WIDTHS = [15, 30, 15, 35, 15, 12, 28, 16, 15];

        // ── 7. Shift Sheets (Shift 1, 2, 3) ──────────────────────────────────
        [0, 1, 2].forEach(idx => {
            const shiftMeta = shifts[idx];
            const shiftId = shiftMeta ? shiftMeta.id : null;
            const sheetName = `Shift ${idx + 1}`;

            let sheetData = [];

            if (isRTSP) {
                // For RTSP, every camera uploaded applies to all shifts
                // So we always show Shift 1, 2, and 3 sheets.

                // Show ALL master cameras for RTSP in this shift
                sheetData = masterCameras.map(cam => {
                    const key = `${cam.device_id}_${cam.camera_no}`;
                    const agg = (aggregated[shiftId] || {})[key];
                    const camType = cam.classification || 'Failed to Classify';

                    if (agg) {
                        return {
                            'City': cam.city || agg.details.city || '',
                            'Center': cam.centre_name || agg.details.center || '',
                            'Cam ID': key,
                            'Camera Name': cam.camera_name || agg.details.camera_name || '',
                            'Cam Type': camType,
                            'TC Code': cam.tc_code || agg.details.tc_code || '',
                            'Events (Excluding Rejected)': agg.events,
                            'Rejected Events': agg.rejected,
                            'Camera Status': agg.status,
                        };
                    } else {
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': key,
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': camType,
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': 0,
                            'Rejected Events': 0,
                            'Camera Status': cam.status === 'accessible' ? 'Online' : 'Offline',
                        };
                    }
                });

            } else {
                // HLS: load all master cameras, map detections if any found
                // If allShifts is true, ignore c.shift_id filter and show all masterCameras in every shift
                const shiftCams = allShifts ? masterCameras : masterCameras.filter(c => c.shift_id === shiftId);

                sheetData = shiftCams.map(cam => {
                    const agg = (aggregated[shiftId] || {})[cam.ch_code];
                    const camIdDisplay = formatHlsCamId(cam.camera_name, cam.ch_code);

                    if (agg) {
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': camIdDisplay,
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': cam.camera_category || '',
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': agg.events,
                            'Rejected Events': agg.rejected,
                            'Camera Status': agg.status,
                        };
                    } else {
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': camIdDisplay,
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': cam.camera_category || '',
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': 0,
                            'Rejected Events': 0,
                            'Camera Status': cam.status === 'accessible' ? 'Online' : 'Offline',
                        };
                    }
                });
            }

            const ws = makeSheet(SHIFT_HEADERS, sheetData, SHIFT_WIDTHS);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        // ── 8. Detections List Sheet ──────────────────────────────────────────
        const DET_HEADERS = [
            'Shift', 'Device ID', 'Camera No', 'Cam ID', 'Camera Name',
            'Center Name', 'City', 'Detection Type', 'Detection Time', 'Image URL', 'View'
        ];
        const DET_WIDTHS = [10, 15, 12, 15, 35, 30, 15, 20, 22, 70, 8];

        const detSheetData = detections.map(d => ({
            'Shift': (shiftMap[d.shift_id] || {}).label || (d.shift_id ? `Shift ${d.shift_id}` : ''),
            'Device ID': d.device_id || '',
            'Camera No': d.camera_no || '',
            'Cam ID': isRTSP ? `${d.device_id}_${d.camera_no}` : formatHlsCamId(d.camera_name, d.ch_code),
            'Camera Name': d.camera_name || '',
            'Center Name': d.center_name || '',
            'City': d.city || '',
            'Detection Type': d.detection_type || '',
            'Detection Time': d.date_time || '',
            'Image URL': d.imageurl || '',
            'View': d.imageurl ? 'View' : '',
        }));

        const detWs = makeSheet(DET_HEADERS, detSheetData, DET_WIDTHS);

        // Add hyperlinks to the "View" column (index 10)
        const range = XLSX.utils.decode_range(detWs['!ref'] || 'A1');
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
            const cellAddr = XLSX.utils.encode_cell({ r: R, c: 10 });
            const url = detSheetData[R - 1]['Image URL'];
            if (url) {
                detWs[cellAddr] = { t: 's', v: 'View', l: { Target: url, Tooltip: 'Click to view image' } };
            }
        }

        XLSX.utils.book_append_sheet(wb, detWs, 'Detections List');

        // ── 9. Analysis Sheet ─────────────────────────────────────────────────
        const analysisData = [];

        let cumulativeOnline = 0;

        [0, 1, 2].forEach(idx => {
            const shiftMeta = shifts[idx];
            const shiftId = shiftMeta ? shiftMeta.id : -1;

            if (isRTSP) {
                // Respecting user requirement: always show all shifts for RTSP analysis
            } else if (!shiftsWithData.has(shiftId) && !allShifts) {
                return;
            }

            const shiftCams = (isRTSP || allShifts) ? masterCameras : masterCameras.filter(c => c.shift_id === shiftId);
            const shiftDets = detections.filter(d => d.shift_id === shiftId);

            const total = shiftCams.length;
            const online = shiftCams.filter(c => c.status === 'accessible').length;
            const offline = total - online;
            const detCount = shiftDets.length;
            const rate = total > 0 ? ((online / total) * 100).toFixed(2) + '%' : '0%';

            cumulativeOnline += online;

            analysisData.push([`Shift ${idx + 1} ANALYSIS`, '']);
            analysisData.push(['Total Cameras Monitored', total]);
            analysisData.push(['Online Cameras', online]);
            analysisData.push(['Offline Cameras', offline]);
            analysisData.push(['Total Detections', detCount]);
            analysisData.push(['Online Rate', rate]);
            analysisData.push(['']);

            analysisData.push([`Top 5 Most Active Cameras (Shift ${idx + 1})`, '']);
            const counts = {};
            shiftDets.forEach(d => { counts[d.camera_name] = (counts[d.camera_name] || 0) + 1; });
            Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach((t, i) => analysisData.push([`${i + 1}. ${t[0]}`, `${t[1]} detections`]));

            analysisData.push(['']);
            analysisData.push(['']);
        });

        // Overall summary
        const uniqueOnline = new Set(
            detections.filter(d => (d.camera_status || '').toLowerCase() === 'online').map(d => d.ch_code)
        ).size;

        analysisData.push(['OVERALL SUMMARY', '']);
        analysisData.push(['Total Unique Cameras Online Today', uniqueOnline]);
        analysisData.push(['Total Online Cameras (Sum of Shifts)', cumulativeOnline]);
        analysisData.push(['Total Detections (All Shifts)', detections.length]);
        analysisData.push([`Total Shift Duration`, `${shifts.length} shift(s) × 1.5 hours`]);

        const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
        analysisWs['!cols'] = [{ wch: 40 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, analysisWs, 'Analysis');

        // ── 10. Stream to client ──────────────────────────────────────────────
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const safeName = sanitizeFilename(examName);
        const filename = `${safeName}_Report_${mysqlDate}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);

    } catch (error) {
        console.error('[ReportController] Error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error while generating report.' });
    }
};