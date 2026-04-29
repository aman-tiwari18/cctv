#!/bin/bash

# CCTV Database Reset Script
# This script will reset the database with fresh schema and default data

set -e

echo "🔄 CCTV Database Reset Script"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed!${NC}"
    exit 1
fi

# Check if db_schema.sql exists
if [ ! -f "db_schema.sql" ]; then
    echo -e "${RED}❌ db_schema.sql not found in current directory!${NC}"
    exit 1
fi

echo -e "${YELLOW}⚠️  WARNING: This will delete all existing database data!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}❌ Operation cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${GREEN}Step 1: Stopping all services...${NC}"
docker compose down

echo ""
echo -e "${GREEN}Step 2: Removing MySQL volume...${NC}"
docker volume rm cctv_mysql_data 2>/dev/null || echo "Volume doesn't exist, skipping..."

echo ""
echo -e "${GREEN}Step 3: Starting services with fresh database...${NC}"
docker compose up -d

echo ""
echo -e "${GREEN}Step 4: Waiting for MySQL to initialize (30 seconds)...${NC}"
sleep 30

echo ""
echo -e "${GREEN}Step 5: Checking MySQL status...${NC}"
docker compose exec mysql mysqladmin ping -h localhost -uroot -prootpassword123

echo ""
echo -e "${GREEN}Step 6: Verifying database initialization...${NC}"

# Check tables
TABLE_COUNT=$(docker compose exec -T mysql mysql -uroot -prootpassword123 cctv_monitoring -sN -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cctv_monitoring'" 2>/dev/null || echo "0")
echo "📊 Tables created: $TABLE_COUNT"

# Check users
USER_COUNT=$(docker compose exec -T mysql mysql -uroot -prootpassword123 cctv_monitoring -sN -e "SELECT COUNT(*) FROM users" 2>/dev/null || echo "0")
echo "👥 Users created: $USER_COUNT"

# Check scripts
SCRIPT_COUNT=$(docker compose exec -T mysql mysql -uroot -prootpassword123 cctv_monitoring -sN -e "SELECT COUNT(*) FROM scripts" 2>/dev/null || echo "0")
echo "📜 Scripts created: $SCRIPT_COUNT"

echo ""
if [ "$TABLE_COUNT" -gt "0" ] && [ "$USER_COUNT" -gt "0" ] && [ "$SCRIPT_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✅ Database reset completed successfully!${NC}"
    echo ""
    echo "Default Users:"
    docker compose exec -T mysql mysql -uroot -prootpassword123 cctv_monitoring -e "SELECT id, username, email, role, company_name FROM users"
    echo ""
    echo "Default Scripts:"
    docker compose exec -T mysql mysql -uroot -prootpassword123 cctv_monitoring -e "SELECT id, script_id, name FROM scripts"
    echo ""
    echo -e "${GREEN}🎉 You can now login with:${NC}"
    echo "   Username: admin"
    echo "   Password: admin123"
else
    echo -e "${RED}❌ Database initialization may have failed!${NC}"
    echo "Check logs with: docker compose logs mysql"
fi
