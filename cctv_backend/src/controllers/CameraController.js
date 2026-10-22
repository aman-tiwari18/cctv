const { CameraLinkHLS, CameraLinkRTSP, Exam, ExamShift, ShiftScriptAssignment, Script } = require("../models");
const { Op } = require("sequelize");
const { query } = require("../config/database");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const { fetchFrameFromAnyWorker } = require("../utils/workerFrameFetch");
const logger = require("../utils/logger");
const { runningScope, toIsoDate, scheduledExamIds, rtspScheduleClauseShiftExpr } = require("../utils/examSchedule");

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

// 16 Oct 2026: a camera's "Server Address" must be a host like d16.camview.io (or a full
// rtsp/http URL). Rows that were pasted one column off carried "New" / "Updated" there and the
// real server in the next column, and were saved with "New" as the server.
const looksLikeServer = (value) => {
    const v = String(value || "").trim();
    if (!v) return false;
    if (/^(rtsp|https?):\/\//i.test(v)) return true;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(v);
};

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
        let missingChCode = 0; // HLS rows whose channel id header could not be resolved
        let serverRecovered = 0;      // RTSP rows whose server sat in another column (sheet pasted one column off)
        const badServerRows = [];     // RTSP rows with no usable server anywhere in the row: not imported

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
                        "Channel ID(key)",
                        "Channel ID",
                        "channel id key",
                        "unique key",
                        "unique key value"
                    ) ||
                    pickByHeaderTokens(row, "ch", "no") ||
                    pickByHeaderTokens(row, "channel", "id");

                // A row with no channel id is unusable: ch_code is the key the
                // detection workers look the camera up by, and an unresolved
                // header yields "" — which, unlike NULL, is a real value to
                // MySQL and collides on unique_exam_ch_shift_date as soon as a
                // second such row is inserted. Drop these here so the upload
                // reports the header problem instead of a constraint error.
                if (chCode === undefined || chCode === null || String(chCode).trim() === "") {
                    missingChCode++;
                    continue;
                }

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
                let cctv_url = pick(row, "Server Address", "CCTV URL", "cctv_url", "url", "URL", "Link");
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

                // The server column holds something else ("New", "Updated"...): take the one cell of the
                // row that is a server address; with none (or several) the row is not imported.
                let region = pick(row, "Region", "region", "REGION") || null;
                if (!looksLikeServer(cctv_url)) {
                    const found = [...new Set(Object.values(row).map((v) => String(v || "").trim()).filter(looksLikeServer))];
                    if (found.length === 1) {
                        cctv_url = found[0];
                        serverRecovered++;
                    } else {
                        badServerRows.push(`${device_id}/${camera_no || "-"} ("${cctv_url}")`);
                        continue;
                    }
                }
                if (region && looksLikeServer(region)) region = null;

                validRecords.push({
                    exam_id: examId,
                    device_id,
                    centre_name: pick(row, "Centre Name", "Center Name", "center_name", "centre_name", "TC Name", "TC NAME", "Tc_name"),
                    tc_code: pick(row, "TC Code", "tc_code", "TC_CODE", "TC code"),
                    camera_name,
                    camera_no: camera_no !== "" ? camera_no : null,
                    city: pick(row, "City", "city", "CITY"),
                    state: pick(row, "State", "state", "STATE"),
                    region,
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
                    ? `No valid records found. Required RTSP columns: Device ID, Server Address (or CCTV URL). Optional: Camera No, TC Code, Camera Name, Centre/Center Name, City, State, Region, Classification (or Scene Classification / Room Classification). Detected headers: ${detectedHeaders.join(", ")}`
                    : missingChCode > 0
                        ? `No valid records found. ${missingChCode} row(s) have no readable channel id — rename that column to 'ch_no' (accepted: ch_no, ch_code, Channel ID(key), unique key value). Detected headers: ${detectedHeaders.join(", ")}`
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
            // HLS unique key: tc_code + ch_code, WITHIN the shift AND the exam
            // date being uploaded. The same physical camera is filmed in every
            // shift its centre hosts, and again on every day a multi-day exam
            // runs, so a camera already listed under shift 1 — or under this
            // same shift on an earlier date — is not a duplicate of the row
            // being uploaded now. camera_links_hls is unique on
            // (exam, ch_code, shift, exam_date) for exactly that reason.
            // Ignoring the date made day 2's sheet look like duplicates of
            // day 1 and silently dropped every camera that already existed.
            const targetShiftId = shiftId || null;
            const targetExamDate = examDate || null;
            const existingCameras = await Model.findAll({
                where: {
                    exam_id: examId,
                    is_active: true,
                    shift_id: targetShiftId,
                    exam_date: targetExamDate
                },
                attributes: ['id', 'tc_code', 'ch_code', 'classification']
            });
            
            console.log(`[DUPLICATE CHECK] Found ${existingCameras.length} existing HLS cameras for exam ${examId}, shift ${targetShiftId}, date ${targetExamDate}`);
            
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
                attributes: ['id', 'device_id', 'camera_no', 'tc_code', 'classification', 'region']
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

            // A camera is server + device + camera no (device ids repeat across camview servers).
            // The same camera listed twice in one sheet is imported once (first row wins).
            const seenInSheet = new Set();

            // Separate records into insert vs update
            for (const record of validRecords) {
                if (!record.device_id) {
                    recordsToInsert.push(record);
                    continue;
                }

                const deviceId = String(record.device_id).trim();
                const cameraNo = record.camera_no != null ? String(record.camera_no).trim() : '';
                const sheetKey = `${String(record.cctv_url).trim().toLowerCase()}|${deviceId}|${cameraNo}`;
                if (seenInSheet.has(sheetKey)) {
                    sheetDuplicates.push(`${deviceId}/${cameraNo}`);
                    continue;
                }
                seenInSheet.add(sheetKey);
                const tcCode = record.tc_code ? normalizeTcCode(record.tc_code) : '';
                const uniqueKey = `${deviceId}_${cameraNo}_${tcCode}`;
                const existingCamera = existingMap.get(uniqueKey);
                
                if (existingCamera) {
                    // Update classification if provided in Excel (regardless of existing value),
                    // and region when the sheet has one that differs from what is stored.
                    const regionChanged = !!record.region && record.region !== existingCamera.region;
                    if (record.classification || regionChanged) {
                        const update = { id: existingCamera.id, oldClassification: existingCamera.classification };
                        if (record.classification) update.classification = record.classification;
                        if (regionChanged) update.region = record.region;
                        recordsToUpdate.push(update);
                        console.log(`[UPDATE] Will update ${uniqueKey}: classification "${existingCamera.classification}" → "${record.classification || existingCamera.classification}", region "${existingCamera.region}" → "${regionChanged ? record.region : existingCamera.region}"`);
                    } else {
                        skipped++;
                        console.log(`[SKIP] Skipping duplicate (no classification or new region in Excel): ${uniqueKey}`);
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
                const fields = {};
                if (update.classification) fields.classification = update.classification;
                if (update.region) fields.region = update.region;
                await Model.update(fields, { where: { id: update.id } });
            }
        }
        // Cleanup temp file
        try { fs.unlinkSync(req.file.path); } catch (_) { }

        // Count how many were actually updated vs overwritten
        const newClassifications = recordsToUpdate.filter(r => r.classification && !r.oldClassification).length;
        const overwrittenClassifications = recordsToUpdate.filter(r => r.classification && r.oldClassification).length;
        const regionsUpdated = recordsToUpdate.filter(r => r.region).length;

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

        if (regionsUpdated > 0) {
            parts.push(`${regionsUpdated} region${regionsUpdated !== 1 ? 's' : ''} updated`);
        }

        if (parts.length > 0) {
            message = `Successfully processed: ${parts.join(', ')}.`;
        } else {
            message = `No changes made.`;
        }

        if (skipped > 0) {
            message += ` ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped (already in this shift on this exam date, no classification provided in Excel).`;
        }

        if (missingChCode > 0) {
            message += ` ${missingChCode} row${missingChCode !== 1 ? 's' : ''} skipped for having no readable channel id (expected a 'ch_no' column).`;
        }

        if (sheetDuplicates.length > 0) {
            const sample = sheetDuplicates.slice(0, 5).join(', ');
            const what = linkType === "RTSP" ? "camera (server + device + camera no)" : "CH NO";
            message += ` ${sheetDuplicates.length} row${sheetDuplicates.length !== 1 ? 's' : ''} in the Excel repeat a ${what} already listed in the same file (e.g. ${sample}) - only the first was kept.`;
        }

        if (serverRecovered > 0) {
            message += ` ${serverRecovered} row${serverRecovered !== 1 ? 's' : ''} had the server address in another column (e.g. "New"/"Updated" in Server Address) - the server was taken from that column.`;
        }

        if (badServerRows.length > 0) {
            message += ` ${badServerRows.length} row${badServerRows.length !== 1 ? 's' : ''} NOT imported: no valid server address (e.g. ${badServerRows.slice(0, 5).join(', ')}).`;
        }

        console.log(`[UPLOAD SUMMARY] Inserted: ${recordsToInsert.length}, Updated: ${recordsToUpdate.length} (${newClassifications} new, ${overwrittenClassifications} overwritten), Skipped: ${skipped}, In-sheet duplicates: ${sheetDuplicates.length}`);

        res.status(200).json({
            success: true,
            message,
            details: {
                inserted: recordsToInsert.length,
                updated: recordsToUpdate.length,
                sheetDuplicates: sheetDuplicates.length,
                missingChCode,
                newClassifications,
                overwrittenClassifications,
                regionsUpdated,
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
        : [["Device ID", "Camera No", "TC Code", "Camera Name", "Centre Name", "City", "State", "Region", "CCTV URL"]];

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
    const { is_active = true, shift_id, exam_date, search, classification, region, run_start, run_end, run_shift_id, raw, page = 1, limit = 50, sort_by, sort_order = 'asc', status, verified, tc_code, camera } = req.query;
    const { Model, linkType } = await getModelByExam(examId);

    const where = {
        exam_id: examId,
        is_active: is_active === "true" || is_active === true,
    };

    // Extra filters (Cameras tab). Every condition goes into Op.and so it combines with the
    // search (Op.or) and the schedule scope below instead of overwriting them.
    const andConds = [];
    const csv = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

    // classification: one value or a comma list; "__unclassified__" = no label yet (NULL or blank)
    if (classification && String(classification).trim()) {
        const vals = csv(classification);
        const named = vals.filter((v) => v !== '__unclassified__');
        const ors = [];
        if (named.length) ors.push({ classification: { [Op.in]: named } });
        if (vals.includes('__unclassified__')) ors.push({ classification: null }, { classification: '' });
        if (ors.length) andConds.push({ [Op.or]: ors });
    }
    // manual verification: yes | no
    if (verified === 'yes') andConds.push({ manually_verified: 1 });
    if (verified === 'no') andConds.push({ [Op.or]: [{ manually_verified: 0 }, { manually_verified: null }] });
    // centre(s) by TC code
    if (tc_code && String(tc_code).trim()) andConds.push({ tc_code: { [Op.in]: csv(tc_code) } });
    // one exact camera: RTSP "device_camera" (e.g. 1000700_12) / HLS ch_code
    if (camera && String(camera).trim()) {
        const c = String(camera).trim();
        if (linkType === "RTSP") {
            const m = c.match(/^(\d+)\s*[_/:\- ]\s*(\d+)$/);
            andConds.push(m ? { device_id: m[1], camera_no: m[2] } : { device_id: c });
        } else {
            andConds.push({ ch_code: c });
        }
    }

    // Region is RTSP-only (no region column on camera_links_hls).
    if (region && region.trim() && linkType === "RTSP") {
        where.region = region.trim();
    }

    // Scope to a specific classification "run" (see getClassificationRuns).
    // Every run attempts ALL the exam's cameras, but the history table only
    // gets a row for the ones that were reachable and classified — so the full
    // camera set is kept here (the total stays the exam's real count) and each
    // row's classification/status is overlaid below with what that run produced:
    // a history row = Accessible + its label, no row = Not Accessible that run.
    const historyTable = linkType === "RTSP" ? "camera_classification_rtsp" : "camera_classification_hls";
    let runCameraIds = null;
    if (run_start && run_end) {
        const runShift = run_shift_id !== undefined && run_shift_id !== '' ? Number(run_shift_id) : null;
        const runRows = await query(
            `SELECT DISTINCT camera_id FROM ${historyTable} WHERE created_at BETWEEN ? AND ?`
            + ` AND NOT (classification = 'Uncertain' AND (frame_path IS NULL OR frame_path = ''))`   // frame_capture_failed rows are not classified cameras
            + (runShift !== null ? ` AND COALESCE(shift_id, 0) = ?` : ''),
            runShift !== null ? [run_start, run_end, runShift] : [run_start, run_end]
        );
        runCameraIds = runRows.map((r) => r.camera_id);
        // HLS rows are per shift + day, so for the NEWEST run of a shift the cameras' saved status is exactly
        // what that run found — use it (history rows only appear after labelling, minutes later).
        if (linkType === "HLS" && runShift) {
            const endMs = new Date(run_end).getTime() + RUN_GAP_SECONDS * 1000;
            const later = await query(
                `SELECT 1 FROM ${historyTable} WHERE COALESCE(shift_id, 0) = ? AND created_at > ? LIMIT 1`,
                [runShift, new Date(endMs).toISOString()]
            );
            const laterRun = later.length ? later : await query(
                `SELECT 1 FROM shift_script_assignments a JOIN scripts s ON s.id = a.script_id
                 WHERE a.shift_id = ? AND s.name = 'Scene Classification' AND a.started_at > ? LIMIT 1`,
                [runShift, new Date(endMs).toISOString()]
            );
            if (!laterRun.length) runCameraIds = null;
        }
    }

    // A selected classification run belongs to ONE shift and ONE day: list only that shift's cameras
    // (not every shift of the exam), unless the Shift / Date filters say otherwise.
    const runHasScope = !!(run_start && run_end);
    const hlsShift = shift_id || ((runHasScope && run_shift_id !== undefined && run_shift_id !== '' && Number(run_shift_id) > 0) ? Number(run_shift_id) : undefined);
    const hlsDate = exam_date || (runHasScope ? toIsoDate(new Date(run_start)) : undefined);

    if (linkType === "HLS") {
        const hlsScope = buildHlsCameraScope({ shiftId: hlsShift, examDate: hlsDate });
        if (hlsScope.length > 0) {
            where[Op.and] = hlsScope;
        }
    }

    // status: accessible | not_accessible | unknown (in a run view: classified in that run or not)
    if (status) {
        if (runCameraIds) {
            const ids = runCameraIds.length ? runCameraIds : [0];
            if (status === 'accessible') andConds.push({ id: { [Op.in]: ids } });
            if (status === 'not_accessible') andConds.push({ id: { [Op.notIn]: ids } });
            if (status === 'unknown') andConds.push({ id: 0 });
        } else {
            if (status === 'accessible') andConds.push({ status: 'Accessible' });
            if (status === 'not_accessible') andConds.push({ status: 'Not Accessible' });
            if (status === 'unknown') andConds.push({ [Op.or]: [{ status: null }, { status: { [Op.notIn]: ['Accessible', 'Not Accessible'] } }] });
        }
    }

    // RTSP + exam schedule (Exams page): which centres run in the chosen date + shift — from the
    // Shift/Date filters, or from the selected classification run (its day and shift). Only the
    // scheduled centres' cameras are listed/counted; in a run view cameras that nevertheless have
    // a history row in that run stay visible. No uploaded schedule = no restriction.
    let scheduleInfo = null;
    let dayScopeIds = null;
    let scheduleCond = null;
    if (linkType === "RTSP" || linkType === "HLS") {     // 13 Oct 2026: HLS exams have a centre schedule too
        let schedDate = null;
        let schedShift = null;
        if (run_start && run_end) {
            // run_start arrives as a UTC ISO string ("…T23:00:00.000Z" for a 04:30 IST run):
            // parse it to a Date first so the day is taken in local (IST) time, not UTC.
            schedDate = toIsoDate(new Date(run_start));
            schedShift = run_shift_id !== undefined && run_shift_id !== '' ? Number(run_shift_id) : null;
        } else if (exam_date && shift_id) {
            schedDate = toIsoDate(exam_date);
            schedShift = Number(shift_id);
        }
        if (schedDate && Number.isInteger(schedShift) && schedShift > 0) {
            const scope = await runningScope(examId, schedDate, schedShift);
            scheduleInfo = {
                date: schedDate, shift_id: schedShift, applied: !!scope.restricted,
                exam_runs: scope.restricted ? !!scope.examRuns : true,
                centres: scope.restricted && scope.centres ? scope.centres.size : null,
            };
            if (scope.restricted) {
                const ids = runCameraIds || [];
                const base = !scope.examRuns ? null : { tc_code: { [Op.in]: scope.centres ? [...scope.centres] : [] } };
                const withRun = (cond) => (runCameraIds ? { [Op.or]: [cond, { id: { [Op.in]: ids.length ? ids : [0] } }] } : cond);
                scheduleCond = base
                    ? (scope.centres ? withRun(base) : null)               // every centre runs, only the exam-level slot matters
                    : withRun({ id: { [Op.in]: [0] } });                   // the exam does not run in this slot
                if (scheduleCond) where[Op.and] = [...(where[Op.and] || []), scheduleCond];
            }
        }
    }

    // Date chosen (no shift, no run): is it an exam day, and which cameras are scheduled in ANY shift that
    // day. With an uploaded schedule (slot / centre) only those cameras are listed; without one the exam's
    // date range (or its shift dates) decides. dayInfo.runs=false -> the UI says "no exam on this day".
    let dayInfo = null;
    if (exam_date) {
        const day = toIsoDate(exam_date);
        try {
            const T0 = linkType === "RTSP" ? "camera_links_rtsp" : "camera_links_hls";
            if ((await scheduledExamIds([examId])).size) {
                const dayRows = await query(
                    `SELECT c.id, c.tc_code FROM ${T0} c WHERE c.exam_id = ? AND c.is_active = 1 AND EXISTS (
                        SELECT 1 FROM exam_shifts s_ WHERE s_.exam_id = c.exam_id AND s_.is_active = 1
                          AND ${rtspScheduleClauseShiftExpr('c', 's_.id')})`, [examId, day, day]);
                const ids = dayRows.map((r) => r.id);
                dayInfo = { date: day, scheduled: true, runs: ids.length > 0, cameras: ids.length,
                            centres: new Set(dayRows.map((r) => r.tc_code)).size };
                if (!shift_id && !(run_start && run_end)) {
                    where[Op.and] = [...(where[Op.and] || []), { id: { [Op.in]: ids.length ? ids : [0] } }];
                    dayScopeIds = ids;
                }
            } else {
                const exam = await Exam.findByPk(examId, { attributes: ['start_date', 'end_date'], raw: true });
                const sd = exam?.start_date ? toIsoDate(exam.start_date) : null;
                const ed = exam?.end_date ? toIsoDate(exam.end_date) : null;
                const shiftDates = (await ExamShift.findAll({ where: { exam_id: examId }, attributes: ['exam_date'], raw: true }))
                    .map((x) => (x.exam_date ? toIsoDate(x.exam_date) : null)).filter(Boolean);
                let runs = null;
                if (sd || ed) runs = (!sd || day >= sd) && (!ed || day <= ed);
                if (shiftDates.length && linkType === "HLS") runs = shiftDates.includes(day);
                dayInfo = { date: day, scheduled: false, runs };
            }
        } catch (e) {
            logger.warn(`[cameras] day scope failed: ${e.message}`);
        }
    }

    // Add search functionality
    const camKey = search && linkType === "RTSP" ? String(search).trim().match(/^(\d+)\s*[_/:\- ]\s*(\d+)$/) : null;
    if (camKey) {
        // "1000700_12" / "1000700/12" / "1000700 12": that exact camera
        andConds.push({ device_id: camKey[1], camera_no: camKey[2] });
    } else if (search && search.trim()) {
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
            where[Op.or].push({ classification: { [Op.like]: searchTerm } });
            where[Op.or].push({ region: { [Op.like]: searchTerm } });
        }

        // Add ch_code for HLS
        if (linkType === "HLS") {
            where[Op.or].push({ ch_code: { [Op.like]: searchTerm } });
        }
    }

    if (andConds.length) where[Op.and] = [...(where[Op.and] || []), ...andConds];

    const parsedLimit = parseInt(limit, 10) || 50;
    const parsedPage = parseInt(page, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    // Build server-side sort order
    const SORTABLE_HLS = ['centre_name', 'tc_code', 'city', 'state', 'camera_name', 'ch_code', 'camera_category', 'classification', 'status', 'exam_date', 'shift_id', 'created_at'];
    const SORTABLE_RTSP = ['device_id', 'camera_no', 'tc_code', 'camera_name', 'centre_name', 'city', 'state', 'region', 'classification', 'status', 'created_at'];
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

    if (linkType === "HLS") {
        const hlsScope = buildHlsCameraScope({ shiftId: hlsShift, examDate: hlsDate });
        if (hlsScope.length > 0) {
            statusCountsWhere[Op.and] = hlsScope;
        }
    }
    if (scheduleCond) statusCountsWhere[Op.and] = [...(statusCountsWhere[Op.and] || []), scheduleCond];
    if (dayScopeIds) statusCountsWhere[Op.and] = [...(statusCountsWhere[Op.and] || []), { id: { [Op.in]: dayScopeIds.length ? dayScopeIds : [0] } }];

    let accessibleCount, notAccessibleCount, unknownCount;
    if (runCameraIds) {
        // Per-run status: classified in the run = Accessible, the rest of the
        // exam's cameras = Not Accessible for that run.
        const scopeTotal = await Model.count({ where: statusCountsWhere });
        accessibleCount = runCameraIds.length > 0
            ? await Model.count({ where: { ...statusCountsWhere, id: { [Op.in]: runCameraIds } } })
            : 0;
        notAccessibleCount = scopeTotal - accessibleCount;
        unknownCount = 0;
    } else {
        accessibleCount = await Model.count({
            where: {
                ...statusCountsWhere,
                status: 'Accessible'
            }
        });

        notAccessibleCount = await Model.count({
            where: {
                ...statusCountsWhere,
                status: 'Not Accessible'
            }
        });

        unknownCount = await Model.count({
            where: {
                ...statusCountsWhere,
                [Op.or]: [
                    { status: null },
                    { status: { [Op.notIn]: ['Accessible', 'Not Accessible'] } }
                ]
            }
        });
    }

    // When scoped to a run, replace classification/frame_path on this page's
    // rows with the values that run actually produced (the live table may
    // have since been overwritten by a later run).
    let data = result.rows;
    if (runCameraIds && data.length > 0) {
        const pageIds = data.map((c) => c.id);
        const historyRows = await query(
            `SELECT camera_id, classification, frame_path, created_at FROM ${historyTable}
             WHERE camera_id IN (?) AND created_at BETWEEN ? AND ?`
            + (run_shift_id !== undefined && run_shift_id !== '' ? ` AND COALESCE(shift_id, 0) = ?` : ''),
            run_shift_id !== undefined && run_shift_id !== ''
                ? [pageIds, run_start, run_end, Number(run_shift_id)]
                : [pageIds, run_start, run_end]
        );
        const byCameraId = new Map(historyRows.map((r) => [r.camera_id, r]));
        data = data.map((c) => {
            const plain = c.get({ plain: true });
            const runRow = byCameraId.get(plain.id);
            // A history row with label "Uncertain" and NO frame is the classifier's marker for
            // "stream opened but no frame could be grabbed" (frame_capture_failed): not a real
            // classification, so it must not show as Accessible with an empty preview.
            const captureFailed = !!runRow && !runRow.frame_path && runRow.classification === "Uncertain";
            const ok = !!runRow && !captureFailed;
            return {
                ...plain,
                classification: ok ? runRow.classification : null,
                status: ok ? "Accessible" : "Not Accessible",
                frame_path: ok ? (runRow.frame_path ?? plain.frame_path) : null,
                // Exact time this camera's classification was recorded within the
                // selected run (may differ slightly per-camera inside the burst).
                classification_run_at: runRow?.created_at ?? null,
            };
        });
    }

    // Filter options with counts over the exam's scope (exam + date/shift/schedule), not just this
    // page: classification (incl. unclassified), centres and verification — for the filter dropdowns.
    let facets = null;
    let serverStats = null;      // RTSP: cameras + not-accessible cameras per camview server (d11, d12 ...)
    try {
        const T = linkType === "RTSP" ? "camera_links_rtsp" : "camera_links_hls";
        const scopeIds = (await Model.findAll({ where: statusCountsWhere, attributes: ['id'], raw: true })).map((r) => r.id);
        if (scopeIds.length && linkType === "RTSP") {
            const runSet = runCameraIds ? new Set(runCameraIds) : null;
            const rows = await query(`SELECT id, cctv_url, status FROM ${T} WHERE id IN (?)`, [scopeIds]);
            const by = new Map();
            for (const r of rows) {
                const host = String(r.cctv_url || '').toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0];
                const key = host.split('.')[0] || 'unknown';
                const e = by.get(key) || { server: key, total: 0, notAccessible: 0 };
                e.total += 1;
                const notAcc = runSet ? !runSet.has(r.id) : String(r.status || '').toLowerCase() === 'not accessible';
                if (notAcc) e.notAccessible += 1;
                by.set(key, e);
            }
            const list = [...by.values()].filter((e) => e.notAccessible > 0)
                .sort((a, b) => b.notAccessible - a.notAccessible);
            serverStats = { servers: list, totalNotAccessible: list.reduce((a, e) => a + e.notAccessible, 0) };
        }
        if (scopeIds.length) {
            const cls = await query(`SELECT NULLIF(TRIM(classification),'') AS v, COUNT(*) AS n,
                       SUM(manually_verified = 1) AS verified FROM ${T} WHERE id IN (?) GROUP BY v ORDER BY n DESC`, [scopeIds]);
            const cen = await query(`SELECT tc_code AS v, MAX(centre_name) AS name, COUNT(*) AS n FROM ${T}
                       WHERE id IN (?) GROUP BY tc_code ORDER BY name`, [scopeIds]);
            const ver = await query(`SELECT SUM(manually_verified = 1) AS yes, SUM(COALESCE(manually_verified,0) = 0) AS no
                       FROM ${T} WHERE id IN (?)`, [scopeIds]);
            facets = {
                classifications: cls.map((r) => ({ value: r.v || '__unclassified__', label: r.v || 'Unclassified',
                                                   count: Number(r.n), verified: Number(r.verified || 0) })),
                centres: cen.map((r) => ({ value: r.v, label: r.name ? `${r.v} · ${r.name}` : String(r.v), count: Number(r.n) })),
                verified: { yes: Number(ver[0]?.yes || 0), no: Number(ver[0]?.no || 0) },
            };
        }
    } catch (e) {
        console.error('[cameras] facets failed:', e.message);
    }

    // raw=1 (no classification ran on the chosen day): list the scheduled cameras without any
    // status / frame from another day's classification.
    const rawView = (raw === '1' || raw === 'true') && !runCameraIds;
    if (rawView) {
        data = data.map((c) => ({ ...(c.get ? c.get({ plain: true }) : c), status: null, frame_path: null }));
        unknownCount = accessibleCount + notAccessibleCount + unknownCount;
        accessibleCount = 0;
        notAccessibleCount = 0;
        serverStats = null;
    }

    res.json({
        success: true,
        facets,
        day: dayInfo,
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
        serverStats,
        // RTSP: set when a date + shift (or a run) was chosen — says whether the exam schedule
        // restricted the list, so the UI can explain why some cameras are not shown.
        schedule: scheduleInfo,
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

/**
 * Distinct region values for the exam's RTSP cameras (Cameras tab + Detections
 * page filter dropdown). Region only exists on camera_links_rtsp — HLS exams
 * return an empty list.
 */
exports.getRegionOptions = async (req, res) => {
    const { examId } = req.params;
    const { Model, linkType } = await getModelByExam(examId);
    if (linkType !== "RTSP") {
        return res.json({ success: true, data: [] });
    }
    const rows = await Model.findAll({
        attributes: [[require("sequelize").fn("DISTINCT", require("sequelize").col("region")), "region"]],
        where: { exam_id: examId, is_active: true },
        raw: true,
    });
    const options = rows
        .map((r) => r.region)
        .filter((v) => v != null && String(v).trim() !== "")
        .map((v) => String(v).trim())
        .sort((a, b) => a.localeCompare(b));
    res.json({ success: true, data: Array.from(new Set(options)) });
};

// A single vision-classification execution writes one row per camera into
// camera_classification_hls/rtsp, all within a tight burst (workers process
// cameras a few seconds apart). Consecutive rows more than RUN_GAP_SECONDS
// apart are treated as separate runs (script re-triggered later, e.g. per the
// shift's frequency_minutes). With several workers each worker classifies its own
// share of the cameras and starts at its own pace (vLLM warm-up differs by minutes),
// so the gap must be longer than the spread between workers (14 Oct 2026: worker-5
// wrote its rows 164 s after the others and showed up as a separate 69-camera run).
// Real re-runs of the same shift are hours apart.
const RUN_GAP_SECONDS = Number(process.env.CLASSIFICATION_RUN_GAP_SECONDS) || 420;

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

    // Runs are grouped per shift first (each history row carries the shift_id of
    // the assignment that produced it), then by time gap — so a run is always
    // mapped to exactly the shift it was scheduled for, even if two shifts'
    // classifications ever overlap in time. shift_id NULL (old rows) = one group.
    const rows = await query(
        `
        WITH ordered AS (
            SELECT DISTINCT COALESCE(cc.shift_id, 0) AS sid, cc.created_at AS ts
            FROM ${historyTable} cc
            JOIN ${linksTable} cl ON cl.id = cc.camera_id
            WHERE cl.exam_id = ?
        ),
        gapped AS (
            SELECT sid, ts,
                CASE
                    WHEN LAG(ts) OVER (PARTITION BY sid ORDER BY ts) IS NULL
                      OR TIMESTAMPDIFF(SECOND, LAG(ts) OVER (PARTITION BY sid ORDER BY ts), ts) > ?
                    THEN 1 ELSE 0
                END AS is_new_run
            FROM ordered
        ),
        runs AS (
            SELECT sid, ts, SUM(is_new_run) OVER (PARTITION BY sid ORDER BY ts) AS run_seq
            FROM gapped
        ),
        bounds AS (
            SELECT sid, run_seq, MIN(ts) AS started_at, MAX(ts) AS ended_at
            FROM runs
            GROUP BY sid, run_seq
        )
        SELECT b.sid, es.shift_name, b.started_at, b.ended_at,
               COUNT(DISTINCT CASE WHEN NOT (cc.classification = 'Uncertain' AND (cc.frame_path IS NULL OR cc.frame_path = '')) THEN cc.camera_id END) AS camera_count
        FROM bounds b
        JOIN ${historyTable} cc ON cc.created_at BETWEEN b.started_at AND b.ended_at
             AND COALESCE(cc.shift_id, 0) = b.sid
        JOIN ${linksTable} cl ON cl.id = cc.camera_id AND cl.exam_id = ?
        LEFT JOIN exam_shifts es ON es.id = b.sid
        GROUP BY b.sid, es.shift_name, b.started_at, b.ended_at
        ORDER BY b.started_at DESC
        `,
        [examId, RUN_GAP_SECONDS, examId]
    );

    // A run that reached no camera writes no history row, so it is missing above and the page
    // claimed "no classification ran". Add every classification assignment that started and is
    // not already covered by a history run of its shift, as a run with 0 accessible cameras
    // (every camera a run reaches gets a history row — a new label or a kept label with a fresh frame).
    try {
        const ran = await query(
            `SELECT a.shift_id AS sid, es.shift_name, a.started_at, a.completed_at,
                    TIMESTAMPDIFF(SECOND, a.custom_start_time, a.custom_end_time) AS window_s
             FROM shift_script_assignments a
             JOIN exam_shifts es ON es.id = a.shift_id
             JOIN scripts s ON s.id = a.script_id
             WHERE es.exam_id = ? AND s.name = 'Scene Classification' AND a.started_at IS NOT NULL`,
            [examId]
        );
        const historyRuns = rows.slice();
        for (const a of ran) {
            const start = new Date(a.started_at);
            const end = a.completed_at ? new Date(a.completed_at)
                : new Date(start.getTime() + Math.max(0, Number(a.window_s) || 0) * 1000);
            const covered = historyRuns.some((r) => Number(r.sid) === Number(a.sid)
                && new Date(r.started_at).getTime() <= end.getTime() + RUN_GAP_SECONDS * 1000
                && new Date(r.ended_at).getTime() >= start.getTime() - RUN_GAP_SECONDS * 1000);
            if (!covered) rows.push({ sid: a.sid, shift_name: a.shift_name, started_at: start, ended_at: end, camera_count: 0, no_history: true });
        }
        rows.sort((x, y) => new Date(y.started_at) - new Date(x.started_at));
    } catch (e) {
        logger.warn(`[cameras] classification runs: assignment lookup failed: ${e.message}`);
    }

    // camera_count above = cameras that got a history row in the run, i.e. were
    // reachable and classified — it varies with DVR accessibility even though
    // every run attempts every active camera. total_cameras is the exam's real
    // camera count the run covered: constant for RTSP (all shifts share one
    // camera set); for HLS, the active cameras of the run's shift/date.
    let rtspTotal = null;
    if (linkType === "RTSP") {
        const [t] = await query(
            `SELECT COUNT(*) AS c FROM camera_links_rtsp WHERE exam_id = ? AND is_active = 1`,
            [examId]
        );
        rtspTotal = Number(t?.c || 0);
    }

    const data = [];
    const schedTotals = new Map();       // "date#shift" -> scheduled camera count (RTSP)
    const newestSeen = new Set();        // HLS shifts whose newest run was already handled
    for (const r of rows) {
        let total = rtspTotal;
        if (linkType === "RTSP" && Number(r.sid) > 0) {
            // With an uploaded schedule a run only attempted the centres scheduled in its day + shift
            const day = toIsoDate(r.started_at);
            const key = `${day}#${r.sid}`;
            if (day && !schedTotals.has(key)) {
                let n = null;
                try {
                    const scope = await runningScope(examId, day, Number(r.sid));
                    if (scope.restricted) {
                        if (!scope.examRuns) n = 0;
                        else if (scope.centres) {
                            const codes = [...scope.centres];
                            n = codes.length
                                ? Number((await query(`SELECT COUNT(*) AS c FROM camera_links_rtsp WHERE exam_id = ? AND is_active = 1 AND tc_code IN (?)`, [examId, codes]))[0]?.c || 0)
                                : 0;
                        }
                    }
                } catch (e) {
                    logger.warn(`[cameras] run total: schedule lookup failed: ${e.message}`);
                }
                schedTotals.set(key, n);
            }
            if (schedTotals.get(key) != null) total = Math.max(schedTotals.get(key), Number(r.camera_count));
        }
        if (linkType === "HLS") {
            // A run belongs to ONE shift and ONE day: count only that shift's cameras on that day,
            // and, when a centre schedule is uploaded, only the centres scheduled in it (same rule
            // the loader applies). Taking it from the run's own shift_id (not from a join on the
            // run's time window) keeps this correct when workers finish minutes apart.
            const sid = Number(r.sid) || 0;
            const day = toIsoDate(r.started_at);
            const conds = ["exam_id = ?", "is_active = 1"];
            const params = [examId];
            if (sid > 0) { conds.push("shift_id = ?"); params.push(sid); }
            if (day) { conds.push("exam_date = ?"); params.push(day); }
            try {
                if (sid > 0 && day) {
                    const scope = await runningScope(examId, day, sid);
                    if (scope.restricted) {
                        if (!scope.examRuns) { conds.push("1 = 0"); }
                        else if (scope.centres) {
                            const codes = [...scope.centres];
                            if (codes.length) { conds.push("tc_code IN (?)"); params.push(codes); }
                            else conds.push("1 = 0");
                        }
                    }
                }
            } catch (e) {
                logger.warn(`[cameras] HLS run total: schedule lookup failed: ${e.message}`);
            }
            const [t] = await query(`SELECT COUNT(*) AS c FROM camera_links_hls WHERE ${conds.join(" AND ")}`, params);
            total = Math.max(Number(t?.c || 0), Number(r.camera_count));
            if (sid > 0 && !newestSeen.has(sid)) {     // rows are newest first: this is the shift's latest run
                newestSeen.add(sid);
                const [acc] = await query(`SELECT COUNT(*) AS c FROM camera_links_hls WHERE ${conds.join(" AND ")} AND status = 'Accessible'`, params);
                r.camera_count = Number(acc?.c || 0);
            }
        }
        data.push({
            started_at: r.started_at,
            ended_at: r.ended_at,
            shift_id: Number(r.sid) || null,
            shift_name: r.shift_name || null,
            camera_count: Number(r.camera_count),
            total_cameras: total,
        });
    }

    res.json({ success: true, data });
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
