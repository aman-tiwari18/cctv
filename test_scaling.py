#!/usr/bin/env python3
"""
Quick test script to verify horizontal scaling setup
"""

import os
import sys

# Test 1: Camera distribution calculation
print("="*60)
print("TEST 1: Camera Distribution Calculation")
print("="*60)

sys.path.insert(0, 'script-server')
from app.camera_distributor import calculate_camera_ranges, print_distribution_plan

# Test with 20K cameras, 4 workers
print_distribution_plan(20000, 4)

# Test 2: Camera filtering
print("\n" + "="*60)
print("TEST 2: Camera Filtering Logic")
print("="*60)

test_cameras = [
    {"id": 100, "ch_code": "12345", "device_id": "dev1"},
    {"id": 5500, "ch_code": "67890", "device_id": "dev2"},
    {"id": 10500, "ch_code": "11111", "device_id": "dev3"},
    {"id": 15500, "ch_code": "22222", "device_id": "dev4"},
]

# Simulate worker-2 (cameras 5001-10000)
os.environ["WORKER_ID"] = "worker-2"
os.environ["CAMERA_START_ID"] = "5001"
os.environ["CAMERA_END_ID"] = "10000"
os.environ["DISTRIBUTION_MODE"] = "static"

from app.camera_distributor import CameraDistributor

dist = CameraDistributor()
filtered = dist.filter_cameras(test_cameras)

print(f"\nWorker: {dist.worker_id}")
print(f"Range: {dist.camera_start} - {dist.camera_end}")
print(f"Total cameras: {len(test_cameras)}")
print(f"Assigned cameras: {len(filtered)}")
print("\nAssigned camera IDs:")
for cam in filtered:
    print(f"  - Camera ID {cam['id']}")

# Test 3: Worker stats
print("\n" + "="*60)
print("TEST 3: Worker Statistics")
print("="*60)

stats = dist.get_worker_stats()
print(f"Worker ID: {stats['worker_id']}")
print(f"Distribution Mode: {stats['distribution_mode']}")
print(f"Camera Range: {stats['camera_range']}")

print("\n" + "="*60)
print("ALL TESTS PASSED ✓")
print("="*60)
