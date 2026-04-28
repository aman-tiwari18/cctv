#!/bin/bash

# CCTV Monitoring System - Quick Start Script
# ============================================

set -e

echo "🚀 CCTV Monitoring System - Docker Setup"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before proceeding"
    echo "   Run: nano .env"
    echo ""
    read -p "Press Enter to continue with default values or Ctrl+C to exit and edit .env..."
fi

echo "🔨 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if MySQL is ready
echo "🔍 Checking MySQL..."
until docker exec cctv_mysql mysql -uroot -prootpassword123 -e "SELECT 1" &> /dev/null; do
    echo "   MySQL is starting..."
    sleep 2
done
echo "✅ MySQL is ready"

# Check if backend is ready
echo "🔍 Checking Backend..."
until curl -f http://localhost:5000/api/health &> /dev/null; do
    echo "   Backend is starting..."
    sleep 2
done
echo "✅ Backend is ready"

# Check if frontend is ready
echo "🔍 Checking Frontend..."
until curl -f http://localhost:3000 &> /dev/null; do
    echo "   Frontend is starting..."
    sleep 2
done
echo "✅ Frontend is ready"

echo ""
echo "=========================================="
echo "🎉 All services are running!"
echo "=========================================="
echo ""
echo "📍 Access Points:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:5000"
echo "   MySQL:     localhost:3306"
echo "   Ollama:    http://localhost:11434"
echo ""
echo "🔐 Default Credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "📝 Useful Commands:"
echo "   View logs:        docker-compose logs -f"
echo "   Stop services:    docker-compose down"
echo "   Restart:          docker-compose restart"
echo "   Run detection:    docker exec -it cctv_script_server python scripts/detection/vision_classification_rtsp.py --exam_id 19"
echo ""
echo "📚 For more information, see README.Docker.md"
echo ""
echo "⚠️  Next Steps:"
echo "   1. Setup Ollama model: docker exec -it cctv_ollama ollama pull qwen3-vl:8b"
echo "   2. Place YOLO models in script-server/models/"
echo "   3. Login to http://localhost:3000 with admin/admin123"
echo ""
