const { CameraLinkHLS, CameraLinkRTSP, Exam, ExamShift, ShiftScriptAssignment, Script } = require("../models");
const { Op } = require("sequelize");
const xlsx = require("xlsx");
const fs = require("fs");

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

        if (linkType === "HLS") {
            // HLS unique key: tc_code + ch_code
            const existingCameras = await Model.findAll({
                where: { 
                    exam_id: examId,
                    is_active: true
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
            
            // Separate records into insert vs update
            for (const record of validRecords) {
                if (!record.tc_code || !record.ch_code) {
                    recordsToInsert.push(record);
                    continue;
                }
                
                const uniqueKey = `${String(record.tc_code).trim()}_${String(record.ch_code).trim()}`;
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
                    const tcCode = c.tc_code ? String(c.tc_code).trim().replace(/^0+/, '') : '';
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
                const tcCode = record.tc_code ? String(record.tc_code).trim().replace(/^0+/, '') : '';
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
            message += ` ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped (no classification provided in Excel).`;
        }

        console.log(`[UPLOAD SUMMARY] Inserted: ${recordsToInsert.length}, Updated: ${recordsToUpdate.length} (${newClassifications} new, ${overwrittenClassifications} overwritten), Skipped: ${skipped}`);

        res.status(200).json({
            success: true,
            message,
            details: {
                inserted: recordsToInsert.length,
                updated: recordsToUpdate.length,
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
    const { is_active = true, shift_id, exam_date, search, page = 1, limit = 50 } = req.query;
    const { Model, linkType } = await getModelByExam(examId);

    const where = {
        exam_id: examId,
        is_active: is_active === "true" || is_active === true,
    };

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

    const result = await Model.findAndCountAll({
        where,
        order: [["created_at", "DESC"]],
        limit: parsedLimit,
        offset: offset
    });

    // Calculate status counts (Accessible vs Not Accessible)
    const statusCountsWhere = {
        exam_id: examId,
        is_active: is_active === "true" || is_active === true,
    };

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
        data: result.rows
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
