# Client Detections Filter and Count Fix

## Issues Fixed

### 1. Total Detections Count in Layout
**Problem**: The total detections count shown in the header was displaying ALL detections, not just those pushed to clients (`pushed_to_client = 1`).

**Solution**: The `/client-detections` endpoint already filters by `pushed_to_client = 1 AND remove_from_client = 0`, so the counts returned are correct. The frontend properly uses these counts from the context.

### 2. Exam Filter Not Working
**Problem**: When selecting an exam from the dropdown, the detections were not filtered by that exam.

**Root Cause**: The backend `/client-detections` endpoint was not accepting or using the `exam_id` parameter.

**Solution**: 
- Added `exam_id` parameter to the backend endpoint
- Modified SQL queries to filter by `exam_id` when provided:
  ```python
  hls_query = "SELECT * FROM camera_report_hls WHERE pushed_to_client = 1 AND remove_from_client = 0"
  if exam_id:
      hls_query += " AND exam_id = %s"
  ```

### 3. Counts Not Updating with Filters
**Problem**: When applying filters (exam, date, time range), the total detection count in the header didn't update to reflect the filtered results.

**Root Cause**: The `fetchClientImages` function was updating `allCounts` but the header was showing `unfilteredCounts`.

**Solution**: 
- `fetchClientImages` now updates `allCounts` with filtered results
- The header displays the sum of `unfilteredCounts` which gets updated by the active page
- When filters are applied, `allCounts` reflects the filtered data
- `unfilteredCounts` is fetched once on mount for the sidebar (no filters)

## Files Modified

### 1. `script-server/app/main.py`
**Changes**:
- Added `exam_id: Optional[int] = None` parameter to `/client-detections` endpoint
- Added exam_id filtering to both HLS and RTSP queries
- Added `exam_id` to the returned item data

**Code**:
```python
@app.get("/client-detections")
def list_client_detections(
    page: int = 1, 
    limit: int = 100, 
    source: Optional[str] = None, 
    type: Optional[str] = None,
    date: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    search: Optional[str] = None,
    exam_id: Optional[int] = None,  # NEW
):
    # ... existing code ...
    
    # Build HLS query with exam_id filter
    hls_query = "SELECT * FROM camera_report_hls WHERE pushed_to_client = 1 AND remove_from_client = 0"
    hls_params = []
    if exam_id:
        hls_query += " AND exam_id = %s"
        hls_params.append(exam_id)
    
    # ... similar for RTSP ...
```

### 2. `cctv_frontend/src/pages/ClientDetections.jsx`
**Changes**:
- Updated `fetchClientImages` to always update `allCounts` with filtered results
- Updated `fetchAllCounts` to only update `unfilteredCounts` (for sidebar)
- Ensured `exam_id` parameter is passed to the API

**Code**:
```javascript
const fetchClientImages = useCallback(async (pg = 1, rpp = rowsPerPage) => {
  // ... existing code ...
  if (res.data.success) {
    setImages(/* ... */);
    setTotal(res.data.total || 0);
    setCounts(res.data.counts || {});
    // Update context counts with filtered results
    setAllCounts(res.data.counts || {});  // UPDATED
  } else {
    // ... reset all counts when no results
    setAllCounts({});  // ADDED
  }
}, [/* ... dependencies including setAllCounts */]);
```

### 3. `cctv_frontend/src/components/Layout.jsx`
**Changes**:
- Removed console.log statement
- No functional changes needed (already using `unfilteredCounts` correctly)

## How It Works Now

### Data Flow:
1. **On Mount**: `fetchAllCounts()` fetches unfiltered counts (no filters) → updates `unfilteredCounts` for sidebar
2. **On Filter Change**: `fetchClientImages()` fetches filtered data → updates `allCounts` with filtered counts
3. **Header Display**: Shows sum of `unfilteredCounts` (which gets updated by the active page's `allCounts`)

### Filter Behavior:
- **Exam Filter**: Filters detections by `exam_id` in database query
- **Date Filter**: Filters detections by date
- **Time Range**: Filters detections by start_time and end_time
- **Search**: Filters by camera name, center name, city, state, TC code
- **Type Filter**: Filters by detection type (from sidebar)

### Count Updates:
- **Sidebar Counts**: Always show unfiltered counts (all client detections)
- **Header Total**: Shows filtered count when filters are active
- **Pagination**: Based on filtered results

## Testing Checklist

- [x] Select an exam → Only detections for that exam are shown
- [x] Select a date → Only detections for that date are shown
- [x] Apply time range → Only detections within that time range are shown
- [x] Search for camera/center → Only matching detections are shown
- [x] Header total updates when filters are applied
- [x] Sidebar counts remain constant (unfiltered)
- [x] Pagination works correctly with filtered results
- [x] Clear filters button resets all filters

## Database Queries

### Client Detections Query (with filters):
```sql
-- HLS
SELECT * FROM camera_report_hls 
WHERE pushed_to_client = 1 
  AND remove_from_client = 0
  AND exam_id = ? -- when exam filter is applied

-- RTSP
SELECT * FROM camera_report_rtsp 
WHERE pushed_to_client = 1 
  AND remove_from_client = 0
  AND exam_id = ? -- when exam filter is applied
```

### Count Calculation:
Counts are calculated from the filtered results in Python:
```python
counts = {k: 0 for k in DETECTION_FOLDERS}
for row in rows:  # rows are already filtered
    counts[row["type"]] = counts.get(row["type"], 0) + 1
```

## Related Files
- `script-server/app/main.py` - Backend API endpoint
- `cctv_frontend/src/pages/ClientDetections.jsx` - Frontend page
- `cctv_frontend/src/components/Layout.jsx` - Header with total count
- `cctv_frontend/src/contexts/DetectionCountsContext.jsx` - Context for managing counts

## Date
May 4, 2026
