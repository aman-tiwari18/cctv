# User Verification System

## Overview
Admin-only user verification system that allows administrators to review and verify new user registrations, assign roles, and manage user access.

## Features

### Backend Implementation

#### New API Endpoints

1. **GET /api/auth/users** (Admin only)
   - Fetches all users with optional filtering
   - Query parameters:
     - `verified`: Filter by verification status (true/false)
     - `role`: Filter by role (ADMIN/OPERATOR/VIEWER)
     - `search`: Search by name or email
   - Returns: Array of user objects with all details

2. **PUT /api/auth/verify/:userId** (Admin only)
   - Verify/unverify users and update their roles
   - Request body:
     - `verified`: Boolean (optional)
     - `role`: String - ADMIN/OPERATOR/VIEWER (optional)
   - Automatically sets `verified_date` when verifying
   - Returns: Updated user object

#### Controller Functions

- `getAllUsers()`: Fetches and filters users based on query parameters
- `verifyUser()`: Updates user verification status and role

### Frontend Implementation

#### New Page: UserVerification.jsx

**Location**: `cctv_frontend/src/pages/UserVerification.jsx`

**Features**:
- Two-tab interface:
  - **Pending Verification**: Shows unverified users
  - **Verified Users**: Shows verified users
- Search functionality across name, email, and company
- User information display:
  - Full name and username
  - Email and phone
  - Company name
  - Current role with color-coded chips
  - Registration date
  - Verification date (for verified users)
- Actions:
  - **Verify**: Opens dialog to select role and verify user
  - **Unverify**: Removes verification status
- Real-time alerts for success/error messages
- Loading states and empty states

**Design**:
- Follows application color scheme (#eef2fb background, #3b82f6 buttons)
- No shadows or elevation (flat design)
- Clean, modern table layout
- Color-coded role chips:
  - ADMIN: Red (#ef4444)
  - OPERATOR: Orange (#f59e0b)
  - VIEWER: Green (#10b981)

#### Layout Updates

**Profile Menu** (Admin only):
- Added "Verify Users" menu item before Logout
- Icon: VerifiedUser (blue #3b82f6)
- Only visible to users with ADMIN role
- Navigates to `/user-verification`

#### Routing

Added route in `App.jsx`:
```jsx
<Route path="user-verification" element={<UserVerification />} />
```

## User Flow

### For New Users
1. User registers via `/register` page
2. Account created with `verified: false`
3. User cannot access system until verified by admin

### For Admins
1. Admin logs in and clicks profile icon
2. Selects "Verify Users" from menu
3. Views pending users in "Pending Verification" tab
4. Clicks "Verify" button on a user
5. Selects appropriate role (ADMIN/OPERATOR/VIEWER)
6. Clicks "Verify User" to confirm
7. User is now verified and can access the system

### Managing Verified Users
1. Admin switches to "Verified Users" tab
2. Can search and filter verified users
3. Can click "Unverify" to revoke access if needed

## Security

- All verification endpoints require authentication
- Only users with ADMIN role can access verification features
- Frontend hides "Verify Users" menu for non-admin users
- Backend validates admin role on all verification endpoints
- Proper error handling and validation

## API Service Updates

Added to `cctv_frontend/src/services/api.js`:
```javascript
getAllUsers: (params) => api.get('/auth/users', { params }),
verifyUser: (userId, data) => api.put(`/auth/verify/${userId}`, data)
```

## Database Schema

Uses existing user table columns:
- `verified`: BOOLEAN (default: false)
- `verified_date`: TIMESTAMP (set when verified)
- `role`: ENUM('ADMIN', 'OPERATOR', 'VIEWER')
- `phone`: VARCHAR(20)
- `company_name`: VARCHAR(255)

## Testing

### Backend Testing
```bash
# Get all users (requires admin token)
curl -X GET "http://localhost:3000/cctv_analytics/api/auth/users" \
  -H "Authorization: Bearer <admin_token>"

# Get pending users
curl -X GET "http://localhost:3000/cctv_analytics/api/auth/users?verified=false" \
  -H "Authorization: Bearer <admin_token>"

# Verify a user
curl -X PUT "http://localhost:3000/cctv_analytics/api/auth/verify/123" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"verified": true, "role": "VIEWER"}'
```

### Frontend Testing
1. Register a new user account
2. Login as admin
3. Click profile icon → "Verify Users"
4. Verify the new user appears in "Pending Verification" tab
5. Click "Verify" and select a role
6. Confirm user moves to "Verified Users" tab
7. Test search functionality
8. Test unverify functionality

## Files Modified/Created

### Backend
- ✅ `cctv_backend/src/controllers/AuthController.js` - Added `getAllUsers()` function
- ✅ `cctv_backend/src/routes/auth.js` - Added GET /users route

### Frontend
- ✅ `cctv_frontend/src/pages/UserVerification.jsx` - New page (created)
- ✅ `cctv_frontend/src/App.jsx` - Added route
- ✅ `cctv_frontend/src/components/Layout.jsx` - Added menu item
- ✅ `cctv_frontend/src/services/api.js` - Added API methods

## Color Scheme Reference

- Background: `#eef2fb` / `#f8fafc`
- Primary Button: `#3b82f6`
- Primary Hover: `#2563eb`
- Border: `#e2e8f0`
- Text Primary: `#0f172a`
- Text Secondary: `#64748b`
- Success: `#10b981`
- Warning: `#f59e0b`
- Error: `#ef4444`

## Next Steps

1. Test the complete user registration and verification flow
2. Ensure email/phone OTP verification works before user registration
3. Test role-based access control for different user types
4. Consider adding bulk verification for multiple users
5. Consider adding email notifications when users are verified
