#!/bin/bash

# Migration script for adding client push fields to camera report tables
# This script updates camera_report_hls and camera_report_rtsp tables

echo "=========================================="
echo "Running Migration 018"
echo "Adding client push fields to camera reports"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please create .env file with database credentials"
    exit 1
fi

# Run the migration
node src/migrations/run_018_migration.js

echo ""
echo "=========================================="
echo "Migration Complete"
echo "=========================================="
