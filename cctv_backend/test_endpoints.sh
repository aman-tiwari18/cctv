#!/bin/bash

echo "=== Testing API Endpoints ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test login first to get token
echo "1. Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Login failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
else
  echo -e "${GREEN}✓ Login successful${NC}"
fi

echo ""
echo "2. Testing GET /api/exams..."
EXAMS_RESPONSE=$(curl -s -X GET http://localhost:3000/api/exams \
  -H "Authorization: Bearer $TOKEN")
echo $EXAMS_RESPONSE | grep -q '"success":true' && echo -e "${GREEN}✓ GET /api/exams works${NC}" || echo -e "${RED}✗ GET /api/exams failed${NC}"

echo ""
echo "3. Creating test exam..."
CREATE_EXAM=$(curl -s -X POST http://localhost:3000/api/exams \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"exam_name":"Test Exam","exam_body":"TEST","link_type":"RTSP","description":"Test exam for API validation"}')

EXAM_ID=$(echo $CREATE_EXAM | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')

if [ -z "$EXAM_ID" ]; then
  echo -e "${RED}✗ Failed to create exam${NC}"
  echo "Response: $CREATE_EXAM"
else
  echo -e "${GREEN}✓ Exam created with ID: $EXAM_ID${NC}"
fi

echo ""
echo "4. Testing nested routes..."

# Test schedules
echo "  - GET /api/exams/$EXAM_ID/schedules"
curl -s -X GET http://localhost:3000/api/exams/$EXAM_ID/schedules \
  -H "Authorization: Bearer $TOKEN" | grep -q '"success":true' && echo -e "    ${GREEN}✓${NC}" || echo -e "    ${RED}✗${NC}"

# Test cameras
echo "  - GET /api/exams/$EXAM_ID/cameras"
curl -s -X GET http://localhost:3000/api/exams/$EXAM_ID/cameras \
  -H "Authorization: Bearer $TOKEN" | grep -q '"success":true' && echo -e "    ${GREEN}✓${NC}" || echo -e "    ${RED}✗${NC}"

# Test analytics
echo "  - GET /api/exams/$EXAM_ID/analytics"
curl -s -X GET http://localhost:3000/api/exams/$EXAM_ID/analytics \
  -H "Authorization: Bearer $TOKEN" | grep -q '"success":true' && echo -e "    ${GREEN}✓${NC}" || echo -e "    ${RED}✗${NC}"

echo ""
echo "5. Testing direct access routes..."

# Test direct schedules access
echo "  - GET /api/schedules/upcoming"
curl -s -X GET "http://localhost:3000/api/schedules/upcoming?hours=24" \
  -H "Authorization: Bearer $TOKEN" | grep -q '"success":true' && echo -e "    ${GREEN}✓${NC}" || echo -e "    ${RED}✗${NC}"

echo ""
echo "=== All tests completed ==="
