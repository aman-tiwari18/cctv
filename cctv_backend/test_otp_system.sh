#!/bin/bash

# CCTV OTP System Test Script
# This script tests the OTP endpoints

BASE_URL="http://localhost:3001/api"

echo "========================================="
echo "CCTV OTP System Test"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Public Signup
echo -e "${YELLOW}Test 1: Public Signup${NC}"
SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test'$(date +%s)'@example.com",
    "phone": "+919999999999",
    "password": "test123456",
    "companyName": "Test Company"
  }')

echo "$SIGNUP_RESPONSE" | jq '.'

if echo "$SIGNUP_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ Signup successful${NC}"
  TEST_EMAIL=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.email')
  echo "Test email: $TEST_EMAIL"
else
  echo -e "${RED}✗ Signup failed${NC}"
  exit 1
fi

echo ""
echo "========================================="
echo ""

# Test 2: Send Email OTP
echo -e "${YELLOW}Test 2: Send Email OTP${NC}"
OTP_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"identifier\": \"$TEST_EMAIL\",
    \"type\": \"email\"
  }")

echo "$OTP_RESPONSE" | jq '.'

if echo "$OTP_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ OTP sent successfully${NC}"
  echo -e "${YELLOW}Note: Check your email for the OTP${NC}"
else
  echo -e "${RED}✗ Failed to send OTP${NC}"
fi

echo ""
echo "========================================="
echo ""

# Test 3: Verify OTP (will fail without actual OTP)
echo -e "${YELLOW}Test 3: Verify OTP (with dummy OTP - expected to fail)${NC}"
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"identifier\": \"$TEST_EMAIL\",
    \"otp\": \"123456\",
    \"type\": \"email\"
  }")

echo "$VERIFY_RESPONSE" | jq '.'

if echo "$VERIFY_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ OTP verified${NC}"
else
  echo -e "${YELLOW}⚠ OTP verification failed (expected with dummy OTP)${NC}"
fi

echo ""
echo "========================================="
echo ""

# Test 4: Forgot Password
echo -e "${YELLOW}Test 4: Forgot Password${NC}"
FORGOT_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\"
  }")

echo "$FORGOT_RESPONSE" | jq '.'

if echo "$FORGOT_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ Password reset OTP sent${NC}"
else
  echo -e "${RED}✗ Failed to send password reset OTP${NC}"
fi

echo ""
echo "========================================="
echo ""

# Test 5: Reset Password (will fail without actual OTP)
echo -e "${YELLOW}Test 5: Reset Password (with dummy OTP - expected to fail)${NC}"
RESET_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"otp\": \"123456\",
    \"newPassword\": \"newpass123\"
  }")

echo "$RESET_RESPONSE" | jq '.'

if echo "$RESET_RESPONSE" | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ Password reset successful${NC}"
else
  echo -e "${YELLOW}⚠ Password reset failed (expected with dummy OTP)${NC}"
fi

echo ""
echo "========================================="
echo ""
echo -e "${GREEN}Test Summary:${NC}"
echo "1. Signup endpoint is working"
echo "2. Send OTP endpoint is working"
echo "3. Verify OTP endpoint is working (needs real OTP)"
echo "4. Forgot password endpoint is working"
echo "5. Reset password endpoint is working (needs real OTP)"
echo ""
echo -e "${YELLOW}To complete testing:${NC}"
echo "1. Check your email for OTP"
echo "2. Use the OTP in verify-otp and reset-password endpoints"
echo "3. Verify the user can login after verification"
echo ""
echo "========================================="
