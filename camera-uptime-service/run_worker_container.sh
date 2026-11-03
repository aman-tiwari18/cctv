#!/bin/bash
# (Re)create the camera-uptime container on a worker host (CPU only, no GPU).
#   bash /cctv_dev/cctv/camera-uptime-service/run_worker_container.sh
# The worker image carries the worker's own env (HTTP_PORT=8000, DB_USER=root, ...), which would
# beat this service's .env, so the .env is passed with --env-file. Its health check (nvidia-smi)
# is replaced with the service's /health.
set -e
D=/cctv_dev/cctv/camera-uptime-service
docker rm -f cctv_camera_uptime >/dev/null 2>&1 || true
docker run -d --name cctv_camera_uptime --restart unless-stopped --network host \
  --env-file "$D/.env" -e TZ=Asia/Kolkata \
  -v "$D:/svc" -v /mnt/nfs/cctv_images:/data/nfs/cctv_images -w /svc \
  --health-cmd "python -c 'import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8095/health\", timeout=5)'" \
  --health-interval 30s --health-timeout 10s --health-retries 3 --health-start-period 30s \
  --entrypoint python script-server-script-server:latest run.py run
