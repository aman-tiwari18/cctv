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
const ExcelJS = require('exceljs');
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

/**
 * Normalise a camera_links exam_date to "yyyy-mm-dd".
 * Sequelize hands DATE columns back as strings, but tolerate Date objects and
 * datetime strings too so the comparison never silently fails.
 */
function normalizeExamDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        const pad = n => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Cameras belonging to a given shift on the report's date.
 *
 * Both dimensions are scoped per camera, and NULL always means "applies to
 * everything" — so narrowing only ever happens where the upload was explicit:
 *
 *   shift_id  = <id>    uploaded against one shift  → counted in that shift only
 *   shift_id  = NULL    uploaded for the whole exam → counted in every shift
 *   exam_date = <date>  uploaded for one date       → counted on that date only
 *   exam_date = NULL    no date on the upload       → counted on every date
 *
 * An exam whose cameras carry neither field therefore keeps the original
 * behaviour (every camera on every shift sheet). RTSP is untouched for the same
 * reason: camera_links_rtsp has no shift_id or exam_date column, so its rows are
 * selected as NULL and always apply to all shifts and all dates.
 *
 * @param {string|null} examDate the report's date as "yyyy-mm-dd" (mysqlDate)
 */
function camerasForShiftAndDate(masterCameras, shiftId, examDate) {
    return masterCameras.filter(cam => {
        const shiftMatches = cam.shift_id == null
            || Number(cam.shift_id) === Number(shiftId);

        const camDate = normalizeExamDate(cam.exam_date);
        const dateMatches = camDate === null || examDate == null
            || camDate === examDate;

        return shiftMatches && dateMatches;
    });
}

/**
 * Live online/offline state of a camera, read from its camera_links row.
 *
 * This is the single rule used everywhere a camera's status is reported — the
 * shift sheets, the Analysis sheet and the Cameras tab in the UI: a camera is
 * Online when it has been classified AND its link status is "Accessible".
 *
 * It deliberately does NOT use `camera_report_*.camera_status`. That column is
 * a snapshot taken at the moment a detection row was written, so a camera that
 * blipped offline once during the shift stayed "Offline" in the sheet for the
 * rest of the day even after it came back — which is why the sheet's Online
 * count came out lower than the Cameras tab's.
 */
function cameraIsOnline(cam, isRTSP) {
    const classification = isRTSP ? cam.classification : cam.camera_category;
    const hasClassification = !!classification && String(classification).trim() !== '';
    const isAccessible = String(cam.status || '').toLowerCase() === 'accessible';
    return hasClassification && isAccessible;
}

// Rows of one classification run land within minutes of each other (each
// worker bulk-writes its share at the end of Pass-2); separate runs of the same
// day are scheduled hours apart. A gap longer than this starts a new run.
const RTSP_RUN_GAP_MS = 15 * 60 * 1000;

/**
 * RTSP camera list for each shift, as that shift's own classification saw it.
 *
 * camera_links_rtsp holds only the LATEST classification/status (the final run
 * of the day overwrites earlier ones), so reading it for every shift gave all
 * shifts the same — final — picture. Instead each shift uses the classification
 * that was run FOR THAT SHIFT: camera_classification_rtsp rows carry the
 * shift_id of the assignment that produced them, so the mapping is exact —
 * a run scheduled for Shift 2 belongs to Shift 2 only, whenever it ran (e.g.
 * 30-09: the 10:31 and 12:05 runs were both Shift 2's; Shift 1 had none).
 *
 *   - shift has runs on the report date → its LATEST run is used;
 *   - shift has no run, but other shifts that day do → no classification for
 *     this shift: every camera is Offline / "Not Classified" (never borrowed
 *     from another shift's run);
 *   - no classification history at all for the date (older data) → the live
 *     camera_links_rtsp values, as before.
 *
 * Within a run, a camera with a history row is Accessible with that label;
 * every other camera is Not Accessible for that shift (every run attempts all
 * active cameras — only reachable, classified ones get a history row).
 *
 * @returns {{ camsByShift: Object<number, object[]>, runByShift: Object<number, string> }}
 *          runByShift = human-readable description of the classification used.
 */
