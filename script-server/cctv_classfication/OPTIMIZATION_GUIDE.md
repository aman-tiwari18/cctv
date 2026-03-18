# TCS Camera Classification - Optimization Guide

## 🚀 Performance Improvements

### **Estimated Processing Time**
- **Previous**: ~55 hours for 20,000 cameras
- **Optimized**: ~6-10 hours for 20,000 cameras
- **Speedup**: **5-9x faster**

---

## 📋 Implemented Optimizations

### **1. Two-Pass Processing Strategy** ⭐ MAJOR SPEEDUP
**Pass 1: Quick Accessibility Check**
- Only tests if stream URL is reachable
- No frame capture, no VLM classification
- Uses 64 parallel workers (high network I/O)
- Quickly filters out ~86% of broken cameras
- Estimated time: 2-3 hours for 20k cameras

**Pass 2: Classification Only**
- Only processes accessible cameras (~14% = 2,800 cameras)
- Captures frames and classifies with VLM
- Uses 4 parallel VLM workers (GPU limited)
- Estimated time: 4-7 hours for ~2,800 cameras

### **2. Aggressive Timeout Reduction**
- Extract URL: 10s → **3s**
- Test stream: 10s → **3s**
- OpenCV: 10s → **3s**
- FFmpeg: 15s → **5s**
- Saves ~15s per failed camera × 17,000 failed = **~71 hours saved**

### **3. Smart Early Bailout**
- Detects HTTP error codes (404, 502, 503, 500)
- Skips FFmpeg fallback for known bad streams
- Saves ~5s per clearly broken camera

### **4. Increased Parallelism**
- Network workers: 8 → **64** (for Pass 1 & URL testing)
- VLM workers: 1 → **4** (for concurrent classification)
- Leverages your 251GB RAM and H100 GPU

### **5. Checkpoint/Resume System**
- Auto-saves progress every 500 cameras
- Resume from last checkpoint if interrupted
- Prevents data loss on crashes/interruptions
- Checkpoint file: `checkpoint_progress.json`

### **6. Grey/Obstructed Camera Detection**
Uses OpenCV pre-checks before VLM:
- Detects uniform grey screens (std_dev < 5)
- Detects very dark images (mean < 10)
- Detects overexposed images (mean > 245)
- Detects low detail/blur (Laplacian variance < 10)
- Saves ~30s VLM call for obviously bad images

### **7. Three-Category Classification (Option A)**
Output categories:
1. **✅ Accessible (Classified)**: Successfully classified scenes
2. **⚠️ Accessible (Uncertain/Obstructed)**: Camera works but image is grey/unclear
3. **❌ Not Accessible**: Stream not reachable or broken

---

## 🔧 Configuration Settings

### **In the script (lines 40-58):**

```python
# Performance settings
MAX_WORKERS_NETWORK = 64  # Parallel workers for network I/O
MAX_WORKERS_VLM = 4       # Concurrent VLM requests (GPU limited)
CHECKPOINT_INTERVAL = 500  # Save progress every N cameras

# Timeout settings (reduced for speed)
TIMEOUT_EXTRACT_URL = 3    # Extract HLS URL timeout (seconds)
TIMEOUT_TEST_STREAM = 3    # Test stream accessibility timeout (seconds)
TIMEOUT_OPENCV = 3000      # OpenCV timeout (milliseconds)
TIMEOUT_FFMPEG = 5         # FFmpeg timeout (seconds)
TIMEOUT_VLM = 60           # VLM classification timeout (seconds)

# Processing mode
TWO_PASS_MODE = True       # Enable two-pass processing
RESUME_FROM_CHECKPOINT = True  # Resume from checkpoint
```

### **Tuning for Your System:**

**If you want even faster processing:**
- Increase `MAX_WORKERS_NETWORK` to 128 (you have 251GB RAM)
- Increase `MAX_WORKERS_VLM` to 8 (H100 can handle it)

**If you get errors:**
- Reduce `MAX_WORKERS_NETWORK` to 32
- Reduce `MAX_WORKERS_VLM` to 2

---

## 📊 Expected Output

### **Console Output:**
```
================================================================================
🚀 OPTIMIZED TCS Camera Classification - TWO-PASS MODE
================================================================================
Total cameras: 19667
Network workers: 64
VLM workers: 4
Checkpoint interval: 500
================================================================================

================================================================================
PASS 1: Quick Accessibility Check (No frame capture)
================================================================================
Pass 1: Checking accessibility: 100%|██████████| 19667/19667 [2:15:32<00:00]

✅ Pass 1 Complete!
   Time: 135m 32s
   Accessible: 2800
   Not Accessible: 16867

================================================================================
PASS 2: Frame Capture & Classification (2800 cameras)
================================================================================
Pass 2: Classifying: 100%|██████████| 2800/2800 [4:22:15<00:00]

✅ Pass 2 Complete!
   Time: 262m 15s
   Classified: 2100
   Uncertain/Obstructed: 700

================================================================================
🎉 FINAL SUMMARY
================================================================================
Total Cameras: 19667
✅ Accessible (Classified): 2100
⚠️  Accessible (Uncertain/Obstructed): 700
❌ Not Accessible: 16867
⏱️  Total Time: 397m 47s (6.6 hours)
📊 Success Rate: 14.2%
================================================================================
```

