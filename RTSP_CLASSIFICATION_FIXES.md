# RTSP Classification Script Fixes

## Issues Fixed

### 1. **Missing `re` Module Import**
- **Problem**: Script used `re.search()` and `re.sub()` without importing the `re` module
- **Fix**: Added `import re` to the imports section
- **Impact**: Prevents `NameError: name 're' is not defined` runtime errors

### 2. **Incorrect Authentication Password**
- **Problem**: Script had `AUTH_PASSWORD = "Coreiseven@@"` but should be `"Sasd@12345"`
- **Fix**: Updated password to match the working reference implementation
- **Impact**: Fixes authentication failures with DSS servers

### 3. **Port 9100 Connectivity Issues**
- **Problem**: RTSP streams on port 9100 were blocked/unreachable for private IPs (172.16.x.x)
- **Fix**: Enhanced `build_rtsp_url()` to:
  - Probe TCP port before attempting connection
  - Automatically fall back to HLS (HTTP/443) when RTSP port is blocked
  - Filter private IPs when `SKIP_PRIVATE_IPS` is enabled
- **Impact**: Cameras behind firewalls can now use HLS fallback instead of timing out

### 4. **Improved Error Handling**
- **Problem**: Generic error handling made debugging difficult
- **Fix**: Added detailed logging for:
  - URL attempts (showing which URL index is being tried)
  - Port reachability checks
  - FFmpeg stderr output
  - VLM JSON parsing errors
- **Impact**: Better visibility into failure reasons

### 5. **VLM Response Parsing**
- **Problem**: Qwen3-VL model sometimes includes `<think>...</think>` tags in responses
- **Fix**: Added regex to strip chain-of-thought tags before JSON parsing
- **Impact**: Prevents JSON parsing errors from VLM responses

### 6. **FFmpeg Command Construction**
- **Problem**: Improper command building for different stream types
- **Fix**: Properly handle both RTSP and HLS streams with appropriate timeouts
- **Impact**: More reliable frame capture across different stream protocols

## Key Improvements

### HLS Fallback Strategy
When RTSP port 9100 is blocked:
1. Detect port unreachability via TCP probe (2s timeout)
2. Automatically request HLS stream (dataType=1) instead of RTSP (dataType=2)
3. HLS uses HTTP/443 which is typically firewall-friendly
4. Log the fallback for visibility

### Better Timeout Handling
- **OpenCV**: Hard thread timeout (8s) to prevent 30s hangs
- **FFmpeg**: Both internal timeout (-timeout, -stimeout) and subprocess timeout
- **VLM**: Explicit timeout exception handling

### Enhanced Logging
- Thread-safe logging with thread names
- Progress indicators for both passes
- Detailed error messages with context
- URL attempt tracking (URL 1/3, URL 2/3, etc.)

## Testing Recommendations

1. **Test with blocked ports**: Verify HLS fallback works when port 9100 is blocked
2. **Test with private IPs**: Ensure `SKIP_PRIVATE_IPS` filters correctly
3. **Test authentication**: Verify new password works across all servers
4. **Test VLM responses**: Check that chain-of-thought tags are properly stripped
5. **Monitor logs**: Watch for "Port X on Y is BLOCKED" messages and HLS fallback success

## Configuration

Current optimized settings:
```python
MAX_WORKERS_NETWORK = 64   # High parallelism for Pass 1
MAX_WORKERS_VLM = 4        # GPU-limited for Pass 2
TIMEOUT_OPENCV = 10000     # 10s (milliseconds)
TIMEOUT_OPENCV_REAL = 8    # 8s hard thread timeout
TIMEOUT_FFMPEG = 10        # 10s
TIMEOUT_VLM = 120          # 2 minutes
SKIP_PRIVATE_IPS = True    # Filter private IPs
TWO_PASS_MODE = True       # Efficient two-pass processing
```

## Expected Behavior

### Pass 1 (Quick Accessibility Check)
- Authenticate with DSS servers
- Request stream URLs via API
- Check port reachability
- Fall back to HLS if RTSP port blocked
- Mark cameras as accessible/not accessible

### Pass 2 (Frame Capture & Classification)
- Try each URL in sequence until one works
- Capture frame with OpenCV (primary) or FFmpeg (fallback)
- Classify with VLM
- Update database with results

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `No route to host` | Port blocked by firewall | HLS fallback should trigger automatically |
| `The nonce is illegal` | Auth token timing issue | Script retries with exponential backoff |
| `method OPTIONS failed: 401` | Token expired | Script auto-refreshes tokens |
| `Invalid JSON from VLM` | VLM response parsing failed | Check Ollama service and model |

## Files Modified

- `script-server/scripts/detection/vision_classification_rtsp.py`
  - Added `import re`
  - Updated `AUTH_PASSWORD`
  - Enhanced `build_rtsp_url()` with HLS fallback
  - Improved `capture_frame_with_ffmpeg_stream()`
  - Enhanced `classify_with_vlm()` with regex stripping
  - Better error logging throughout
