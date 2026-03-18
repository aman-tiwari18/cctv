# TCS Detection Scripts

This folder contains all detection scripts compatible with TCS HLS streaming links.

## Available Scripts (All 7 Detection Types)

### 1. **phone_det_tcs.py** - Phone Detection
- **Target Scenes**: Computer Lab, Server Room
- **Function**: Detects mobile phones in exam halls
- **Cooldown**: 7 minutes between saves
- **Results**: `results/tcs_detections/phone_detection/`

### 2. **crowd_det_tcs.py** - Crowd Detection
- **Target Scenes**: Outdoor Scene, Outside area, Parking Lot, Entry
- **Function**: Detects crowds (10+ people)
- **Cooldown**: 2 minutes between saves
- **Results**: `results/tcs_detections/crowd_detection/`

### 3. **close_proximity_tcs.py** - Close Proximity Detection
- **Target Scenes**: Computer Lab, Server Room
- **Function**: Detects people in close proximity (<100 pixels)
- **Cooldown**: 2 minutes between saves
- **Results**: `results/tcs_detections/proximity_detection/`

### 4. **entry_exit_det_tcs.py** - Entry/Exit Detection
- **Target Scenes**: Entry, Outside area
- **Function**: Tracks people crossing entry/exit lines
- **Cooldown**: 1 minute between saves
- **Results**: `results/tcs_detections/entry_exit_detection/`

### 5. **server_room_det_tcs.py** - Server Room Monitoring
- **Target Scenes**: Server Room
- **Function**: Detects unauthorized access to server rooms
- **Cooldown**: 5 minutes between saves
- **Results**: `results/tcs_detections/server_room_detection/`

### 6. **invigilator_tracking_tcs.py** - Invigilator Tracking
- **Target Scenes**: Computer Lab
- **Function**: Tracks invigilator movement, detects static behavior
- **Cooldown**: 3 minutes between saves
- **Results**: `results/tcs_detections/invigilator_tracking/`

### 7. **intruder_det_tcs.py** - Intruder Detection
- **Target Scenes**: Outdoor Scene, Outside area, Parking Lot, Entry
- **Function**: Detects intruders during restricted hours (10 PM - 6 AM)
- **Cooldown**: 30 seconds (critical alerts)
- **Results**: `results/tcs_detections/intruder_detection/`

## TCS HLS Stream Handling

All TCS scripts use **tcs_hls_utils.py** for HLS stream processing:

### Two-Step Process:
1. **Extract HLS URL**: Initial CCTV URL → .m3u8 streaming URL
2. **Stream Processing**: Captured .m3u8 URL used for video analysis

### Key Functions:
- `extract_hls_streaming_url()` - Extract .m3u8 from TCS URL
- `test_hls_stream()` - Verify stream accessibility
- `open_hls_stream()` - Open stream for continuous reading
- `capture_frame_from_hls()` - Capture single frame (OpenCV + FFmpeg fallback)

## Configuration

All scripts read camera configuration from:
```
cctv_classfication/results/tcs_classification/accessible_cameras_20251230_174822.xlsx
```

### Required Columns:
- **CCTV URL** - Initial TCS streaming URL
- **Center Name** - Exam center name
- **Camera Location** - Camera location description
- **Scene Classification** (optional) - Camera scene type

## Usage

### Run Individual Scripts:
```bash
cd scripts/tcs

# Phone detection
python phone_det_tcs.py

# Crowd detection
python crowd_det_tcs.py

# Close proximity
python close_proximity_tcs.py

# Entry/Exit
python entry_exit_det_tcs.py

# Server room monitoring
python server_room_det_tcs.py

# Invigilator tracking
python invigilator_tracking_tcs.py

# Intruder detection
python intruder_det_tcs.py
```

### Run All Scripts (Parallel):
```bash
# Create a script to run all in background
for script in phone_det_tcs.py crowd_det_tcs.py close_proximity_tcs.py entry_exit_det_tcs.py server_room_det_tcs.py invigilator_tracking_tcs.py intruder_det_tcs.py; do
    python $script &
done
```

## Results Directory Structure

```
results/tcs_detections/
├── phone_detection/
├── crowd_detection/
├── proximity_detection/
├── entry_exit_detection/
├── server_room_detection/
├── invigilator_tracking/
└── intruder_detection/
```

## Dependencies

- Python 3.8+
- OpenCV (cv2)
- ultralytics (YOLO)
- pandas
- requests
- numpy
- FFmpeg (system-level, for fallback)

### Install Dependencies:
```bash
pip install opencv-python ultralytics pandas requests numpy
sudo apt-get install ffmpeg  # For frame capture fallback
```

## Features

✅ **HLS Stream Support** - Compatible with TCS streaming links  
✅ **Auto Fallback** - OpenCV → FFmpeg if stream fails  
✅ **Thread-Safe** - Excel updates are thread-safe  
✅ **Parallel Processing** - Multiple cameras simultaneously  
✅ **Scene Filtering** - Auto-filter cameras by scene type  
✅ **Cooldown Management** - Prevents duplicate saves  
✅ **Logging** - Comprehensive logging for debugging  

## Troubleshooting

### Issue: HLS URL Extraction Fails
**Solution**: Check initial URL format, verify network access

### Issue: FFmpeg Not Found
**Solution**: Install FFmpeg
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

### Issue: Stream Opens But No Frames
**Solution**: 
- Check .m3u8 URL validity
- Test with VLC media player
- Verify network firewall settings

### Issue: No Cameras Found
**Solution**: 
- Check Excel file path
- Verify Scene Classification column values
- Ensure CCTV URL column is populated

## Notes

- All scripts save detections with timestamps
- Excel file is updated with detection counts
- Logs saved to `logs/` directory
- Press Ctrl+C to stop any running script
- Results include annotated images with bounding boxes

## Support

For issues:
1. Check script logs in `logs/`
2. Review `/docs/TCS_COMPLETE_GUIDE.md`
3. Test HLS extraction manually with `tcs_hls_utils.py`

---

**Last Updated**: December 30, 2025  
**Total Scripts**: 7 detection types + 1 utility module  
**Status**: All scripts implemented and ready

