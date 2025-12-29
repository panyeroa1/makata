-- Migration: Add Participant Status & Room Settings
-- Created: 2025-12-30

-- 1. Add 'status' column to participants
-- Allowed values: 'waiting', 'active', 'denied'
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('waiting', 'active', 'denied')) DEFAULT 'waiting';

-- Update existing participants to 'active' (retroactive fix)
UPDATE participants SET status = 'active' WHERE status IS NULL;

-- 2. Add 'settings' column to rooms
-- Stores JSON configuration like { "allow_instant_join": boolean }
ALTER TABLE rooms 
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{"allow_instant_join": false}'::jsonb;

-- 3. Add Index for status to optimize filtering waiting users
CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);

-- 4. Update Policies to ensure Guests can only see themselves if 'waiting'
-- (Optional: Depending on strictness, we might want to hide waiting users from other guests)
-- For now, we keep existing policies which allow room participants to see each other.
