-- Migration: Room Codes, Passcodes, RPCs, and RLS fixes
-- Created: 2025-12-31

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Room code + passcode hash
ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS passcode_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code_unique ON rooms(code);

-- 2. Code generator
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  seg1 TEXT;
  seg2 TEXT;
  seg3 TEXT;
BEGIN
  seg1 := lpad((floor(random() * 1000))::int::text, 3, '0');
  seg2 := lpad((floor(random() * 1000))::int::text, 3, '0');
  seg3 := lpad((floor(random() * 1000))::int::text, 3, '0');
  RETURN seg1 || '-' || seg2 || '-' || seg3;
END;
$$ LANGUAGE plpgsql;

-- 3. Create room with code + passcode
CREATE OR REPLACE FUNCTION create_room_with_code(
  p_mode TEXT,
  p_passcode TEXT,
  p_allow_instant_join BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  code TEXT,
  mode TEXT,
  host_id UUID,
  settings JSONB,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;

  LOOP
    new_code := generate_room_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE code = new_code);
  END LOOP;

  INSERT INTO rooms (mode, host_id, code, passcode_hash, settings)
  VALUES (
    p_mode,
    auth.uid(),
    new_code,
    crypt(p_passcode, gen_salt('bf')),
    jsonb_build_object('allow_instant_join', p_allow_instant_join)
  )
  RETURNING rooms.id, rooms.code, rooms.mode, rooms.host_id, rooms.settings, rooms.created_at
  INTO id, code, mode, host_id, settings, created_at;

  -- Ensure host is also a participant
  INSERT INTO participants (room_id, user_id, role, status, consent_granted)
  VALUES (id, auth.uid(), 'host', 'active', TRUE);

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Join room by code + passcode
CREATE OR REPLACE FUNCTION join_room_by_code(
  p_code TEXT,
  p_passcode TEXT,
  p_role TEXT,
  p_src_lang TEXT,
  p_tgt_lang TEXT,
  p_consent_granted BOOLEAN
)
RETURNS TABLE (
  participant_id UUID,
  room_id UUID,
  status TEXT,
  role TEXT
) AS $$
DECLARE
  room_rec rooms%ROWTYPE;
  join_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;

  SELECT * INTO room_rec FROM rooms WHERE code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF room_rec.passcode_hash IS NULL
     OR crypt(p_passcode, room_rec.passcode_hash) <> room_rec.passcode_hash THEN
    RAISE EXCEPTION 'Invalid passcode';
  END IF;

  IF p_role NOT IN ('host', 'audience') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_role = 'host' THEN
    join_status := 'active';
  ELSE
    join_status := CASE
      WHEN (room_rec.settings->>'allow_instant_join')::boolean THEN 'active'
      ELSE 'waiting'
    END;
  END IF;

  INSERT INTO participants (
    room_id,
    user_id,
    role,
    status,
    src_lang,
    tgt_lang,
    consent_granted
  )
  VALUES (
    room_rec.id,
    auth.uid(),
    p_role,
    join_status,
    p_src_lang,
    p_tgt_lang,
    p_consent_granted
  )
  RETURNING participants.id, participants.room_id, participants.status, participants.role
  INTO participant_id, room_id, status, role;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Grant RPCs
GRANT EXECUTE ON FUNCTION create_room_with_code(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION join_room_by_code(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- 6. RLS: allow hosts to update participants in their rooms
CREATE POLICY "Hosts can update participants in their rooms"
  ON participants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE rooms.id = participants.room_id
      AND rooms.host_id = auth.uid()
    )
  );
