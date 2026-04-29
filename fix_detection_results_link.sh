#!/bin/bash
# Fix detection results symlink to NFS

DETECTION_RESULTS="script-server/scripts/detection/results"

echo "Fixing detection results symlink..."

# Backup existing if it's a directory
if [ -d "$DETECTION_RESULTS" ] && [ ! -L "$DETECTION_RESULTS" ]; then
    echo "Backing up existing results..."
    mv "$DETECTION_RESULTS" "${DETECTION_RESULTS}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Remove broken symlink
if [ -L "$DETECTION_RESULTS" ] && [ ! -e "$DETECTION_RESULTS" ]; then
    rm "$DETECTION_RESULTS"
fi

# Create symlink
if [ ! -e "$DETECTION_RESULTS" ]; then
    ln -sf /mnt/nfs/cctv_images "$DETECTION_RESULTS"
    echo "✓ Created symlink: $DETECTION_RESULTS → /mnt/nfs/cctv_images"
else
    echo "✓ Detection results already configured"
fi

# Verify
echo ""
echo "Verification:"
ls -la "$DETECTION_RESULTS"
echo ""
echo "NFS mount:"
df -h | grep nfs
