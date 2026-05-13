# Testing User Verification System

## Quick Test Guide

### Prerequisites
1. Backend server running on port 3000
2. Frontend server running
3. At least one admin user in the database

### Test Scenario 1: New User Registration and Verification

#### Step 1: Register a New User
1. Navigate to `/register` page
2. Fill in the form:
   - Name: Test User
   - Email: testuser@example.com
   - Phone: +1234567890
   - Company: Test Company (optional)
3. Click "Send OTP" for email
4. Enter the OTP from console logs (if email not configured)
5. Click "Verify" for email
6. Click "Send OTP" for phone
7. Enter the OTP from console logs (if SMS not configured)
8. Click "Verify" for phone
9. Click "Next"
10. Set password (minimum 6 characters)
11. Click "Create Account"
12. User is redirected to login page

#### Step 2: Verify User Cannot Login Yet
1. Try to login with the new user credentials
2. Login should succeed but user may have limited access (depending on role)
3. Note: User is created with `verified: false`

#### Step 3: Admin Verifies the User
1. Login as admin user
2. Click on profile icon (top right)
3. Click "Verify Users" from dropdown menu
4. You should see the new user in "Pending Verification" tab
5. User details should show:
   - Name: Test User
   - Email: testuser@example.com
   - Phone: +1234567890
   - Company: Test Company
   - Role: VIEWER (default)
   - Registration date
6. Click "Verify" button
7. Select role from dropdown (VIEWER/OPERATOR/ADMIN)
8. Click "Verify User"
9. Success message should appear
10. User should move to "Verified Users" tab

#### Step 4: Verify User Can Now Access System
1. Logout from admin account
2. Login with the verified user credentials
3. User should have full access based on assigned role

### Test Scenario 2: Search Functionality

1. Login as admin
2. Navigate to "Verify Users"
3. Register multiple test users with different names/emails
4. Test search:
   - Search by name
   - Search by email
   - Search by company name
5. Verify results update in real-time (500ms debounce)

### Test Scenario 3: Tab Switching

1. Login as admin
2. Navigate to "Verify Users"
3. Switch between tabs:
   - "Pending Verification" - shows unverified users
   - "Verified Users" - shows verified users
4. Verify correct users appear in each tab

### Test Scenario 4: Unverify User

1. Login as admin
2. Navigate to "Verify Users"
3. Switch to "Verified Users" tab
4. Click "Unverify" on a verified user
5. User should move back to "Pending Verification" tab
6. Verify user's access is revoked

### Test Scenario 5: Role Management

1. Login as admin
2. Navigate to "Verify Users"
3. Verify a user with VIEWER role
4. Switch to "Verified Users" tab
5. Click "Verify" again on the same user
6. Change role to OPERATOR
7. Click "Verify User"
8. Verify role chip updates to OPERATOR

### Test Scenario 6: Non-Admin Access

1. Login as VIEWER or OPERATOR user
2. Click profile icon
3. Verify "Verify Users" option is NOT visible
4. Try to access `/user-verification` directly
5. Should be redirected or show access denied

### Test Scenario 7: API Testing with cURL

#### Get All Users (Admin)
```bash
# Login as admin first
curl -X POST "http://localhost:3000/cctv_analytics/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Copy the token from response
export TOKEN="<your_token_here>"

# Get all users
curl -X GET "http://localhost:3000/cctv_analytics/api/auth/users" \
  -H "Authorization: Bearer $TOKEN"

# Get pending users only
curl -X GET "http://localhost:3000/cctv_analytics/api/auth/users?verified=false" \
  -H "Authorization: Bearer $TOKEN"

# Get verified users only
curl -X GET "http://localhost:3000/cctv_analytics/api/auth/users?verified=true" \
  -H "Authorization: Bearer $TOKEN"

# Search users
curl -X GET "http://localhost:3000/cctv_analytics/api/auth/users?search=test" \
  -H "Authorization: Bearer $TOKEN"
```

#### Verify User
```bash
# Verify user with ID 5 and set role to VIEWER
curl -X PUT "http://localhost:3000/cctv_analytics/api/auth/verify/5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verified":true,"role":"VIEWER"}'

# Unverify user
curl -X PUT "http://localhost:3000/cctv_analytics/api/auth/verify/5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verified":false}'

# Change role only (without changing verification status)
curl -X PUT "http://localhost:3000/cctv_analytics/api/auth/verify/5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"OPERATOR"}'
```

### Expected Behaviors

#### UI Behaviors
- ✅ Search has 500ms debounce
- ✅ Loading spinner shows while fetching data
- ✅ Empty state messages when no users found
- ✅ Success/error alerts auto-dismiss after 5 seconds
- ✅ Role chips color-coded (Red=ADMIN, Orange=OPERATOR, Green=VIEWER)
- ✅ Dates formatted as dd-mm-yyyy
- ✅ Verify dialog shows current role as default selection
- ✅ Submit button disabled while processing

#### API Behaviors
- ✅ Returns 401 if no token provided
- ✅ Returns 403 if non-admin tries to access
- ✅ Returns 404 if user not found
- ✅ Returns 400 if invalid role provided
- ✅ Sets verified_date automatically when verifying
- ✅ Clears verified_date when unverifying
- ✅ Allows updating role without changing verification status
- ✅ Allows updating verification without changing role

### Common Issues and Solutions

#### Issue: "Verify Users" not showing in menu
**Solution**: Ensure you're logged in as ADMIN role user

#### Issue: Cannot see newly registered users
**Solution**: 
1. Check if user was created in database
2. Verify you're on "Pending Verification" tab
3. Try refreshing the page

#### Issue: OTP not received
**Solution**: 
1. Check backend console logs for OTP
2. Verify email/SMS service is configured
3. OTPs are logged to console if services not configured

#### Issue: Search not working
**Solution**: 
1. Wait 500ms after typing (debounce delay)
2. Check browser console for errors
3. Verify API endpoint is responding

#### Issue: Role not updating
**Solution**: 
1. Ensure you selected a role in the dropdown
2. Check if success message appeared
3. Refresh the page to see updated role

### Database Verification

Check user verification status directly in database:
```sql
-- View all users with verification status
SELECT id, username, email, full_name, role, verified, verified_date, created_at 
FROM users 
ORDER BY created_at DESC;

-- View pending users
SELECT id, username, email, full_name, role, created_at 
FROM users 
WHERE verified = FALSE;

-- View verified users
SELECT id, username, email, full_name, role, verified_date 
FROM users 
WHERE verified = TRUE;
```

### Performance Testing

1. Create 50+ test users
2. Test search performance
3. Test tab switching with large datasets
4. Verify pagination (if implemented)
5. Check loading states

### Security Testing

1. Try accessing `/user-verification` without login → Should redirect to login
2. Try accessing as VIEWER role → Should not see menu option
3. Try API calls without token → Should return 401
4. Try API calls with VIEWER token → Should return 403
5. Try SQL injection in search field → Should be sanitized
6. Try XSS in user input fields → Should be escaped

## Success Criteria

- ✅ Admin can view all users
- ✅ Admin can filter by verification status
- ✅ Admin can search users
- ✅ Admin can verify users and assign roles
- ✅ Admin can unverify users
- ✅ Non-admin users cannot access verification features
- ✅ UI matches application design (no shadows, correct colors)
- ✅ All API endpoints work correctly
- ✅ Proper error handling and validation
- ✅ Real-time updates after actions
