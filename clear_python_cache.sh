#!/bin/bash

echo "🧹 Clearing Python bytecode cache..."

# Clear all __pycache__ directories in detection folder
find script-server/scripts/detection -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null

# Clear .pyc files
find script-server/scripts/detection -type f -name "*.pyc" -delete 2>/dev/null

# Clear .pyo files
find script-server/scripts/detection -type f -name "*.pyo" -delete 2>/dev/null

echo "✅ Python cache cleared!"
echo ""
echo "Now you can run your detection scripts without the signal handler error."
