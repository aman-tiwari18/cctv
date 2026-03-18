"""
Test Script for Blind Spot Detection
=====================================
This script tests the blind spot detection algorithms with a single camera feed.
Useful for debugging and verifying detection accuracy.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import numpy as np
import argparse
import logging
from blind_spot_det_tcs import BlindSpotDetector
from tcs_hls_utils import extract_hls_streaming_url, test_hls_stream, open_hls_stream

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))


def test_single_camera(camera_url, camera_id="test_camera", is_inside_lab=False, max_frames=100):
    """Test blind spot detection on a single camera feed"""
    
    logger.info(f"Testing blind spot detection on camera: {camera_id}")
    logger.info(f"URL: {camera_url}")
    logger.info(f"Inside Lab: {is_inside_lab}")
    
    # Extract and test HLS URL
    hls_url = extract_hls_streaming_url(camera_url)
    if not hls_url:
        logger.error("Failed to extract HLS URL")
        return False
    
    if not test_hls_stream(hls_url):
        logger.error("HLS stream test failed")
        return False
    
    # Open stream
    cap = open_hls_stream(hls_url)
    if cap is None or not cap.isOpened():
        logger.error("Failed to open HLS stream")
        return False
    
    # Create detector
    detector = BlindSpotDetector(camera_id)
    
    frame_count = 0
    logger.info("Starting frame processing...")
    
    try:
        while frame_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                logger.warning("Failed to read frame")
                break
            
            frame_count += 1
            
            # Analyze frame
            annotated_frame, issues = detector.analyze_frame(frame, is_inside_lab)
            
            # Display results
            cv2.imshow(f"Blind Spot Detection - {camera_id}", annotated_frame)
            
            # Print issues
            if frame_count % 10 == 0:
                logger.info(f"Frame {frame_count}:")
                for issue_type, issue_data in issues.items():
                    if isinstance(issue_data, dict) and issue_data.get('detected'):
                        logger.warning(f"  - {issue_type}: {issue_data}")
            
            # Save frame if issues detected
            detector.save_detection(annotated_frame, issues)
            
            # Press 'q' to quit, 's' to save current frame
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                logger.info("User quit")
                break
            elif key == ord('s'):
                save_path = f"{PROJECT_ROOT}/results/tcs_detections/blind_spot_detection/manual_save_{frame_count}.jpg"
                cv2.imwrite(save_path, annotated_frame)
                logger.info(f"Manually saved frame: {save_path}")
    
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Error during processing: {e}", exc_info=True)
    finally:
        cap.release()
        cv2.destroyAllWindows()
    
    # Print summary
    logger.info("\n=== Detection Summary ===")
    logger.info(f"Total frames processed: {frame_count}")
    logger.info(f"Edge obstructions: {detector.issue_counts['edge_obstruction']}")
    logger.info(f"Partial persons: {detector.issue_counts['partial_persons']}")
    logger.info(f"No movement: {detector.issue_counts['no_movement']}")
    logger.info(f"Obstructions: {detector.issue_counts['obstruction_detected']}")
    logger.info(f"Total detections saved: {len(detector.detections_log)}")
    
    return True


def test_with_synthetic_frames():
    """Test detection algorithms with synthetic test frames"""
    
    logger.info("\n=== Testing with Synthetic Frames ===")
    
    detector = BlindSpotDetector("synthetic_test")
    
    # Test 1: Frame with dark edges (obstruction)
    logger.info("\nTest 1: Dark edge obstruction")
    frame1 = np.zeros((480, 640, 3), dtype=np.uint8)
    frame1[50:430, 50:590] = 128  # Lighter center, dark edges
    annotated1, issues1 = detector.analyze_frame(frame1, is_inside_lab=False)
    cv2.imwrite(f"{PROJECT_ROOT}/results/tcs_detections/blind_spot_detection/test_dark_edges.jpg", annotated1)
    logger.info(f"Edge obstruction detected: {issues1['edge_obstruction']['detected']}")
    
    # Test 2: Very dark frame (complete obstruction)
    logger.info("\nTest 2: Complete obstruction (very dark)")
    frame2 = np.zeros((480, 640, 3), dtype=np.uint8) + 10
    annotated2, issues2 = detector.analyze_frame(frame2, is_inside_lab=False)
    cv2.imwrite(f"{PROJECT_ROOT}/results/tcs_detections/blind_spot_detection/test_complete_obstruction.jpg", annotated2)
    logger.info(f"Obstruction patterns detected: {issues2['obstruction_patterns']['detected']}")
    
    # Test 3: Uniform frame (no texture)
    logger.info("\nTest 3: Uniform frame (no texture)")
    frame3 = np.ones((480, 640, 3), dtype=np.uint8) * 128
    annotated3, issues3 = detector.analyze_frame(frame3, is_inside_lab=False)
    cv2.imwrite(f"{PROJECT_ROOT}/results/tcs_detections/blind_spot_detection/test_uniform.jpg", annotated3)
    logger.info(f"Uniform obstruction detected: {issues3['obstruction_patterns']['detected']}")
    
    # Test 4: Normal frame with some variation
    logger.info("\nTest 4: Normal frame (should pass)")
    frame4 = np.random.randint(50, 200, (480, 640, 3), dtype=np.uint8)
    annotated4, issues4 = detector.analyze_frame(frame4, is_inside_lab=False)
    cv2.imwrite(f"{PROJECT_ROOT}/results/tcs_detections/blind_spot_detection/test_normal.jpg", annotated4)
    logger.info(f"Any issues detected: {any([v.get('detected', False) for v in issues4.values() if isinstance(v, dict)])}")
    
    # Test 5: Static frames (no movement)
    logger.info("\nTest 5: Static frames (no movement)")
    detector_static = BlindSpotDetector("static_test")
    static_frame = np.ones((480, 640, 3), dtype=np.uint8) * 100
    
    for i in range(15):  # Process 15 identical frames
        annotated, issues = detector_static.analyze_frame(static_frame, is_inside_lab=True)
        if i == 14:
            logger.info(f"No movement detected after {i+1} frames: {issues['no_movement']['detected']}")
            cv2.imwrite(f"{PROJECT_ROOT}/results/tcs_detections/blind_spot_detection/test_static.jpg", annotated)
    
    logger.info("\nSynthetic tests complete. Check results folder for output images.")


def benchmark_performance():
    """Benchmark detection performance"""
    import time
    
    logger.info("\n=== Performance Benchmark ===")
    
    detector = BlindSpotDetector("benchmark")
    test_frame = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
    
    # Warm-up
    for _ in range(5):
        detector.analyze_frame(test_frame, is_inside_lab=False)
    
    # Benchmark
    num_iterations = 50
    start_time = time.time()
    
    for _ in range(num_iterations):
        detector.analyze_frame(test_frame, is_inside_lab=True)
    
    end_time = time.time()
    total_time = end_time - start_time
    fps = num_iterations / total_time
    avg_time = total_time / num_iterations
    
    logger.info(f"Processed {num_iterations} frames (1920x1080)")
    logger.info(f"Total time: {total_time:.2f} seconds")
    logger.info(f"Average time per frame: {avg_time*1000:.2f} ms")
    logger.info(f"Effective FPS: {fps:.2f}")


def main():
    parser = argparse.ArgumentParser(description="Test blind spot detection")
    parser.add_argument('--url', type=str, help='Camera URL to test')
    parser.add_argument('--camera-id', type=str, default='test_camera', help='Camera ID')
    parser.add_argument('--inside-lab', action='store_true', help='Camera is inside lab')
    parser.add_argument('--max-frames', type=int, default=100, help='Maximum frames to process')
    parser.add_argument('--synthetic', action='store_true', help='Run synthetic tests')
    parser.add_argument('--benchmark', action='store_true', help='Run performance benchmark')
    
    args = parser.parse_args()
    
    if args.synthetic:
        test_with_synthetic_frames()
    elif args.benchmark:
        benchmark_performance()
    elif args.url:
        test_single_camera(args.url, args.camera_id, args.inside_lab, args.max_frames)
    else:
        logger.info("No action specified. Use --help for options.")
        logger.info("\nQuick start:")
        logger.info("  Test with synthetic frames: python test_blind_spot.py --synthetic")
        logger.info("  Test with camera: python test_blind_spot.py --url 'YOUR_URL' --camera-id 'cam1'")
        logger.info("  Benchmark performance: python test_blind_spot.py --benchmark")


if __name__ == "__main__":
    main()
