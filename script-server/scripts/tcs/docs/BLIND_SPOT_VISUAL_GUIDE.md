# Blind Spot Detection - Visual Examples

## Detection Types Illustrated

### 1. Edge Obstruction Detection

```
┌─────────────────────────────────────┐
│ ████████████████████████████████████│  ← Dark top edge (obstructed)
│ ███                             ████│
│ ███      CAMERA VIEW            ████│  ← Dark left/right edges
│ ███                             ████│
│ ███                             ████│
│ ████████████████████████████████████│  ← Dark bottom edge (obstructed)
└─────────────────────────────────────┘

Result: Edge Obstruction = 100% (all 4 edges)
Alert: CRITICAL - Camera lens partially covered
```

### 2. Partial Person Detection

```
┌─────────────────────────────────────┐
│                                     │
│         ┌──────┐                    │
│         │Person│                    │  ← Person 1: Complete (green box)
│         │  OK  │                    │
│         └──────┘                    │
│                                     │
│  ┌────                         ────┐│  ← Person 2 & 3: Partial (red boxes)
│  │Per│                        │son││
│  └────                         ────┘│
└─────────────────────────────────────┘

Result: Partial Persons = 2/3 (66%)
Alert: WARNING - Candidates partially out of frame
```

### 3. Movement Detection (Inside Lab)

```
Frame N:                    Frame N+1:
┌───────────────┐          ┌───────────────┐
│               │          │               │
│   👤          │          │   👤          │  ← Same position
│               │          │               │
│               │          │               │
│      👤       │          │      👤       │  ← No movement
│               │          │               │
└───────────────┘          └───────────────┘

Movement Pixels: 45 (< 500 threshold)
Static Frame Count: 12 (> 10 threshold)
Result: NO MOVEMENT DETECTED
Alert: WARNING - Static camera or empty lab
```

### 4. Obstruction Patterns

#### 4a. Dark Obstruction (Covered Lens)
```
┌─────────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
└─────────────────────────────────────┘

Mean Intensity: 15 (< 30 threshold)
Result: DARK OBSTRUCTION
Alert: CRITICAL - Lens covered or blocked
```

#### 4b. Uniform/Washed Out
```
┌─────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└─────────────────────────────────────┘

Std Deviation: 8 (< 20 threshold)
Result: UNIFORM/NO TEXTURE
Alert: WARNING - Possible obstruction or wall view
```

## Annotated Frame Examples

### Example 1: Multiple Issues Detected
```
┌─────────────────────────────────────────────────────────┐
│ Edge Obstruction: 25.0% ⚠️                              │ ← Detection info
│ Partial: 2/3 ⚠️                                         │
│ Movement: 342 px (Avg: 401) ⚠️                          │
│                                                         │
│ ████████████████████████████████████████████████████   │ ← Red: Obstructed edge
│ ███                                              ████   │
│ ███   ┌─────────┐                               ████   │
│ ███   │Person OK│ ← Green box                   ████   │
│ ███   └─────────┘                               ████   │
│ ███                                              ████   │
│ ███ ┌────                                       ████   │
│ ███ │Par│ ← Red box (partial)              ────┐████   │
│ ███ └────                                  │son│████   │
│ ████████████████████████████████████████████────┘████   │
│                                                         │
│ Camera: Center1_Lab2_Camera5               [12:35:22]  │ ← Camera ID & time
└─────────────────────────────────────────────────────────┘

Saved as: Center1_Lab2_Camera5_20260119_123522_edge_obst_partial.jpg
```

### Example 2: Healthy Camera (No Issues)
```
┌─────────────────────────────────────────────────────────┐
│ Edge Obstruction: 0.0% ✓                                │ ← Green: OK
│ Partial: 0/4 ✓                                          │
│ Movement: 1847 px (Avg: 1523) ✓                         │
│                                                         │
│                                                         │
│      ┌─────────┐        ┌─────────┐                    │
│      │Person OK│        │Person OK│ ← All green boxes  │
│      └─────────┘        └─────────┘                    │
│                                                         │
│  ┌─────────┐                    ┌─────────┐            │
│  │Person OK│                    │Person OK│            │
│  └─────────┘                    └─────────┘            │
│                                                         │
│ Camera: Center1_Lab3_Camera2               [12:35:45]  │
└─────────────────────────────────────────────────────────┘

No issues detected - frame not saved
```

## Real-World Scenarios

### Scenario 1: Mounting Bracket Obstruction
**Cause**: Camera bracket blocks left edge of view  
**Visual**: Red line on left edge, 25% obstruction  
**Detection**: Edge Obstruction  
**Recommended Action**: Adjust camera mount

### Scenario 2: Narrow Field of View
**Cause**: Camera angle too narrow, candidates at edges  
**Visual**: Multiple red boxes on persons touching edges  
**Detection**: Partial Persons (3/5 partial)  
**Recommended Action**: Widen camera angle or reposition

