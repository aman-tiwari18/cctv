const { CameraLinkHLS, CameraLinkRTSP, Exam, ExamShift, ShiftScriptAssignment, Script } = require("../models");
const { Op } = require("sequelize");
const { query } = require("../config/database");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { fetchFrameFromAnyWorker } = require("../utils/workerFrameFetch");
const logger = require("../utils/logger");

// All classification frames live on NFS at this root (script-server side
// symlinks `scripts/detection/results` and `script-server/results/classification_frames`
// both resolve here). Any DB-stored frame_path containing `/classification_frames/`
// can be resolved by taking the suffix after that marker and joining with this root.
const NFS_FRAMES_ROOT = process.env.NFS_FRAMES_ROOT || "/data/nfs/cctv_images/classification_frames";

const CLASSIFICATION_MARKER = "/classification_frames/";

const buildHlsCameraScope = ({ shiftId, examDate }) => {
    const conditions = [];

    if (shiftId) {
        conditions.push({
            [Op.or]: [
                { shift_id: shiftId },
                { shift_id: null },
            ],
        });
    }

    if (examDate) {
        conditions.push({
            [Op.or]: [
                { exam_date: examDate },
                { exam_date: null },
            ],
        });
    }

    return conditions;
};

/**
 * Helper to get the correct model based on exam link type
 */
const getModelByExam = async (examId) => {
    const exam = await Exam.findByPk(examId);
    if (!exam) throw new Error("Exam not found");

    if (exam.link_type && exam.link_type.toUpperCase() === "RTSP") {
        return { Model: CameraLinkRTSP, linkType: "RTSP", exam };
    }
    return { Model: CameraLinkHLS, linkType: "HLS", exam };
};

/**
 * Pick first truthy value by checking row keys (case-insensitive and trimmed)
 */
