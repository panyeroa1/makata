-- Orbitz Live Translation - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Rooms table (meeting sessions)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID,
  mode TEXT CHECK (mode IN ('one_on_one', 'one_to_many')) NOT NULL,
  host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT CHECK (role IN ('host', 'audience')) NOT NULL,
  src_lang TEXT,
  tgt_lang TEXT,
  consent_granted BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Segments table (transcript chunks)
CREATE TABLE IF NOT EXISTS segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  speaker_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT,
  text TEXT NOT NULL,
  is_final BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Translations table
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id UUID REFERENCES segments(id) ON DELETE CASCADE NOT NULL,
  target_lang TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(segment_id, target_lang)
);

-- TTS Assets table (optional - for caching synthesized audio)
CREATE TABLE IF NOT EXISTS tts_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id UUID REFERENCES segments(id) ON DELETE CASCADE NOT NULL,
  target_lang TEXT NOT NULL,
  audio_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(segment_id, target_lang)
);

-- ============================================
-- INDEXES
-- ============================================

-- Rooms indexes
CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at);

-- Participants indexes  
CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id);

-- Segments indexes
CREATE INDEX IF NOT EXISTS idx_segments_room_created ON segments(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_segments_speaker ON segments(speaker_id);
CREATE INDEX IF NOT EXISTS idx_segments_final ON segments(is_final) WHERE is_final = true;

-- Translations indexes
CREATE INDEX IF NOT EXISTS idx_translations_segment_lang ON translations(segment_id, target_lang);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tts_assets ENABLE ROW LEVEL SECURITY;

-- Rooms policies
CREATE POLICY "Users can view rooms they participate in"
  ON rooms FOR SELECT
  USING (
    auth.uid() = host_id 
    OR 
    EXISTS (
      SELECT 1 FROM participants 
      WHERE participants.room_id = rooms.id 
      AND participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their rooms"
  ON rooms FOR UPDATE
  USING (auth.uid() = host_id);

-- Participants policies
CREATE POLICY "Users can view participants in their rooms"
  ON participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM participants p2
      WHERE p2.room_id = participants.room_id
      AND p2.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join rooms as participants"
  ON participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participant record"
  ON participants FOR UPDATE
  USING (auth.uid() = user_id);

-- Segments policies
CREATE POLICY "Users can view segments in their rooms"
  ON segments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = segments.room_id
      AND participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can create segments in their rooms"
  ON segments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants
      WHERE participants.room_id = segments.room_id
      AND participants.user_id = auth.uid()
    )
  );

-- Translations policies
CREATE POLICY "Users can view translations in their rooms"
  ON translations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM segments s
      JOIN participants p ON p.room_id = s.room_id
      WHERE s.id = translations.segment_id
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can create translations"
  ON translations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM segments s
      JOIN participants p ON p.room_id = s.room_id
      WHERE s.id = translations.segment_id
      AND p.user_id = auth.uid()
    )
  );

-- TTS Assets policies (same as translations)
CREATE POLICY "Users can view TTS assets in their rooms"
  ON tts_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM segments s
      JOIN participants p ON p.room_id = s.room_id
      WHERE s.id = tts_assets.segment_id
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can create TTS assets"
  ON tts_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM segments s
      JOIN participants p ON p.room_id = s.room_id
      WHERE s.id = tts_assets.segment_id
      AND p.user_id = auth.uid()
    )
  );

-- ============================================
-- REALTIME PUBLICATION
-- ============================================

-- Enable realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE segments;
ALTER PUBLICATION supabase_realtime ADD TABLE translations;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to automatically end room when host leaves
CREATE OR REPLACE FUNCTION end_room_on_host_leave()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    -- Host is leaving
    UPDATE rooms 
    SET ended_at = NOW()
    WHERE id = NEW.room_id 
    AND host_id = NEW.user_id
    AND ended_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_end_room_on_host_leave
  AFTER UPDATE ON participants
  FOR EACH ROW
  EXECUTE FUNCTION end_room_on_host_leave();

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment to insert sample data
/*
INSERT INTO rooms (mode, host_id) 
VALUES ('one_on_one', auth.uid());
*/

COMMENT ON TABLE rooms IS 'Meeting rooms/sessions';
COMMENT ON TABLE participants IS 'Users participating in rooms';
COMMENT ON TABLE segments IS 'Transcript segments from speech';
COMMENT ON TABLE translations IS 'Translated text for each segment';
COMMENT ON TABLE tts_assets IS 'Cached TTS audio URLs';
