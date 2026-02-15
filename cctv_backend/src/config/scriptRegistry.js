const path = require('path');

/**
 * Registry of available analytics scripts
 * Maps a technical script ID to user-friendly details and configuration
 */
module.exports = {
    // Face Detection
    "face_detection": {
        "name": "Face Recognition & Detection",
        "description": "Detects and recognizes faces in the camera feed. Alerts on unauthorized persons.",
        "script_path": "scripts/face_detection.sh", // Relative to project root
        "default_frequency": 5, // Run every 5 minutes
        "default_duration": 2 // Run for 2 minutes
    },

    // Motion Detection
    "motion_detection": {
        "name": "Motion Activity Monitoring",
        "description": "Detects significant motion in exam halls during restricted times.",
        "script_path": "scripts/motion_detection.sh",
        "default_frequency": 15,
        "default_duration": 5
    },

    // Audio Analysis
    "audio_analysis": {
        "name": "Audio Level Monitoring",
        "description": "Monitors noise levels to detect potential cheating via communication.",
        "script_path": "scripts/audio_analysis.sh",
        "default_frequency": 10,
        "default_duration": 3
    },

    // Test Scripts (for verification)
    "test_simple": {
        "name": "System Health Check (Simple)",
        "description": "Basic connectivity and system health verification.",
        "script_path": "scripts/test_simple.sh",
        "default_frequency": 60,
        "default_duration": 1
    },
    "test_param": {
        "name": "Parameter Validation Test",
        "description": "Verifies that parameters are correctly passed to the analysis engine.",
        "script_path": "scripts/test_param.sh",
        "default_frequency": 30,
        "default_duration": 1
    },
    "test_random": {
        "name": "Random Result Generator",
        "description": "Randomly generates success/failure results to test error handling.",
        "script_path": "scripts/test_random.sh",
        "default_frequency": 10,
        "default_duration": 1
    }
};
