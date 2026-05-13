# Company-Based Filtering System

## Overview
The system now filters exam data based on the user's company name, ensuring clients only see their own data while admins can see all data.

## How It Works

### User Company Name → Exam Body Matching
- Users have a `company_name` field in the `users` table
- Exams have an `exam_body` field in the `exams` table
- **The system matches `user.company_name` with `exam.exam_body`**
- Non-admin users only see exams where `exam_body = user.company_name`
- Admin users see all exams regardless of exam_body

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  phone VARCHAR(20),
  company_name VARCHAR(255),  -- Used for filtering
  role ENUM('ADMIN', 'OPERATOR', 'VIEWER') DEFAULT 'VIEWER',
  verified BOOLEAN DEFAULT FALSE,
  ...
);
```

### Exams Table
```sql
CREATE TABLE exams (
  id INT PRIMARY KEY AUTO_INCREMENT,
  exam_name VARCHAR(255) NOT NULL,
  exam_body VARCHAR(255),  -- Matched with user.company_name
  link_type VARCHAR(255),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  ...
);
```

## Implementation

### Backend - ClientDashboardController.js

#### getClientDashboardStats()
```javascript
// Get user's company_name from authenticated user
const userCompanyName = req.user?.company_name;
const userRole = req.user?.role;

// Build query based on user role
let examQuery = `
    SELECT id, exam_name, exam_body, link_type, start_date, end_date, is_active
    FROM exams
    WHERE is_active = 1
`;
let queryParams = [];

// Filter by company_name for non-admin users
if (userRole !== 'ADMIN' && userCompanyName) {
    examQuery += ` AND exam_body = ?`;
    queryParams.push(userCompanyName);
}

const exams = await query(examQuery, queryParams);
```

#### getExamBodyDetails()
```javascript
// Check if non-admin user is trying to access another company's data
if (userRole !== 'ADMIN' && userCompanyName && examBody !== userCompanyName) {
    return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your company data.'
    });
}
```

### Frontend - Layout.jsx

**Profile Menu Display:**
```jsx
<MenuItem disabled>
  <AccountCircle sx={{ mr: 1, color: '#64748b' }} />
  <Box>
    <Typography variant="body2" fontWeight={600}>{user?.username}</Typography>
    <Typography variant="caption" color="text.secondary">{user?.role}</Typography>
    {user?.role !== 'ADMIN' && user?.company_name && (
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        {user.company_name}
      </Typography>
    )}
  </Box>
</MenuItem>
```

### Frontend - ClientDetectionDashboard.jsx

**Dynamic Messaging:**
```jsx
<Typography variant="body2" color="text.secondary" mb={3}>
  {user?.role === 'ADMIN' 
    ? 'Client-wise detection analytics grouped by examination body'
    : `Detection analytics for ${user?.company_name || 'your company'}`
  }
</Typography>
```

## User Experience

### For Admin Users
1. Login as admin
2. Navigate to Client Dashboard
3. See all exam bodies and their data
4. Profile menu shows: Username, Role (no company name)
5. Can view all companies' data

### For Client Users (VIEWER/OPERATOR)
1. Login with company credentials
2. User has `company_name = "ABC Corporation"`
3. Navigate to Dashboard
4. See only exams where `exam_body = "ABC Corporation"`
5. Profile menu shows: Username, Role, Company Name
6. Cannot access other companies' data

## Example Scenario

### Setup
```sql
-- Users
INSERT INTO users (username, email, company_name, role, verified) VALUES
('admin@system.com', 'admin@system.com', NULL, 'ADMIN', TRUE),
('abc@client.com', 'abc@client.com', 'ABC Corporation', 'VIEWER', TRUE),
('xyz@client.com', 'xyz@client.com', 'XYZ Industries', 'VIEWER', TRUE);