const normalizeHeaderKey = (key) =>
    String(key || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const normalizeCellValue = (value) => {
    if (typeof value === "string") return value.trim();
    return value;
};

const pick = (row, ...keys) => {
    // Normalise row keys so variants like "ch_no", "Ch No", "CH-NO" all match.
    const normalizedRow = {};
    for (const [k, v] of Object.entries(row)) {
        const normalizedKey = normalizeHeaderKey(k);
        if (normalizedKey) {
            const normalizedValue = normalizeCellValue(v);

            // Preserve first non-empty value for duplicate-like headers.
            if (
                normalizedRow[normalizedKey] === undefined ||
                normalizedRow[normalizedKey] === ""
            ) {
                normalizedRow[normalizedKey] = normalizedValue;
            }
        }
    }

    // Check for keys
    for (const k of keys) {
        const checkKey = normalizeHeaderKey(k);
        if (normalizedRow[checkKey] !== undefined && normalizedRow[checkKey] !== "") {
            return normalizedRow[checkKey];
        }
    }
    return "";
};

const normalizeTcCode = (val) => val ? String(val).trim().replace(/^0+/, '') : '';

/**
 * Pick value from a header that contains all provided tokens.
 * Useful for merged headers like "ch_no(unique key value)".
 */
const pickByHeaderTokens = (row, ...tokens) => {
    const normalizedTokens = tokens.map((t) => normalizeHeaderKey(t)).filter(Boolean);
    if (normalizedTokens.length === 0) return "";

    for (const [k, v] of Object.entries(row)) {
        const normalizedKey = normalizeHeaderKey(k);
        if (!normalizedKey) continue;

        const isMatch = normalizedTokens.every((token) => normalizedKey.includes(token));
        if (!isMatch) continue;

        const value = normalizeCellValue(v);
        if (value !== undefined && value !== "") return value;
    }

    return "";
};

/**
 * Upload cameras via Excel file
 */
exports.uploadCameras = async (req, res) => {
    try {
        const examId = req.params.examId;
        const { shiftId, examDate } = req.body; // optional filters from form-data

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const { Model, linkType } = await getModelByExam(examId);

        // Read Excel
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

        if (!data || data.length === 0) {
            return res.status(400).json({ success: false, message: "Excel file is empty" });
        }

        // Validate exam_date against exam dates if provided
        if (examDate && linkType === "HLS") {
            const shifts = await ExamShift.findAll({ where: { exam_id: examId } });
            const validDates = [...new Set(shifts.map((s) => s.exam_date?.toString().split("T")[0]))].filter(Boolean);
            if (validDates.length > 0 && !validDates.includes(examDate)) {
                return res.status(400).json({
                    success: false,
                    message: `No exam scheduled on ${examDate}. Valid dates: ${validDates.join(", ")}`,
                });
            }
        }

        const validRecords = [];

        for (const row of data) {
            if (linkType === "HLS") {
                const cctv_url = pick(row, "cctv_url", "CCTV URL", "url", "URL", "Link", "CCTV_URL");
                if (!cctv_url) continue;

                const chCode =
                    pick(
                        row,
                        "ch_no",
                        "ch no",
                        "ch-no",
                        "chno",
                        "CH NO",
                        "CH-NO",
                        "channel no",
                        "channel_no",
                        "channel number",
                        "ch_code",
                        "CH Code",
                        "unique key",
                        "unique key value"
                    ) ||
                    pickByHeaderTokens(row, "ch", "no");

                validRecords.push({
                    exam_id: examId,
                    centre_name: pick(row, "Centre Name", "center_name", "centre_name", "TC Name", "TC NAME", "Tc_name"),
                    tc_code: pick(row, "TC Code", "tc_code", "TC_CODE", "TC code"),
                    city: pick(row, "City", "city", "CITY"),
                    state: pick(row, "State", "state", "STATE"),
                    camera_name: pick(row, "Camera Name", "camera_name", "LAN and Lab Name", "LAN & Lab Name"),
                    ch_code: chCode,
                    cctv_url,
                    camera_category: pick(row, "Camera Category", "camera_category", "camera category"),
                    classification: pick(row, "Classification", "classification") || null,
                    exam_date: examDate || null,
                    shift_id: shiftId || null,
                    is_active: true,
                });
            } else {
                // RTSP
                const device_id = pick(
                    row,
                    "Device ID",
                    "device_id",
                    "DeviceID",
                    "Device Id",
                    "Deive ID",
                    "DeiveID",
                    "Deive Id"
                );
                const camera_name = pick(row, "Camera Name", "camera_name");
                const camera_no = pick(row, "Camera No", "camera_no", "CameraNo", "Camera Number", "camera_number");
                const cctv_url = pick(row, "Server Address", "CCTV URL", "cctv_url", "url", "URL", "Link");
                const classification = pick(
                    row,
                    "Classification",
                    "classification",
                    "Scene Classification",
                    "scene_classification",
                    "scene classification",
                    "SceneClassification",
                    "sceneclassification",
                    "SCENE CLASSIFICATION",
                    "Room Classification",
                    "room_classification",
                    "room classification",
                    "RoomClassification",
                    "roomclassification",
                    "ROOM CLASSIFICATION",
                    "Room_Classification"
                ) || null;

                // Debug logging for classification
                if (device_id) {
                    console.log(`[DEBUG] Row for device ${device_id}:`, {
                        rawHeaders: Object.keys(row),
                        classificationValue: classification,
                        rawRow: row
                    });
                }

                if (!device_id || !cctv_url) continue;

                validRecords.push({
                    exam_id: examId,
                    device_id,
                    centre_name: pick(row, "Centre Name", "Center Name", "center_name", "centre_name", "TC Name", "TC NAME", "Tc_name"),
                    tc_code: pick(row, "TC Code", "tc_code", "TC_CODE", "TC code"),
                    camera_name,
                    camera_no: camera_no !== "" ? camera_no : null,
                    city: pick(row, "City", "city", "CITY"),
                    state: pick(row, "State", "state", "STATE"),
                    cctv_url,
                    classification,  // ← ADDED classification field
                    is_active: true,
                });
            }
        }

        if (validRecords.length === 0) {
            const detectedHeaders = Object.keys(data[0] || {});
            const missingColumnsMessage =
                linkType === "RTSP"
                    ? `No valid records found. Required RTSP columns: Device ID, Server Address (or CCTV URL). Optional: Camera No, TC Code, Camera Name, Centre/Center Name, City, State, Classification (or Scene Classification / Room Classification). Detected headers: ${detectedHeaders.join(", ")}`
                    : "No valid records found. Make sure the Excel contains a 'CCTV URL' column.";

            return res.status(400).json({
                success: false,
                message: missingColumnsMessage,
            });
        }

        // Debug: Log sample records with classification
        console.log(`[DEBUG] Sample records to insert (first 3):`, 
            validRecords.slice(0, 3).map(r => ({
                device_id: r.device_id,
                classification: r.classification,
                camera_name: r.camera_name
            }))
        );

        // Filter out duplicates based on unique keys
        let recordsToInsert = [];
        let recordsToUpdate = [];
        let skipped = 0;
        const sheetDuplicates = []; // ch_codes repeated inside the uploaded sheet

        if (linkType === "HLS") {
            // HLS unique key: tc_code + ch_code, WITHIN the shift being uploaded.
            // The same physical camera is filmed in every shift its centre hosts,
            // so a camera already listed under shift 1 is not a duplicate of the
            // shift 2 row — camera_links_hls is unique on (exam, ch_code, shift)
            // for exactly that reason. Comparing across shifts made every later
            // shift's sheet look like duplicates and silently dropped it.
            const targetShiftId = shiftId || null;
            const existingCameras = await Model.findAll({
                where: {
                    exam_id: examId,
                    is_active: true,
                    shift_id: targetShiftId
                },
                attributes: ['id', 'tc_code', 'ch_code', 'classification']
            });
            
            console.log(`[DUPLICATE CHECK] Found ${existingCameras.length} existing HLS cameras for exam ${examId}`);
            
            // Create map of unique keys to camera records
            const existingMap = new Map();
            existingCameras.forEach(c => {
                if (c.tc_code && c.ch_code) {
                    const key = `${String(c.tc_code).trim()}_${String(c.ch_code).trim()}`;
                    existingMap.set(key, c);
                }
            });
            
            console.log(`[DUPLICATE CHECK] Existing unique keys:`, Array.from(existingMap.keys()).slice(0, 5));
            
            // A ch_code repeated inside the sheet itself would break the
            // (exam_id, ch_code, shift_id) unique index and fail the whole
            // bulkCreate, so keep the first row and report the rest.
            const seenInSheet = new Map();

            // Separate records into insert vs update
            for (const record of validRecords) {
                if (!record.tc_code || !record.ch_code) {
                    recordsToInsert.push(record);
                    continue;
                }

                const chKey = String(record.ch_code).trim();
                if (seenInSheet.has(chKey)) {
                    sheetDuplicates.push(chKey);
                    continue;
                }
                seenInSheet.set(chKey, true);

                const uniqueKey = `${String(record.tc_code).trim()}_${chKey}`;
                const existingCamera = existingMap.get(uniqueKey);

                if (existingCamera) {
                    // Update classification if provided in Excel (regardless of existing value)
                    if (record.classification) {
                        recordsToUpdate.push({
                            id: existingCamera.id,
                            classification: record.classification,
                            oldClassification: existingCamera.classification
                        });
                        console.log(`[UPDATE] Will update classification for ${uniqueKey}: "${existingCamera.classification}" → "${record.classification}"`);
                    } else {
                        skipped++;
                        console.log(`[SKIP] Skipping duplicate (no classification provided in Excel): ${uniqueKey}`);
                    }
                } else {
                    recordsToInsert.push(record);
                }
            }
            
        } else {
            // RTSP unique key: device_id + camera_no + tc_code (leading zeros ignored)
            const existingCameras = await Model.findAll({
                where: {
                    exam_id: examId,
                    is_active: true
                },
                attributes: ['id', 'device_id', 'camera_no', 'tc_code', 'classification']
            });

            console.log(`[DUPLICATE CHECK] Found ${existingCameras.length} existing RTSP cameras for exam ${examId}`);

            // Create map of unique keys to camera records
            const existingMap = new Map();
            existingCameras.forEach(c => {
                if (c.device_id) {
                    const deviceId = String(c.device_id).trim();
                    const cameraNo = c.camera_no != null ? String(c.camera_no).trim() : '';
                    const tcCode = c.tc_code ? normalizeTcCode(c.tc_code) : '';
                    const key = `${deviceId}_${cameraNo}_${tcCode}`;
                    existingMap.set(key, c);
                }
            });

            console.log(`[DUPLICATE CHECK] Existing unique keys:`, Array.from(existingMap.keys()).slice(0, 5));

            // Separate records into insert vs update
            for (const record of validRecords) {
                if (!record.device_id) {
                    recordsToInsert.push(record);
                    continue;
                }

                const deviceId = String(record.device_id).trim();
                const cameraNo = record.camera_no != null ? String(record.camera_no).trim() : '';
                const tcCode = record.tc_code ? normalizeTcCode(record.tc_code) : '';
                const uniqueKey = `${deviceId}_${cameraNo}_${tcCode}`;
                const existingCamera = existingMap.get(uniqueKey);
                
                if (existingCamera) {
                    // Update classification if provided in Excel (regardless of existing value)
                    if (record.classification) {
                        recordsToUpdate.push({
                            id: existingCamera.id,
                            classification: record.classification,
                            oldClassification: existingCamera.classification
                        });
                        console.log(`[UPDATE] Will update classification for ${uniqueKey}: "${existingCamera.classification}" → "${record.classification}"`);
                    } else {
                        skipped++;
                        console.log(`[SKIP] Skipping duplicate (no classification provided in Excel): ${uniqueKey}`);
                    }
                } else {
                    recordsToInsert.push(record);
                }
            }
        }

        console.log(`[SUMMARY] Total: ${validRecords.length}, To Insert: ${recordsToInsert.length}, To Update: ${recordsToUpdate.length}, Skipped: ${skipped}`);

        // Insert new records
        if (recordsToInsert.length > 0) {
            await Model.bulkCreate(recordsToInsert);
        }

        // Update existing records with classification
        if (recordsToUpdate.length > 0) {
            for (const update of recordsToUpdate) {
                await Model.update(
                    { classification: update.classification },
                    { where: { id: update.id } }
                );
            }
        }
        // Cleanup temp file
        try { fs.unlinkSync(req.file.path); } catch (_) { }

        // Count how many were actually updated vs overwritten
        const newClassifications = recordsToUpdate.filter(r => !r.oldClassification).length;
        const overwrittenClassifications = recordsToUpdate.filter(r => r.oldClassification).length;

        let message = '';
        const parts = [];

        if (recordsToInsert.length > 0) {
            parts.push(`${recordsToInsert.length} new camera${recordsToInsert.length !== 1 ? 's' : ''} created`);
        }

        if (newClassifications > 0) {
            parts.push(`${newClassifications} camera${newClassifications !== 1 ? 's' : ''} classified`);
        }

        if (overwrittenClassifications > 0) {
            parts.push(`${overwrittenClassifications} classification${overwrittenClassifications !== 1 ? 's' : ''} updated`);
        }

        if (parts.length > 0) {
            message = `Successfully processed: ${parts.join(', ')}.`;
        } else {
            message = `No changes made.`;
        }

        if (skipped > 0) {
            message += ` ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped (already in this shift, no classification provided in Excel).`;
        }

        if (sheetDuplicates.length > 0) {
            const sample = sheetDuplicates.slice(0, 5).join(', ');
            message += ` ${sheetDuplicates.length} row${sheetDuplicates.length !== 1 ? 's' : ''} in the Excel repeat a CH NO already listed in the same file (e.g. ${sample}) - only the first was kept.`;
        }

        console.log(`[UPLOAD SUMMARY] Inserted: ${recordsToInsert.length}, Updated: ${recordsToUpdate.length} (${newClassifications} new, ${overwrittenClassifications} overwritten), Skipped: ${skipped}, In-sheet duplicates: ${sheetDuplicates.length}`);

        res.status(200).json({
            success: true,
            message,
            details: {
                inserted: recordsToInsert.length,
                updated: recordsToUpdate.length,
                sheetDuplicates: sheetDuplicates.length,
                newClassifications,
                overwrittenClassifications,
                skipped
            }
        });
    } catch (error) {
        if (error?.name && error.name.includes("Sequelize")) {
            const details = (error.errors || []).map((e) => e.message).filter(Boolean);
            return res.status(400).json({
                success: false,
                message: details.length > 0 ? details.join("; ") : "Validation error while uploading cameras",
            });
        }
        throw error;
    }
};

/**
 * Download blank Excel template for HLS or RTSP
 */
exports.downloadTemplate = async (req, res) => {
    const { type } = req.params; // "hls" or "rtsp"
    const isHLS = type?.toLowerCase() === "hls";

    const headers = isHLS
        ? [["S.No.", "TC Code", "Centre Name", "City", "State", "LIS IF/IDZ", "LAN and Lab Name", "Camera Name", "CCTV URL", "ch_no", "Camera Category"]]
        : [["Device ID", "Camera No", "TC Code", "Camera Name", "Centre Name", "City", "State", "CCTV URL"]];

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(headers);

    // Column widths
    ws["!cols"] = headers[0].map((h) => ({ wch: Math.max(h.length + 4, 18) }));

    xlsx.utils.book_append_sheet(wb, ws, isHLS ? "HLS Cameras" : "RTSP Cameras");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = isHLS ? "HLS_Camera_Template.xlsx" : "RTSP_Camera_Template.xlsx";

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
};

/**
 * Create Camera Link manually
 */
exports.createCamera = async (req, res) => {
    const exam_id = req.params.examId;
    const { Model, linkType } = await getModelByExam(exam_id);

    // Map url → cctv_url for HLS if client sends "url"
    const body = { ...req.body, exam_id };
    if (body.url && !body.cctv_url) { body.cctv_url = body.url; delete body.url; }
    if (linkType === "RTSP" && body.tc_name && !body.centre_name) {
        body.centre_name = body.tc_name;
        delete body.tc_name;
    }

    const camera = await Model.create(body);
    res.status(201).json({ success: true, message: "Camera link created", data: camera });
};

/**
 * Get By Exam (with optional shift/date filter for HLS, search, and pagination)
 */
exports.getByExam = async (req, res) => {
    const { examId } = req.params;
    const { is_active = true, shift_id, exam_date, search, classification, run_start, run_end, page = 1, limit = 50, sort_by, sort_order = 'asc' } = req.query;
    const { Model, linkType } = await getModelByExam(examId);

    const where = {
        exam_id: examId,
        is_active: is_active === "true" || is_active === true,
    };

    if (classification && classification.trim()) {
        where.classification = classification.trim();
    }

    // Scope to a specific classification "run" (see getClassificationRuns):
    // only cameras that appear in the history table within [run_start, run_end]
    // are included, and their classification/frame_path get overridden below
    // to reflect that run's value rather than the current/latest one.
    const historyTable = linkType === "RTSP" ? "camera_classification_rtsp" : "camera_classification_hls";
    let runCameraIds = null;
    if (run_start && run_end) {
        const runRows = await query(
            `SELECT DISTINCT camera_id FROM ${historyTable} WHERE created_at BETWEEN ? AND ?`,
            [run_start, run_end]
        );
        runCameraIds = runRows.map((r) => r.camera_id);
        where.id = { [Op.in]: runCameraIds.length > 0 ? runCameraIds : [-1] };
    }

    if (linkType === "HLS") {
        const hlsScope = buildHlsCameraScope({ shiftId: shift_id, examDate: exam_date });
        if (hlsScope.length > 0) {
            where[Op.and] = hlsScope;
        }
    }

    // Add search functionality
    if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        where[Op.or] = [
            { centre_name: { [Op.like]: searchTerm } },
            { state: { [Op.like]: searchTerm } },
            { city: { [Op.like]: searchTerm } },
            { tc_code: { [Op.like]: searchTerm } },
            { camera_name: { [Op.like]: searchTerm } },
        ];

        // Add device_id for RTSP
        if (linkType === "RTSP") {
            where[Op.or].push({ device_id: { [Op.like]: searchTerm } });
        }

        // Add ch_code for HLS
        if (linkType === "HLS") {
            where[Op.or].push({ ch_code: { [Op.like]: searchTerm } });
        }
    }

    const parsedLimit = parseInt(limit, 10) || 50;
    const parsedPage = parseInt(page, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    // Build server-side sort order
    const SORTABLE_HLS = ['centre_name', 'tc_code', 'city', 'state', 'camera_name', 'ch_code', 'camera_category', 'classification', 'status', 'exam_date', 'shift_id', 'created_at'];
    const SORTABLE_RTSP = ['device_id', 'camera_no', 'tc_code', 'camera_name', 'centre_name', 'city', 'state', 'classification', 'status', 'created_at'];
    const validColumns = linkType === 'HLS' ? SORTABLE_HLS : SORTABLE_RTSP;
    // shift_name is a virtual column — sort by shift_id instead
    const columnMap = { shift_name: 'shift_id' };
    const resolvedColumn = columnMap[sort_by] || sort_by;
    const direction = sort_order?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const orderClause = (resolvedColumn && validColumns.includes(resolvedColumn))
        ? [[resolvedColumn, direction]]
        : [['created_at', 'DESC']];

    const result = await Model.findAndCountAll({
        where,
        order: orderClause,
        limit: parsedLimit,
        offset: offset
    });

    // Calculate status counts (Accessible vs Not Accessible)
    const statusCountsWhere = {
        exam_id: examId,
        is_active: is_active === "true" || is_active === true,
    };

    if (runCameraIds) {
        statusCountsWhere.id = { [Op.in]: runCameraIds.length > 0 ? runCameraIds : [-1] };
    }

    if (linkType === "HLS") {
        const hlsScope = buildHlsCameraScope({ shiftId: shift_id, examDate: exam_date });
        if (hlsScope.length > 0) {
            statusCountsWhere[Op.and] = hlsScope;
        }
    }

    // Get counts for each status
    const accessibleCount = await Model.count({
        where: {
            ...statusCountsWhere,
            status: 'Accessible'
        }
    });

    const notAccessibleCount = await Model.count({
        where: {
            ...statusCountsWhere,
            status: 'Not Accessible'
        }
    });

    const unknownCount = await Model.count({
        where: {
            ...statusCountsWhere,
            [Op.or]: [
                { status: null },
                { status: { [Op.notIn]: ['Accessible', 'Not Accessible'] } }
            ]
        }
    });

    // When scoped to a run, replace classification/frame_path on this page's
    // rows with the values that run actually produced (the live table may
    // have since been overwritten by a later run).
    let data = result.rows;
    if (runCameraIds && data.length > 0) {
        const pageIds = data.map((c) => c.id);
        const historyRows = await query(
            `SELECT camera_id, classification, frame_path, created_at FROM ${historyTable}
             WHERE camera_id IN (?) AND created_at BETWEEN ? AND ?`,
            [pageIds, run_start, run_end]
        );
        const byCameraId = new Map(historyRows.map((r) => [r.camera_id, r]));
        data = data.map((c) => {
            const plain = c.get({ plain: true });
            const runRow = byCameraId.get(plain.id);
            return {
                ...plain,
                classification: runRow?.classification ?? null,
                frame_path: runRow?.frame_path ?? plain.frame_path,
                // Exact time this camera's classification was recorded within the
                // selected run (may differ slightly per-camera inside the burst).
                classification_run_at: runRow?.created_at ?? null,
            };
        });
    }

    res.json({
        success: true,
        totalCount: result.count,
        count: result.rows.length,
        totalPages: Math.ceil(result.count / parsedLimit),
        currentPage: parsedPage,
        linkType,
        statusCounts: {
            accessible: accessibleCount,
            notAccessible: notAccessibleCount,
            unknown: unknownCount
        },
        data
    });
};

/**
 * Get By ID
 */
exports.getById = async (req, res) => {
    const { examId, id } = req.params;
    const { Model, linkType } = await getModelByExam(examId);
    const camera = await Model.findByPk(id);
    if (!camera) return res.status(404).json({ success: false, message: "Camera not found" });
    res.json({ success: true, type: linkType, data: camera });
};

/**
 * Stream the classification frame image for a camera.
 *
 * frame_path values seen in the wild:
 *   /data/cctv_dev/cctv/script-server/scripts/detection/results/classification_frames/…   (main, NFS)
 *   /data/cctv_dev/cctv/script-server/results/classification_frames/…                     (main, NFS symlink)
 *   /app/scripts/detection/results/classification_frames/…                                (worker, NFS-mounted)
 *   /app/results/classification_frames/…                                                  (worker, container-local — not on NFS)
 *
 * Resolution order:
 *   1) translate the suffix after `/classification_frames/` and serve from NFS_FRAMES_ROOT
 *   2) if the stored path is absolute and exists as-is on this host, serve it
 *   3) ssh into each worker host and `docker exec <container> cat <frame_path>`
 */
exports.getFrame = async (req, res) => {
    const { examId, id } = req.params;
    const { Model } = await getModelByExam(examId);
    const camera = await Model.findByPk(id);
    if (!camera) return res.status(404).json({ success: false, message: "Camera not found" });
    if (!camera.frame_path) return res.status(404).json({ success: false, message: "No frame captured for this camera" });

    const framePath = String(camera.frame_path);

    // 1) NFS-relative resolution
    const markerIdx = framePath.indexOf(CLASSIFICATION_MARKER);
    if (markerIdx !== -1) {
        const relative = framePath.slice(markerIdx + CLASSIFICATION_MARKER.length);
        const resolved = path.resolve(NFS_FRAMES_ROOT, relative);
        if (resolved.startsWith(path.resolve(NFS_FRAMES_ROOT)) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=3600");
            return fs.createReadStream(resolved).pipe(res);
        }
    }

    // 2) try the path as stored (covers any main-server-local outliers)
    if (framePath.startsWith("/") && fs.existsSync(framePath) && fs.statSync(framePath).isFile()) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=3600");
        return fs.createReadStream(framePath).pipe(res);
    }

    // 3) ssh + docker exec fallback for container-local paths
    try {
        const { workerId, bytes } = await fetchFrameFromAnyWorker(framePath);
        logger.info(`[getFrame] served ${framePath} from ${workerId} via ssh fallback (${bytes.length} bytes)`);
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.end(bytes);
    } catch (err) {
        logger.warn(`[getFrame] frame unreachable for camera ${id}: ${framePath} — ${err.message}`);
        return res.status(404).json({
            success: false,
            message: "Frame image unavailable on main server or any worker",
            frame_path: framePath,
        });
    }
};

