# Client Dashboard Fixes Summary - May 2026

## Overview

Fixed multiple issues in the client dashboard to ensure:
1. Camera accessibility correctly identifies accessible vs non-accessible cameras
2. Detection counts are filtered by user's assigned exams only
3. All status checks are case-insensitive

## Issues Fixed

### 1. Camera Accessibility Status Check

**Problem:** Camera accessibility was checking for `status === 'active' || status === 'online'`, but the database uses `status === 'accessible'`.

**Files Modified:**
- `cctv_backend/src/controllers/ClientDashboardController.js`

**Changes:**

#### In `getCameraAccessibility()` function (Line ~389):
```javascript
// Before
const accessible = allCameras.filter(cam => 
    cam.status && (cam.status.toLowerCase() === 'active' || cam.status.toLowerCase() === 'online')
).length;

// After
const accessible = allCameras.filter(cam => 
    cam.status && cam.status.toLowerCase() === 'accessible'
).length;
```

#### In `downloadCameraAccessibility()` function (Lines ~557, ~561):
```javascript
// Before - Accessible filter
if (type === 'accessible') {
    allCameras = allCameras.filter(cam => 
        cam.status && (cam.status.toLowerCase() === 'active' || cam.status.toLowerCase() === 'online')
    );
}

// After - Accessible filter
if (type === 'accessible') {
    allCameras = allCameras.filter(cam => 
        cam.status && cam.status.toLowerCase() === 'accessible'
    );
}

// Before - Non-accessible filter
else if (type === 'non_accessible') {
    allCameras = allCameras.filter(cam => 
        !cam.status || (cam.status.toLowerCase() !== 'active' && cam.status.toLowerCase() !== 'online')
    );
}

// After - Non-accessible filter
else if (type === 'non_accessible') {
    allCameras = allCameras.filter(cam => 
        !cam.status || cam.status.toLowerCase() !== 'accessible'
    );
}
```

### 2. Detection Distribution Query Simplification

**Problem:** Detection distribution was trying to filter exams by `link_type` before querying, which was unnecessary and caused complexity.

**File Modified:**
- `cctv_backend/src/controllers/ClientDashboardController.js`

**Changes:**

```javascript
// Before - Complex filtering by link_type
const hlsExams = exams.filter(e => e.link_type === 'HLS').map(e => e.id);
const rtspExams = exams.filter(e => e.link_type === 'RTSP').map(e => e.id);

if (hlsExams.length > 0) {
    const hlsDetections = await query(`...`, [hlsExams]);
    // Process HLS detections
}

if (rtspExams.length > 0) {
    const rtspDetections = await query(`...`, [rtspExams]);
    // Process RTSP detections
}

// After - Direct query with all exam IDs
const hlsDetections = await query(`
    SELECT 
        detection_type,
        COUNT(*) as total_count,
        SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
    FROM camera_report_hls
    WHERE exam_id IN (?) ${dateCondition}
    GROUP BY detection_type
`, [examIds]);

const rtspDetections = await query(`
    SELECT 
        detection_type,
        COUNT(*) as total_count,
        SUM(CASE WHEN pushed_to_client = 1 THEN 1 ELSE 0 END) as pushed_count,
        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
    FROM camera_report_rtsp
    WHERE exam_id IN (?) ${dateCondition}
    GROUP BY detection_type
`, [examIds]);
```

### 3. Exam Query Consistency

**Problem:** Need to ensure `link_type` field is included in exam queries for consistency with production database.

**File Modified:**
- `cctv_backend/src/controllers/ClientDashboardController.js`

**Changes:**

```javascript
// Updated exam query to include link_type
let examQuery = 'SELECT id, exam_name, exam_body, link_type, start_date, end_date FROM exams WHERE is_active = 1';

// Updated exam response to include link_type
exams: exams.map(e => ({ 
    id: e.id, 
    name: e.exam_name, 
    body: e.exam_body,
    link_type: e.link_type,
    start_date: e.start_date,
    end_date: e.end_date
}))
```

## Case-Insensitive Status Checks

All status checks use `.toLowerCase()` for case-insensitive comparison:

### Locations:
1. **getCameraAccessibility** (Line ~389):
   ```javascript
   cam.status && cam.status.toLowerCase() === 'accessible'
   ```

2. **downloadCameraAccessibility - Accessible** (Line ~557):
   ```javascript
   cam.status && cam.status.toLowerCase() === 'accessible'
   ```

3. **downloadCameraAccessibility - Non-accessible** (Line ~561):
   ```javascript
   !cam.status || cam.status.toLowerCase() !== 'accessible'
   ```

### Supported Status Values (Case-Insensitive):
- `'accessible'`
- `'Accessible'`
- `'ACCESSIBLE'`
- `'AcCeSsIbLe'`
- Any other casing variation

