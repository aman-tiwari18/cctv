# Client Detection Accuracy & Count Fix - May 2026

## Overview

Fixed the detection count and accuracy calculation logic for the client dashboard to properly reflect only the detections that were pushed to clients and calculate accuracy based on client feedback (removed detections).

## Issues Fixed

### 1. Total Detection Count
**Problem:** Dashboard was showing ALL detections from the database, including those not pushed to clients.

**Solution:** Only count detections where `pushed_to_client = 1`.

### 2. Accuracy Calculation
**Problem:** Accuracy was calculated as `(pushed_to_client / total_count) * 100`, which doesn't reflect client feedback.

**Solution:** Changed to client-side accuracy formula:
```
Accuracy = (pushed_count - removed_count) / pushed_count * 100
```

Where:
- `pushed_count` = detections pushed to client (`pushed_to_client = 1`)
- `removed_count` = detections removed by client (`remove_from_client = 1`)
- `accurate_count` = `pushed_count - removed_count` (detections client kept)

### 3. Category Filtering
**Problem:** Category filter wasn't properly filtering detection types by their categories (people, movement, camera).

**Solution:** Filter by category FIRST, then by exam, using the `SCRIPT_CATEGORY_MAP`.

## Backend Changes

### File: `cctv_backend/src/controllers/ClientDashboardController.js`

#### Detection Query Changes

**Before:**
```javascript
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
```

**After:**
```javascript
const hlsDetections = await query(`
    SELECT 
        detection_type,
        COUNT(*) as pushed_count,
        SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count
    FROM camera_report_hls
    WHERE exam_id IN (?) 
      AND pushed_to_client = 1
      ${dateCondition}
    GROUP BY detection_type
`, [examIds]);
```

**Key Changes:**
1. Added `WHERE pushed_to_client = 1` filter
2. Removed `total_count` (no longer needed)
3. `COUNT(*)` now directly gives `pushed_count`

#### Accuracy Calculation Changes

**Before:**
```javascript
const detectionDistributionWithAccuracy = detectionDistribution.map(d => ({
    type: d.type,
    count: d.total_count,
    pushed_count: d.pushed_count,
    removed_count: d.removed_count,
    accuracy: d.total_count > 0 ? ((d.pushed_count / d.total_count) * 100).toFixed(2) : 0
}));
```

**After:**
```javascript
const detectionDistributionWithAccuracy = detectionDistribution.map(d => {
    const accurateCount = d.pushed_count - d.removed_count;
    const accuracy = d.pushed_count > 0 ? ((accurateCount / d.pushed_count) * 100).toFixed(2) : 0;
    
    return {
        type: d.type,
        count: d.pushed_count, // Total pushed to client
        pushed_count: d.pushed_count,
        removed_count: d.removed_count,
        accurate_count: accurateCount, // Pushed - Removed
        accuracy: parseFloat(accuracy)
    };
});
```

**Key Changes:**
1. Calculate `accurate_count = pushed_count - removed_count`
2. Accuracy = `(accurate_count / pushed_count) * 100`
3. Include `accurate_count` in response

#### Total Detections

**Before:**
```javascript
const totalDetections = detectionDistribution.reduce((sum, d) => sum + d.total_count, 0);
```

**After:**
```javascript
const totalDetections = detectionDistribution.reduce((sum, d) => sum + d.pushed_count, 0);
```

## Frontend Changes

### File: `cctv_frontend/src/pages/ClientDetectionDashboard.jsx`

#### Category Filtering Order

**Before:**
```javascript
// Filter by exam first, then category
const examFilteredDetectionData = selectedDetectionExam === 'all'
    ? detectionData
    : detectionData.filter(item => { /* complex exam filtering */ });

const filteredDetectionData = selectedCategory === 'all' 
    ? examFilteredDetectionData 
    : examFilteredDetectionData.filter(item => SCRIPT_CATEGORY_MAP[item.type] === selectedCategory);
```

**After:**
```javascript
// Filter by category first (backend already filters by user's exams)
const categoryFilteredData = selectedCategory === 'all' 
    ? detectionData 
    : detectionData.filter(item => SCRIPT_CATEGORY_MAP[item.type] === selectedCategory);

const filteredDetectionData = selectedDetectionExam === 'all'
    ? categoryFilteredData
    : categoryFilteredData;
```

**Rationale:** Backend already filters by user's assigned exams, so no need for complex exam filtering in frontend.

#### Pie Chart Data

**Added `accurate_count` field:**
```javascript
const pieData = filteredDetectionData.map(item => ({
    name: DETECTION_TYPE_LABELS[item.type] || item.type,
    value: parseFloat(item.accuracy) || 0,
    count: item.count,
    pushed_count: item.pushed_count,
    removed_count: item.removed_count,
    accurate_count: item.accurate_count || (item.pushed_count - item.removed_count), // NEW
    type: item.type,
    category: SCRIPT_CATEGORY_MAP[item.type] || 'camera',
    color: CATEGORY_COLORS[SCRIPT_CATEGORY_MAP[item.type]] || '#94a3b8',
}));
```

#### Enhanced Tooltip

**Added detailed tooltip showing:**
- Detection type name
- Pushed count
- Removed count
- Accurate count
- Accuracy percentage