/**
 * Operator manual verification of a camera's classification.
 *
 * Takes the camera's primary key + a new classification value (chosen from
 * the dropdown in the frame-preview dialog) and:
 *   - sets classification = <new value>
 *   - sets manually_verified = 1
 *   - sets verified_by = <current user id>
 *
 * Authorized for OPERATOR and ADMIN only.
 */
exports.verifyClassification = async (req, res) => {
    const { examId, id } = req.params;
    const { classification } = req.body || {};
    if (!classification || !String(classification).trim()) {
        return res.status(400).json({ success: false, message: "classification is required" });
    }
    const { Model } = await getModelByExam(examId);
    const camera = await Model.findByPk(id);
    if (!camera) return res.status(404).json({ success: false, message: "Camera not found" });
    await camera.update({
        classification: String(classification).trim(),
        manually_verified: true,
        verified_by: req.user?.id || null,
    });
    res.json({ success: true, message: "Classification verified", data: camera });
};

/**
 * Distinct classification values for a given exam — used to populate the
 * dropdown in the verify dialog. Returns a sorted, deduplicated list of
 * non-empty classification strings already in the table.
 */
exports.getClassificationOptions = async (req, res) => {
    const { examId } = req.params;
    const { Model } = await getModelByExam(examId);
    const rows = await Model.findAll({
        attributes: [[require("sequelize").fn("DISTINCT", require("sequelize").col("classification")), "classification"]],
        where: { exam_id: examId, is_active: true },
        raw: true,
    });
    const options = rows
        .map((r) => r.classification)
        .filter((v) => v != null && String(v).trim() !== "")
        .map((v) => String(v).trim())
        .sort((a, b) => a.localeCompare(b));
    res.json({ success: true, data: Array.from(new Set(options)) });
};

