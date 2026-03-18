# Blind Spot Detection - Quick Reference

## Quick Start

```bash
cd /home/suvam/projects/cctv/cctv-analytics-system/scripts/tcs
python blind_spot_det_tcs.py
```

## What It Detects

| Issue Type | Description | Alert Trigger |
|------------|-------------|---------------|
| **Edge Obstruction** | Dark/covered edges of frame | >15% of edges obstructed |
| **Partial Persons** | Persons cut off at frame edges | Any person touching edges |
| **No Movement** | Static camera (inside labs only) | <500 pixels movement for 10 frames |
| **Obstruction Patterns** | Physical obstructions, covered lens | >30% dark/bright/uniform pixels |

## Common Commands

```bash
# Run with custom settings
export TCS_BLINDSPOT_SAMPLE_EVERY=5
export TCS_BLINDSPOT_MAX_FRAMES_PER_RUN=500
python blind_spot_det_tcs.py

# Test with synthetic frames
python test_blind_spot.py --synthetic

# Test single camera
python test_blind_spot.py --url "YOUR_HLS_URL" --camera-id "cam1"

# Benchmark performance
python test_blind_spot.py --benchmark
```

## Output Locations

- **Images**: `results/tcs_detections/blind_spot_detection/`
- **Excel Report**: `cctv_classfication/results/tcs_classification/accessible_cameras_server_blind_spot_results.xlsx`

## File Naming

Format: `{camera_id}_{timestamp}_{issue_types}.jpg`

Examples:
- `Center1_Lab2_20260119_143022_edge_obst.jpg` - Edge obstruction
- `Center1_Lab2_20260119_143045_partial.jpg` - Partial person
- `Center1_Lab2_20260119_143100_static.jpg` - No movement
- `Center1_Lab2_20260119_143120_obstructed.jpg` - Physical obstruction

## Image Annotations

- 🔴 **Red boxes**: Partial persons, issues
- 🟢 **Green boxes**: Complete person detections  
- 🔴 **Red edge lines**: Obstructed edges
- ⚠️ **Warning text**: Detection alerts

## Key Thresholds

```python
EDGE_OBSTRUCTION_THRESHOLD = 0.15      # 15% edge coverage
MIN_MOVEMENT_PIXELS = 500              # Movement sensitivity
STATIC_THRESHOLD = 10                  # Consecutive static frames
CONFIDENCE_THRESHOLD = 0.4             # YOLO confidence
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No detections saved | Lower thresholds in script |
| Too many false positives | Increase threshold values |
| Slow processing | Increase `SAMPLE_EVERY` value |
| Memory issues | Reduce `MAX_CONCURRENCY` |
| Stream connection fails | Check HLS URL accessibility |

## Environment Variables

```bash
# Sampling (process every Nth frame)
export TCS_BLINDSPOT_SAMPLE_EVERY=3

# Maximum concurrent cameras
export TCS_BLINDSPOT_MAX_CONCURRENCY=4

# Maximum frames per run
export TCS_BLINDSPOT_MAX_FRAMES_PER_RUN=1000

# Worker pool settings
export TCS_USE_WORKER_POOL=true
export TCS_WORKER_COUNT=8
export TCS_POOL_COOLDOWN_SEC=0.5
```

## Detection Algorithm Flow

```
1. Load camera configurations from Excel
2. For each camera:
   a. Extract HLS streaming URL
   b. Validate stream accessibility
   c. Process frames (sample every Nth)
   d. Run 4 detection algorithms:
      - Edge obstruction check
      - Partial person detection (YOLO)
      - Movement analysis (if inside lab)
      - Obstruction pattern detection
   e. Annotate and save frames with issues
   f. Update statistics
3. Save results to Excel
```

## Dependencies

- OpenCV (`cv2`)
- NumPy
- Pandas
- YOLO (`ultralytics`)
- Requests

## Model Requirements

- **Path**: `models/yolov10m.pt`
- **Type**: YOLOv10 Medium
- **Purpose**: Person detection for partial person analysis

## Integration Points

- **TCS Scheduler**: Camera slot management, frame sampling
- **TCS HLS Utils**: Stream extraction and handling
- **Excel I/O**: Configuration input, results output

## Performance Tips

1. **Increase sampling rate** for faster processing:
   ```bash
   export TCS_BLINDSPOT_SAMPLE_EVERY=10  # Process every 10th frame
   ```

2. **Enable worker pool** for multiple cameras:
   ```bash
   export TCS_USE_WORKER_POOL=true
   export TCS_WORKER_COUNT=4
   ```

3. **Limit frames** for quick tests:
   ```bash
   export TCS_BLINDSPOT_MAX_FRAMES_PER_RUN=100
   ```

## Expected Performance

- **Frame Processing**: ~10-15 FPS (with YOLO)
- **Frame Processing**: ~30-40 FPS (without YOLO)
- **Memory Usage**: ~500MB per camera stream
- **CPU Usage**: 20-30% per camera (with sampling)

## Success Indicators

✅ Cameras processing successfully  
✅ Issues detected and saved  
✅ Excel report updated  
✅ Logs showing frame progress  
✅ Detection images in output folder

## Common Issues

### Issue: "YOLO not available"
**Solution**: Install ultralytics
```bash
pip install ultralytics
```

### Issue: "Failed to open HLS stream"
**Solution**: Check URL and network connectivity
```bash
curl -I "your-stream-url.m3u8"
```

### Issue: "Too many detections"
**Solution**: Adjust thresholds in `blind_spot_det_tcs.py`:
```python
EDGE_OBSTRUCTION_THRESHOLD = 0.25  # More lenient
MIN_MOVEMENT_PIXELS = 1000         # Less sensitive
```

## Support Files

- `blind_spot_det_tcs.py` - Main detection script
- `test_blind_spot.py` - Testing utilities
- `BLIND_SPOT_DETECTION_README.md` - Full documentation
- `tcs_hls_utils.py` - HLS stream utilities
- `tcs_scheduler.py` - Scheduling and concurrency

---

**Last Updated**: January 19, 2026  
**Version**: 1.0
