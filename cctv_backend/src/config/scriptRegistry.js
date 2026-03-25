/**
 * Registry of schedulable analytics scripts.
 * The scripts table is synced from this registry so local environments do not
 * depend on manual SQL seed data.
 */
module.exports = {
    server: {
        name: 'Server Room Detection',
        description: 'Detects people or movement in server room camera feeds.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    crowd: {
        name: 'Crowd Detection',
        description: 'Detects crowding in active camera feeds.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    intruder: {
        name: 'Intruder Detection',
        description: 'Detects unauthorized people in protected areas.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    entry_exit: {
        name: 'Entry Exit Detection',
        description: 'Tracks entry and exit movement patterns.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    proximity: {
        name: 'Proximity Detection',
        description: 'Detects close proximity violations in exam halls.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    phone: {
        name: 'Phone Detection',
        description: 'Detects mobile phone usage in camera feeds.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    invigilator: {
        name: 'Invigilator Detection',
        description: 'Tracks invigilator presence and movement.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    vision: {
        name: 'Scene Classification',
        description: 'Classifies each camera view and stores the result in the classification column.',
        script_path: 'scripts/detection/vision_classification.py',
        default_frequency: 60,
        default_duration: 30,
    },
    inversion: {
        name: 'Camera Inversion Detection',
        description: 'Detects rotated or inverted HLS camera feeds.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
    tampering: {
        name: 'Camera Tampering Detection',
        description: 'Detects blur, blockage, or tampering in HLS camera feeds.',
        script_path: 'scripts/detection/pipeline/master_pipeline.py',
        default_frequency: 5,
        default_duration: 1,
    },
};