// A single vision-classification execution writes one row per camera into
// camera_classification_hls/rtsp, all within a tight burst (workers process
// cameras a few seconds apart). Consecutive rows more than RUN_GAP_SECONDS
// apart are treated as separate runs (script re-triggered later, e.g. per the
// shift's frequency_minutes).
const RUN_GAP_SECONDS = 90;

/**
 * Distinct classification "runs" for a given exam — groups rows in the
 * classification-history table (camera_classification_hls/rtsp) into bursts
 * so the frontend can offer "how many times has classification run" as a
 * dropdown, each option scoping the camera list to that run's results.
 */
exports.getClassificationRuns = async (req, res) => {
    const { examId } = req.params;
    const { linkType } = await getModelByExam(examId);
    const historyTable = linkType === "RTSP" ? "camera_classification_rtsp" : "camera_classification_hls";
    const linksTable = linkType === "RTSP" ? "camera_links_rtsp" : "camera_links_hls";

    const rows = await query(
        `
        WITH ordered AS (
            SELECT DISTINCT cc.created_at AS ts
            FROM ${historyTable} cc
            JOIN ${linksTable} cl ON cl.id = cc.camera_id
            WHERE cl.exam_id = ?
        ),
        gapped AS (
            SELECT ts,
                CASE
                    WHEN LAG(ts) OVER (ORDER BY ts) IS NULL
                      OR TIMESTAMPDIFF(SECOND, LAG(ts) OVER (ORDER BY ts), ts) > ?
                    THEN 1 ELSE 0
                END AS is_new_run
            FROM ordered
        ),
        runs AS (
            SELECT ts, SUM(is_new_run) OVER (ORDER BY ts) AS run_seq
            FROM gapped
        ),
        bounds AS (
            SELECT run_seq, MIN(ts) AS started_at, MAX(ts) AS ended_at
            FROM runs
            GROUP BY run_seq
        )
        SELECT b.started_at, b.ended_at, COUNT(DISTINCT cc.camera_id) AS camera_count
        FROM bounds b
        JOIN ${historyTable} cc ON cc.created_at BETWEEN b.started_at AND b.ended_at
        JOIN ${linksTable} cl ON cl.id = cc.camera_id AND cl.exam_id = ?
        GROUP BY b.started_at, b.ended_at
        ORDER BY b.started_at DESC
        `,
        [examId, RUN_GAP_SECONDS, examId]
    );

    res.json({
        success: true,
        data: rows.map((r) => ({
            started_at: r.started_at,
            ended_at: r.ended_at,
            camera_count: Number(r.camera_count),
        })),
    });
};