### Scenario 3: Camera Frozen/Disconnected
**Cause**: Stream frozen or camera pointing at empty wall  
**Visual**: "NO MOVEMENT" warning, static frame count  
**Detection**: No Movement (15 consecutive static frames)  
**Recommended Action**: Check camera connection, verify position

### Scenario 4: Lens Dust/Dirt
**Cause**: Accumulated dust on lens  
**Visual**: Dark/washed out appearance, low contrast  
**Detection**: Obstruction Patterns (dark/uniform)  
**Recommended Action**: Clean camera lens

### Scenario 5: Wrong Camera Position
**Cause**: Camera pointing at ceiling/wall instead of area  
**Visual**: Uniform texture, no persons detected ever  
**Detection**: Obstruction Patterns (uniform)  
**Recommended Action**: Reposition camera

## Detection Sensitivity Comparison

### Low Sensitivity (Lenient)
```python
EDGE_OBSTRUCTION_THRESHOLD = 0.30      # 30% edges must be obstructed
MIN_MOVEMENT_PIXELS = 1500             # High movement threshold
STATIC_THRESHOLD = 20                  # 20 consecutive frames
```
**Effect**: Fewer false positives, may miss minor issues

### Medium Sensitivity (Default)
```python
EDGE_OBSTRUCTION_THRESHOLD = 0.15      # 15% edges
MIN_MOVEMENT_PIXELS = 500              # Moderate threshold
STATIC_THRESHOLD = 10                  # 10 consecutive frames
```
**Effect**: Balanced detection, recommended for most cases

### High Sensitivity (Strict)
```python
EDGE_OBSTRUCTION_THRESHOLD = 0.05      # 5% edges
MIN_MOVEMENT_PIXELS = 200              # Low threshold
STATIC_THRESHOLD = 5                   # 5 consecutive frames
```
**Effect**: Catches all issues, higher false positive rate

## Output File Structure

```
results/tcs_detections/blind_spot_detection/
├── Center1_Lab2_20260119_123522_edge_obst.jpg
├── Center1_Lab2_20260119_123545_partial.jpg
├── Center1_Lab2_20260119_123607_static.jpg
├── Center1_Lab2_20260119_123630_obstructed.jpg
├── Center1_Lab2_20260119_123652_edge_obst_partial.jpg
├── Center1_Lab3_20260119_124015_partial.jpg
├── Center2_ServerRoom_20260119_124320_edge_obst.jpg
└── test_dark_edges.jpg (synthetic test)
```

## Excel Report Format

```
| Camera Location    | Blind Spot -  | Blind Spot -   | Blind Spot -  | Blind Spot -   |
|                    | Edge Obst.    | Partial Persons| No Movement   | Obstructions   |
|--------------------|---------------|----------------|---------------|----------------|
| Center1_Lab2       | 15            | 23             | 5             | 8              |
| Center1_Lab3       | 2             | 0              | 0             | 0              |
| Center2_ServerRoom | 45            | 0              | 0             | 12             |
```

## Color Coding in Saved Images

- 🔴 **Red** = Issue detected (obstruction, partial person, warning)
- 🟢 **Green** = Normal/OK (complete person, clear edge)
- ⚪ **White** = Info text (camera ID, timestamp)
- 🟡 **Yellow** = (Reserved for future use)

## Detection Confidence Levels

| Detection Count | Confidence | Action Required |
|-----------------|------------|-----------------|
| 0-5             | ✓ Good     | Monitor         |
| 6-15            | ⚠️ Warning | Investigate     |
| 16-30           | 🔶 Alert   | Action needed   |
| 31+             | 🔴 Critical| Immediate fix   |

## Frame Processing Pipeline

```
Input Frame (1920x1080)
         ↓
    Preprocessing
         ↓
    ┌─────────────────────┐
    │ Edge Analysis       │ → Edge Obstruction %
    │ YOLO Detection      │ → Partial Persons Count
    │ Movement Tracking   │ → Movement Pixels
    │ Pattern Analysis    │ → Obstruction Type
    └─────────────────────┘
         ↓
    Annotation & Overlay
         ↓
    Issue Detection Logic
         ↓
    Save if Issues? → Yes → Save to Disk
         ↓ No              ↓ Update Stats
    Continue Processing    
```

## Tips for Reviewing Saved Images

1. **Check timestamp**: Ensure detection is recent
2. **Review annotation**: Verify detections are accurate
3. **Compare with live feed**: Confirm issue still exists
4. **Look for patterns**: Multiple similar issues indicate systematic problem
5. **Prioritize by camera**: Inside lab cameras with "no movement" are critical

---

**Visual Guide Version**: 1.0  
**Last Updated**: January 19, 2026  
**Compatibility**: Works with all TCS HLS streams
