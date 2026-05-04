# Executions Date Filter Fix

## Issue
The executions page was fetching ALL executions for an exam without any date filtering. When the page loaded, it should automatically show executions for today (if today is within the exam date range) or the last exam date, but it was showing all executions regardless of date.

## Root Cause
1. **Backend**: The `/api/executions` endpoint didn't accept or filter by `assignment_date` parameter
2. **Frontend**: All filtering (date, status) was done client-side after fetching all data
3. **No Auto-Selection**: The page didn't automatically select today's date or the last exam date on load

## Solution

### Backend Changes (`cctv_backend/src/controllers/ExecutionController.js`)

Added `assignment_date` parameter to the `getAll` method:

```javascript
exports.getAll = async (req, res) => {
    const {
        status,
        script_id,
        shift_id,
        exam_id,
        assignment_date,  // NEW
        limit,
        offset,
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (script_id) where.script_id = parseInt(script_id);
    if (shift_id) where.shift_id = parseInt(shift_id);
    if (assignment_date) where.assignment_date = assignment_date;  // NEW
    
    // ... rest of the code
};
```

### Frontend Changes (`cctv_frontend/src/pages/Executions.jsx`)

#### 1. Updated `loadExecutions` to Pass Filters to Backend

```javascript
const loadExecutions = useCallback(async () => {
  if (!selectedExamId) { setExecutions([]); return; }
  setLoading(true);
  try {
    const params = { limit: 200, exam_id: selectedExamId };
    
    // Add date filter if selected
    if (selectedDate) {
      params.assignment_date = selectedDate;
    }
    
    // Add status filter if not 'ALL'
    if (statusFilter && statusFilter !== 'ALL') {
      params.status = statusFilter;
    }
    
    const res = await executionsAPI.getAll(params);
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    setExecutions(list);
  } catch (e) {
    console.error('loadExecutions:', e);
    setExecutions([]);
  } finally {
    setLoading(false);
  }
}, [selectedExamId, selectedDate, statusFilter]);
```

#### 2. Auto-Select Date on Exam Change

```javascript
useEffect(() => { 
  const fetchInitialData = async () => {
    if (!selectedExamId) { 
      setExecutions([]); 
      setSelectedDate(''); 
      setStatusFilter('ALL'); 
      return; 
    }
    
    setLoading(true);
    try {
      // Fetch all executions for this exam to get available dates
      const res = await executionsAPI.getAll({ limit: 200, exam_id: selectedExamId });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      
      // Get unique dates from executions
      const dates = [...new Set(list.map((e) => e.assignment_date).filter(Boolean))].sort((a, b) => new Date(b) - new Date(a));
      
      if (dates.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        
        // Get exam details to check date range
        const selectedExam = exams.find((e) => String(e.id) === String(selectedExamId));
        
        if (selectedExam && selectedExam.start_date && selectedExam.end_date) {
          const startDate = new Date(selectedExam.start_date);
          const endDate = new Date(selectedExam.end_date);
          const todayDate = new Date(today);
          
          // If today is within exam range and has executions, select today
          if (todayDate >= startDate && todayDate <= endDate && dates.includes(today)) {
            setSelectedDate(today);
          } else {
            // Otherwise select the last date (most recent)
            setSelectedDate(dates[0]);
          }
        } else {
          // No exam date range, select today if available, otherwise last date
          setSelectedDate(dates.includes(today) ? today : dates[0]);
        }
      } else {
        setSelectedDate('');
      }
      
      setStatusFilter('ALL');
    } catch (e) {
      console.error('fetchInitialData:', e);
      setExecutions([]);
      setSelectedDate('');
      setStatusFilter('ALL');
    } finally {
      setLoading(false);
    }
  };
  
  fetchInitialData();
}, [selectedExamId, exams]);
```

#### 3. Reload When Filters Change

