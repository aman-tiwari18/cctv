# TCS Blind Spot Detection System

## Overview
The Blind Spot Detection System identifies camera coverage issues and placement problems in TCS CCTV streams. It helps ensure optimal camera positioning and complete surveillance coverage.

## Features

### 1. Edge Obstruction Detection
- Detects dark or obstructed regions at frame edges
- Identifies if camera lens is partially covered
- Checks all four edges (top, bottom, left, right)
- **Threshold**: 15% edge obstruction triggers alert

### 2. Partial Person Detection
- Identifies candidates/persons cut off at frame edges
- Detects if seats are only partially visible
- Uses YOLO object detection for person recognition
- Highlights partial vs. complete person detections
- **Threshold**: Any person touching frame margin (5%)

### 3. Movement Detection (Inside Lab Cameras)
- Monitors for lack of movement in inside lab cameras
- Tracks movement history over 100 frames
- Flags cameras as static if no movement detected
- **Threshold**: <500 pixels movement for 10 consecutive frames

### 4. Obstruction Pattern Detection
- Identifies unusual darkness (>30% dark pixels)
- Detects overexposure/washed out frames (>30% bright pixels)
- Flags uniform textureless regions (may indicate physical obstruction)
- Checks for covered lenses or incorrect positioning

## Installation

### Prerequisites
```bash
# Ensure you have Python 3.8+ and required dependencies
pip install opencv-python numpy pandas ultralytics requests
```

### Model Requirements
- YOLO model: `models/yolov10m.pt` (automatically loaded)
- Location: `/home/suvam/projects/cctv/cctv-analytics-system/models/`

## Usage

### Basic Execution
```bash
cd /home/suvam/projects/cctv/cctv-analytics-system/scripts/tcs
python blind_spot_det_tcs.py
```

### With Environment Variables
```bash
# Set sampling rate (process every Nth frame)
export TCS_BLINDSPOT_SAMPLE_EVERY=3

# Set maximum concurrent cameras
export TCS_BLINDSPOT_MAX_CONCURRENCY=4

# Set maximum frames per camera run
export TCS_BLINDSPOT_MAX_FRAMES_PER_RUN=1000

# Use worker pool for better resource management
export TCS_USE_WORKER_POOL=true
export TCS_WORKER_COUNT=8
export TCS_POOL_COOLDOWN_SEC=0.5

# Run the script
python blind_spot_det_tcs.py
```

## Configuration

### Input Data
- **Excel File**: `cctv_classfication/results/tcs_classification/accessible_cameras_server.xlsx`
- **Required Columns**:
  - `CCTV URL`: HLS streaming URL
  - `TC NAME` or `Center Name`: Center identifier
  - `Camera Name` or `Camera Location`: Camera identifier
  - `Scene Classification` (optional): Camera type classification

### Output Location
- **Detection Results**: `results/tcs_detections/blind_spot_detection/`
- **Excel Report**: `accessible_cameras_server_blind_spot_results.xlsx`

### Detection Thresholds

| Parameter | Default | Description |
|-----------|---------|-------------|
| `EDGE_OBSTRUCTION_THRESHOLD` | 0.15 | 15% of edges must be obstructed |
| `PARTIAL_DETECTION_THRESHOLD` | 0.3 | Minimum visibility for complete person |
| `MIN_MOVEMENT_PIXELS` | 500 | Minimum pixel change for movement |
| `MOVEMENT_HISTORY_FRAMES` | 100 | Frames to track movement history |
| `STATIC_THRESHOLD` | 10 | Consecutive static frames threshold |
| `CONFIDENCE_THRESHOLD` | 0.4 | YOLO detection confidence |

## Output Format

### Saved Images
Format: `{camera_id}_{timestamp}_{issue_types}.jpg`

Example: `Center1_Camera5_20260119_143022_edge_obst_partial.jpg`

Issue types:
- `edge_obst`: Edge obstruction detected
- `partial`: Partial person detected
- `static`: No movement (inside lab only)
- `obstructed`: Obstruction pattern detected

### Image Annotations
- **Red boxes**: Partial persons or obstructions
- **Green boxes**: Complete person detections
- **Red edge rectangles**: Obstructed edges
- **Text overlays**: Detection statistics and warnings

### Excel Report Columns
- `Blind Spot - Edge Obstruction`: Count of edge obstruction detections
- `Blind Spot - Partial Persons`: Count of partial person detections
- `Blind Spot - No Movement`: Count of static/no-movement detections
- `Blind Spot - Obstructions`: Count of obstruction pattern detections

## Algorithm Details

### 1. Edge Obstruction Algorithm
```python
For each edge (top, bottom, left, right):
    - Extract 10% edge region
    - Calculate mean intensity (darkness check)
    - Calculate standard deviation (uniformity check)
    - Flag if mean < 30 OR std < 15
    - Sum obstruction percentages
    - Alert if total >= 15%
```

### 2. Partial Person Detection
```python
For each detected person:
    - Get bounding box coordinates
    - Check if box touches frame edges (within 5% margin)
    - Flag as partial if any edge contact
    - Categorize: partial (red) vs complete (green)
```

