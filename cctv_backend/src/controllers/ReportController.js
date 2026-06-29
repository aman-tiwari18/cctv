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




//2 new function
function parseTimeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return (h * 60) + m;
}

function determineShiftId(dateTimeStr, shifts) {
    if (!shifts || shifts.length === 0) return 0;
    if (!dateTimeStr) return shifts[0].id;

    const timePart = dateTimeStr.split(' ')[1];
    if (!timePart) return shifts[0].id;

    const detMinutes = parseTimeToMinutes(timePart);

    for (const shift of shifts) {
        const start = parseTimeToMinutes(shift.start_time);
        const end = parseTimeToMinutes(shift.end_time);

        if (end < start) {
            if (detMinutes >= start || detMinutes <= end) return shift.id;
        } else {
            if (detMinutes >= start && detMinutes <= end) return shift.id;
        }
    }

    // Closest shift fallback
    let closest = shifts[0];
    let minDiff = Infinity;
    for (const shift of shifts) {
        const start = parseTimeToMinutes(shift.start_time);
        const diff = Math.abs(detMinutes - start);
        if (diff < minDiff) {
            minDiff = diff;
            closest = shift;
        }
    }
    return closest.id;
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
                    unique_id, pushed_to_client, remove_from_client  -- ✅ add these
            FROM camera_report_rtsp
            WHERE exam_id = ? AND date_time LIKE CONCAT(?, '%')
            ORDER BY shift_id ASC`,
            [examId, searchDate]
        ) : await query(
            `SELECT id, shift_id, city, center_name, camera_id, camera_name,
                    camera_category, tc_code, ch_code, state, camera_status,
                    events, rejected_events, date_time, imageurl, detection_type,
                    unique_id, created_at, pushed_to_client, remove_from_client  -- ✅ add these
            FROM camera_report_hls
            WHERE exam_id = ? AND date_time LIKE CONCAT(?, '%')
            ORDER BY shift_id ASC, created_at ASC`,
            [examId, searchDate]
        );

        // ── 4b. Server-address (cctv_url) lookup from camera_links ───────────
        // The report tables don't carry the server URL, so map it per camera.
        // Keyed the same way as detections: device_id_camera_no (RTSP) / ch_code (HLS).
        const linkRows = isRTSP
            ? await query(`SELECT device_id, camera_no, cctv_url FROM camera_links_rtsp WHERE exam_id = ?`, [examId])
            : await query(`SELECT ch_code, cctv_url FROM camera_links_hls WHERE exam_id = ?`, [examId]);
        const serverByKey = {};
        linkRows.forEach(l => {
            const k = isRTSP ? `${l.device_id}_${l.camera_no}` : String(l.ch_code);
            if (serverByKey[k] === undefined) serverByKey[k] = l.cctv_url || '';
        });

        // ── 5. Aggregate detections: aggregated[shiftId][key] ───────────────
        const aggregated = {};
        const shiftsWithData = new Set();

        detections.forEach(d => {
            // ✅ shift_id NULL ho to date_time se dynamically determine karo
            const sid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
            
            shiftsWithData.add(sid);
            const key = isRTSP ? `${d.device_id}_${d.camera_no}` : d.ch_code;

            if (!aggregated[sid]) aggregated[sid] = {};
            if (!aggregated[sid][key]) {
                aggregated[sid][key] = {
                    events: 0,
                    rejected: 0,
                    falsePositive: 0,  // ✅ add karo
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

            
            if (Number(d.pushed_to_client) === 1) {
                if (Number(d.remove_from_client) === 1) {
                    aggregated[sid][key].rejected += 1;
                } else {
                    aggregated[sid][key].events += 1;
                }
            } else {
                aggregated[sid][key].falsePositive += 1;  // ✅ pushed_to_client = 0
            }


        });

        // ── 6. Build Workbook ─────────────────────────────────────────────────
        const wb = XLSX.utils.book_new();

        const SHIFT_HEADERS = [
            'City', 'Center', 'Cam ID', 'Camera Name',
            'Cam Type', 'TC Code', 'Events (Excluding Rejected)', 'Rejected Events', 'False Positive', 'Camera Status'
        ];
        const SHIFT_WIDTHS = [15, 30, 15, 35, 15, 12, 28, 16, 15, 15];


        // ── 7. Shift Sheets (Shift 1, 2, 3...) ──────────────────────────────────
        shifts.forEach((shiftMeta, idx) => {
            const shiftId = shiftMeta.id;
            const sheetName = `Shift ${idx + 1}`;

            let sheetData = [];

            if (isRTSP) {
                // For RTSP, every camera uploaded applies to all shifts
                // So we always show all shifts scheduled for this exam.

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
                            'False Positive': agg.falsePositive,  // ✅
                            'Camera Status': agg.status,
                        };
                    } else {
                        // Camera is online if: classification IS NOT NULL AND status = 'Accessible' (case-insensitive)
                        const hasClassification = cam.classification && cam.classification.trim() !== '';
                        const isAccessible = (cam.status || '').toLowerCase() === 'accessible';
                        const isOnline = hasClassification && isAccessible;
                        
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': key,
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': camType,
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': 0,
                            'Rejected Events': 0,
                            'False Positive': 0,  // ✅
                            'Camera Status': isOnline ? 'Online' : 'Offline',
                        };
                    }
                });

            } else {
                // HLS: load ALL master cameras for this exam in every generated shift sheet
                // Matching the RTSP pattern ("jaise rtsp m ho rha h")
                const shiftCams = masterCameras;

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
                            'False Positive': agg.falsePositive,  // ✅
                            'Camera Status': agg.status,
                        };
                    } else {
                        // Camera is online if: classification IS NOT NULL AND status = 'Accessible' (case-insensitive)
                        const hasClassification = cam.camera_category && cam.camera_category.trim() !== '';
                        const isAccessible = (cam.status || '').toLowerCase() === 'accessible';
                        const isOnline = hasClassification && isAccessible;
                        
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': camIdDisplay,
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': cam.camera_category || '',
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': 0,
                            'Rejected Events': 0,
                            'False Positive': 0,  // ✅
                            'Camera Status': isOnline ? 'Online' : 'Offline',
                        };
                    }
                });
            }

            const ws = makeSheet(SHIFT_HEADERS, sheetData, SHIFT_WIDTHS);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        // ── 8. Detections List Sheet ──────────────────────────────────────────
        const DET_HEADERS = [
            'Shift', 'Device ID', 'Camera No', 'Cam ID', 'TC Code', 'Camera Name',
            'Center Name', 'City', 'Server Address', 'Detection Type', 'Detection Time',
            'Rejected', 'Image URL', 'View'
        ];
        const DET_WIDTHS = [10, 15, 12, 15, 14, 35, 30, 15, 28, 20, 22, 10, 70, 8];

        const detSheetData = detections.map(d => {
            const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
            return {
                'Shift': (shiftMap[resolvedSid] || {}).label || `Shift ${resolvedSid}`,
                'Device ID': d.device_id || '',
                'Camera No': d.camera_no || '',
                'Cam ID': isRTSP ? `${d.device_id}_${d.camera_no}` : formatHlsCamId(d.camera_name, d.ch_code),
                'TC Code': d.tc_code || '',
                'Camera Name': d.camera_name || '',
                'Center Name': d.center_name || '',
                'City': d.city || '',
                'Server Address': serverByKey[isRTSP ? `${d.device_id}_${d.camera_no}` : String(d.ch_code)] || '',
                'Detection Type': d.detection_type || '',
                'Detection Time': d.date_time || '',
                'Rejected': Number(d.remove_from_client) === 1 ? 1 : 0,
                'Image URL': d.imageurl || '',
                'View': d.imageurl ? 'View' : '',
            };
        });

        const detWs = makeSheet(DET_HEADERS, detSheetData, DET_WIDTHS);

        // Add hyperlinks to the "View" column (index 10)
        const range = XLSX.utils.decode_range(detWs['!ref'] || 'A1');
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
            //purana
            // const cellAddr = XLSX.utils.encode_cell({ r: R, c: 10 });
            //naya
            const cellAddr = XLSX.utils.encode_cell({ r: R, c: DET_HEADERS.indexOf('View') });
            const url = detSheetData[R - 1]['Image URL'];
            if (url) {
                detWs[cellAddr] = { t: 's', v: 'View', l: { Target: url, Tooltip: 'Click to view image' } };
            }
        }

        XLSX.utils.book_append_sheet(wb, detWs, 'Detections List');

        // ── 9. Analysis Sheet ─────────────────────────────────────────────────
        const analysisData = [];
        let cumulativeOnline = 0;
        let totalDurationMinutes = 0;

        const parseTimeToMinutes = (t) => {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return (h * 60) + m;
        };

        shifts.forEach((shiftMeta, idx) => {
            const shiftId = shiftMeta.id;

            // Calculate duration for this shift
            if (shiftMeta && shiftMeta.start_time && shiftMeta.end_time) {
                let diff = parseTimeToMinutes(shiftMeta.end_time) - parseTimeToMinutes(shiftMeta.start_time);
                if (diff < 0) diff += 1440; // Handle overnight shifts
                totalDurationMinutes += diff;
            }

            // In analysis, we show stats for every scheduled shift
            // Show all master cameras for the exam in every shift (RTSP parity)
            const shiftCams = masterCameras;
            const shiftDets = detections.filter(d => {
                const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
                return resolvedSid === shiftId;
            });

            const total = shiftCams.length;
            // Camera is online if: classification IS NOT NULL AND status = 'Accessible' (case-insensitive)
            const online = shiftCams.filter(c => {
                const hasClassification = isRTSP 
                    ? (c.classification && c.classification.trim() !== '')
                    : (c.camera_category && c.camera_category.trim() !== '');
                const isAccessible = (c.status || '').toLowerCase() === 'accessible';
                return hasClassification && isAccessible;
            }).length;
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

        const totalHours = (totalDurationMinutes / 60).toFixed(1);

        analysisData.push(['OVERALL SUMMARY', '']);
        analysisData.push(['Total Unique Cameras Online Today', uniqueOnline]);
        analysisData.push(['Total Online Cameras (Sum of Shifts)', cumulativeOnline]);
        analysisData.push(['Total Detections (All Shifts)', detections.length]);
        analysisData.push(['Total Scheduled Duration (Active Shifts)', `${totalHours} hours`]);

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


/**
 * Client-facing version of the consolidated report.
 *
 * GET /api/report/download/client?exam_id=<id>&date=<dd-mm-yyyy>
 *
 * Identical to downloadReport in every output sheet (shift sheets, Detections
 * List, Analysis) except for two surgical changes:
 *
 *   1. Detection query is filtered to `pushed_to_client = 1`. Everything
 *      derived from `detections` (shift aggregation, Detections List rows,
 *      Analysis totals, top-5) is therefore over the client-visible set only.
 *
 *   2. In the shift sheets, the "Rejected Events" column for each camera is
 *      driven by `remove_from_client = 1` rather than the row's stored
 *      `rejected_events` value. A detection with remove_from_client=1
 *      contributes its `events` count to the camera's Rejected total; a
 *      detection with remove_from_client=0 contributes to the Events
 *      (Excluding Rejected) total. Net effect: per-camera Events vs Rejected
 *      reflects the admin's keep/pull decisions on the client side.
 *
 * Everything else — column headers, widths, hyperlinks, Analysis row labels —
 * matches downloadReport line-for-line so the two exports look identical to
 * the user.
 */
exports.downloadClientReport = async (req, res) => {
    const rawDate = req.query.date;
    const examId = req.query.exam_id;
    const mysqlDate = parseDateParam(rawDate);

    if (!mysqlDate || !examId) {
        return res.status(400).json({
            success: false,
            message: 'Missing or invalid parameters. Required: ?exam_id=<id>&date=<dd-mm-yyyy>'
        });
    }

    try {
        // ── 1. Exam metadata ─────────────────────────────────────────────────
        const examRows = await query(
            `SELECT id, exam_name, link_type FROM exams WHERE id = ? LIMIT 1`,
            [examId]
        );
        if (!examRows || examRows.length === 0) {
            return res.status(404).json({ success: false, message: `Exam with id=${examId} not found.` });
        }
        const examName = examRows[0].exam_name || `Exam_${examId}`;
        const isRTSP = (examRows[0].link_type || '').toLowerCase() === 'rtsp';

        // ── 2. Shift metadata ────────────────────────────────────────────────
        const shifts = await query(
            `SELECT id, shift_name, start_time, end_time
             FROM exam_shifts
             WHERE exam_id = ? AND is_active = 1
             ORDER BY id ASC`,
            [examId]
        );
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

        // ── 3. Master camera list ────────────────────────────────────────────
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
        const searchDate = `${d}/${m}/${y}`;

        // ── 4. Client-only detection set: pushed_to_client = 1 ───────────────
        // Carry remove_from_client through so the per-row "Rejected" column
        // and the aggregated "Rejected Events" count can both use it.
        const detections = isRTSP ? await query(
            `SELECT id, shift_id, city, center_name, camera_id, camera_name, camera_no,
                    '' as camera_category, tc_code, device_id, state, camera_status,
                    events, rejected_events, date_time, imageurl, detection_type,
                    unique_id, pushed_to_client, remove_from_client
             FROM camera_report_rtsp
             WHERE exam_id = ?
               AND date_time LIKE CONCAT(?, '%')
               AND pushed_to_client = 1
             ORDER BY shift_id ASC`,
            [examId, searchDate]
        ) : await query(
            `SELECT id, shift_id, city, center_name, camera_id, camera_name,
                    camera_category, tc_code, ch_code, state, camera_status,
                    events, rejected_events, date_time, imageurl, detection_type,
                    unique_id, created_at, pushed_to_client, remove_from_client
             FROM camera_report_hls
             WHERE exam_id = ?
               AND date_time LIKE CONCAT(?, '%')
               AND pushed_to_client = 1
             ORDER BY shift_id ASC, created_at ASC`,
            [examId, searchDate]
        );

        // ── 4b. Server-address (cctv_url) lookup from camera_links ───────────
        // The report tables don't carry the server URL, so map it per camera.
        // Keyed the same way as detections: device_id_camera_no (RTSP) / ch_code (HLS).
        const linkRows = isRTSP
            ? await query(`SELECT device_id, camera_no, cctv_url FROM camera_links_rtsp WHERE exam_id = ?`, [examId])
            : await query(`SELECT ch_code, cctv_url FROM camera_links_hls WHERE exam_id = ?`, [examId]);
        const serverByKey = {};
        linkRows.forEach(l => {
            const k = isRTSP ? `${l.device_id}_${l.camera_no}` : String(l.ch_code);
            if (serverByKey[k] === undefined) serverByKey[k] = l.cctv_url || '';
        });

        // ── 5. Aggregate detections per (shift, camera) ──────────────────────
        const aggregated = {};
        detections.forEach(d => {
            // ✅ NULL shift_id → date_time se dynamically determine karo
            const sid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
            
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
            if (Number(d.remove_from_client) === 1) {
                aggregated[sid][key].rejected += 1;
            } else {
                aggregated[sid][key].events += 1;
            }
        });

        // ── 6. Workbook ──────────────────────────────────────────────────────
        const wb = XLSX.utils.book_new();

        const SHIFT_HEADERS = [
            'City', 'Center', 'Cam ID', 'Camera Name',
            'Cam Type', 'TC Code', 'Events (Excluding Rejected)', 'Rejected Events', 'Camera Status'
        ];
        const SHIFT_WIDTHS = [15, 30, 15, 35, 15, 12, 28, 16, 15];

        shifts.forEach((shiftMeta, idx) => {
            const shiftId = shiftMeta.id;
            const sheetName = `Shift ${idx + 1}`;

            let sheetData = [];

            if (isRTSP) {
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
                        const hasClassification = cam.classification && cam.classification.trim() !== '';
                        const isAccessible = (cam.status || '').toLowerCase() === 'accessible';
                        const isOnline = hasClassification && isAccessible;
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': key,
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': camType,
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': 0,
                            'Rejected Events': 0,
                            'Camera Status': isOnline ? 'Online' : 'Offline',
                        };
                    }
                });
            } else {
                const shiftCams = masterCameras;
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
                        const hasClassification = cam.camera_category && cam.camera_category.trim() !== '';
                        const isAccessible = (cam.status || '').toLowerCase() === 'accessible';
                        const isOnline = hasClassification && isAccessible;
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': camIdDisplay,
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': cam.camera_category || '',
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': 0,
                            'Rejected Events': 0,
                            'Camera Status': isOnline ? 'Online' : 'Offline',
                        };
                    }
                });
            }

            const ws = makeSheet(SHIFT_HEADERS, sheetData, SHIFT_WIDTHS);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        // ── 7. Detections List — admin layout + per-row "Rejected" flag ─────
        // Each row is one pushed detection. The Rejected column is 1 when
        // the admin later pulled this detection back from the client UI
        // (remove_from_client = 1), 0 when it's still active on the client.
        const DET_HEADERS = [
            'Shift', 'Device ID', 'Camera No', 'Cam ID', 'TC Code', 'Camera Name',
            'Center Name', 'City', 'Server Address', 'Detection Type', 'Detection Time',
            'Rejected', 'Image URL', 'View'
        ];
        const DET_WIDTHS = [10, 15, 12, 15, 14, 35, 30, 15, 28, 20, 22, 10, 70, 8];

        const detSheetData = detections.map(d => {
            const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
            return {
                'Shift': (shiftMap[resolvedSid] || {}).label || `Shift ${resolvedSid}`,
                'Device ID': d.device_id || '',
                'Camera No': d.camera_no || '',
                'Cam ID': isRTSP ? `${d.device_id}_${d.camera_no}` : formatHlsCamId(d.camera_name, d.ch_code),
                'TC Code': d.tc_code || '',
                'Camera Name': d.camera_name || '',
                'Center Name': d.center_name || '',
                'City': d.city || '',
                'Server Address': serverByKey[isRTSP ? `${d.device_id}_${d.camera_no}` : String(d.ch_code)] || '',
                'Detection Type': d.detection_type || '',
                'Detection Time': d.date_time || '',
                'Rejected': Number(d.remove_from_client) === 1 ? 1 : 0,
                'Image URL': d.imageurl || '',
                'View': d.imageurl ? 'View' : '',
            };
        });

        const detWs = makeSheet(DET_HEADERS, detSheetData, DET_WIDTHS);

        // Hyperlinks on the "View" column — index 11 because Rejected was
        // inserted between Detection Time and Image URL.
        const range = XLSX.utils.decode_range(detWs['!ref'] || 'A1');
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
            const cellAddr = XLSX.utils.encode_cell({ r: R, c: DET_HEADERS.indexOf('View') });
            const url = detSheetData[R - 1]['Image URL'];
            if (url) {
                detWs[cellAddr] = { t: 's', v: 'View', l: { Target: url, Tooltip: 'Click to view image' } };
            }
        }

        XLSX.utils.book_append_sheet(wb, detWs, 'Detections List');

        // ── 8. Analysis sheet ────────────────────────────────────────────────
        const analysisData = [];
        let cumulativeOnline = 0;
        let totalDurationMinutes = 0;

        const parseTimeToMinutes = (t) => {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return (h * 60) + m;
        };

        shifts.forEach((shiftMeta, idx) => {
            const shiftId = shiftMeta.id;

            if (shiftMeta && shiftMeta.start_time && shiftMeta.end_time) {
                let diff = parseTimeToMinutes(shiftMeta.end_time) - parseTimeToMinutes(shiftMeta.start_time);
                if (diff < 0) diff += 1440;
                totalDurationMinutes += diff;
            }

            const shiftCams = masterCameras;
            const shiftDets = detections.filter(d => {
                const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
                return resolvedSid === shiftId;
            });

            const total = shiftCams.length;
            const online = shiftCams.filter(c => {
                const hasClassification = isRTSP
                    ? (c.classification && c.classification.trim() !== '')
                    : (c.camera_category && c.camera_category.trim() !== '');
                const isAccessible = (c.status || '').toLowerCase() === 'accessible';
                return hasClassification && isAccessible;
            }).length;
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

        const uniqueOnline = new Set(
            detections.filter(d => (d.camera_status || '').toLowerCase() === 'online').map(d => d.ch_code)
        ).size;
        const totalHours = (totalDurationMinutes / 60).toFixed(1);

        analysisData.push(['OVERALL SUMMARY', '']);
        analysisData.push(['Total Unique Cameras Online Today', uniqueOnline]);
        analysisData.push(['Total Online Cameras (Sum of Shifts)', cumulativeOnline]);
        analysisData.push(['Total Detections (All Shifts)', detections.length]);
        analysisData.push(['Total Scheduled Duration (Active Shifts)', `${totalHours} hours`]);

        const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
        analysisWs['!cols'] = [{ wch: 40 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, analysisWs, 'Analysis');

        // ── 9. Stream ────────────────────────────────────────────────────────
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const safeName = sanitizeFilename(examName);
        const filename = `${safeName}_Client_Report_${mysqlDate}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
    } catch (error) {
        console.error('[ReportController.downloadClientReport] Error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error while generating client report.' });
    }
};





