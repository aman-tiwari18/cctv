#!/bin/bash
# Test script that echoes parameters
echo "Starting parameter test..."
if [ -z "$1" ]; then
    echo "No parameters provided."
else
    echo "Received parameters: $@"
fi
# Simulate processing
echo "Processing parameters..."
sleep 1
echo "Processing complete."
exit 0
