#!/bin/bash
# Simple system health check script
echo "[$(date)] Starting system health check..."
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')%"
echo "Memory Usage: $(free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2 }')"
echo "Disk Usage: $(df -h / | awk 'NR==2{print $5}')"
echo "[$(date)] Health check completed successfully"
exit 0