### **Output Files:**
Located in `results/tcs_classification/`:

1. `accessible_classified_YYYYMMDD_HHMMSS.xlsx` - Successfully classified cameras
2. `accessible_uncertain_YYYYMMDD_HHMMSS.xlsx` - Cameras with grey/obstructed views
3. `not_accessible_YYYYMMDD_HHMMSS.xlsx` - Broken/unreachable cameras
4. `complete_results_YYYYMMDD_HHMMSS.xlsx` - All results in one file with multiple sheets

---

## 🏃 How to Run

1. **Make sure Ollama is running:**
   ```bash
   ollama serve
   ```

2. **Run the optimized script:**
   ```bash
   cd /home/suvam/projects/cctv/cctv-analytics-system/cctv_classfication
   python vision_classification_tcs.py
   ```

3. **Monitor progress:**
   - Watch the progress bars for Pass 1 and Pass 2
   - Check checkpoint saves every 500 cameras
   - Log file: `logs/tcs_classification_YYYYMMDD_HHMMSS.log`

4. **If interrupted:**
   - Just re-run the script
   - It will automatically resume from last checkpoint
   - Delete `checkpoint_progress.json` to start fresh

---

## 📈 Performance Breakdown

### **Time Estimates (20k cameras):**

| Phase | Cameras | Workers | Time |
|-------|---------|---------|------|
| Pass 1: Accessibility | 20,000 | 64 | 2-3h |
| Pass 2: Classification | 2,800 | 4 | 4-7h |
| **Total** | **20,000** | - | **6-10h** |

### **Resource Usage:**
- **RAM**: ~20-30GB (out of 251GB available)
- **GPU**: ~40-60GB (out of 80GB H100)
- **CPU**: High utilization during Pass 1
- **Network**: High bandwidth usage

---

## 🔍 Understanding Status Categories

### **1. Accessible (Classified)**
- Stream is working ✅
- Frame captured successfully ✅
- VLM classified the scene ✅
- **Action**: Use these cameras

### **2. Accessible (Uncertain/Obstructed)**
- Stream is working ✅
- Frame captured successfully ✅
- But: Image is grey/dark/overexposed/blurry ⚠️
- **Action**: Check these cameras manually, might need cleaning or repositioning

### **3. Not Accessible**
- Stream URL failed ❌
- HTTP errors (404, 502, etc.) ❌
- Frame capture failed ❌
- **Action**: These cameras are broken, check hardware/network

---

## 🛠️ Troubleshooting

### **Script is too slow:**
- Check if Ollama is running: `ollama list`
- Increase workers: edit `MAX_WORKERS_NETWORK` and `MAX_WORKERS_VLM`
- Check network bandwidth
- Reduce timeout values further (risky)

### **Out of memory:**
- Reduce `MAX_WORKERS_NETWORK` to 32
- Reduce `MAX_WORKERS_VLM` to 2
- Check: `free -h`

### **VLM classification errors:**
- Check Ollama status: `curl http://localhost:11434/api/tags`
- Verify model: `ollama list` (should see qwen3-vl:8b)
- Test VLM: `ollama run qwen3-vl:8b`

### **Resume not working:**
- Delete checkpoint: `rm checkpoint_progress.json`
- Start fresh

---

## 📝 Key Differences from Original

| Feature | Original | Optimized |
|---------|----------|-----------|
| Processing Strategy | Single-pass | Two-pass |
| Network Workers | 8 | 64 |
| VLM Workers | 1 | 4 |
| Timeouts | 10-15s | 3-5s |
| FFmpeg Fallback | Always | Smart (skip on known errors) |
| Grey Detection | None | Pre-check before VLM |
| Checkpoint | None | Every 500 cameras |
| Output Categories | 2 | 3 (with Uncertain) |
| Estimated Time | ~55h | ~6-10h |

---

## 🎯 Next Steps

1. **Run the optimized script** and observe Pass 1 speed
2. **Monitor checkpoint saves** to ensure progress isn't lost
3. **Review Uncertain cameras** manually after completion
4. **Adjust workers** if you want even faster processing
5. **Check GPU usage** with `nvidia-smi` during Pass 2

---

## 💡 Pro Tips

- **Use tmux/screen** to keep script running if SSH disconnects
- **Monitor GPU**: `watch -n 1 nvidia-smi`
- **Monitor RAM**: `watch -n 1 free -h`
- **Check logs** in real-time: `tail -f logs/tcs_classification_*.log`

---

**Happy Processing! 🚀**
