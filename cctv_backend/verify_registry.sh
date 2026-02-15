#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "=== Testing Script Registry ==="
echo ""

# 1. Login
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Login failed${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Login successful${NC}"

# 2. Get Scripts
echo ""
echo "2. Fetching available scripts..."
SCRIPTS_RESPONSE=$(curl -s -X GET http://localhost:3000/api/scripts \
  -H "Authorization: Bearer $TOKEN")
  
echo $SCRIPTS_RESPONSE | grep -q '"id":"test_simple"' && echo -e "${GREEN}✓ Found test_simple script${NC}" || echo -e "${RED}✗ test_simple script not found${NC}"
echo $SCRIPTS_RESPONSE | grep -q '"id":"face_detection"' && echo -e "${GREEN}✓ Found face_detection script${NC}" || echo -e "${RED}✗ face_detection script not found${NC}"

# 3. Create Analytics Task using script_id
echo ""
echo "3. Creating analytics task with script_id..."
TASK_RESPONSE=$(curl -s -X POST http://localhost:3000/api/exams/1/analytics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "script_id": "test_simple",
    "frequency_minutes": 2,
    "duration_minutes": 1
  }')

echo $TASK_RESPONSE | grep -q '"success":true' && echo -e "${GREEN}✓ Task created successfully${NC}" || echo -e "${RED}✗ Task creation failed${NC}"
echo $TASK_RESPONSE | grep -q '"task_name":"System Health Check (Simple)"' && echo -e "${GREEN}✓ Task name auto-populated${NC}" || echo -e "${RED}✗ Task name missing/wrong${NC}"

# 4. Verify Validation
echo ""
echo "4. Testing validation (invalid script_id)..."
INVALID_RESPONSE=$(curl -s -X POST http://localhost:3000/api/exams/1/analytics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "script_id": "invalid_script_id"
  }')

echo $INVALID_RESPONSE | grep -q '"msg":"Invalid script ID"' && echo -e "${GREEN}✓ Invalid script_id rejected${NC}" || echo -e "${RED}✗ Validation failed to catch invalid ID${NC}"

echo ""
echo "=== Test Complete ==="
