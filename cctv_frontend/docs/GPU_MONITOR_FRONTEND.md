# GPU Monitor Frontend Integration

## Overview
Added a GPU Monitor page to the CCTV frontend for real-time monitoring of GPU utilization across all worker servers. This feature is **admin-only** and provides comprehensive insights into GPU performance, processes, and camera distribution.

## Changes Made

### 1. **Layout.jsx** - Added GPU Monitor Menu Item
- Added `Memory` icon import from Material-UI
- Added "GPU Monitor" menu item (admin-only)
- Position: Between "Executions" and "Detections"
- Icon: Memory chip icon
- Path: `/gpu-monitor`

### 2. **App.jsx** - Added Route
- Imported `GPUMonitor` component
- Added route: `/gpu-monitor` → `<GPUMonitor />`
- Protected with `RoleBasedRoute` (admin-only)

### 3. **GPUMonitor.jsx** - New Page Component
Created comprehensive GPU monitoring dashboard with:

#### Features:
- **Real-time Updates**: Auto-refreshes every 10 seconds
- **Cluster Overview Cards**:
  - Total Servers (online/offline status)
  - Total GPUs across cluster
  - Active Processes (detection pipelines)
  - Total Cameras being monitored

- **Server Details**:
  - Server name, IP, and status
  - GPU cards with:
    - Utilization percentage (color-coded)
    - Memory usage (used/total)
    - Temperature monitoring
  - Running processes table:
    - GPU assignment
    - Process ID (PID)
    - Process name and type
    - Memory usage
    - Camera count per process

#### Visual Design:
- Color-coded utilization bars:
  - Green (0-40%): Low usage
  - Blue (40-60%): Moderate usage
  - Orange (60-80%): High usage
  - Red (80-100%): Critical usage
- Temperature indicators with color coding
- Status chips for online/offline servers
- Responsive grid layout
- Clean Material-UI design matching app theme

## API Integration

### Endpoint Used:
```javascript
GET /gpu-monitor/stats
```

### Response Structure:
```json
{
  "success": true,
  "timestamp": "2026-05-07T10:30:00",
  "data": {
    "total_servers": 4,
    "online_servers": 4,
    "offline_servers": 0,
    "total_gpus": 4,
    "total_processes": 8,
    "total_cameras": 25000,
    "servers": [
      {
        "server_id": "worker-0",
        "server_name": "Main Server (Worker 0)",
        "ip": "localhost",
        "status": "online",
        "data": {
          "gpus": [
            {
              "gpu_id": 0,
              "name": "NVIDIA GeForce RTX 3090",
              "utilization": 85,
              "memory_used": 18432,
              "memory_total": 24576,
              "temperature": 72
            }
          ],
          "processes": {
            "0": [
              {
                "pid": 12345,
                "name": "Master Pipeline",
                "type": "master",
                "memory_mb": 8192,
                "camera_count": 6250,
                "cmdline": "python master_pipeline.py..."
              }
            ]
          }
        }
      }
    ]
  }
}
```

## Access Control

### Admin Only
- Menu item only visible to users with `role === 'ADMIN'`
- Route protected with `RoleBasedRoute`
- VIEWER and OPERATOR roles cannot access

### Navigation
```
Admin Menu:
├── Dashboard
├── Exams
├── Cameras
├── Shifts
├── Schedule Analysis
├── Executions
├── GPU Monitor          ← NEW (Admin only)
├── Detections
└── Client Detections
```

## Usage

### For Admins:
1. Click "GPU Monitor" in the sidebar
2. View real-time cluster statistics
3. Monitor individual server GPU usage
4. Track running detection processes
5. See camera distribution across workers
6. Click refresh icon for manual update

### Key Metrics Displayed:
- **Server Health**: Online/offline status
- **GPU Utilization**: Real-time percentage
- **Memory Usage**: Used vs. total memory
- **Temperature**: GPU temperature monitoring
- **Process Info**: Running detection pipelines
- **Camera Count**: Cameras per process/server

## Technical Details

### Dependencies:
- Material-UI components
- Axios for API calls
- React hooks (useState, useEffect)

### Auto-Refresh:
- Interval: 10 seconds
- Cleans up on component unmount
- Shows last update timestamp

### Error Handling:
- Displays error alerts
- Graceful fallback for offline servers
- Loading states during data fetch

### Responsive Design:
- Grid layout adapts to screen size
- Mobile-friendly cards
- Scrollable tables on small screens

## Environment Configuration

### API Base URL:
```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
```

Make sure your `.env` file has:
```bash
VITE_API_BASE_URL=http://your-backend-url:8000
```

## Color Coding

### Utilization:
- 🟢 Green (0-40%): Low usage
- 🔵 Blue (40-60%): Moderate usage
- 🟠 Orange (60-80%): High usage
- 🔴 Red (80-100%): Critical usage

### Temperature:
- 🟢 Green (<70°C): Normal
- 🟠 Orange (70-80°C): Warm
- 🔴 Red (>80°C): Hot

### Server Status:
- 🟢 Green: Online
- 🔴 Red: Offline

## Files Modified/Created

### Modified:
1. `cctv_frontend/src/components/Layout.jsx`
   - Added Memory icon import
   - Added GPU Monitor menu item

2. `cctv_frontend/src/App.jsx`
   - Imported GPUMonitor component
   - Added /gpu-monitor route

### Created:
1. `cctv_frontend/src/pages/GPUMonitor.jsx`
   - Complete GPU monitoring dashboard
   - Real-time data visualization
   - Server and GPU details

## Testing

### Manual Testing:
```bash
# 1. Start backend server
cd script-server
python run.py

# 2. Start frontend
cd cctv_frontend
npm run dev

# 3. Login as admin
# 4. Navigate to GPU Monitor
# 5. Verify data displays correctly
```

### Expected Behavior:
- ✅ Menu item visible for admin
- ✅ Page loads without errors
- ✅ Data refreshes every 10 seconds
- ✅ Server cards display correctly
- ✅ GPU metrics show utilization/memory
- ✅ Process table shows running pipelines
- ✅ Offline servers show error message

## Future Enhancements

Possible improvements:
- Historical GPU usage charts
- Alert notifications for high utilization
- Process management (start/stop)
- GPU memory optimization suggestions
- Export GPU stats to CSV/Excel
- Real-time WebSocket updates
- Custom refresh intervals
- GPU comparison across servers

## Summary

✅ **GPU Monitor page created**  
✅ **Admin-only access control**  
✅ **Real-time monitoring (10s refresh)**  
✅ **Cluster overview statistics**  
✅ **Individual server details**  
✅ **GPU utilization visualization**  
✅ **Process tracking with camera counts**  
✅ **Responsive Material-UI design**  
✅ **Error handling and loading states**  

The GPU Monitor provides admins with comprehensive visibility into the GPU cluster's performance, helping optimize resource allocation and identify bottlenecks! 🚀
