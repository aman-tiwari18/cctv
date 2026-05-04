# Classification Mapping Fix - May 2026

## Problem Summary

Detection scripts were loading 0 cameras despite 118 cameras being present in the database. The issue was a mismatch between the expected classification values in the code and the actual classification values stored in the database.

## Root Cause

The `SCRIPT_CLASSIFICATION_MAP` in `camera_loader.py` was using incorrect classification values that didn't match the actual database values:

### Old (Incorrect) Classifications:
```python
"intruder":        ["strong room", "strongroom", "strong_room"]
"invigilator":     ["inside classroom", "inside_classroom", "classroom"]
"phone":           ["inside classroom", "inside_classroom", "classroom"]
"proximity":       ["inside classroom", "inside_classroom", "classroom"]
"crowd_zero":      ["inside classroom", "inside_classroom", "classroom"]
"crowd_five":      ["inside classroom", "inside_classroom", "classroom"]
```

### Actual Database Classifications:
- Computer Lab
- Entry
- Outdoor Scene
- Outside Area
- Parking Lot
- Server Room
- Uncertain/Obstructed
- Inside Lab / Server room
- Inside Lab
- Entry/Exit
- Outside/Biometric Area
- Inside Server room
- Outside (Crowd at entry/ exit gate)
- Inside Lab/Server room/Outside

## Solution

Updated `SCRIPT_CLASSIFICATION_MAP` in `script-server/scripts/detection/utils/camera_loader.py` to match actual database values:

```python
SCRIPT_CLASSIFICATION_MAP = {
    # 1. Intruder detection in exam lab and server room
    "intruder":        ["inside lab", "server room", "inside lab / server room", 
                        "inside server room", "inside lab/server room/outside"],
    
    # 3. Crowd Detection - More than 10 people at entry gate
    "crowd":           ["entry", "entry/exit", "outside/biometric area", 
                        "outside (crowd at entry/ exit gate)"],
    "crowd_biometric": ["entry", "entry/exit", "outside/biometric area", 
                        "outside (crowd at entry/ exit gate)"],
    
    # 4. Invigilator Not Moving in exam room or not moving in all lanes
    "invigilator":     ["inside lab", "computer lab"],
    
    # 5. Two or More People in Close Proximity
    "proximity":       ["inside lab", "computer lab"],
    
    # 6. Server Room Threshold - More than or equal to the limit
    "server":          ["server room", "inside lab / server room", "inside server room"],
    
    # 7. Mobile Phone Detection
    "phone":           ["inside lab", "computer lab", "inside server room"],
    
    # 8. Movement at entry/exit during examination
    "entry_exit":      ["entry", "entry/exit", "outside (crowd at entry/ exit gate)"],
    
    # 9. Camera feed is inverted
    "inversion":       ["all"],
    
    # 10. 0 candidate in a room
    "crowd_zero":      ["inside lab", "computer lab"],
    
    # 11. Less than 5 candidates in a room
    "crowd_five":      ["inside lab", "computer lab"],
    
    # 12. Blind Spot detected inside lab
    "blind_spot":      ["inside lab", "computer lab"],
    
    # Camera tampering (all cameras)
    "tamper":          ["all"],
    
    # Strong room related
    "strongroom":      ["server room", "inside lab / server room", "inside server room"],
    "qp_box":          ["server room", "inside lab / server room", "inside server room"],
}
```

## Additional Fixes

### 1. Camera Accessibility Status Check

**File:** `cctv_backend/src/controllers/ClientDashboardController.js`

**Problem:** Camera accessibility was checking for `status === 'active' || status === 'online'`, but the database uses `status === 'accessible'`.

**Fix:**
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

### 2. Detection Distribution Query

**Problem:** Detection distribution was trying to filter exams by `link_type` field before querying, which was unnecessary and caused issues.

**Fix:** Simplified to query all user's exams directly:
```javascript
// Query HLS detections for user's exams
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

// Query RTSP detections for user's exams
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

## Analytics to Classification Mapping

Based on the SOP document provided:

| Sr. No. | Analytics | Camera Type | Script Code | Classifications |
|---------|-----------|-------------|-------------|-----------------|
| 1 | Intruder detection in exam lab and server room | Inside Lab / Server room | `intruder` | inside lab, server room, inside lab / server room, inside server room |
| 2 | Improper furniture | Inside Lab | - | inside lab |
| 3 | Crowd Detection - More than 10 people at entry gate | Entry/Exit, Outside/Biometric Area | `crowd`, `crowd_biometric` | entry, entry/exit, outside/biometric area, outside (crowd at entry/ exit gate) |
| 4 | Invigilator Not Moving | Inside Lab | `invigilator` | inside lab, computer lab |
| 5 | Two or More People in Close Proximity | Inside Lab | `proximity` | inside lab, computer lab |
| 6 | Server Room Threshold | Server Room | `server` | server room, inside lab / server room, inside server room |
| 7 | Mobile Phone Detection | Inside Lab, Inside Server room | `phone` | inside lab, computer lab, inside server room |
| 8 | Movement at entry/exit during examination | Outside (Crowd at entry/ exit gate) | `entry_exit` | entry, entry/exit, outside (crowd at entry/ exit gate) |
| 9 | Camera feed is inverted | Inside Lab/Server room/Outside | `inversion` | all |
| 10 | 0 candidate in a room | Inside Lab | `crowd_zero` | inside lab, computer lab |
| 11 | Less than 5 candidates in a room | Inside Lab | `crowd_five` | inside lab, computer lab |
| 12 | Blind Spot detected inside lab | Inside Lab | `blind_spot` | inside lab, computer lab |

## Files Modified

1. **script-server/scripts/detection/utils/camera_loader.py**
   - Updated `SCRIPT_CLASSIFICATION_MAP` with correct database values
   - Added comments mapping to SOP document

2. **cctv_backend/src/controllers/ClientDashboardController.js**
   - Fixed camera accessibility status check (accessible vs active/online)
   - Simplified detection distribution query
   - Ensured `link_type` field is included in exam queries

## Testing

After applying these fixes, the detection scripts should now:

1. ✅ Load cameras correctly based on their classification
2. ✅ Show accurate camera accessibility counts (accessible vs non-accessible)
3. ✅ Display detection counts filtered by user's assigned exams
4. ✅ Download camera accessibility reports with correct status filtering

## Verification Steps

1. Check script logs to confirm cameras are being loaded:
   ```
   [CameraLoader] Loaded X cameras (script=intruder, link_type=RTSP, exam_id=20, shift_id=100)
   ```

2. Verify camera accessibility dashboard shows correct counts

3. Confirm detection distribution shows only user's exam data

4. Test camera accessibility download for all three types:
   - Accessible cameras
   - Non-accessible cameras
   - All cameras

## Notes

- All classification matching is **case-insensitive** (uses `.lower()`)
- Scripts with `["all"]` classification will process all cameras regardless of classification
- The `_camera_matches_script()` function returns `True` if classification is `None` or empty (default behavior)

## Related Issues

- Detection scripts showing "No cameras to process" despite cameras in database
- Camera accessibility showing incorrect counts
- Client dashboard not filtering by user's assigned exams

## Date

May 4, 2026