```javascript
/* Reload executions when date or status filter changes */
useEffect(() => {
  if (selectedDate || statusFilter !== 'ALL') {
    loadExecutions();
  }
}, [selectedDate, statusFilter, loadExecutions]);
```

#### 4. Simplified Client-Side Filtering

Now only search filter is done client-side (for better UX), while date and status are backend-filtered:

```javascript
const visibleRows = useMemo(() => {
  let filtered = executions;

  // Search filter (client-side for better UX)
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter((e) => {
      const haystack = [
        e.script?.name,
        e.shift?.shift_name,
        e.status,
        String(e.id),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  // Apply sorting
  if (orderBy) {
    // ... sorting logic
  }

  return filtered;
}, [executions, searchQuery, orderBy, order]);
```

## How It Works Now

### Initial Load Flow:
1. User selects an exam from sidebar
2. Frontend fetches ALL executions for that exam (no date filter)
3. Extracts unique dates from results
4. Checks if today is within exam date range:
   - **If yes and today has executions**: Auto-select today
   - **If no or today has no executions**: Auto-select the most recent date (last date)
5. Fetches executions again with the selected date filter

### Filter Flow:
1. User changes date or status filter
2. Frontend calls API with filters: `{ exam_id, assignment_date, status }`
3. Backend filters in SQL query
4. Frontend receives only filtered results
5. Client-side search filter is applied for instant feedback

### Benefits:
- ✅ **Reduced Data Transfer**: Only relevant executions are fetched
- ✅ **Better Performance**: Database filtering is faster than client-side
- ✅ **Auto-Selection**: Smart date selection based on exam range
- ✅ **Consistent UX**: Always shows relevant data on load

## API Endpoint

### GET `/api/executions`

**Query Parameters**:
- `exam_id` (required): Filter by exam ID
- `assignment_date` (optional): Filter by assignment date (YYYY-MM-DD)
- `status` (optional): Filter by status (SCHEDULED, PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)
- `script_id` (optional): Filter by script ID
- `shift_id` (optional): Filter by shift ID
- `limit` (optional): Limit results (default: 100)
- `offset` (optional): Offset for pagination (default: 0)

**Example Requests**:
```bash
# Get all executions for exam 19
GET /api/executions?exam_id=19&limit=200

# Get executions for exam 19 on a specific date
GET /api/executions?exam_id=19&assignment_date=2026-05-04

# Get running executions for exam 19 on a specific date
GET /api/executions?exam_id=19&assignment_date=2026-05-04&status=RUNNING
```

**Response**:
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": 123,
      "status": "COMPLETED",
      "assignment_date": "2026-05-04",
      "started_at": "2026-05-04T09:00:00.000Z",
      "completed_at": "2026-05-04T12:00:00.000Z",
      "script": {
        "id": 5,
        "name": "Crowd Detection",
        "script_id": "crowd"
      },
      "shift": {
        "id": 10,
        "shift_name": "Morning Shift",
        "start_time": "09:00:00",
        "end_time": "12:00:00",
        "exam_id": 19
      }
    }
  ]
}
```

## Testing Checklist

- [x] Select an exam → Auto-selects today (if in range) or last date
- [x] Change date filter → Only shows executions for that date
- [x] Change status filter → Only shows executions with that status
- [x] Search for script/shift → Filters results instantly (client-side)
- [x] Running executions → Auto-refreshes every 10 seconds
- [x] Sort by columns → Works correctly with filtered data
- [x] Switch exams → Resets filters and auto-selects date

## Files Modified

1. **Backend**:
   - `cctv_backend/src/controllers/ExecutionController.js` - Added `assignment_date` filter

2. **Frontend**:
   - `cctv_frontend/src/pages/Executions.jsx` - Updated filtering logic and auto-selection

## Related Files
- `cctv_backend/src/routes/executions.js` - Routes definition
- `cctv_frontend/src/services/api.js` - API client

## Date
May 4, 2026