-- Exams
INSERT INTO exams (exam_name, exam_body, is_active) VALUES
('JEE Main 2026', 'ABC Corporation', TRUE),
('NEET 2026', 'ABC Corporation', TRUE),
('CAT 2026', 'XYZ Industries', TRUE),
('GATE 2026', 'XYZ Industries', TRUE);
```

### Results

**Admin Login:**
- Sees all 4 exams
- Dashboard shows 2 exam bodies: ABC Corporation, XYZ Industries

**abc@client.com Login:**
- Sees only 2 exams: JEE Main 2026, NEET 2026
- Dashboard shows only: ABC Corporation
- Profile shows: "ABC Corporation"

**xyz@client.com Login:**
- Sees only 2 exams: CAT 2026, GATE 2026
- Dashboard shows only: XYZ Industries
- Profile shows: "XYZ Industries"

## Security

### Access Control
- ✅ Non-admin users can only see their company's data
- ✅ Backend validates company access on all endpoints
- ✅ Frontend hides company name for admins (cleaner UI)
- ✅ 403 Forbidden returned if user tries to access another company's data

### API Endpoints Protected
1. `GET /api/client-dashboard/stats` - Filters by company_name
2. `GET /api/client-dashboard/exam-body/:examBody/details` - Validates access

## Testing

### Test Case 1: Admin Access
```bash
# Login as admin
curl -X POST "http://localhost:3000/cctv_analytics/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Get dashboard stats (should see all companies)
curl -X GET "http://localhost:3000/cctv_analytics/api/client-dashboard/stats" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Test Case 2: Client Access
```bash
# Login as client user
curl -X POST "http://localhost:3000/cctv_analytics/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"abc@client.com","password":"password123"}'

# Get dashboard stats (should see only ABC Corporation)
curl -X GET "http://localhost:3000/cctv_analytics/api/client-dashboard/stats" \
  -H "Authorization: Bearer CLIENT_TOKEN"
```

### Test Case 3: Unauthorized Access
```bash
# Login as ABC Corporation user
# Try to access XYZ Industries data
curl -X GET "http://localhost:3000/cctv_analytics/api/client-dashboard/exam-body/XYZ%20Industries/details" \
  -H "Authorization: Bearer ABC_TOKEN"

# Expected: 403 Forbidden
# {
#   "success": false,
#   "message": "Access denied. You can only view your company data."
# }
```

## Setup Instructions

### 1. Ensure Users Have Company Names
```sql
-- Update existing users with company names
UPDATE users 
SET company_name = 'ABC Corporation' 
WHERE email = 'abc@client.com';

UPDATE users 
SET company_name = 'XYZ Industries' 
WHERE email = 'xyz@client.com';
```

### 2. Ensure Exams Have Exam Body
```sql
-- Update existing exams with exam_body
UPDATE exams 
SET exam_body = 'ABC Corporation' 
WHERE exam_name LIKE '%JEE%' OR exam_name LIKE '%NEET%';

UPDATE exams 
SET exam_body = 'XYZ Industries' 
WHERE exam_name LIKE '%CAT%' OR exam_name LIKE '%GATE%';
```

### 3. Verify Matching
```sql
-- Check user company names
SELECT id, username, email, company_name, role FROM users WHERE role != 'ADMIN';

-- Check exam bodies
SELECT id, exam_name, exam_body FROM exams WHERE is_active = 1;

-- Verify matches
SELECT 
    u.username,
    u.company_name as user_company,
    e.exam_name,
    e.exam_body
FROM users u
LEFT JOIN exams e ON e.exam_body = u.company_name
WHERE u.role != 'ADMIN' AND e.is_active = 1
ORDER BY u.company_name, e.exam_name;
```

## Benefits

1. **Data Isolation**: Each client sees only their own data
2. **Security**: Backend enforces access control
3. **Scalability**: Easy to add new clients
4. **Flexibility**: Admin can see all data for management
5. **User Experience**: Clear indication of which company's data is being viewed

## Future Enhancements

1. **Multi-Company Access**: Allow users to access multiple companies
2. **Company Hierarchy**: Support parent-child company relationships
3. **Company Settings**: Per-company configuration and branding
4. **Company Analytics**: Cross-company comparison for admins
5. **Company Invitations**: Allow company admins to invite users
