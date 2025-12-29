/**
 * Signaling Service for Room Management
 * Handles room creation, joining, and real-time participant sync via Supabase
 */

import { supabase } from './supabaseClient';

export interface RoomData {
  room_id: string;
  room_code: string;
  mode: 'one_on_one' | 'one_to_many';
  host_id: string;
  created_at: string;
  settings: {
    allow_instant_join: boolean;
  };
}

export interface ParticipantData {
  id: string;
  room_id: string;
  user_id: string;
  role: 'host' | 'audience';
  status: 'waiting' | 'active' | 'denied';
  src_lang: string;
  tgt_lang: string;
  consent_granted: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface JoinRoomResult {
  participant_id: string;
  room_id: string;
  status: 'waiting' | 'active' | 'denied';
  role: 'host' | 'audience';
}

export class SignalingService {
  /**
   * Create a new room
   */
  static async createRoom(
    mode: 'one_on_one' | 'one_to_many',
    passcode: string,
    allowInstantJoin: boolean
  ): Promise<RoomData | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('[Signaling] No authenticated user');
      return null;
    }

    const { data, error } = await supabase.rpc('create_room_with_code', {
      p_mode: mode,
      p_passcode: passcode,
      p_allow_instant_join: allowInstantJoin,
    });

    if (error) {
      console.error('[Signaling] Failed to create room:', error);
      return null;
    }

    const result = data[0];
    return {
      room_id: result.id,
      room_code: result.code,
      mode: result.mode,
      host_id: result.host_id,
      created_at: result.created_at,
      settings: result.settings || { allow_instant_join: allowInstantJoin }
    } as RoomData;
  }

  /**
   * Update room settings
   */
  static async updateRoomSettings(roomId: string, settings: { allow_instant_join: boolean }) {
    const { error } = await supabase
      .from('rooms')
      .update({ settings })
      .eq('id', roomId);

    if (error) {
      console.error('[Signaling] Failed to update room settings:', error);
    }
  }

  /**
   * Join an existing room
   */
  static async joinRoom(
    roomCode: string,
    passcode: string,
    role: 'host' | 'audience',
    srcLang: string,
    tgtLang: string,
    consentGranted: boolean
  ): Promise<JoinRoomResult | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('[Signaling] No authenticated user');
      return null;
    }

    const { data, error } = await supabase.rpc('join_room_by_code', {
      p_code: roomCode,
      p_passcode: passcode,
      p_role: role,
      p_src_lang: srcLang,
      p_tgt_lang: tgtLang,
      p_consent_granted: consentGranted,
    });

    if (error) {
      console.error('[Signaling] Failed to join room:', error);
      return null;
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      console.error('[Signaling] Unexpected join response:', data);
      return null;
    }

    return data[0] as JoinRoomResult;
  }

  /**
   * Update participant status (Admit/Deny)
   */
  static async updateParticipantStatus(participantId: string, status: 'active' | 'denied') {
    const { error } = await supabase
      .from('participants')
      .update({ status })
      .eq('id', participantId);

    if (error) {
      console.error('[Signaling] Failed to update participant status:', error);
    }
  }

  /**
   * Leave a room
   */
  static async leaveRoom(participantId: string) {
    const { error } = await supabase
      .from('participants')
      .update({ left_at: new Date().toISOString() })
      .eq('id', participantId);

    if (error) {
      console.error('[Signaling] Failed to leave room:', error);
    }
  }

  /**
   * Subscribe to room participant changes
   */
  static subscribeToRoom(
    roomId: string,
    callbacks: {
      onParticipantJoined?: (participant: ParticipantData) => void;
      onParticipantLeft?: (participant: ParticipantData) => void;
      onParticipantUpdated?: (participant: ParticipantData) => void;
    }
  ) {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'participants',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: { new: ParticipantData }) => {
          if (callbacks.onParticipantJoined) {
            callbacks.onParticipantJoined(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'participants',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: { new: ParticipantData }) => {
          const participant = payload.new;
          
          // Check if participant left
          if (participant.left_at && callbacks.onParticipantLeft) {
            callbacks.onParticipantLeft(participant);
          } else if (callbacks.onParticipantUpdated) {
            callbacks.onParticipantUpdated(participant);
          }
        }
      )
      .subscribe();

    return channel;
  }

  /**
   * Get all participants in a room
   */
  static async getRoomParticipants(roomId: string): Promise<ParticipantData[]> {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .is('left_at', null);

    if (error) {
      console.error('[Signaling] Failed to get participants:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get room settings (requires participant access)
   */
  static async getRoomSettings(roomId: string): Promise<RoomData['settings'] | null> {
    const { data, error } = await supabase
      .from('rooms')
      .select('settings')
      .eq('id', roomId)
      .single();

    if (error) {
      console.error('[Signaling] Failed to get room settings:', error);
      return null;
    }

    return data?.settings || null;
  }

  /**
   * Update participant language preferences
   */
  static async updateParticipantLanguages(
    participantId: string,
    srcLang: string,
    tgtLang: string
  ) {
    const { error } = await supabase
      .from('participants')
      .update({ src_lang: srcLang, tgt_lang: tgtLang })
      .eq('id', participantId);

    if (error) {
      console.error('[Signaling] Failed to update languages:', error);
    }
  }
}
