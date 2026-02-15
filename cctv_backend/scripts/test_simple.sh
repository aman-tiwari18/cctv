#!/bin/bash
# Simple test script that logs execution
echo "Starting simple test script..."
echo "Timestamp: $(date)"
echo "Arguments: $@"
echo "Environment: $NODE_ENV"
sleep 2
echo "Test completed successfully."
exit 0
