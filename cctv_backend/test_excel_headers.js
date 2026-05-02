const xlsx = require("xlsx");

// This script helps debug Excel header parsing
// Usage: node test_excel_headers.js <path-to-excel-file>

const filePath = process.argv[2];

if (!filePath) {
    console.error("Usage: node test_excel_headers.js <path-to-excel-file>");
    process.exit(1);
}

try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

    console.log("\n=== EXCEL HEADER ANALYSIS ===\n");
    
    if (data.length === 0) {
        console.log("No data found in Excel file");
        process.exit(0);
    }

    const firstRow = data[0];
    const headers = Object.keys(firstRow);

    console.log("Detected Headers:");
    headers.forEach((header, index) => {
        console.log(`  ${index + 1}. "${header}"`);
        console.log(`     - Length: ${header.length}`);
        console.log(`     - Char codes: [${Array.from(header).map(c => c.charCodeAt(0)).join(', ')}]`);
        console.log(`     - Normalized: "${normalizeHeaderKey(header)}"`);
        console.log(`     - Sample value: "${firstRow[header]}"`);
        console.log();
    });

    console.log("\n=== FIRST 3 ROWS ===\n");
    data.slice(0, 3).forEach((row, index) => {
        console.log(`Row ${index + 1}:`);
        console.log(JSON.stringify(row, null, 2));
        console.log();
    });

} catch (error) {
    console.error("Error reading Excel file:", error.message);
    process.exit(1);
}

function normalizeHeaderKey(key) {
    return String(key || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}
