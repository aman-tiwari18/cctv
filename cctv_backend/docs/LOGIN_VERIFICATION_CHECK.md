# Login Verification Check

## Overview
Added verification check during login to ensure only verified users can access the system.

## Changes Made

### Backend - AuthController.js

**Location**: `cctv_backend/src/controllers/AuthController.js`

**Modified Function**: `login()`

**Change**:
Added verification check after password validation:

```javascript
// Check if user is verified
if (!user.verified) {
    return res.status(401).json({
        success: false,
        message: "Your account is pending verification. Please contact an administrator.",
    });
}
```

## Login Flow

### Before Changes
1. User enters username and password
2. System checks if user exists
3. System validates password
4. If valid, user is logged in (regardless of verification status)

### After Changes
1. User enters username and password
2. System checks if user exists
3. System validates password
4. **System checks if user is verified**
5. If verified, user is logged in
6. If not verified, login is rejected with message

## Error Messages

### Invalid Credentials
- **When**: Username doesn't exist OR password is incorrect
- **Message**: "Invalid credentials"
- **Status Code**: 401

### Unverified User
- **When**: Username and password are correct BUT user is not verified
- **Message**: "Your account is pending verification. Please contact an administrator."
- **Status Code**: 401

## User Experience

### For Unverified Users
1. User registers a new account
2. Account is created with `verified: false`
3. User tries to login
4. Login fails with message: "Your account is pending verification. Please contact an administrator."
5. User must wait for admin to verify their account
6. After admin verification, user can login successfully

### For Verified Users
1. User has been verified by admin
2. User enters credentials
3. Login succeeds normally
4. User gains access to system based on their role

## Frontend Display

The error message is displayed in the Login component using Material-UI Alert:

```jsx
{error && (
  <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
    {error}
  </Alert>
)}
```

## Security Considerations

### Why This Approach?
- **Prevents unauthorized access**: Unverified users cannot access the system
- **Admin control**: Only admins can grant access by verifying users
- **Clear messaging**: Users know they need admin approval
- **No information leakage**: Same 401 status for both invalid credentials and unverified users

### Alternative Approaches Considered

1. **Different status codes**: 
   - Could use 403 for unverified users
   - Decided against to avoid information leakage about valid usernames

2. **Different error messages**:
   - Could say "Invalid credentials" for unverified users too
   - Decided to be transparent so users know to contact admin

3. **Allow login but restrict access**:
   - Could let unverified users login but show limited UI
   - Decided against to keep security simple and clear

## Testing

### Test Case 1: Unverified User Login
```bash
# Create a user (will be unverified by default)
curl -X POST "http://localhost:3000/cctv_analytics/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "phone": "+1234567890",
    "password": "password123"
  }'

# Try to login (should fail)
curl -X POST "http://localhost:3000/cctv_analytics/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test@example.com",
    "password": "password123"
  }'

# Expected response:
# {
#   "success": false,
#   "message": "Your account is pending verification. Please contact an administrator."
# }
```

### Test Case 2: Verified User Login
```bash
# Admin verifies the user
curl -X PUT "http://localhost:3000/cctv_analytics/api/auth/verify/USER_ID" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "verified": true,
    "role": "VIEWER"
  }'

# Try to login again (should succeed)
curl -X POST "http://localhost:3000/cctv_analytics/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test@example.com",
    "password": "password123"
  }'

# Expected response:
# {
#   "success": true,
#   "message": "Login successful",
#   "data": {
#     "token": "...",
#     "user": { ... }
#   }
# }
```

### Test Case 3: Invalid Credentials
```bash
# Try to login with wrong password
curl -X POST "http://localhost:3000/cctv_analytics/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test@example.com",
    "password": "wrongpassword"
  }'

# Expected response:
# {
#   "success": false,
#   "message": "Invalid credentials"
# }
```

## Database Schema

The verification check relies on the `verified` column in the users table:

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  phone VARCHAR(20),
  company_name VARCHAR(255),
  role ENUM('ADMIN', 'OPERATOR', 'VIEWER') DEFAULT 'VIEWER',
  verified BOOLEAN DEFAULT FALSE,  -- This field is checked during login
  verified_date TIMESTAMP NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Related Features

This change works in conjunction with:
1. **User Registration** - Creates users with `verified: false`
2. **User Verification System** - Admins can verify users
3. **Admin Dashboard** - Shows pending and verified users

## Impact

### Positive
- ✅ Increased security - only approved users can login
- ✅ Admin control over user access
- ✅ Clear user feedback about account status
- ✅ Prevents spam/fake accounts from accessing system

### Considerations
- ⚠️ Users must wait for admin approval before accessing system
- ⚠️ Admins need to actively monitor and verify new users
- ⚠️ Consider adding email notifications to admins when new users register

## Future Enhancements

1. **Email Notifications**
   - Notify admins when new users register
   - Notify users when their account is verified

2. **Auto-verification**
   - For certain email domains (e.g., company emails)
   - Based on email/phone verification completion

3. **Verification Expiry**
   - Auto-reject registrations older than X days
   - Remind admins to verify pending users

4. **Bulk Verification**
   - Allow admins to verify multiple users at once
   - Import verified user list from CSV

## Files Modified

- ✅ `cctv_backend/src/controllers/AuthController.js` - Added verification check in login()
- ✅ `cctv_frontend/src/pages/Login.jsx` - Already displays error messages properly

## Rollback

If needed to rollback this change, remove these lines from `AuthController.js`:

```javascript
// Check if user is verified
if (!user.verified) {
    return res.status(401).json({
        success: false,
        message: "Your account is pending verification. Please contact an administrator.",
    });
}
```

This will allow unverified users to login again.
