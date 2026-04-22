# User Verification Feature

## Overview
Added user verification and profile management features to the CCTV Monitoring System. Admins can now verify users, assign roles, and users can manage their profile information.

## Database Changes

### New Columns in `users` Table
1. **phone** (VARCHAR(20)) - Contact phone number
2. **company_name** (VARCHAR(255)) - Company or organization name
3. **verified** (BOOLEAN) - Account verification status (default: FALSE)
4. **verified_date** (DATETIME) - Date and time when account was verified

### Migration File
**Location**: `cctv_backend/src/migrations/017_add_user_verification_fields.sql`

**To Apply Migration:**
```bash
mysql -u your_user -p cctv_monitoring < cctv_backend/src/migrations/017_add_user_verification_fields.sql
```

Or using MySQL client:
```sql
USE cctv_monitoring;
SOURCE cctv_backend/src/migrations/017_add_user_verification_fields.sql;
```

## API Endpoints

### 1. Register User (Admin Only)
**Endpoint**: `POST /api/auth/register`

**Headers**:
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "full_name": "John Doe",
  "phone": "+1234567890",
  "company_name": "ABC Corporation",
  "role": "VIEWER"
}
```

**Response**:
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 5,
    "username": "john_doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "company_name": "ABC Corporation",
    "role": "VIEWER",
    "verified": false
  }
}
```

### 2. Verify User (Admin Only)
**Endpoint**: `PUT /api/auth/verify/:userId`

**Headers**:
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "verified": true,
  "role": "OPERATOR"
}
```

**Parameters**:
- `userId` (path parameter) - ID of the user to verify
- `verified` (optional) - Boolean to set verification status
- `role` (optional) - New role for the user (ADMIN, OPERATOR, or VIEWER)

**Response**:
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "id": 5,
    "username": "john_doe",
    "email": "john@example.com",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "company_name": "ABC Corporation",
    "verified": true,
    "verified_date": "2026-04-22T10:30:00.000Z",
    "role": "OPERATOR"
  }
}
```

**Use Cases**:
- Verify a user: `{ "verified": true }`
- Change role: `{ "role": "OPERATOR" }`
- Verify and change role: `{ "verified": true, "role": "ADMIN" }`
- Unverify a user: `{ "verified": false }`

### 3. Update Profile (Any Authenticated User)
**Endpoint**: `PUT /api/auth/profile`

**Headers**:
```
Authorization: Bearer <user_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "full_name": "John Smith",
  "phone": "+1987654321",
  "company_name": "XYZ Corporation"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": 5,
    "username": "john_doe",
    "email": "john@example.com",
    "full_name": "John Smith",
    "phone": "+1987654321",
    "company_name": "XYZ Corporation",
    "verified": true,
    "verified_date": "2026-04-22T10:30:00.000Z",
    "role": "OPERATOR"
  }
}
```

### 4. Get Current User
**Endpoint**: `GET /api/auth/me`

**Headers**:
```
Authorization: Bearer <user_token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 5,
    "username": "john_doe",
    "email": "john@example.com",
    "full_name": "John Smith",
    "phone": "+1987654321",
    "company_name": "XYZ Corporation",
    "verified": true,
    "verified_date": "2026-04-22T10:30:00.000Z",
    "role": "OPERATOR",
    "last_login": "2026-04-22T09:15:00.000Z",
    "created_at": "2026-04-20T14:30:00.000Z"
  }
}
```

### 5. Login
**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "username": "john_doe",
  "password": "securePassword123"
}
```

**Response** (now includes new fields):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 5,
      "username": "john_doe",
      "email": "john@example.com",
      "full_name": "John Smith",
      "phone": "+1987654321",
      "company_name": "XYZ Corporation",
      "verified": true,
      "verified_date": "2026-04-22T10:30:00.000Z",
      "role": "OPERATOR"
    }
  }
}
```

## User Workflow

### Admin Workflow
1. **Create User**: Admin creates a new user account with basic info
2. **Review User**: Admin reviews user's company information
3. **Verify User**: Admin verifies the user and assigns appropriate role
4. **User Gets Access**: Verified user can now access the system

