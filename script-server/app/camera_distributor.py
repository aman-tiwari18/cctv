"""
Camera Distribution Logic for Horizontal Scaling
=================================================
Handles camera assignment across multiple GPU worker nodes.

Supports two distribution strategies:
1. Static Range Assignment: Each worker handles a fixed camera ID range
2. Dynamic Assignment: Workers pull cameras from a shared queue

Author: CCTV Monitoring System
Date: 2026-04-29
"""

import os
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class CameraDistributor:
    """
    Manages camera distribution across multiple worker nodes.
    """
    
    def __init__(self):
        self.worker_id = os.environ.get("WORKER_ID", "main")
        self.camera_start = self._parse_int_env("CAMERA_START_ID")
        self.camera_end = self._parse_int_env("CAMERA_END_ID")
        self.distribution_mode = os.environ.get("DISTRIBUTION_MODE", "static")
        
        logger.info(
            f"Camera Distributor initialized: "
            f"worker_id={self.worker_id}, "
            f"mode={self.distribution_mode}, "
            f"range={self.camera_start}-{self.camera_end}"
        )
    
    @staticmethod
    def _parse_int_env(key: str) -> Optional[int]:
        """Parse integer from environment variable."""
        val = os.environ.get(key)
        if val:
            try:
                return int(val)
            except ValueError:
                logger.warning(f"Invalid integer for {key}: {val}")
        return None
    
    def should_process_camera(self, camera: Dict) -> bool:
        """
        Determine if this worker should process the given camera.
        
        Args:
            camera: Camera dict with 'id', 'ch_code', or 'device_id'
        
        Returns:
            True if this worker should process the camera
        """
        if self.distribution_mode == "static":
            return self._static_assignment(camera)
        elif self.distribution_mode == "dynamic":
            return self._dynamic_assignment(camera)
        else:
            # Default: process all cameras (single-node mode)
            return True
    
    def _static_assignment(self, camera: Dict) -> bool:
        """
        Static range-based assignment.
        
        Cameras are assigned based on their ID falling within
        the worker's configured range.
        """
        # If no range configured, process all cameras
        if self.camera_start is None or self.camera_end is None:
            return True
        
        # Try to get camera ID from various fields
        camera_id = (
            camera.get("id") or
            camera.get("camera_id") or
            self._extract_numeric_id(camera.get("ch_code")) or
            self._extract_numeric_id(camera.get("device_id"))
        )
        
        if camera_id is None:
            logger.warning(f"Cannot determine camera ID for assignment: {camera}")
            return False
        
        # Check if camera falls within this worker's range
        in_range = self.camera_start <= camera_id <= self.camera_end
        
        if in_range:
            logger.debug(
                f"Camera {camera_id} assigned to worker {self.worker_id} "
                f"(range: {self.camera_start}-{self.camera_end})"
            )
        
        return in_range
    
    def _dynamic_assignment(self, camera: Dict) -> bool:
        """
        Dynamic assignment using database worker_id field.
        
        Cameras have a 'worker_id' field in the database that
        indicates which worker should process them.
        """
        assigned_worker = camera.get("worker_id")
        
        # If no worker assigned, this worker can claim it
        if not assigned_worker:
            return True
        
        # Check if assigned to this worker
        return assigned_worker == self.worker_id
    
    @staticmethod
    def _extract_numeric_id(value: any) -> Optional[int]:
        """Extract numeric ID from string or int value."""
        if value is None:
            return None
        
        if isinstance(value, int):
            return value
        
        if isinstance(value, str):
            # Try direct conversion
            try:
                return int(value)
            except ValueError:
                pass
            
            # Try extracting first number
            import re
            match = re.search(r'\d+', value)
            if match:
                return int(match.group())
        
        return None
    
    def filter_cameras(self, cameras: List[Dict]) -> List[Dict]:
        """
        Filter camera list to only include cameras assigned to this worker.
        
        Args:
            cameras: List of camera dicts
        
        Returns:
            Filtered list of cameras for this worker
        """
        assigned = [cam for cam in cameras if self.should_process_camera(cam)]
        
        logger.info(
            f"Worker {self.worker_id}: "
            f"Assigned {len(assigned)}/{len(cameras)} cameras"
        )
        
        return assigned
    
    def get_worker_stats(self) -> Dict:
        """Get worker statistics for monitoring."""
        return {
            "worker_id": self.worker_id,
            "distribution_mode": self.distribution_mode,
            "camera_range": {
                "start": self.camera_start,
                "end": self.camera_end,
            } if self.camera_start and self.camera_end else None,
        }


