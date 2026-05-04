# Category Filtering Fix for Detection Distribution

## Issue
The category dropdown (People/Movement/Camera) in the Detection Distribution pie chart was not filtering detection types correctly. When selecting a category, the chart would still show all detections instead of only those belonging to the selected category.

## Root Cause
The database stores detection types as **folder names** (e.g., `crowd_detection`, `phone_detection`, `proximity_detection`) which are set by the detection worker scripts when calling `report_to_db_hls()`. However, the frontend's `SCRIPT_CATEGORY_MAP` only had mappings for **script IDs** (e.g., `crowd`, `phone`, `proximity`) and some incorrect folder name variations.

### Database Detection Type Values (from worker scripts)
The actual `detection_type` values stored in `camera_report_hls` and `camera_report_rtsp` tables are:

**People Category:**
- `proximity_detection` (from close_proximity_worker.py)
- `crowd_detection` (from crowd_worker.py)
- `crowd_detection_biometric` (from crowd_det_biometric_worker.py)
- `crowd_detection_threshold` (from crowd_five_det_worker.py)
- `zero_person_detection` (from crowd_zero_det_worker.py)
- `invigilator_detection` (from invigilator_worker.py)
- `phone_detection` (from phone_worker.py)
- `server_room_detection` (from server_room_worker.py)
- `intruder_detection` (from intruder_worker.py)

**Movement Category:**
- `strongroom_detection` (from strongroom_worker.py)
- `qp_box_missing` (from qp_box_det_worker.py)
- `entry_exit_detection` (from entry_exit_worker.py)

**Camera Category:**
- `camera_inversion_detection` (from camera_inversion_worker.py)
- `camera_tampering_detection` (from camera_tampering_worker.py)
- `blind_spot_detection` (from blind_spot_worker.py)
- `vision_detection` (if exists)

## Solution
Updated both `SCRIPT_CATEGORY_MAP` and `DETECTION_TYPE_LABELS` in the frontend to include the **actual folder names** used by the detection workers.

### Files Modified

1. **cctv_frontend/src/pages/ClientDetectionDashboard.jsx**
   - Updated `SCRIPT_CATEGORY_MAP` to include all actual folder names from worker scripts
   - Updated `DETECTION_TYPE_LABELS` to include all actual folder names
   - Removed console.log debugging statements

2. **cctv_frontend/src/pages/Dashboard.jsx**
   - Updated `SCRIPT_CATEGORY_MAP` to include all actual folder names from worker scripts
   - Updated `DETECTION_TYPE_LABELS` to include all actual folder names

### Category Mappings

```javascript
const SCRIPT_CATEGORY_MAP = {
  // Script IDs (from scripts table)
  proximity: 'people',
  crowd: 'people',
  crowd_biometric: 'people',
  crowd_five: 'people',
  crowd_zero: 'people',
  invigilator: 'people',
  phone: 'people',
  server: 'people',
  intruder: 'people',
  strongroom: 'movement',
  qp_box: 'movement',
  entry_exit: 'movement',
  inversion: 'camera',
  tamper: 'camera',
  tampering: 'camera',
  blind_spot: 'camera',
  vision: 'camera',
  
  // Folder names (detection_type in database) - ACTUAL VALUES FROM WORKERS
  proximity_detection: 'people',
  crowd_detection: 'people',
  crowd_detection_biometric: 'people',
  crowd_detection_threshold: 'people',
  zero_person_detection: 'people',
  invigilator_detection: 'people',
  phone_detection: 'people',
  server_room_detection: 'people',
  intruder_detection: 'people',
  strongroom_detection: 'movement',
  qp_box_missing: 'movement',
  entry_exit_detection: 'movement',
  camera_inversion_detection: 'camera',
  camera_tampering_detection: 'camera',
  blind_spot_detection: 'camera',
  vision_detection: 'camera',
};
```

## How Detection Types Are Set

Detection types are set in the worker scripts when they call `report_to_db_hls()`:

```python
# Example from crowd_worker.py
report_to_db_hls(
    ch_code=str(ch_no),
    image_name=fname,
    folder="crowd_detection"  # This becomes detection_type in database
)
```

The `folder` parameter is stored as `detection_type` in the database and used in the image URL path.

## Testing
After this fix, the category filtering should work correctly:
1. Select "People" → Shows only people-related detections (proximity, crowd, phone, etc.)
2. Select "Movement" → Shows only movement-related detections (strongroom, qp_box, entry_exit)
3. Select "Camera" → Shows only camera-related detections (inversion, tampering, blind_spot)
4. Select "All Categories" → Shows all detections

## Related Files
- `script-server/scripts/detection/utils/db_client.py` - Contains `report_to_db_hls()` function
- `script-server/scripts/detection/workers/*.py` - All worker scripts that call `report_to_db_hls()` with folder parameter
- `cctv_backend/src/controllers/ClientDashboardController.js` - Backend API that returns detection_distribution data

## Date
May 4, 2026