### User Workflow
1. **Account Created**: Admin creates account (verified = false)
2. **Update Profile**: User can update their profile information
3. **Wait for Verification**: User waits for admin to verify account
4. **Access Granted**: Once verified, user has full access based on role

## Verification Status

### Unverified User (verified = false)
- Can login to the system
- Can update their profile
- May have limited access (implement in frontend if needed)
- `verified_date` is NULL

### Verified User (verified = true)
- Full access to system features based on role
- `verified_date` is set to the timestamp when verified
- Cannot be unverified without admin action

## Role Hierarchy

1. **ADMIN**
   - Full system access
   - Can create, verify, and manage users
   - Can assign roles to users
   - Can access all features

2. **OPERATOR**
   - Can manage exams, cameras, and scripts
   - Cannot manage users
   - Full access to monitoring features

3. **VIEWER**
   - Read-only access
   - Can view Client Dashboard and Client Detections
   - Cannot modify system data

## Security Considerations

### Password Requirements
- Minimum 6 characters (enforced in validation)
- Hashed using bcrypt with salt rounds = 10
- Never returned in API responses

### Authorization
- Only ADMIN can create users
- Only ADMIN can verify users and change roles
- Users can only update their own profile
- JWT tokens expire after 24 hours (configurable)

### Verification
- New users are created as unverified by default
- Admin must explicitly verify users
- Verification date is automatically set when verified
- Unverifying a user clears the verification date

## Database Queries

### Check Unverified Users
```sql
SELECT id, username, email, company_name, phone, created_at
FROM users
WHERE verified = FALSE
ORDER BY created_at DESC;
```

### Check Verified Users
```sql
SELECT id, username, email, company_name, role, verified_date
FROM users
WHERE verified = TRUE
ORDER BY verified_date DESC;
```

### Manually Verify a User
```sql
UPDATE users
SET verified = TRUE, verified_date = NOW()
WHERE id = 5;
```

### Change User Role
```sql
UPDATE users
SET role = 'OPERATOR'
WHERE id = 5;
```

### Get Users by Company
```sql
SELECT id, username, email, full_name, role, verified
FROM users
WHERE company_name = 'ABC Corporation'
ORDER BY username;
```

## Testing

### Test User Creation
```bash
curl -X POST http://localhost:5000/cctv_analytics/api/auth/register \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "email": "test@example.com",
    "password": "test123",
    "full_name": "Test User",
    "phone": "+1234567890",
    "company_name": "Test Corp",
    "role": "VIEWER"
  }'
```

### Test User Verification
```bash
curl -X PUT http://localhost:5000/cctv_analytics/api/auth/verify/5 \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "verified": true,
    "role": "OPERATOR"
  }'
```

### Test Profile Update
```bash
curl -X PUT http://localhost:5000/cctv_analytics/api/auth/profile \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Updated Name",
    "phone": "+9876543210"
  }'
```

## Frontend Integration (Future)

### User Management Page (Admin)
- List all users with verification status
- Filter by verified/unverified
- Verify users with one click
- Change user roles
- View user details (company, phone, etc.)

### Profile Page (All Users)
- View own profile information
- Edit full name, phone, company name
- View verification status
- Cannot change own role or verification status

### Registration Form Updates
- Add phone number field
- Add company name field
- Show verification pending message after creation

## Files Modified

### Backend
- ✅ `cctv_backend/src/migrations/schema_full.sql` - Updated users table schema
- ✅ `cctv_backend/src/migrations/017_add_user_verification_fields.sql` - Migration file
- ✅ `cctv_backend/src/controllers/AuthController.js` - Added new endpoints
- ✅ `cctv_backend/src/routes/auth.js` - Added new routes

### Documentation
- ✅ `docs/user_verification_feature.md` - This file

## Future Enhancements

1. **Email Verification**: Send verification email to users
2. **Phone Verification**: SMS OTP verification
3. **User Management UI**: Admin panel for managing users
4. **Audit Log**: Track who verified which user and when
5. **Bulk Operations**: Verify multiple users at once
6. **User Approval Workflow**: Multi-step approval process
7. **Company Management**: Separate company table with relationships
8. **User Notifications**: Notify users when verified