### 3. Movement Detection
```python
For each frame:
    - Convert to grayscale
    - Calculate absolute difference from previous frame
    - Threshold difference (threshold=25)
    - Count movement pixels
    - Track in rolling history (100 frames)
    - Flag if movement < 500 pixels for 10 consecutive frames
```

### 4. Obstruction Pattern Detection
```python
Analyze frame:
    - Check darkness: >30% pixels with intensity < 30
    - Check brightness: >30% pixels with intensity > 220
    - Check uniformity: std deviation < 20
    - Flag if any condition met
```

## HLS Stream Support

The script fully supports TCS HLS streaming links:

1. **Automatic URL Extraction**: Extracts .m3u8 URLs from initial TCS URLs
2. **Stream Validation**: Tests stream accessibility before processing
3. **Robust Connection**: Handles HLS stream reconnection
4. **Multi-Camera**: Concurrent processing of multiple HLS streams

## Performance Optimization

### Sampling Strategy
- Default: Process every 3rd frame
- Reduces computational load by 67%
- Maintains detection accuracy

### Worker Pool Mode
- Enables parallel processing
- Manages resource allocation
- Configurable worker count
- Built-in cooldown periods

### Memory Management
- Rolling window for movement history (100 frames)
- Periodic cleanup of processed frames
- Efficient YOLO model sharing

## Troubleshooting

### No YOLO Model Found
```bash
# Download YOLOv10 model
cd /home/suvam/projects/cctv/cctv-analytics-system/models
# Place yolov10m.pt in this directory
```

### HLS Stream Connection Failed
```bash
# Check URL accessibility
curl -I "https://your-hls-stream-url.m3u8"

# Verify network connectivity
ping streaming-server.com
```

### High False Positive Rate
```python
# Adjust thresholds in the script
EDGE_OBSTRUCTION_THRESHOLD = 0.20  # More lenient (default: 0.15)
MIN_MOVEMENT_PIXELS = 1000  # Less sensitive (default: 500)
```

## Integration with TCS System

### Scheduler Integration
```python
from tcs_scheduler import camera_slot, frame_should_process

# Uses TCS scheduling system for:
# - Camera slot management
# - Frame sampling
# - Concurrency control
# - Worker pool coordination
```

### HLS Utils Integration
```python
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

# Leverages:
# - URL extraction from TCS links
# - Stream validation
# - OpenCV HLS stream handling
```

## Example Detection Scenarios

### Scenario 1: Partially Covered Lens
**Detection**: Edge obstruction (left edge)
**Cause**: Camera mounting bracket partially covering lens
**Visual**: Red rectangle on left edge, high obstruction percentage

### Scenario 2: Candidates Out of Frame
**Detection**: Partial persons at frame edges
**Cause**: Camera angle too narrow or incorrect positioning
**Visual**: Red boxes on persons touching frame edges

### Scenario 3: Static Camera in Lab
**Detection**: No movement for extended period
**Cause**: Camera frozen, disconnected, or pointing at empty area
**Visual**: "WARNING: NO MOVEMENT" overlay

### Scenario 4: Physical Obstruction
**Detection**: Obstruction pattern (dark/uniform)
**Cause**: Object placed in front of camera, dust on lens
**Visual**: "OBSTRUCTION: Dark/Covered" message

## Best Practices

1. **Regular Monitoring**: Run daily to catch camera positioning issues early
2. **Review Saved Images**: Manually verify flagged issues
3. **Threshold Tuning**: Adjust based on environment (lighting, camera types)
4. **Inside Lab Classification**: Ensure cameras are correctly classified
5. **Results Analysis**: Review Excel report for trends across cameras

## Command Line Options

Currently configured via environment variables. Future versions may include CLI arguments:

```bash
# Planned feature
python blind_spot_det_tcs.py \
    --sample-every 5 \
    --max-concurrent 4 \
    --max-frames 2000 \
    --output-dir custom_output/
```

## Logging

Logs are output to console with the following levels:

- **INFO**: Normal operation, frame processing progress
- **WARNING**: Blind spot issues detected, saved to disk
- **ERROR**: Stream connection failures, processing errors

Example log output:
```
2026-01-19 12:35:22 - INFO - [Camera123] Blind spot detection started @ 25.0 FPS (Inside Lab: True)
2026-01-19 12:35:45 - WARNING - [Camera123] Blind spot issue detected - saved: results/.../Camera123_20260119_123545_partial.jpg
2026-01-19 12:36:00 - INFO - [Camera123] Processed 100 frames. Issues: Edge=2, Partial=5, Static=0, Obstructed=1
```

## Future Enhancements

- [ ] Real-time alerting system
- [ ] Historical trend analysis
- [ ] Automatic camera angle correction suggestions
- [ ] Machine learning-based blind spot prediction
- [ ] Integration with SMS/email notifications
- [ ] Web dashboard for visualization
- [ ] Confidence scoring for each detection type

## Support

For issues or questions:
1. Check logs for error messages
2. Verify Excel file format and columns
3. Ensure HLS streams are accessible
4. Review threshold configurations

## License

Part of the CCTV Analytics System project.
