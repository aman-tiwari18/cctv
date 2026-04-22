# Client Detection Dashboard Feature

## Overview
A comprehensive dashboard that displays detection statistics grouped by `exam_body` (client), providing a high-level overview of all examination bodies and their associated exams, cameras, and detections.

## Features

### 1. Overall Statistics Cards
- **Total Exam Bodies**: Count of unique examination bodies
- **Total Active Exams**: Sum of all active exams across all bodies
- **Total Cameras**: Total camera count with accessible camera breakdown
- **Total Detections**: Aggregate detection count across all exams

### 2. Exam Body Breakdown (Accordion View)
Each exam body displays:
- **Exam body name** with icon and color coding
- **Quick stats**: Number of exams and cameras
- **Detection count chip**: Total detections for that body

When expanded, shows:
- **Active Exams Table**:
  - Exam name
  - Link type (HLS/RTSP)
  - Duration (start date - end date)
  
- **Statistics Overview**:
  - Total shifts
  - Accessible cameras (green)
  - Not accessible cameras (red)
  - Unknown status cameras (gray)
  - Detection types breakdown with color-coded chips

### 3. Visualization Charts
- **Pie Chart**: Detections distribution by exam body
- **Bar Chart**: Camera accessibility status by exam body (stacked bars showing accessible vs not accessible)

## Backend Implementation

### New Controller: `ClientDashboardController.js`

#### Endpoint 1: Get Overall Stats
```
GET /api/client-dashboard/stats
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "exam_body": "JE (SSC)",
      "exams": [
        {
          "id": 7,
          "name": "JE SSC 2024",
          "link_type": "HLS",
          "start_date": "2026-04-08",
          "end_date": "2026-04-30"
        }
      ],
      "stats": {
        "total_exams": 1,
        "total_cameras": 300,
        "total_shifts": 14,
        "total_detections": 778,
        "detection_counts": {
          "proximity": 245,
          "crowd": 180,
          "phone": 120,
          "invigilator": 233
        },
        "camera_status": {
          "accessible": 250,
          "not_accessible": 45,
          "unknown": 5
        }
      }
    }
  ]
}
```

#### Endpoint 2: Get Exam Body Details (Future Enhancement)
```
GET /api/client-dashboard/exam-body/:examBody/details?date=2026-04-08
```
Returns detailed breakdown for a specific exam body with optional date filtering.

### Database Queries
The controller aggregates data from:
- `exams` table (grouped by `exam_body`)
- `camera_links_hls` and `camera_links_rtsp` tables (camera counts and status)
- `exam_shifts` table (shift counts)
- `camera_report_hls` and `camera_report_rtsp` tables (detection counts by type)

## Frontend Implementation

### New Page: `ClientDetectionDashboard.jsx`

**Location**: `cctv_frontend/src/pages/ClientDetectionDashboard.jsx`

**Key Components**:
1. **StatCard**: Reusable card component for displaying statistics
2. **Accordion**: Expandable sections for each exam body
3. **Charts**: Recharts library for pie and bar charts
4. **Tables**: Material-UI tables for exam listings

**State Management**:
- `dashboardData`: Array of exam body statistics
- `loading`: Loading state
- `expanded`: Currently expanded accordion panel
- `dateFilter`: Optional date filter (for future enhancement)

### API Service Updates

Added to `cctv_frontend/src/services/api.js`:
```javascript
export const clientDashboardAPI = {
    getStats: () => api.get('/client-dashboard/stats'),
    getExamBodyDetails: (examBody, params) => 
        api.get(`/client-dashboard/exam-body/${examBody}/details`, { params })
};
```

### Routing Updates

**App.jsx**:
```javascript
<Route path="client-dashboard" element={<ClientDetectionDashboard />} />
```

**Layout.jsx**:
Added menu item:
```javascript
{ text: 'Client Dashboard', icon: <TrendingUp />, path: '/client-dashboard' }
```

## Color Scheme

Detection types use consistent colors:
- **Proximity**: `#5cb88a` (green)
- **Crowd**: `#e24d7b` (pink)
- **Crowd < 5**: `#e06050` (red-orange)
- **Zero Person**: `#6b5b95` (purple)
- **Server Room**: `#a0623d` (brown)
- **Intruder**: `#d94466` (red-pink)
- **Entry/Exit**: `#1d7a7d` (teal)
- **Phone**: `#465a38` (olive)
- **Blind Spot**: `#b0a850` (yellow-green)
- **Invigilator**: `#00bfcf` (cyan)
- **Camera Inversion**: `#7a86b4` (blue-gray)
- **Camera Tampering**: `#00c8d4` (bright cyan)

Exam body colors cycle through:
`['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']`

## Access Control

The dashboard is accessible to all authenticated users (ADMIN and VIEWER roles).

## Future Enhancements

1. **Date Range Filtering**: Add date picker to filter detections by date range
2. **Export Functionality**: Export dashboard data to Excel/PDF
3. **Drill-down Views**: Click on exam body to see detailed exam-wise breakdown
4. **Real-time Updates**: Socket.io integration for live detection counts
5. **Comparison View**: Compare multiple exam bodies side-by-side
6. **Trend Analysis**: Show detection trends over time
7. **Alert Thresholds**: Configure alerts for detection thresholds per exam body

## Files Created/Modified

### Backend
- ✅ Created: `cctv_backend/src/controllers/ClientDashboardController.js`
- ✅ Created: `cctv_backend/src/routes/clientDashboard.js`
- ✅ Modified: `cctv_backend/src/app.js` (registered routes)

### Frontend
- ✅ Created: `cctv_frontend/src/pages/ClientDetectionDashboard.jsx`
- ✅ Modified: `cctv_frontend/src/services/api.js` (added API methods)
- ✅ Modified: `cctv_frontend/src/App.jsx` (added route)
- ✅ Modified: `cctv_frontend/src/components/Layout.jsx` (added menu item)

## Testing

To test the dashboard:

1. **Backend**: Ensure the server is running and the database has active exams with `exam_body` values
2. **Frontend**: Navigate to `/client-dashboard` in the application
3. **Verify**:
   - Overall statistics cards display correct totals
   - Each exam body appears as an accordion
   - Expanding an accordion shows exam details and statistics
   - Charts render correctly with data
   - Camera status colors are correct (green/red/gray)

## Dependencies

No new dependencies were added. The feature uses existing libraries:
- **Backend**: Express, MySQL
- **Frontend**: React, Material-UI, Recharts (already installed)
