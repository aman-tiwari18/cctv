#!/usr/bin/env python3
"""
Test script to verify all worker imports are working correctly.
Run this from the script-server/scripts/detection/pipeline/ directory.
"""

import sys
import os

# Setup paths (same as master_pipeline.py)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
WORKERS_DIR = os.path.join(PROJECT_ROOT, "workers")
sys.path.insert(0, PROJECT_ROOT)
sys.path.insert(0, WORKERS_DIR)

print("=" * 70)
print("Testing Worker Imports")
print("=" * 70)
print(f"BASE_DIR: {BASE_DIR}")
print(f"PROJECT_ROOT: {PROJECT_ROOT}")
print(f"WORKERS_DIR: {WORKERS_DIR}")
print("=" * 70)

# Test all workers
workers = [
    ("intruder", "intruder_worker", "intruder_worker", "intruder_worker_hls"),
    ("strongroom", "strongroom_worker", "strongroom_worker", "strongroom_worker_hls"),
    ("server", "server_room_worker", "server_room_worker", "server_room_worker_hls"),
    ("crowd", "crowd_worker", "crowd_worker", "crowd_worker_hls"),
    ("entry_exit", "entry_exit_worker", "entry_exit_worker", "entry_exit_worker_hls"),
    ("proximity", "close_proximity_worker", "close_proximity_worker", "close_proximity_worker_hls"),
    ("phone", "phone_worker", "phone_worker", "phone_worker_hls"),
    ("invigilator", "invigilator_worker", "invigilator_worker", "invigilator_worker_hls"),
    ("tamper", "camera_tampering_worker", "camera_tampering_worker", "camera_tampering_worker_hls"),
    ("inversion", "camera_inversion_worker", "camera_inversion_worker", "camera_inversion_worker_hls"),
    ("crowd_zero", "crowd_zero_det_worker", "crowd_zero_worker", "crowd_zero_det_worker_hls"),
    ("crowd_five", "crowd_five_det_worker", "crowd_five_worker", "crowd_five_det_worker_hls"),
    ("blind_spot", "blind_spot_worker", "blind_spot_worker", "blind_spot_worker_hls"),
]

passed = 0
failed = 0
errors = []

for name, module_name, rtsp_fn, hls_fn in workers:
    try:
        # Try importing the module
        module = __import__(module_name)
        
        # Check if RTSP function exists
        has_rtsp = hasattr(module, rtsp_fn)
        
        # Check if HLS function exists
        has_hls = hasattr(module, hls_fn)
        
        if has_rtsp and has_hls:
            print(f"✅ {name:15} | Module: {module_name:30} | RTSP: ✓ | HLS: ✓")
            passed += 1
        else:
            print(f"⚠️  {name:15} | Module: {module_name:30} | RTSP: {'✓' if has_rtsp else '✗'} | HLS: {'✓' if has_hls else '✗'}")
            errors.append(f"{name}: Missing functions (RTSP: {has_rtsp}, HLS: {has_hls})")
            failed += 1
            
    except ImportError as e:
        print(f"❌ {name:15} | Module: {module_name:30} | Import Error")
        errors.append(f"{name}: {str(e)}")
        failed += 1
    except Exception as e:
        print(f"❌ {name:15} | Module: {module_name:30} | Error: {str(e)}")
        errors.append(f"{name}: {str(e)}")
        failed += 1

print("=" * 70)
print(f"Results: {passed} passed, {failed} failed out of {len(workers)} workers")
print("=" * 70)

if errors:
    print("\nErrors:")
    for error in errors:
        print(f"  - {error}")
    sys.exit(1)
else:
    print("\n🎉 All worker imports successful!")
    sys.exit(0)
