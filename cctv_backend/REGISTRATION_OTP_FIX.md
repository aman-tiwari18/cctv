# Registration OTP Fix - Summary

## Problem
During user registration, the system was trying to send OTP to email/phone numbers that don't exist in the database yet. The original `sendOTP` endpoint checked if the user exists before sending OTP, which caused registration to fail.

## Solution
Created separate endpoints for registration OTP that:
1. Don't require the user to exist in the database
2. Check if email/phone is already registered (to prevent duplicates)
3. Use a different OTP type prefix (`registration_email` and `registration_phone`) to separate registration OTPs from login OTPs

## Changes Made

### Backend Changes

#### 1. AuthController.js
Added two new functions:

**`sendRegistrationOTP()`**
- Validates email/phone format
- Checks if already registered (returns 409 if exists)
- Generates and stores OTP with `registration_${type}` prefix
- Sends OTP via email or SMS

**`verifyRegistrationOTP()`**
- Verifies OTP using `registration_${type}` prefix
- Returns success without updating database (user doesn't exist yet)

#### 2. routes/auth.js
Added two new routes:
- `POST /api/auth/send-registration-otp` - Send OTP for registration
- `POST /api/auth/verify-registration-otp` - Verify OTP for registration

### Frontend Changes

#### 1. services/api.js
Added two new API methods:
- `sendRegistrationOTP(data)` - Calls `/auth/send-registration-otp`
- `verifyRegistrationOTP(data)` - Calls `/auth/verify-registration-otp`

#### 2. pages/Register.jsx
Updated to use new registration OTP endpoints:
- `handleSendOTP()` now calls `authAPI.sendRegistrationOTP()`
- `handleVerifyOTP()` now calls `authAPI.verifyRegistrationOTP()`

## Registration Flow

### Step 1: User Details + OTP Verification
1. User enters: name, email, phone, company name
2. User clicks "Send OTP" for email
   - Frontend calls `POST /auth/send-registration-otp` with email
   - Backend checks if email already registered
   - Backend sends OTP to email
3. User enters OTP and clicks "Verify"
   - Frontend calls `POST /auth/verify-registration-otp` with email OTP
   - Backend verifies OTP
4. User clicks "Send OTP" for phone
   - Frontend calls `POST /auth/send-registration-otp` with phone
   - Backend checks if phone already registered
   - Backend sends OTP via SMS
5. User enters OTP and clicks "Verify"
   - Frontend calls `POST /auth/verify-registration-otp` with phone OTP
   - Backend verifies OTP
6. User clicks "Continue"
   - Frontend calls `POST /auth/signup` to create account
   - Backend creates user with temporary password

### Step 2: Set Password
1. User enters new password and confirms
2. User clicks "Complete Registration"
   - Frontend calls `POST /auth/reset-password` with email OTP
   - Backend updates password
3. User redirected to login page

## API Endpoints

### Registration OTP Endpoints (New)

#### Send Registration OTP
```http
POST /api/auth/send-registration-otp
Content-Type: application/json

{
  "identifier": "user@example.com",
  "type": "email"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "OTP sent to your email"
}
```

**Response (Already Registered):**
```json
{
  "success": false,
  "message": "This email is already registered"
}
```

#### Verify Registration OTP
```http
POST /api/auth/verify-registration-otp
Content-Type: application/json

{
  "identifier": "user@example.com",
  "otp": "123456",
  "type": "email"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### Existing Endpoints (Unchanged)

#### Send OTP (For existing users)
```http
POST /api/auth/send-otp
```
- Used for: Password reset, re-verification
- Requires: User must exist in database

#### Verify OTP (For existing users)
```http
POST /api/auth/verify-otp
```
- Used for: Password reset, re-verification
- Updates: User verification status in database

## OTP Storage Keys

### Registration OTPs
- Email: `registration_email:user@example.com`
- Phone: `registration_phone:+919999999999`

### Login/Reset OTPs
- Email: `email:user@example.com`
- Phone: `phone:+919999999999`
- Reset: `reset:user@example.com`

This separation ensures registration OTPs don't interfere with login/reset OTPs.

## Testing

### Test Registration Flow
```bash
# 1. Send email OTP
curl -X POST http://localhost:3001/api/auth/send-registration-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "newuser@example.com",
    "type": "email"
  }'

# 2. Verify email OTP
curl -X POST http://localhost:3001/api/auth/verify-registration-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "newuser@example.com",
    "otp": "123456",
    "type": "email"
  }'

# 3. Send phone OTP
curl -X POST http://localhost:3001/api/auth/send-registration-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+919999999999",
    "type": "phone"
  }'

# 4. Verify phone OTP
curl -X POST http://localhost:3001/api/auth/verify-registration-otp \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "+919999999999",
    "otp": "123456",
    "type": "phone"
  }'

# 5. Create account
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New User",
    "email": "newuser@example.com",
    "phone": "+919999999999",
    "password": "temp123456",
    "companyName": "Test Company"
  }'

# 6. Set password
curl -X POST http://localhost:3001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "otp": "123456",
    "newPassword": "mypassword123"
  }'
```

## Benefits

1. **Cleaner Separation**: Registration OTPs are separate from login OTPs
2. **Better Validation**: Checks if email/phone already registered before sending OTP
3. **No Database Dependency**: Can send OTP without user existing in database
4. **Prevents Duplicates**: Returns error if trying to register with existing email/phone
5. **Secure**: Uses same OTP generation and verification logic

## Files Modified

### Backend
- `src/controllers/AuthController.js` - Added 2 new functions
- `src/routes/auth.js` - Added 2 new routes

### Frontend
- `src/services/api.js` - Added 2 new API methods
- `src/pages/Register.jsx` - Updated to use new endpoints

## Status
✅ **Complete and Ready for Testing**

---

**Date**: April 22, 2026  
**Version**: 1.1.0  
**Status**: Fixed ✅
