#!/bin/bash
# Quick fix for results symlink

cd script-server

# Create symlink to NFS
if [ ! -e "results" ]; then
    ln -sf /mnt/nfs/cctv_images results
    echo "✓ Created results symlink to NFS"
else
    echo "✓ Results already exists"
fi

# Verify
if [ -L "results" ]; then
    echo "✓ Symlink created successfully"
    ls -la results
else
    echo "✗ Failed to create symlink"
fi