async function rtspShiftCameraLists(examId, mysqlDate, shifts, masterCameras) {
    const history = await query(
        `SELECT cc.camera_id, cc.shift_id, cc.classification, cc.created_at
         FROM camera_classification_rtsp cc
         JOIN camera_links_rtsp cl ON cl.id = cc.camera_id AND cl.exam_id = ?
         WHERE cc.exam_date = ? OR (cc.exam_date IS NULL AND DATE(cc.created_at) = ?)
         ORDER BY cc.created_at ASC, cc.id ASC`,
        [examId, mysqlDate, mysqlDate]
    );

    // Partition by the shift each row was classified for, then split each
    // shift's rows into runs by time gap.
    const runsByShift = {};
    history.forEach(r => {
        if (r.shift_id == null) return;
        const sid = Number(r.shift_id);
        const t = new Date(r.created_at).getTime();
        const runs = runsByShift[sid] || (runsByShift[sid] = []);
        let cur = runs[runs.length - 1];
        if (!cur || t - cur.endMs > RTSP_RUN_GAP_MS) {
            cur = { startMs: t, endMs: t, byCamera: new Map() };
            runs.push(cur);
        }
        cur.endMs = t;
        cur.byCamera.set(Number(r.camera_id), r.classification); // last row per camera wins
    });

    const fmt = ms => {
        const d = new Date(ms);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const hhmm = ms => fmt(ms).slice(-5);

    const camsByShift = {};
    const runByShift = {};
    shifts.forEach(sh => {
        const runs = runsByShift[Number(sh.id)] || [];
        const run = runs[runs.length - 1];
        if (!run) {
            if (history.length === 0) {
                camsByShift[sh.id] = masterCameras;
                runByShift[sh.id] = 'No classification history for this date — current camera status used';
            } else {
                camsByShift[sh.id] = masterCameras.map(cam => ({
                    ...cam, classification: null, status: 'Not Accessible', _notClassified: true,
                }));
                runByShift[sh.id] = 'No classification run for this shift';
            }
            return;
        }
        camsByShift[sh.id] = masterCameras.map(cam => {
            const hit = run.byCamera.has(Number(cam.id));
            return {
                ...cam,
                classification: hit ? run.byCamera.get(Number(cam.id)) : null,
                status: hit ? 'Accessible' : 'Not Accessible',
            };
        });
        const all = runs.length > 1
            ? ` — this shift's runs: ${runs.map(r => hhmm(r.startMs)).join(', ')}; latest used`
            : '';
        runByShift[sh.id] = `${fmt(run.startMs)} (${run.byCamera.size} cameras classified)${all}`;
    });
    return { camsByShift, runByShift };
}

/**
 * Identity of a physical camera across shifts: device_id + camera_no for RTSP,
 * ch_code for HLS. Used to count a camera once when it appears in several shifts.
 */
function cameraUniqueKey(cam, isRTSP) {
    return isRTSP ? `${cam.device_id}_${cam.camera_no}` : String(cam.ch_code);
}


/**
 * Device ID + Camera No for an HLS row.
 *
 * The HLS tables carry neither column — an HLS camera is identified by
 * ch_code plus a composite camera_name like "11394/L-002/C04" (DVR/room/channel)
 * or "28839_REGISTRATION_BIOMETRIC". That is why the Detections List showed
 * these two columns blank on every HLS export: there was nothing to read.
 * Both parts are recoverable from the name (camera_id, stored as
 * "<device>_<camera>", is the fallback when the name has no separator).
 */
function hlsDeviceAndCameraNo(row) {
    const name = String(row.camera_name || '').trim();
    if (name.includes('/')) {
        const parts = name.split('/').map(x => x.trim()).filter(Boolean);
        return {
            device: parts[0] || '',
            cameraNo: parts.length > 1 ? parts[parts.length - 1] : '',
        };
    }
    const camId = String(row.camera_id || name || '').trim();
    const sep = camId.indexOf('_');
    if (sep > 0) return { device: camId.slice(0, sep), cameraNo: camId.slice(sep + 1) };
    // Names with neither separator ("2090 Centre-III cam1", "15803-DSP LAB CAM 1")
    // still lead with the numeric DVR id, so split off that first token.
    const leadingId = camId.match(/^(\d+)[\s-]+(.*)$/);
    if (leadingId) return { device: leadingId[1], cameraNo: leadingId[2].trim() };
    return { device: '', cameraNo: camId };
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
             ORDER BY start_time ASC, id ASC`,
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
                    centre_name, city, state, null as shift_id,
                    null as exam_date, status
             FROM camera_links_rtsp
             WHERE exam_id = ? AND is_active = 1
             ORDER BY device_id ASC, camera_no ASC`,
            [examId]
        ) : await query(
            `SELECT id, ch_code, camera_name, camera_category, tc_code,
                    centre_name, city, state, shift_id, exam_date, status
             FROM camera_links_hls
             WHERE exam_id = ? AND is_active = 1
             ORDER BY shift_id ASC, ch_code ASC`,
            [examId]
        );

        const [y, m, d] = mysqlDate.split('-');
        const searchDate = `${d}/${m}/${y}`; // 16/04/2026

        // RTSP: each shift uses its own (latest) classification run instead of
        // the final live classification — see rtspShiftCameraLists. HLS keeps
        // the shift/date-scoped camera_links list.
        const rtspShift = isRTSP ? await rtspShiftCameraLists(examId, mysqlDate, shifts, masterCameras) : null;
        const shiftCamsOf = (sid) => (rtspShift
            ? rtspShift.camsByShift[sid]
            : camerasForShiftAndDate(masterCameras, sid, mysqlDate));

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
                    unique_id, created_at, pushed_to_client, remove_from_client
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
            const shiftCams = shiftCamsOf(shiftId);

            let sheetData = [];

            if (isRTSP) {
                // For RTSP, every camera uploaded applies to all shifts
                // So we always show all shifts scheduled for this exam.

                // Show ALL master cameras for RTSP in this shift
                sheetData = shiftCams.map(cam => {
                    const key = `${cam.device_id}_${cam.camera_no}`;
                    const agg = (aggregated[shiftId] || {})[key];
                    const camType = cam.classification || (cam._notClassified ? 'Not Classified' : 'Failed to Classify');

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
                            'Camera Status': cameraIsOnline(cam, isRTSP) ? 'Online' : 'Offline',
                        };
                    } else {
                        // Camera is online if: classification IS NOT NULL AND status = 'Accessible' (case-insensitive)
                        const isOnline = cameraIsOnline(cam, isRTSP);
                        
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
                // HLS: shift- and date-scoped list (see camerasForShiftAndDate) —
                // a camera uploaded against a specific shift/date appears only on
                // that shift's sheet for that date; a camera uploaded without them
                // (NULL) still appears everywhere, as before.
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
                            'Camera Status': cameraIsOnline(cam, isRTSP) ? 'Online' : 'Offline',
                        };
                    } else {
                        // Camera is online if: classification IS NOT NULL AND status = 'Accessible' (case-insensitive)
                        const isOnline = cameraIsOnline(cam, isRTSP);
                        
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
        const DET_HEADERS = isRTSP ? [
            'Shift', 'Device ID', 'Camera No', 'Cam ID', 'TC Code', 'Camera Name',
            'Center Name', 'City', 'Server Address', 'Detection Type', 'Detection Time',
            'Rejected', 'Image URL', 'View'
        ] : [
            'Shift', 'Device ID', 'Camera No', 'Cam ID', 'TC Code', 'Camera Name',
            'Center Name', 'City', 'Server Address', 'Detection Type', 'Detection Time',
            'Rejected', 'Image URL', 'View'
        ];
        const DET_WIDTHS = isRTSP
            ? [10, 15, 12, 15, 14, 35, 30, 15, 28, 20, 22, 10, 70, 8]
            : [10, 15, 12, 15, 14, 35, 30, 15, 28, 20, 22, 10, 70, 8];

        const detSheetData = detections.map(d => {
            const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
            const row = {
                'Shift': (shiftMap[resolvedSid] || {}).label || `Shift ${resolvedSid}`,
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
            if (isRTSP) {
                row['Device ID'] = d.device_id || '';
                row['Camera No'] = d.camera_no || '';
            } else {
                const { device, cameraNo } = hlsDeviceAndCameraNo(d);
                row['Device ID'] = device;
                row['Camera No'] = cameraNo;
            }
            return row;
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
        const uniqueOnlineKeys = new Set();
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

            // In analysis, we show stats for every scheduled shift. Camera
            // totals are scoped to this shift AND the report's date: a camera
            // uploaded against them is counted here, one uploaded without them
            // (NULL) is counted in every shift and on every date.
            const shiftCams = shiftCamsOf(shiftId);
            const shiftDets = detections.filter(d => {
                const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
                return resolvedSid === shiftId;
            });

            const total = shiftCams.length;
            // Camera is online if: classification IS NOT NULL AND status = 'Accessible' (case-insensitive)
            const online = shiftCams.filter(c => cameraIsOnline(c, isRTSP)).length;
            const offline = total - online;
            const detCount = shiftDets.length;
            const rate = total > 0 ? ((online / total) * 100).toFixed(2) + '%' : '0%';

            cumulativeOnline += online;
            shiftCams.filter(c => cameraIsOnline(c, isRTSP))
                .forEach(c => uniqueOnlineKeys.add(cameraUniqueKey(c, isRTSP)));

            analysisData.push([`Shift ${idx + 1} ANALYSIS`, '']);
            if (rtspShift) analysisData.push(['Classification Used', rtspShift.runByShift[shiftId]]);
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
        // Unique online cameras across all shifts, from the master camera list
        // (same rule as the per-shift "Online Cameras"), independent of detections.
        const uniqueOnline = uniqueOnlineKeys.size;

        const totalHours = (totalDurationMinutes / 60).toFixed(1);

        analysisData.push(['OVERALL SUMMARY', '']);
        analysisData.push(['Total Unique Cameras Online Today', uniqueOnline]);
        analysisData.push(['Total Online Cameras (Sum of Shifts)', cumulativeOnline]);
        analysisData.push(['Total Detections (All Shifts)', detections.length]);
        analysisData.push(['Total Scheduled Duration (Active Shifts)', `${totalHours} hours`]);

        const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
        analysisWs['!cols'] = [{ wch: 40 }, { wch: 60 }];
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
 *   2. The Detections List carries a per-row "Status" column (Accepted /
 *      Rejected / Not Verified) in place of the admin export's plain
 *      "Rejected" 0/1 flag, resolved from accepted_by_client +
 *      remove_from_client.
 *
 *   3. In the shift sheets, the "Rejected Events" column for each camera is
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
             ORDER BY start_time ASC, id ASC`,
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
                    centre_name, city, state, null as shift_id,
                    null as exam_date, status
             FROM camera_links_rtsp
             WHERE exam_id = ? AND is_active = 1
             ORDER BY device_id ASC, camera_no ASC`,
            [examId]
        ) : await query(
            `SELECT id, ch_code, camera_name, camera_category, tc_code,
                    centre_name, city, state, shift_id, exam_date, status
             FROM camera_links_hls
             WHERE exam_id = ? AND is_active = 1
             ORDER BY shift_id ASC, ch_code ASC`,
            [examId]
        );

        const [y, m, d] = mysqlDate.split('-');
        const searchDate = `${d}/${m}/${y}`;

        // RTSP: each shift uses its own (latest) classification run instead of
        // the final live classification — see rtspShiftCameraLists. HLS keeps
        // the shift/date-scoped camera_links list.
        const rtspShift = isRTSP ? await rtspShiftCameraLists(examId, mysqlDate, shifts, masterCameras) : null;
        const shiftCamsOf = (sid) => (rtspShift
            ? rtspShift.camsByShift[sid]
            : camerasForShiftAndDate(masterCameras, sid, mysqlDate));

        // ── 4. Client-only detection set: pushed_to_client = 1 ───────────────
        // Carry remove_from_client through so the aggregated "Rejected Events"
        // count can use it, and accepted_by_client so the Detections List can
        // resolve the per-row Status (Accepted / Rejected / Not Verified).
        const detections = isRTSP ? await query(
            `SELECT id, shift_id, city, center_name, camera_id, camera_name, camera_no,
                    '' as camera_category, tc_code, device_id, state, camera_status,
                    events, rejected_events, date_time, imageurl, detection_type,
                    unique_id, pushed_to_client, remove_from_client, accepted_by_client
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
                    unique_id, created_at, pushed_to_client, remove_from_client, accepted_by_client
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
            'City', 'Center', 'Cam ID', 'Channel Id', 'Camera Name',
            'Cam Type', 'TC Code', 'Events (Excluding Rejected)', 'Rejected Events', 'Camera Status'
        ];
        const SHIFT_WIDTHS = [15, 30, 15, 18, 35, 15, 12, 28, 16, 15];

        shifts.forEach((shiftMeta, idx) => {
            const shiftId = shiftMeta.id;
            const sheetName = `Shift ${idx + 1}`;
            const shiftCams = shiftCamsOf(shiftId);

            let sheetData = [];

            if (isRTSP) {
                sheetData = shiftCams.map(cam => {
                    const key = `${cam.device_id}_${cam.camera_no}`;
                    const agg = (aggregated[shiftId] || {})[key];
                    const camType = cam.classification || (cam._notClassified ? 'Not Classified' : 'Failed to Classify');

                    if (agg) {
                        return {
                            'City': cam.city || agg.details.city || '',
                            'Center': cam.centre_name || agg.details.center || '',
                            'Cam ID': key,
                            'Channel Id': '',
                            'Camera Name': cam.camera_name || agg.details.camera_name || '',
                            'Cam Type': camType,
                            'TC Code': cam.tc_code || agg.details.tc_code || '',
                            'Events (Excluding Rejected)': agg.events,
                            'Rejected Events': agg.rejected,
                            'Camera Status': cameraIsOnline(cam, isRTSP) ? 'Online' : 'Offline',
                        };
                    } else {
                        const isOnline = cameraIsOnline(cam, isRTSP);
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': key,
                            'Channel Id': '',
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
                sheetData = shiftCams.map(cam => {
                    const agg = (aggregated[shiftId] || {})[cam.ch_code];
                    const camIdDisplay = formatHlsCamId(cam.camera_name, cam.ch_code);

                    if (agg) {
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': camIdDisplay,
                            'Channel Id': cam.ch_code || '',
                            'Camera Name': cam.camera_name || '',
                            'Cam Type': cam.camera_category || '',
                            'TC Code': cam.tc_code || '',
                            'Events (Excluding Rejected)': agg.events,
                            'Rejected Events': agg.rejected,
                            'Camera Status': cameraIsOnline(cam, isRTSP) ? 'Online' : 'Offline',
                        };
                    } else {
                        const isOnline = cameraIsOnline(cam, isRTSP);
                        return {
                            'City': cam.city || '',
                            'Center': cam.centre_name || '',
                            'Cam ID': camIdDisplay,
                            'Channel Id': cam.ch_code || '',
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

        // ── 7. Detections List — admin layout + per-row "Status" ────────────
        // Each row is one pushed detection. Status collapses the client's two
        // review actions into one column:
        //   Accepted      accepted_by_client = 1 (client confirmed it; the SMS
        //                 alert to the tc_code observer fired on that click)
        //   Rejected      remove_from_client = 1 (pulled off the client view)
        //   Not Verified  neither — still sitting unreviewed on the client page
        // Accept wins when a row carries both flags: accepting is the terminal,
        // irreversible action (an SMS went out), whereas a later Remove only
        // tidies the feed. Flip the order in detectionStatus to reverse that.
        const DET_HEADERS = isRTSP ? [
            'Shift', 'Device ID', 'Camera No', 'Cam ID', 'TC Code', 'Camera Name',
            'Center Name', 'City', 'Server Address', 'Detection Type', 'Detection Time',
            'Status', 'Image URL', 'View'
        ] : [
            'Shift', 'Device ID', 'Camera No', 'Cam ID', 'Channel Id', 'TC Code', 'Camera Name',
            'Center Name', 'City', 'Server Address', 'Detection Type', 'Detection Time',
            'Status', 'Image URL', 'View'
        ];
        const DET_WIDTHS = isRTSP
            ? [10, 15, 12, 15, 14, 35, 30, 15, 28, 20, 22, 14, 70, 8]
            : [10, 15, 12, 15, 18, 14, 35, 30, 15, 28, 20, 22, 14, 70, 8];

        const detectionStatus = (d) => {
            if (Number(d.accepted_by_client) === 1) return 'Accepted';
            if (Number(d.remove_from_client) === 1) return 'Rejected';
            return 'Not Verified';
        };

        const detSheetData = detections.map(d => {
            const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
            const row = {
                'Shift': (shiftMap[resolvedSid] || {}).label || `Shift ${resolvedSid}`,
                'Cam ID': isRTSP ? `${d.device_id}_${d.camera_no}` : formatHlsCamId(d.camera_name, d.ch_code),
                'TC Code': d.tc_code || '',
                'Camera Name': d.camera_name || '',
                'Center Name': d.center_name || '',
                'City': d.city || '',
                'Server Address': serverByKey[isRTSP ? `${d.device_id}_${d.camera_no}` : String(d.ch_code)] || '',
                'Detection Type': d.detection_type || '',
                'Detection Time': d.date_time || '',
                'Status': detectionStatus(d),
                'Image URL': d.imageurl || '',
                'View': d.imageurl ? 'View' : '',
            };
            if (isRTSP) {
                row['Device ID'] = d.device_id || '';
                row['Camera No'] = d.camera_no || '';
            } else {
                const { device, cameraNo } = hlsDeviceAndCameraNo(d);
                row['Device ID'] = device;
                row['Camera No'] = cameraNo;
                row['Channel Id'] = d.ch_code || '';
            }
            return row;
        });

        const detWs = makeSheet(DET_HEADERS, detSheetData, DET_WIDTHS);

        // Hyperlinks on the "View" column — resolved by header name, since
        // Status sits between Detection Time and Image URL.
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
        const uniqueOnlineKeys = new Set();
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

            const shiftCams = shiftCamsOf(shiftId);
            const shiftDets = detections.filter(d => {
                const resolvedSid = (d.shift_id != null) ? d.shift_id : determineShiftId(d.date_time, shifts);
                return resolvedSid === shiftId;
            });

            const total = shiftCams.length;
            const online = shiftCams.filter(c => cameraIsOnline(c, isRTSP)).length;
            const offline = total - online;
            const detCount = shiftDets.length;
            const rate = total > 0 ? ((online / total) * 100).toFixed(2) + '%' : '0%';

            cumulativeOnline += online;
            shiftCams.filter(c => cameraIsOnline(c, isRTSP))
                .forEach(c => uniqueOnlineKeys.add(cameraUniqueKey(c, isRTSP)));

            analysisData.push([`Shift ${idx + 1} ANALYSIS`, '']);
            if (rtspShift) analysisData.push(['Classification Used', rtspShift.runByShift[shiftId]]);
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

        // Unique online cameras across all shifts, from the master camera list
        // (same rule as the per-shift "Online Cameras"), independent of detections.
        const uniqueOnline = uniqueOnlineKeys.size;
        const totalHours = (totalDurationMinutes / 60).toFixed(1);

        analysisData.push(['OVERALL SUMMARY', '']);
        analysisData.push(['Total Unique Cameras Online Today', uniqueOnline]);
        analysisData.push(['Total Online Cameras (Sum of Shifts)', cumulativeOnline]);
        analysisData.push(['Total Detections (All Shifts)', detections.length]);
        analysisData.push(['Total Scheduled Duration (Active Shifts)', `${totalHours} hours`]);

        const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
        analysisWs['!cols'] = [{ wch: 40 }, { wch: 60 }];
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


/**
 * Per-exam summary report (admin).
 *
 * GET /api/report/summary?exam_id=<id>
 *
 * One row per exam date that has detections, plus a final bold "Total :" row
 * summing each column across all dates:
 *   Date | Shift N (Online) ... | Total Online | Total Detections
 * Total Detections counts only client-side detections (pushed_to_client = 1),
 * same set as the client consolidated report.
 * "Online" per shift uses the same rule as the consolidated report's Analysis
 * sheet (cameraIsOnline over camerasForShiftAndDate).
 */
exports.downloadSummaryReport = async (req, res) => {
    const examId = req.query.exam_id;
    if (!examId) {
        return res.status(400).json({ success: false, message: 'Missing parameter: exam_id' });
    }

    try {
        const examRows = await query(
            `SELECT id, exam_name, link_type FROM exams WHERE id = ? LIMIT 1`,
            [examId]
        );
        if (!examRows || examRows.length === 0) {
            return res.status(404).json({ success: false, message: `Exam with id=${examId} not found.` });
        }
        const examName = examRows[0].exam_name || `Exam_${examId}`;
        const isRTSP = (examRows[0].link_type || '').toLowerCase() === 'rtsp';

        const shifts = await query(
            `SELECT id, shift_name, start_time, end_time
             FROM exam_shifts
             WHERE exam_id = ? AND is_active = 1
             ORDER BY start_time ASC, id ASC`,
            [examId]
        );

        const masterCameras = isRTSP ? await query(
            `SELECT id, classification, null as shift_id, null as exam_date, status
             FROM camera_links_rtsp
             WHERE exam_id = ? AND is_active = 1`,
            [examId]
        ) : await query(
            `SELECT id, camera_category, shift_id, exam_date, status
             FROM camera_links_hls
             WHERE exam_id = ? AND is_active = 1`,
            [examId]
        );

        // date_time is stored as "dd/mm/yyyy hh:mm:ss" — group on the date prefix.
        const table = isRTSP ? 'camera_report_rtsp' : 'camera_report_hls';
        const dayRows = await query(
            `SELECT LEFT(date_time, 10) AS d, COUNT(*) AS cnt
             FROM ${table}
             WHERE exam_id = ? AND pushed_to_client = 1
               AND date_time REGEXP '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
             GROUP BY LEFT(date_time, 10)`,
            [examId]
        );
        const days = dayRows
            .map(r => {
                const [dd, mm, yyyy] = String(r.d).split('/');
                return { iso: `${yyyy}-${mm}-${dd}`, count: Number(r.cnt) };
            })
            .sort((a, b) => a.iso.localeCompare(b.iso));

        const headers = [
            'Date',
            ...shifts.map((_, i) => `Shift${i + 1}(Online)`),
            'Total Online',
            'Total Detections',
        ];
        const rows = [];
        for (const day of days) {
            const row = { 'Date': day.iso };
            let totalOnline = 0;
            // RTSP: each shift's Online count comes from that shift's own
            // classification run on that date (same rule as the consolidated
            // report), not the final live classification.
            const rtspShift = isRTSP ? await rtspShiftCameraLists(examId, day.iso, shifts, masterCameras) : null;
            shifts.forEach((sh, i) => {
                const cams = rtspShift
                    ? rtspShift.camsByShift[sh.id]
                    : camerasForShiftAndDate(masterCameras, sh.id, day.iso);
                const online = cams.filter(c => cameraIsOnline(c, isRTSP)).length;
                row[`Shift${i + 1}(Online)`] = online;
                totalOnline += online;
            });
            row['Total Online'] = totalOnline;
            row['Total Detections'] = day.count;
            rows.push(row);
        }

        // exceljs (not SheetJS) so the header row can be styled.
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Sheet1');
        ws.columns = headers.map(h => ({ header: h, key: h, width: Math.max(14, h.length + 2) }));
        rows.forEach(r => ws.addRow(r));
        ws.getRow(1).eachCell(cell => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        });

        if (rows.length > 0) {
            const totalRow = { 'Date': 'Total :' };
            shifts.forEach((_, i) => {
                const key = `Shift${i + 1}(Online)`;
                totalRow[key] = rows.reduce((sum, r) => sum + r[key], 0);
            });
            totalRow['Total Online'] = rows.reduce((sum, r) => sum + r['Total Online'], 0);
            totalRow['Total Detections'] = rows.reduce((sum, r) => sum + r['Total Detections'], 0);
            const addedTotalRow = ws.addRow(totalRow);
            addedTotalRow.eachCell(cell => {
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFF66' } };
            });
        }

        const buffer = Buffer.from(await wb.xlsx.writeBuffer());
        const filename = `Summary_${sanitizeFilename(examName)}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
    } catch (error) {
        console.error('[ReportController] Summary error:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error while generating summary report.' });
    }
};
