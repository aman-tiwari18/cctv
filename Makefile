# CCTV Monitoring System - Makefile
# ===================================

.PHONY: help start stop restart logs build clean status shell-backend shell-frontend shell-script db-backup db-restore

# Default target
help:
	@echo "CCTV Monitoring System - Docker Commands"
	@echo "========================================"
	@echo ""
	@echo "Setup & Start:"
	@echo "  make start          - Build and start all services"
	@echo "  make stop           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make build          - Rebuild all images"
	@echo ""
	@echo "Monitoring:"
	@echo "  make logs           - View logs from all services"
	@echo "  make logs-backend   - View backend logs"
	@echo "  make logs-frontend  - View frontend logs"
	@echo "  make logs-script    - View script server logs"
	@echo "  make status         - Check service status"
	@echo "  make gpu-stats      - View H200 GPU statistics"
	@echo "  make gpu-watch      - Live H200 GPU monitor"
	@echo ""
	@echo "Shell Access:"
	@echo "  make shell-backend  - Access backend container shell"
	@echo "  make shell-script   - Access script server shell"
	@echo "  make shell-db       - Access MySQL shell"
	@echo ""
	@echo "Database:"
	@echo "  make db-backup      - Backup database"
	@echo "  make db-restore     - Restore database from backup"
	@echo "  make db-migrate     - Run database migrations"
	@echo ""
	@echo "Detection Scripts:"
	@echo "  make detect-vision  - Run vision classification"
	@echo "  make detect-qp      - Run QP box detection"
	@echo "  make detect-crowd   - Run crowd detection"
	@echo "  make fetch-urls     - Fetch RTSP URLs"
	@echo ""
	@echo "Ollama:"
	@echo "  make ollama-pull    - Pull VLM model"
	@echo "  make ollama-list    - List Ollama models"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Stop and remove containers"
	@echo "  make clean-all      - Remove containers and volumes"
	@echo "  make prune          - Clean up Docker system"

# Setup & Start
start:
	@echo "🚀 Starting CCTV Monitoring System..."
	@chmod +x start.sh
	@./start.sh

stop:
	@echo "🛑 Stopping all services..."
	@docker-compose down

restart:
	@echo "🔄 Restarting all services..."
	@docker-compose restart

build:
	@echo "🔨 Building all images..."
	@docker-compose build

# Monitoring
logs:
	@docker-compose logs -f

logs-backend:
	@docker-compose logs -f backend

logs-frontend:
	@docker-compose logs -f frontend

logs-script:
	@docker-compose logs -f script-server

logs-mysql:
	@docker-compose logs -f mysql

logs-ollama:
	@docker-compose logs -f ollama

status:
	@echo "📊 Service Status:"
	@docker-compose ps

# H200 GPU Monitoring
gpu-stats:
	@echo "🎮 H200 GPU Statistics:"
	@docker exec cctv_script_server nvidia-smi

gpu-watch:
	@echo "🎮 H200 GPU Live Monitor (Ctrl+C to exit):"
	@docker exec -it cctv_script_server watch -n 1 nvidia-smi

gpu-monitor-start:
	@echo "🎮 Starting GPU Monitor Service..."
	@docker-compose --profile monitoring up -d gpu-monitor
	@echo "✅ GPU monitor started. View with: docker logs -f cctv_gpu_monitor"

gpu-monitor-stop:
	@echo "🛑 Stopping GPU Monitor Service..."
	@docker-compose --profile monitoring stop gpu-monitor

# Shell Access
shell-backend:
	@docker exec -it cctv_backend sh

shell-script:
	@docker exec -it cctv_script_server bash

shell-db:
	@docker exec -it cctv_mysql mysql -uroot -prootpassword123 cctv_monitoring

shell-ollama:
	@docker exec -it cctv_ollama sh

# Database Operations
db-backup:
	@echo "💾 Backing up database..."
	@docker exec cctv_mysql mysqldump -uroot -prootpassword123 cctv_monitoring > backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✅ Backup complete: backup_$(shell date +%Y%m%d_%H%M%S).sql"

db-restore:
	@echo "📥 Restoring database..."
	@read -p "Enter backup file name: " file; \
	docker exec -i cctv_mysql mysql -uroot -prootpassword123 cctv_monitoring < $$file
	@echo "✅ Database restored"

db-migrate:
	@echo "🔄 Running database migrations..."
	@docker exec -it cctv_backend node src/migrations/run.js

# Detection Scripts
detect-vision:
	@echo "🔍 Running vision classification..."
	@docker exec -it cctv_script_server python scripts/detection/vision_classification_rtsp.py --exam_id 19

detect-qp:
	@echo "📦 Running QP box detection..."
	@docker exec -it cctv_script_server python scripts/detection/qp_box_det.py

detect-crowd:
	@echo "👥 Running crowd detection..."
	@docker exec -it cctv_script_server python scripts/detection/crowd_zero_det.py

fetch-urls:
	@echo "🔗 Fetching RTSP URLs..."
	@docker exec -it cctv_script_server python scripts/detection/fetch_rtsp_urls.py --exam_id 19

# Ollama Operations
ollama-pull:
	@echo "📥 Pulling VLM model..."
	@docker exec -it cctv_ollama ollama pull qwen3-vl:8b

ollama-list:
	@docker exec -it cctv_ollama ollama list

ollama-test:
	@docker exec -it cctv_ollama ollama run qwen3-vl:8b "Hello, test message"

# Cleanup
clean:
	@echo "🧹 Cleaning up containers..."
	@docker-compose down

clean-all:
	@echo "🧹 Cleaning up containers and volumes..."
	@read -p "This will delete all data. Are you sure? (y/N): " confirm; \
	if [ "$$confirm" = "y" ]; then \
		docker-compose down -v; \
		echo "✅ Cleanup complete"; \
	else \
		echo "❌ Cleanup cancelled"; \
	fi

prune:
	@echo "🧹 Pruning Docker system..."
	@docker system prune -a --volumes

# Development
dev-backend:
	@echo "🔧 Starting backend in development mode..."
	@cd cctv_backend && npm run dev

dev-frontend:
	@echo "🔧 Starting frontend in development mode..."
	@cd cctv_frontend && npm run dev

# Health Checks
health:
	@echo "🏥 Checking service health..."
	@echo "Backend:  $$(curl -s http://localhost:5000/api/health || echo 'Not responding')"
	@echo "Frontend: $$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'Not responding')"
	@echo "MySQL:    $$(docker exec cctv_mysql mysql -uroot -prootpassword123 -e 'SELECT 1' 2>/dev/null && echo 'OK' || echo 'Not responding')"
