# Client Dashboard Troubleshooting Guide

## Issue: No Data Showing in Client Dashboard

### Possible Causes and Solutions

#### 1. No Active Exams with exam_body Values

**Check:**
```sql
SELECT id, exam_name, exam_body, is_active 
FROM exams 
WHERE is_active = 1;
```

**Solution:**
If `exam_body` is NULL or empty for your exams, you need to populate it:

```sql
-- Update exam_body for your exams
UPDATE exams 
SET exam_body = 'JE (SSC)' 
WHERE id = 7;  -- Replace with your exam ID

-- Or update multiple exams at once
UPDATE exams 
SET exam_body = 'SSC' 
WHERE exam_name LIKE '%SSC%';
```

#### 2. Backend API Not Responding

**Check Backend Logs:**
Look for these log messages:
```
[ClientDashboard] Total active exams found: X
[ClientDashboard] Exam bodies found: [...]
[ClientDashboard] Processing exam_body: ...
```

**Test API Directly:**
```bash
# Test the API endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/cctv_analytics/api/client-dashboard/stats
```

#### 3. Frontend Not Calling API

**Check Browser Console:**
Look for these log messages:
```
[ClientDashboard Frontend] API Response: {...}
[ClientDashboard Frontend] No data received. Message: ...
```

**Check Network Tab:**
- Look for request to `/api/client-dashboard/stats`
- Check if it returns 200 status
- Verify response data structure

#### 4. Role-Based Access Issue

**For VIEWER Role:**
- Should see "Dashboard" (renamed from "Client Dashboard")
- Should see "Client Detections"
- Should NOT see other admin pages

**For ADMIN Role:**
- Should NOT see "Client Dashboard" in menu
- Should see all other admin pages

### Quick Fix Steps

1. **Verify Database Data:**
```sql
-- Run this script
source cctv_backend/scripts/check_exam_body_data.sql
```

2. **Populate exam_body if needed:**
```sql
-- Example: Set exam_body for exam ID 7
UPDATE exams SET exam_body = 'JE (SSC)' WHERE id = 7;
```

3. **Restart Backend:**
```bash
cd cctv_backend
npm start
```

4. **Clear Browser Cache and Reload:**
- Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- Or clear browser cache completely

5. **Check Console Logs:**
- Backend: Look for `[ClientDashboard]` logs
- Frontend: Open browser DevTools Console

### Expected Data Flow

1. **Backend Query:**
   - Fetches all active exams with `is_active = 1`
   - Groups by `exam_body`
   - For each exam_body, calculates:
     - Total cameras (HLS + RTSP)
     - Total shifts
     - Total detections
     - Camera status counts
     - Detection type counts

2. **Frontend Display:**
   - Shows overall statistics cards
   - Lists each exam_body in accordion
   - Displays charts for visualization

### Sample Data Structure

**Backend Response:**
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
          "crowd": 180
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

### Common Errors

#### Error: "No active exams found"
**Cause:** No exams with `is_active = 1`
**Fix:** 
```sql
UPDATE exams SET is_active = 1 WHERE id = YOUR_EXAM_ID;
```

#### Error: "Failed to fetch client dashboard statistics"
**Cause:** Database connection or query error
**Fix:** Check backend logs for detailed error message

#### Empty Dashboard (No Error)
**Cause:** Exams exist but `exam_body` is NULL
**Fix:** Populate `exam_body` column as shown above

### Testing Checklist

- [ ] At least one exam has `is_active = 1`
- [ ] Exam has `exam_body` value (not NULL)
- [ ] Backend server is running
- [ ] API endpoint returns 200 status
- [ ] Response contains `data` array
- [ ] Frontend console shows API response
- [ ] User is logged in with correct role
- [ ] Browser cache is cleared

### Contact Support

If issue persists after following these steps:
1. Collect backend logs
2. Collect browser console logs
3. Export database schema and sample data
4. Note exact error messages