/**
 * Update
 */
exports.updateCamera = async (req, res) => {
    const { examId, id } = req.params;
    const { Model, linkType } = await getModelByExam(examId);
    const camera = await Model.findByPk(id);
    if (!camera) return res.status(404).json({ success: false, message: "Camera not found" });
    const body = { ...req.body };
    if (body.url && !body.cctv_url) { body.cctv_url = body.url; delete body.url; }
    if (linkType === "RTSP" && body.tc_name && !body.centre_name) {
        body.centre_name = body.tc_name;
        delete body.tc_name;
    }
    await camera.update(body);
    res.json({ success: true, message: "Camera updated", data: camera });
};

/**
 * Soft Delete
 */
exports.deleteCamera = async (req, res) => {
    const { examId, id } = req.params;
    const { Model } = await getModelByExam(examId);
    await Model.update({ is_active: false }, { where: { id } });
    res.json({ success: true, message: "Camera deleted" });
};

/**
 * Bulk create (kept for compatibility)
 */
exports.bulkCreateCamera = async (req, res) => {
    const exam_id = req.params.examId;
    const { Model, linkType } = await getModelByExam(exam_id);
    const records = (req.body.cameras || []).map((c) => {
        if (c.url && !c.cctv_url) { c.cctv_url = c.url; delete c.url; }
        if (linkType === "RTSP" && c.tc_name && !c.centre_name) {
            c.centre_name = c.tc_name;
            delete c.tc_name;
        }
        return { ...c, exam_id };
    });
    await Model.bulkCreate(records);
    res.status(201).json({ success: true, message: `Created ${records.length} cameras` });
};

