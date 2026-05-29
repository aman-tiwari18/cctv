/**
 * One-shot export of all ACCESSIBLE RTSP cameras for a given exam into an
 * Excel file that matches the RTSP-upload template column-for-column.
 *
 * Columns (from CameraController.downloadTemplate for "rtsp"):
 *   Device ID | Camera No | TC Code | Camera Name | Centre Name | City | State | CCTV URL
 *
 * Usage:
 *   node src/scripts/export_accessible_rtsp_cameras.js [examId] [outputPath]
 *
 * Defaults: examId = 19, outputPath = /tmp/exam_<examId>_accessible_rtsp.xlsx
 */

require("dotenv").config();
const path = require("path");
const xlsx = require("xlsx");
const { CameraLinkRTSP } = require("../models");
const { sequelize } = require("../config/database");

const EXAM_ID = Number(process.argv[2] || 19);
const OUT_PATH = process.argv[3] || `/tmp/exam_${EXAM_ID}_accessible_rtsp.xlsx`;

// Header order MUST match downloadTemplate('rtsp') exactly so the export can
// be re-uploaded through the Cameras page without column renames.
const HEADERS = [
    "Device ID",
    "Camera No",
    "TC Code",
    "Camera Name",
    "Centre Name",
    "City",
    "State",
    "CCTV URL",
];

(async () => {
    try {
        await sequelize.authenticate();

        const rows = await CameraLinkRTSP.findAll({
            where: { exam_id: EXAM_ID, is_active: true, status: "Accessible" },
            order: [["device_id", "ASC"], ["camera_no", "ASC"]],
            raw: true,
        });

        console.log(`Found ${rows.length} accessible RTSP camera rows for exam ${EXAM_ID}`);

        const data = rows.map((c) => ({
            "Device ID":   c.device_id   ?? "",
            "Camera No":   c.camera_no   ?? "",
            "TC Code":     c.tc_code     ?? "",
            "Camera Name": c.camera_name ?? "",
            "Centre Name": c.centre_name ?? "",
            "City":        c.city        ?? "",
            "State":       c.state       ?? "",
            "CCTV URL":    c.cctv_url    ?? "",
        }));

        // Build sheet with the exact header order — passing `header: HEADERS`
        // tells xlsx not to alphabetise.
        const ws = xlsx.utils.json_to_sheet(data, { header: HEADERS });

        // Column widths roughly matching the template's `wch: Math.max(h.length + 4, 18)`
        ws["!cols"] = HEADERS.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "RTSP Cameras");

        xlsx.writeFile(wb, OUT_PATH);
        console.log(`Wrote ${data.length} rows to ${OUT_PATH}`);
        console.log(`Size: ${require("fs").statSync(OUT_PATH).size} bytes`);

        process.exit(0);
    } catch (err) {
        console.error("Export failed:", err);
        process.exit(1);
    }
})();
