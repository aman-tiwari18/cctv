# API Documentation

Base URL: `http://localhost:3000/api`

All endpoints (except `/auth/login`) require JWT authentication via `Authorization: Bearer <token>` header.

## Authentication

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "full_name": "Admin User",
      "phone": "+919999999999",
      "company_name": "CDIS",
      "verified": true,
      "verified_date": "2026-04-22T10:30:00.000Z",
      "role": "ADMIN"
    }
  }
}
```

### Public Signup (No Authentication Required)
```http
POST /auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "password": "password123",
  "companyName": "ABC Company"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account created successfully. Please verify your email and phone.",
  "data": {
    "id": 5,
    "email": "john@example.com",
    "phone": "+919876543210",
    "full_name": "John Doe",
    "company_name": "ABC Company",
    "verified": false
  }
}
```

### Send OTP (No Authentication Required)
```http
POST /auth/send-otp
Content-Type: application/json

{
  "identifier": "john@example.com",
  "type": "email"
}
```

**Parameters:**
- `identifier`: Email address or phone number
- `type`: Either "email" or "phone"

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your email"
}
```

### Verify OTP (No Authentication Required)
```http
POST /auth/verify-otp
Content-Type: application/json

{
  "identifier": "john@example.com",
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

### Forgot Password (No Authentication Required)
```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If the email exists, a password reset OTP has been sent"
}
```

### Reset Password (No Authentication Required)
```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "newpassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### Register User (Admin Only)
```http
POST /auth/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "operator1",
  "email": "operator@example.com",
  "password": "password123",
  "full_name": "John Doe",
  "phone": "+919876543210",
  "company_name": "ABC Company",
  "role": "OPERATOR"
}
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>
```

### Update Profile
```http
PUT /auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "John Updated",
  "phone": "+919999999999",
  "company_name": "New Company"
}
```

### Verify User (Admin Only)
```http
PUT /auth/verify/:userId
Authorization: Bearer <token>
Content-Type: application/json

{
  "verified": true,
  "role": "OPERATOR"
}
```

**Parameters:**
- `verified` (optional): Boolean to set verification status
- `role` (optional): One of "ADMIN", "OPERATOR", "VIEWER"

## Exams

### Create Exam
```http
POST /exams
Authorization: Bearer <token>
Content-Type: application/json

{
  "exam_name": "SSC CGL 2026",
  "exam_body": "SSC",
  "link_type": "RTSP",
  "description": "Staff Selection Commission"
}
```

### Get All Exams
```http
GET /exams?is_active=true&exam_body=SSC
Authorization: Bearer <token>
```

### Get Exam by ID
```http
GET /exams/:id
Authorization: Bearer <token>
```

### Update Exam
```http
PUT /exams/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "exam_name": "Updated Name",
  "is_active": false
}
```

### Delete Exam
```http
DELETE /exams/:id
Authorization: Bearer <token>
```

## Camera Links

### Add Camera Manually
```http
POST /exams/:examId/cameras
Authorization: Bearer <token>
Content-Type: application/json

{
  "camera_id": "CAM001",
  "stream_url": "rtsp://192.168.1.100:554/stream",
  "stream_type": "RTSP",
  "location": "Room 101"
}
```

### Upload Camera Links (Excel)
```http
POST /exams/:examId/cameras/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <camera_links.xlsx>
```

**Excel Format:**
- Columns: `camera_id`, `stream_url`, `location` (optional)

### Get Cameras for Exam
```http
GET /exams/:examId/cameras?is_active=true
Authorization: Bearer <token>
```

### Update Camera
```http
PUT /cameras/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "stream_url": "rtsp://new-url",
  "is_active": false
}
```

### Delete Camera
```http
DELETE /cameras/:id
Authorization: Bearer <token>
```

## Schedules

### Create Schedule Manually
```http
POST /exams/:examId/schedules
Authorization: Bearer <token>
Content-Type: application/json

{
  "exam_date": "2026-02-15",
  "shifts": [
    {
      "shift_name": "Morning Shift",
      "start_time": "09:00:00",
      "end_time": "12:00:00"
    },
    {
      "shift_name": "Afternoon Shift",
      "start_time": "14:00:00",
      "end_time": "17:00:00"
    }
  ],
  "notes": "Regular exam day"
}
```

### Upload Schedules (Excel)
```http
POST /exams/:examId/schedules/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <exam_schedule.xlsx>
```

**Excel Format:**
- Column 1: `Date`
- Other columns: Time ranges like `09:00:00 to 12:00:00`
- Cell values: `Yes` or `No`

### Get Schedules for Exam
```http
GET /exams/:examId/schedules?is_active=true&include_shifts=true
Authorization: Bearer <token>
```

### Get Upcoming Shifts
```http
GET /schedules/upcoming?hours=24
Authorization: Bearer <token>
```

### Update Schedule
```http
PUT /schedules/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "exam_date": "2026-02-16",
  "notes": "Updated notes"
}
```

### Delete Schedule
```http
DELETE /schedules/:id
Authorization: Bearer <token>
```

## Analytics Tasks

### Create Analytics Task
```http
POST /exams/:examId/analytics
Authorization: Bearer <token>
Content-Type: application/json

{
  "task_name": "Intrusion Detection",
  "description": "Detect unauthorized persons",
  "script_path": "intrusion_detect.py",
  "frequency_minutes": 2,
  "duration_minutes": 120,
  "start_time": "09:00:00",
  "end_time": "18:00:00",
  "parameters": {
    "threshold": 0.8
  }
}
```

### Upload Analytics Tasks (Excel)
```http
POST /exams/:examId/analytics/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <analytics_tasks.xlsx>
```

**Excel Format:**
- Columns: `task_name`, `script_path`, `frequency_minutes`, `start_time`, `end_time`, `duration_minutes`, `description`

### Get Analytics Tasks
```http
GET /exams/:examId/analytics?is_active=true
Authorization: Bearer <token>
```

### Update Analytics Task
```http
PUT /analytics/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "frequency_minutes": 5,
  "is_active": false
}
```

### Delete Analytics Task
```http
DELETE /analytics/:id
Authorization: Bearer <token>
```

## Script Executions

### Get Pending Executions (Script Server)
```http
GET /executions/pending?limit=50
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 123,
      "analytics_task_id": 5,
      "camera_link_id": 10,
      "script_path": "intrusion_detect.py",
      "stream_url": "rtsp://...",
      "camera_id": "CAM001",
      "scheduled_time": "2026-02-15T09:00:00",
      "status": "PENDING"
    }
  ]
}
```

### Update Execution Status (Script Server)
```http
PUT /executions/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "COMPLETED",
  "result_data": {
    "detections": 5,
    "alerts": 2
  }
}
```

**Status values:** `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`

### Get All Executions
```http
GET /executions?status=COMPLETED&from_date=2026-02-01&limit=100
Authorization: Bearer <token>
```

### Get Execution Details
```http
GET /executions/:id
Authorization: Bearer <token>
```

### Get Execution Statistics
```http
GET /executions/stats/summary?exam_id=1&from_date=2026-02-01
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "completed": 140,
    "failed": 5,
    "running": 3,
    "pending": 2,
    "cancelled": 0
  }
}
```

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "exam_name",
      "message": "Exam name is required"
    }
  ]
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate entry)
- `500` - Internal Server Error

## Rate Limiting

Currently no rate limiting is implemented. Consider adding in production.

## Pagination

For endpoints returning lists, use `limit` and `offset` query parameters:

```http
GET /executions?limit=50&offset=100
```
