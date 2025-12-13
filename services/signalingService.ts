/**
 * Signaling Service for Room Management
 * Handles room creation, joining, and real-time participant sync via Supabase
 */

import { supabase } from './supabaseClient';

export interface RoomData {
  id: string;
  mode: 'one_on_one' | 'one_to_many';
  host_id: string;
  created_at: string;
}

export interface ParticipantData {
  id: string;
  room_id: string;
  user_id: string;
  role: 'host' | 'audience';
  src_lang: string;
  tgt_lang: string;
  consent_granted: boolean;
  joined_at: string;
  left_at: string | null;
}

export class SignalingService {
  /**
   * Create a new room
   */
  static async createRoom(mode: 'one_on_one' | 'one_to_many'): Promise<RoomData | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('[Signaling] No authenticated user');
      return null;
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        mode,
        host_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[Signaling] Failed to create room:', error);
      return null;
    }

    return data;
  }

  /**
   * Join an existing room
   */
  static async joinRoom(
    roomId: string,
    role: 'host' | 'audience',
    srcLang: string,
    tgtLang: string,
    consentGranted: boolean
  ): Promise<ParticipantData | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('[Signaling] No authenticated user');
      return null;
    }

    const { data, error } = await supabase
      .from('participants')
      .insert({
        room_id: roomId,
        user_id: user.id,
        role,
        src_lang: srcLang,
        tgt_lang: tgtLang,
        consent_granted: consentGranted,
      })
      .select()
      .single();

    if (error) {
      console.error('[Signaling] Failed to join room:', error);
      return null;
    }

    return data;
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
        (payload) => {
          if (callbacks.onParticipantJoined) {
            callbacks.onParticipantJoined(payload.new as ParticipantData);
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
        (payload) => {
          const participant = payload.new as ParticipantData;
          
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
