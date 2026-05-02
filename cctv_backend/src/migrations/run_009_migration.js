const mysql = require("mysql2/promise");
require("dotenv").config();

async function runMigration() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "cctv_monitoring",
        multipleStatements: true,
    });

    try {
        console.log("Running migration 009: Add classification column to camera_links_rtsp...");

        // Check if column already exists
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'camera_links_rtsp' 
            AND COLUMN_NAME = 'classification'
        `, [process.env.DB_NAME || "cctv_monitoring"]);

        if (columns.length > 0) {
            console.log("✓ Classification column already exists. Skipping migration.");
        } else {
            await connection.query(`
                ALTER TABLE camera_links_rtsp
                ADD COLUMN classification VARCHAR(255) NULL
            `);
            console.log("✓ Successfully added classification column to camera_links_rtsp");
        }

        console.log("Migration 009 completed successfully!");
    } catch (error) {
        console.error("Migration 009 failed:", error.message);
        throw error;
    } finally {
        await connection.end();
    }
}

runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
