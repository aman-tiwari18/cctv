"""
Global Detection Rate Limiter
==============================
Ensures detection scripts don't exceed 25 alerts per minute.
Implements sliding window rate limiting with dynamic cooldown adjustment.
"""

import time
import threading
from collections import deque
from datetime import datetime

class DetectionRateLimiter:
    """
    Thread-safe rate limiter for detection scripts.
    Target: Maximum 25 detections per minute per script.
    """
    
    def __init__(self, max_per_minute=25, window_seconds=60):
        """
        Initialize rate limiter.
        
        Args:
            max_per_minute: Maximum detections allowed per minute
            window_seconds: Time window for rate limiting (default: 60 seconds)
        """
        self.max_per_minute = max_per_minute
        self.window_seconds = window_seconds
        self.detections = deque()  # Stores timestamps of detections
        self.lock = threading.Lock()
        self.total_rejected = 0
        self.total_accepted = 0
        
    def _cleanup_old_detections(self, current_time):
        """Remove detections outside the current time window."""
        cutoff_time = current_time - self.window_seconds
        while self.detections and self.detections[0] < cutoff_time:
            self.detections.popleft()
    
    def should_save_detection(self, camera_id="unknown"):
        """
        Check if a detection should be saved based on rate limits.
        
        Args:
            camera_id: Identifier for the camera (for logging)
            
        Returns:
            tuple: (should_save: bool, current_rate: int, suggested_cooldown: float)
        """
        with self.lock:
            current_time = time.time()
            
            # Clean up old detections
            self._cleanup_old_detections(current_time)
            
            current_count = len(self.detections)
            
            # Check if we're under the limit
            if current_count < self.max_per_minute:
                self.detections.append(current_time)
                self.total_accepted += 1
                
                # Calculate suggested cooldown based on current rate
                if current_count > 0:
                    # Average time between detections
                    time_span = current_time - self.detections[0]
                    avg_interval = time_span / current_count if current_count > 0 else 0
                    suggested_cooldown = max(2.4, avg_interval * 1.2)  # At least 2.4s (25/min)
                else:
                    suggested_cooldown = 2.4
                
                return True, current_count + 1, suggested_cooldown
            else:
                self.total_rejected += 1
                
                # Calculate when the next detection slot will be available
                oldest_detection = self.detections[0]
                next_available = oldest_detection + self.window_seconds
                wait_time = next_available - current_time
                
                # Suggest a much higher cooldown when rate limited
                suggested_cooldown = max(wait_time, self.window_seconds / self.max_per_minute * 2)
                
                return False, current_count, suggested_cooldown
    
    def get_stats(self):
        """Get statistics about rate limiting."""
        with self.lock:
            current_time = time.time()
            self._cleanup_old_detections(current_time)
            
            return {
                'current_rate': len(self.detections),
                'max_per_minute': self.max_per_minute,
                'total_accepted': self.total_accepted,
                'total_rejected': self.total_rejected,
                'rejection_rate': self.total_rejected / max(1, self.total_accepted + self.total_rejected)
            }
    
    def reset(self):
        """Reset the rate limiter."""
        with self.lock:
            self.detections.clear()
            self.total_rejected = 0
            self.total_accepted = 0


# Global rate limiters for each detection type
_rate_limiters = {}
_limiter_lock = threading.Lock()

def get_rate_limiter(detection_type, max_per_minute=25):
    """
    Get or create a rate limiter for a specific detection type.
    
    Args:
        detection_type: Type of detection (e.g., 'crowd', 'phone', 'server_room')
        max_per_minute: Maximum detections per minute
        
    Returns:
        DetectionRateLimiter instance
    """
    with _limiter_lock:
        if detection_type not in _rate_limiters:
            _rate_limiters[detection_type] = DetectionRateLimiter(max_per_minute=max_per_minute)
        return _rate_limiters[detection_type]


def check_and_save_detection(detection_type, camera_id, save_func, *args, **kwargs):
    """
    Helper function to check rate limit and save detection if allowed.
    
    Args:
        detection_type: Type of detection
        camera_id: Camera identifier
        save_func: Function to call if detection should be saved
        *args, **kwargs: Arguments to pass to save_func
        
    Returns:
        tuple: (was_saved: bool, current_rate: int)
    """
    limiter = get_rate_limiter(detection_type)
    should_save, current_rate, suggested_cooldown = limiter.should_save_detection(camera_id)
    
    if should_save:
        # Execute the save function
        save_func(*args, **kwargs)
        return True, current_rate, suggested_cooldown
    else:
        return False, current_rate, suggested_cooldown
