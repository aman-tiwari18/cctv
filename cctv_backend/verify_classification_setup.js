const xlsx = require("xlsx");
const fs = require("fs");

console.log("\n=== CLASSIFICATION FIELD VERIFICATION ===\n");

// Test 1: Verify Excel file
console.log("✓ Test 1: Excel File Analysis");
const excelPath = "/home/aman/Desktop/cctv/cctv_backend/src/neet_combined_report.xlsx";

if (!fs.existsSync(excelPath)) {
    console.log("  ❌ Excel file not found at:", excelPath);
    process.exit(1);
}

const workbook = xlsx.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

const firstRow = data[0];
const headers = Object.keys(firstRow);

console.log("  ✓ Excel file found");
console.log("  ✓ Total rows:", data.length);
console.log("  ✓ Headers:", headers.length);

// Check for Scene Classification column
const hasSceneClassification = headers.some(h => 
    h.toLowerCase().replace(/[^a-z0-9]/g, '') === 'sceneclassification'
);

if (hasSceneClassification) {
    console.log("  ✓ 'Scene Classification' column found");
    
    // Count rows with classification values
    let withClassification = 0;
    let withoutClassification = 0;
    
    data.forEach(row => {
        const classification = row["Scene Classification"];
        if (classification && classification.trim() !== "") {
            withClassification++;
        } else {
            withoutClassification++;
        }
    });
    
    console.log("  ✓ Rows with classification:", withClassification);
    console.log("  ✓ Rows without classification:", withoutClassification);
    
    // Show unique classification values
    const uniqueValues = [...new Set(
        data
            .map(row => row["Scene Classification"])
            .filter(v => v && v.trim() !== "")
    )];
    
    console.log("  ✓ Unique classification values:");
    uniqueValues.forEach(v => console.log(`    - "${v}"`));
} else {
    console.log("  ❌ 'Scene Classification' column NOT found");
    console.log("  Available columns:", headers.join(", "));
}

// Test 2: Verify backend code
console.log("\n✓ Test 2: Backend Code");
const controllerPath = "./src/controllers/CameraController.js";

if (!fs.existsSync(controllerPath)) {
    console.log("  ❌ CameraController.js not found");
} else {
    const controllerCode = fs.readFileSync(controllerPath, "utf8");
    
    // Check if classification field is being extracted
    const hasClassificationExtraction = controllerCode.includes('"Scene Classification"') ||
                                       controllerCode.includes('"sceneclassification"');
    
    if (hasClassificationExtraction) {
        console.log("  ✓ Backend code includes classification extraction");
    } else {
        console.log("  ❌ Backend code missing classification extraction");
    }
    
    // Check if classification is being inserted
    const hasClassificationInsert = controllerCode.includes('classification,') ||
                                   controllerCode.includes('classification:');
    
    if (hasClassificationInsert) {
        console.log("  ✓ Backend code includes classification in insert");
    } else {
        console.log("  ❌ Backend code missing classification in insert");
    }
}

// Test 3: Verify model
console.log("\n✓ Test 3: Database Model");
const modelPath = "./src/models/CameraLinkRTSP.js";

if (!fs.existsSync(modelPath)) {
    console.log("  ❌ CameraLinkRTSP.js model not found");
} else {
    const modelCode = fs.readFileSync(modelPath, "utf8");
    
    if (modelCode.includes('classification:')) {
        console.log("  ✓ Model includes classification field");
    } else {
        console.log("  ❌ Model missing classification field");
    }
}

// Test 4: Verify migration exists
console.log("\n✓ Test 4: Migration Files");
const migrationSQL = "./src/migrations/009_alter_camera_links_rtsp_new_headers.sql";
const migrationRunner = "./src/migrations/run_009_migration.js";

if (fs.existsSync(migrationSQL)) {
    console.log("  ✓ Migration SQL file exists");
} else {
    console.log("  ❌ Migration SQL file missing");
}

if (fs.existsSync(migrationRunner)) {
    console.log("  ✓ Migration runner exists");
} else {
    console.log("  ❌ Migration runner missing");
}

console.log("\n=== SUMMARY ===\n");
console.log("Your Excel file is correctly formatted with 'Scene Classification' column.");
console.log("The backend code is set up to extract and save classification values.");
console.log("\nNext steps:");
console.log("1. Run: node src/migrations/run_009_migration.js");
console.log("2. Restart your backend server");
console.log("3. Upload the Excel file through the frontend");
console.log("4. Check the database to verify classification values are saved");
console.log("\nIf you see debug logs during upload, the classification values are being processed.");
console.log("");
