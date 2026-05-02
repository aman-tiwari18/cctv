-- Migration 019: Add Biometric Crowd Detection and QP Box Detection Scripts
-- Description: Adds new detection scripts for biometric area crowd monitoring and QP box detection
-- Date: 2026-05-02

-- ============================================================================
-- Add QP Box Detection Script (if not exists)
-- ============================================================================
INSERT INTO scripts (
    script_id,
    name,
    default_frequency_minutes,
    default_duration_minutes,
    is_active,
    created_at,
    updated_at
)
SELECT 
    'qp_box',
    'QP Box Detection',
    5,  -- Check every 5 minutes
    1,  -- Run for 1 minute
    1,  -- Active
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM scripts WHERE script_id = 'qp_box'
);

-- ============================================================================
-- Add Biometric Crowd Detection Script
-- ============================================================================
INSERT INTO scripts (
    script_id,
    name,
    default_frequency_minutes,
    default_duration_minutes,
    is_active,
    created_at,
    updated_at
)
SELECT 
    'crowd_biometric',
    'Biometric Area Crowd Detection',
    10,  -- Check every 10 minutes (as per analytics requirement)
    1,   -- Run for 1 minute
    1,   -- Active
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM scripts WHERE script_id = 'crowd_biometric'
);

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the scripts were added:
-- SELECT script_id, name, default_frequency_minutes, default_duration_minutes, is_active 
-- FROM scripts 
-- WHERE script_id IN ('qp_box', 'crowd_biometric');
