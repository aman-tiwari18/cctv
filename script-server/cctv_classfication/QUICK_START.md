# 🚀 Quick Start - Optimized TCS Classification

## One-Command Run

```bash
cd /home/suvam/projects/cctv/cctv-analytics-system/cctv_classfication
python vision_classification_tcs.py
```

---

## What to Expect

### ⏱️ **Time Estimate**
- **20,000 cameras**: 6-10 hours total
- **Pass 1** (Accessibility): 2-3 hours
- **Pass 2** (Classification): 4-7 hours

### 📊 **Success Rate**
Based on your logs (~14% accessible):
- ✅ Accessible & Classified: ~2,100 cameras
- ⚠️ Accessible but Uncertain: ~700 cameras  
- ❌ Not Accessible: ~16,900 cameras

---

## Key Settings (Optimized for H100 + 251GB RAM)

```python
MAX_WORKERS_NETWORK = 64   # Fast network I/O
MAX_WORKERS_VLM = 4        # GPU-accelerated classification
TWO_PASS_MODE = True       # Efficient two-pass strategy
CHECKPOINT_INTERVAL = 500  # Auto-save every 500 cameras
```

---

## Output Files

All saved in `results/tcs_classification/`:

1. **accessible_classified_TIMESTAMP.xlsx** - Good cameras ✅
2. **accessible_uncertain_TIMESTAMP.xlsx** - Grey/obstructed ⚠️
3. **not_accessible_TIMESTAMP.xlsx** - Broken cameras ❌
4. **complete_results_TIMESTAMP.xlsx** - Everything in one file

---

## Resume After Interruption

Just re-run the script:
```bash
python vision_classification_tcs.py
```

It automatically resumes from `checkpoint_progress.json`

To start fresh:
```bash
rm checkpoint_progress.json
python vision_classification_tcs.py
```

---

## Monitor Progress

### Watch in real-time:
```bash
# Terminal 1: Run script
python vision_classification_tcs.py

# Terminal 2: Watch GPU
watch -n 1 nvidia-smi

# Terminal 3: Watch logs
tail -f logs/tcs_classification_*.log
```

### Progress bars show:
- Pass 1: Checking 20k cameras for accessibility
- Pass 2: Classifying ~2.8k accessible cameras

---

## Tune Performance

### Want it faster? Edit these in the script:

```python
# Line 47-48: Increase workers
MAX_WORKERS_NETWORK = 128  # More parallel checks
MAX_WORKERS_VLM = 8        # More concurrent VLM calls

# Line 51-55: Reduce timeouts (risky!)
TIMEOUT_EXTRACT_URL = 2    # Even faster bailout
TIMEOUT_TEST_STREAM = 2
TIMEOUT_OPENCV = 2000
TIMEOUT_FFMPEG = 3
```

### Getting errors? Reduce workers:

```python
MAX_WORKERS_NETWORK = 32   # Lower memory usage
MAX_WORKERS_VLM = 2        # Lower GPU usage
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Ollama not responding" | `ollama serve` in another terminal |
| "Out of memory" | Reduce `MAX_WORKERS_NETWORK` to 32 |
| "Too slow" | Increase `MAX_WORKERS_NETWORK` to 128 |
| "Checkpoint not loading" | Delete `checkpoint_progress.json` |
| "VLM timeout" | Increase `TIMEOUT_VLM` to 120 |

---

## Understanding Output Categories

### ✅ **Accessible (Classified)**
- Stream works perfectly
- Clear image captured
- Scene identified (Server Room, Computer Lab, etc.)
- **Ready to use**

### ⚠️ **Accessible (Uncertain/Obstructed)**  
- Stream works
- Frame captured BUT:
  - Grey screen
  - Dark/overexposed
  - Blurry/obstructed
  - Can't identify scene
- **Needs manual inspection**

### ❌ **Not Accessible**
- Stream broken
- Network error
- Frame capture failed
- **Check hardware/network**

---

## Performance Optimizations Applied

✅ Two-pass processing (filters bad cameras first)  
✅ 64 parallel workers for network I/O  
✅ 4 concurrent VLM classifications (GPU)  
✅ Reduced timeouts (3-5s vs 10-15s)  
✅ Smart FFmpeg skip on known errors  
✅ Grey screen pre-detection  
✅ Auto-checkpoint every 500 cameras  

**Result: 5-9x faster than original (55h → 6-10h)**

---

## Need Help?

Check the full guide: `OPTIMIZATION_GUIDE.md`

View logs: `logs/tcs_classification_YYYYMMDD_HHMMSS.log`

---

**Pro Tip**: Use `tmux` or `screen` to keep the script running if you disconnect!

```bash
tmux new -s classification
python vision_classification_tcs.py
# Press Ctrl+B, then D to detach
# Later: tmux attach -t classification
```