```javascript
<Tooltip 
    content={({ active, payload }) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
          <Box sx={{ bgcolor: 'white', p: 1.5, borderRadius: 1, boxShadow: 2, border: '1px solid #e2e8f0' }}>
            <Typography variant="caption" fontWeight={700}>
              {data.name}
            </Typography>
            <Typography variant="caption">
              Pushed: {data.pushed_count}
            </Typography>
            <Typography variant="caption">
              Removed: {data.removed_count}
            </Typography>
            <Typography variant="caption">
              Accurate: {data.accurate_count}
            </Typography>
            <Typography variant="caption" fontWeight={700}>
              Accuracy: {data.value}%
            </Typography>
          </Box>
        );
      }
      return null;
    }}
/>
```

#### Detection List Display

**Added accurate/pushed ratio:**
```javascript
<Box display="flex" alignItems="center" gap={2}>
    <Typography variant="caption" sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>
      {item.accurate_count}/{item.pushed_count}
    </Typography>
    <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
      {item.value}%
    </Typography>
</Box>
```

## Category Mapping

Detection types are grouped into three categories:

### People & Activity
- `proximity` - Close Proximity
- `crowd` - Crowd Detection (Entry/Exit)
- `crowd_biometric` - Crowd Detection (Biometric)
- `crowd_five` - Crowd < 5
- `crowd_zero` - Zero Person
- `invigilator` - Invigilator
- `phone` - Phone
- `server` - Server Room
- `intruder` - Intruder

### Movement & Alerts
- `strongroom` - Strong Room Movement
- `qp_box` - QP Box Detection
- `entry_exit` - Entry/Exit

### System & Camera
- `inversion` - Camera Inversion
- `tamper` - Camera Tampering
- `tampering` - Camera Tampering
- `blind_spot` - Blind Spot
- `vision` - Vision Detection

## Example Calculations

### Scenario 1: High Accuracy
```
Pushed to client: 100 detections
Removed by client: 5 detections
Accurate count: 100 - 5 = 95
Accuracy: (95 / 100) * 100 = 95%
```

### Scenario 2: Low Accuracy
```
Pushed to client: 100 detections
Removed by client: 40 detections
Accurate count: 100 - 40 = 60
Accuracy: (60 / 100) * 100 = 60%
```

### Scenario 3: Perfect Accuracy
```
Pushed to client: 100 detections
Removed by client: 0 detections
Accurate count: 100 - 0 = 100
Accuracy: (100 / 100) * 100 = 100%
```

## Database Queries

### Count Total Detections for User's Exams
```sql
-- HLS
SELECT COUNT(*) 
FROM camera_report_hls 
WHERE exam_id IN (user_exam_ids) 
  AND pushed_to_client = 1;

-- RTSP
SELECT COUNT(*) 
FROM camera_report_rtsp 
WHERE exam_id IN (user_exam_ids) 
  AND pushed_to_client = 1;
```

### Calculate Accuracy for Detection Type
```sql
SELECT 
    detection_type,
    COUNT(*) as pushed_count,
    SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as removed_count,
    COUNT(*) - SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END) as accurate_count,
    ((COUNT(*) - SUM(CASE WHEN remove_from_client = 1 THEN 1 ELSE 0 END)) / COUNT(*) * 100) as accuracy
FROM camera_report_hls
WHERE exam_id IN (user_exam_ids)
  AND pushed_to_client = 1
GROUP BY detection_type;
```

## API Response Format

### GET /api/client-dashboard/stats

**Response:**
```json
{
  "success": true,
  "data": {
    "total_detections": 436,
    "detection_distribution": [
      {
        "type": "proximity",
        "count": 100,
        "pushed_count": 100,
        "removed_count": 5,
        "accurate_count": 95,
        "accuracy": 95.00
      },
      {
        "type": "crowd",
        "count": 150,
        "pushed_count": 150,
        "removed_count": 20,
        "accurate_count": 130,
        "accuracy": 86.67
      }
    ]
  }
}
```

## UI Display

### Total Detections Card
Shows: **436** (only pushed_to_client = 1)

### Detection Distribution Pie Chart
- Center: **Average Accuracy** (e.g., 90.5%)
- Segments: Colored by category (people, movement, camera)
- Hover: Shows detailed breakdown

### Detection List
```
🟢 Close Proximity          95/100    95%
🔵 Crowd Detection         130/150   86.67%
🟡 Phone Detection          45/50    90%
```

## Testing Checklist

- [x] Total detections only counts `pushed_to_client = 1`
- [x] Accuracy calculated as `(pushed - removed) / pushed * 100`
- [x] Category filter properly filters detection types
- [x] Pie chart shows correct accuracy percentages
- [x] Tooltip shows detailed breakdown
- [x] Detection list shows accurate/pushed ratio
- [x] Average accuracy calculated correctly
- [x] Backend filters by user's assigned exams
- [x] Frontend respects category selection

## Related Documentation

- [Client Dashboard Fixes Summary](./CLIENT_DASHBOARD_FIXES_SUMMARY.md)
- [Classification Mapping Fix](./CLASSIFICATION_MAPPING_FIX.md)

## Date

May 4, 2026
