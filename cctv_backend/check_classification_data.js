const mysql = require("mysql2/promise");
require("dotenv").config();

async function checkClassificationData() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "cctv_monitoring",
    });

    try {
        console.log("\n=== CLASSIFICATION FIELD CHECK ===\n");

        // Check if column exists
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'camera_links_rtsp' 
            AND COLUMN_NAME = 'classification'
        `, [process.env.DB_NAME || "cctv_monitoring"]);

        if (columns.length === 0) {
            console.log("❌ Classification column does NOT exist in camera_links_rtsp table");
            console.log("\nRun this to fix:");
            console.log("  node src/migrations/run_009_migration.js");
            return;
        }

        console.log("✓ Classification column exists:");
        console.log(`  Type: ${columns[0].DATA_TYPE}`);
        console.log(`  Nullable: ${columns[0].IS_NULLABLE}`);
        console.log(`  Default: ${columns[0].COLUMN_DEFAULT || 'NULL'}`);
        console.log();

        // Check recent records
        const [recentRecords] = await connection.query(`
            SELECT 
                id,
                device_id,
                camera_name,
                classification,
                created_at
            FROM camera_links_rtsp 
            ORDER BY id DESC 
            LIMIT 20
        `);

        console.log(`Recent ${recentRecords.length} records:\n`);
        
        let withClassification = 0;
        let withoutClassification = 0;

        recentRecords.forEach((record, index) => {
            const hasClassification = record.classification !== null && record.classification !== '';
            if (hasClassification) withClassification++;
            else withoutClassification++;

            console.log(`${index + 1}. ID: ${record.id} | Device: ${record.device_id}`);
            console.log(`   Camera: ${record.camera_name || 'N/A'}`);
            console.log(`   Classification: ${record.classification || '(empty)'}`);
            console.log(`   Created: ${record.created_at}`);
            console.log();
        });

        console.log("=== SUMMARY ===");
        console.log(`Records with classification: ${withClassification}`);
        console.log(`Records without classification: ${withoutClassification}`);
        console.log();

        // Check by exam
        const [examStats] = await connection.query(`
            SELECT 
                exam_id,
                COUNT(*) as total,
                SUM(CASE WHEN classification IS NOT NULL AND classification != '' THEN 1 ELSE 0 END) as with_classification,
                SUM(CASE WHEN classification IS NULL OR classification = '' THEN 1 ELSE 0 END) as without_classification
            FROM camera_links_rtsp 
            GROUP BY exam_id
            ORDER BY exam_id DESC
            LIMIT 10
        `);

        if (examStats.length > 0) {
            console.log("=== BY EXAM ===");
            examStats.forEach(stat => {
                console.log(`Exam ${stat.exam_id}: ${stat.total} cameras (${stat.with_classification} with classification, ${stat.without_classification} without)`);
            });
        }

    } catch (error) {
        console.error("Error:", error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

checkClassificationData()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