## Frontend Implementation

The frontend (`cctv_frontend/src/pages/ClientDetectionDashboard.jsx`) correctly displays the data from the backend API:

### Camera Accessibility Display:
```jsx
<Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a' }}>
  {cameraAccessibility?.total_cameras || 0}
</Typography>

// Accessible cameras
{cameraAccessibility?.accessible || 0} Units ({cameraAccessibility?.accessible_percent || 0}%)

// Non-accessible cameras
{cameraAccessibility?.non_accessible || 0} Units ({cameraAccessibility?.non_accessible_percent || 0}%)
```

### Download Functionality:
```jsx
// Download options
<MenuItem onClick={() => handleDownloadOption('accessible')}>
  Download Accessible
</MenuItem>
<MenuItem onClick={() => handleDownloadOption('non_accessible')}>
  Download Non-accessible
</MenuItem>
<MenuItem onClick={() => handleDownloadOption('all')}>
  Download All
</MenuItem>
```

## User Access Control

The dashboard respects user permissions:

### Admin Users:
- Can view all exams and cameras
- No filtering applied

### EY Users:
- Can view SSC and TCS exams only
- Filtered by: `exam_body IN ('SSC', 'TCS')`

### Other Company Users:
- Can view only their company's exams
- Filtered by: `exam_body = user.company_name`

## Database Schema Reference

### Exams Table:
```sql
+-------------+--------------+------+-----+-------------------+-------+
| Field       | Type         | Null | Key | Default           | Extra |
+-------------+--------------+------+-----+-------------------+-------+
| id          | int          | NO   | PRI | NULL              | auto  |
| exam_name   | varchar(255) | NO   |     | NULL              |       |
| exam_body   | varchar(255) | YES  | MUL | NULL              |       |
| link_type   | varchar(255) | YES  |     | NULL              |       |
| start_date  | date         | YES  |     | NULL              |       |
| end_date    | date         | YES  |     | NULL              |       |
| is_active   | tinyint(1)   | YES  | MUL | 1                 |       |
+-------------+--------------+------+-----+-------------------+-------+
```

### Camera Tables Status Column:
- **camera_links_hls.status**: VARCHAR - Values: 'accessible', 'not accessible', etc.
- **camera_links_rtsp.status**: VARCHAR - Values: 'accessible', 'not accessible', etc.

## Testing Checklist

- [x] Camera accessibility shows correct counts for accessible cameras
- [x] Camera accessibility shows correct counts for non-accessible cameras
- [x] Camera accessibility percentages add up to 100%
- [x] Download accessible cameras works correctly
- [x] Download non-accessible cameras works correctly
- [x] Download all cameras works correctly
- [x] Status check is case-insensitive
- [x] Detection counts filtered by user's assigned exams
- [x] Admin users see all exams
- [x] EY users see only SSC and TCS exams
- [x] Other company users see only their company's exams
- [x] Exam filter dropdown shows only user's accessible exams
- [x] Shift filter shows shifts for selected exam
- [x] Date filter shows dates for selected exam

## API Endpoints

### GET /api/client-dashboard/stats
Returns dashboard statistics filtered by user's assigned exams.

**Query Parameters:**
- `timeRange`: '24h', '7d', '30d', '90d', 'all' (default: '24h')

**Response:**
```json
{
  "success": true,
  "data": {
    "active_exams": 5,
    "total_cameras": 118,
    "total_detections": 1234,
    "detection_distribution": [...],
    "exam_status": {...},
    "script_distribution": [...],
    "exams": [...]
  }
}
```

### GET /api/client-dashboard/camera-accessibility
Returns camera accessibility statistics.

**Query Parameters:**
- `exam_id`: Exam ID or 'all'
- `shift_id`: Shift ID or 'all'
- `exam_date`: Date (YYYY-MM-DD) or 'all'

**Response:**
```json
{
  "success": true,
  "data": {
    "total_cameras": 118,
    "accessible": 95,
    "non_accessible": 23,
    "accessible_percent": 80.5,
    "non_accessible_percent": 19.5,
    "available_shifts": [...],
    "available_dates": [...],
    "cameras": [...]
  }
}
```

### GET /api/client-dashboard/camera-accessibility/download
Downloads camera accessibility data as Excel file.

**Query Parameters:**
- `exam_id`: Exam ID or 'all'
- `shift_id`: Shift ID or 'all'
- `exam_date`: Date (YYYY-MM-DD) or 'all'
- `type`: 'accessible', 'non_accessible', or 'all'

**Response:**
- Excel file download

## Related Documentation

- [Classification Mapping Fix](./CLASSIFICATION_MAPPING_FIX.md)
- [Camera Loader Updates](./CLASSIFICATION_MAPPING_FIX.md#solution)

## Date

May 4, 2026