/**
 * Get cameras by exam + type (HLS/RTSP direct filter)
 */
exports.getByExamAndType = async (req, res) => {
    const { examId } = req.params;
    const { Model, linkType } = await getModelByExam(examId);
    const cameras = await Model.findAll({ where: { exam_id: examId, is_active: true } });
    res.json({ success: true, linkType, count: cameras.length, data: cameras });
};

exports.getByAssignment = async (req, res) => {
    const assignment = await ShiftScriptAssignment.findByPk(req.params.id, {
        include: [
            {
                model: ExamShift,
                as: "shift",
                attributes: ["id", "exam_id", "shift_name"],
                include: [
                    {
                        model: Exam,
                        as: "exam",
                        attributes: ["id", "link_type", "exam_name"],
                    },
                ],
            },
            {
                model: Script,
                as: "script",
                attributes: ["id", "script_id", "name"],
            },
        ],
    });

    if (!assignment || !assignment.shift?.exam) {
        return res.status(404).json({
            success: false,
            message: "Assignment not found",
        });
    }

    const examId = assignment.shift.exam.id;
    const { Model, linkType } = await getModelByExam(examId);
    const where = {
        exam_id: examId,
        is_active: true,
    };

    if (linkType === "HLS") {
        const hlsScope = buildHlsCameraScope({
            shiftId: assignment.shift_id,
            examDate: assignment.assignment_date,
        });

        if (hlsScope.length > 0) {
            where[Op.and] = hlsScope;
        }
    }

    const cameras = await Model.findAll({
        where,
        order: [["camera_name", "ASC"], ["created_at", "DESC"]],
    });

    res.json({
        success: true,
        linkType,
        assignment: {
            id: assignment.id,
            assignment_date: assignment.assignment_date,
            shift_id: assignment.shift_id,
            exam_id: examId,
            script_id: assignment.script?.script_id || null,
            shift_name: assignment.shift?.shift_name || null,
            exam_name: assignment.shift?.exam?.exam_name || null,
        },
        count: cameras.length,
        data: cameras,
    });
};