# Global distributor instance
distributor = CameraDistributor()


def should_process_camera(camera: Dict) -> bool:
    """
    Convenience function to check if camera should be processed.
    
    Args:
        camera: Camera dict
    
    Returns:
        True if this worker should process the camera
    """
    return distributor.should_process_camera(camera)


def filter_cameras(cameras: List[Dict]) -> List[Dict]:
    """
    Convenience function to filter camera list.
    
    Args:
        cameras: List of camera dicts
    
    Returns:
        Filtered list for this worker
    """
    return distributor.filter_cameras(cameras)


# ============================================================
# Camera Distribution Utilities
# ============================================================

def calculate_camera_ranges(total_cameras: int, num_workers: int) -> List[Dict]:
    """
    Calculate camera ID ranges for static distribution.
    
    Args:
        total_cameras: Total number of cameras
        num_workers: Number of GPU worker nodes
    
    Returns:
        List of dicts with worker_id, start, end
    
    Example:
        >>> calculate_camera_ranges(20000, 4)
        [
            {'worker_id': 'worker-1', 'start': 1, 'end': 5000},
            {'worker_id': 'worker-2', 'start': 5001, 'end': 10000},
            {'worker_id': 'worker-3', 'start': 10001, 'end': 15000},
            {'worker_id': 'worker-4', 'start': 15001, 'end': 20000},
        ]
    """
    cameras_per_worker = total_cameras // num_workers
    remainder = total_cameras % num_workers
    
    ranges = []
    current_start = 1
    
    for i in range(num_workers):
        # Distribute remainder across first workers
        extra = 1 if i < remainder else 0
        cameras_for_this_worker = cameras_per_worker + extra
        
        current_end = current_start + cameras_for_this_worker - 1
        
        ranges.append({
            "worker_id": f"worker-{i+1}",
            "start": current_start,
            "end": current_end,
            "count": cameras_for_this_worker,
        })
        
        current_start = current_end + 1
    
    return ranges


def print_distribution_plan(total_cameras: int, num_workers: int):
    """
    Print camera distribution plan for deployment.
    
    Args:
        total_cameras: Total number of cameras
        num_workers: Number of GPU worker nodes
    """
    ranges = calculate_camera_ranges(total_cameras, num_workers)
    
    print("\n" + "="*60)
    print("CAMERA DISTRIBUTION PLAN")
    print("="*60)
    print(f"Total Cameras: {total_cameras:,}")
    print(f"GPU Workers: {num_workers}")
    print(f"Cameras per Worker: ~{total_cameras // num_workers:,}")
    print("="*60)
    
    for r in ranges:
        print(
            f"{r['worker_id']:12} | "
            f"Cameras {r['start']:6,} - {r['end']:6,} | "
            f"Count: {r['count']:5,}"
        )
    
    print("="*60 + "\n")


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)
    
    # Test distribution calculation
    print_distribution_plan(20000, 4)
    print_distribution_plan(100000, 10)
    
    # Test distributor
    test_cameras = [
        {"id": 1, "ch_code": "12345"},
        {"id": 5001, "ch_code": "67890"},
        {"id": 10001, "ch_code": "11111"},
    ]
    
    os.environ["WORKER_ID"] = "worker-1"
    os.environ["CAMERA_START_ID"] = "1"
    os.environ["CAMERA_END_ID"] = "5000"
    os.environ["DISTRIBUTION_MODE"] = "static"
    
    dist = CameraDistributor()
    filtered = dist.filter_cameras(test_cameras)
    
    print(f"\nFiltered cameras for worker-1: {len(filtered)}")
    for cam in filtered:
        print(f"  - Camera ID {cam['id']}")
