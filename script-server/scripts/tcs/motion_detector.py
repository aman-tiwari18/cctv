"""
Motion Detection Pre-Filter Utility
====================================
Provides motion detection to reduce unnecessary YOLO inference.
Only runs detection when significant motion is detected in the frame.
"""

import cv2
import numpy as np
import threading

class MotionDetector:
    """
    Detects motion in video frames using background subtraction.
    Reduces GPU load by skipping YOLO detection on static frames.
    """
    
    def __init__(self, motion_threshold=1000, history=500, var_threshold=16):
        """
        Initialize motion detector.
        
        Args:
            motion_threshold: Minimum number of changed pixels to consider motion
            history: Number of frames to use for background model
            var_threshold: Variance threshold for background subtraction
        """
        self.motion_threshold = motion_threshold
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=history, 
            varThreshold=var_threshold, 
            detectShadows=False
        )
        self.lock = threading.Lock()
        self.frames_since_motion = 0
        self.total_frames = 0
        self.motion_frames = 0
        
    def has_motion(self, frame):
        """
        Check if frame has significant motion.
        
        Args:
            frame: Input frame (BGR format)
            
        Returns:
            bool: True if motion detected, False otherwise
        """
        with self.lock:
            self.total_frames += 1
            
            # Apply background subtraction
            fg_mask = self.bg_subtractor.apply(frame)
            
            # Count non-zero pixels (changed pixels)
            motion_pixels = cv2.countNonZero(fg_mask)
            
            has_motion = motion_pixels > self.motion_threshold
            
            if has_motion:
                self.motion_frames += 1
                self.frames_since_motion = 0
            else:
                self.frames_since_motion += 1
            
            return has_motion
    
    def get_stats(self):
        """Get motion detection statistics."""
        with self.lock:
            if self.total_frames == 0:
                return {
                    'total_frames': 0,
                    'motion_frames': 0,
                    'motion_percentage': 0,
                    'frames_since_motion': 0
                }
            
            return {
                'total_frames': self.total_frames,
                'motion_frames': self.motion_frames,
                'motion_percentage': (self.motion_frames / self.total_frames) * 100,
                'frames_since_motion': self.frames_since_motion
            }
    
    def reset(self):
        """Reset motion detector."""
        with self.lock:
            self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
                history=500, 
                varThreshold=16, 
                detectShadows=False
            )
            self.frames_since_motion = 0
            self.total_frames = 0
            self.motion_frames = 0


# Global motion detectors for each camera
_motion_detectors = {}
_detector_lock = threading.Lock()

def get_motion_detector(camera_id, motion_threshold=1000):
    """
    Get or create a motion detector for a specific camera.
    
    Args:
        camera_id: Camera identifier
        motion_threshold: Minimum pixels of motion to trigger
        
    Returns:
        MotionDetector instance
    """
    with _detector_lock:
        if camera_id not in _motion_detectors:
            _motion_detectors[camera_id] = MotionDetector(motion_threshold=motion_threshold)
        return _motion_detectors[camera_id]
