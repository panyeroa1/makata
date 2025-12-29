/**
 * WebRTC Service for Peer-to-Peer Audio/Video Connections
 * Uses Supabase Realtime for signaling
 */

import { supabase } from './supabaseClient';

export interface PeerConnectionConfig {
  roomId: string;
  peerId: string;
  isHost: boolean;
  onRemoteStream?: (stream: MediaStream, peerId?: string) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: PeerConnectionConfig | null = null;
  private signalingChannel: any = null;
  private remotePeerId: string | null = null;

  // Use Google's free STUN servers
  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  async initialize(config: PeerConnectionConfig, localStream: MediaStream) {
    this.config = config;
    this.localStream = localStream;

    // Create peer connection
    this.peerConnection = new RTCPeerConnection(this.iceServers);

    // Add local tracks to connection
    localStream.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, localStream);
    });

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote track');
      if (config.onRemoteStream) {
        config.onRemoteStream(event.streams[0], this.remotePeerId || undefined);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection!.connectionState;
      console.log('[WebRTC] Connection state:', state);
      if (config.onConnectionStateChange) {
        config.onConnectionStateChange(state);
      }
    };

    // Setup signaling
    await this.setupSignaling();

    // If host, create and send offer
    if (config.isHost) {
      await this.createOffer();
    }
  }

  private async setupSignaling() {
    if (!this.config) return;

    // Subscribe to signaling channel
    this.signalingChannel = supabase
      .channel(`room:${this.config.roomId}:signaling`)
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (payload.from === this.config!.peerId) return;
        if (payload.to === 'all' || payload.to === this.config!.peerId) {
          await this.handleOffer(payload.offer, payload.from);
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.from === this.config!.peerId) return;
        if (payload.to === this.config!.peerId) {
          await this.handleAnswer(payload.answer, payload.from);
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.from === this.config!.peerId) return;
        if (payload.to === 'all' || payload.to === this.config!.peerId) {
          await this.handleIceCandidate(payload.candidate);
        }
      })
      .subscribe();

    // Handle ICE candidates
    this.peerConnection!.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendIceCandidate(event.candidate);
      }
    };
  }

  private async createOffer() {
    if (!this.peerConnection || !this.config) return;

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Broadcast offer via Supabase
    await this.signalingChannel.send({
      type: 'broadcast',
      event: 'offer',
      payload: {
        from: this.config.peerId,
        to: 'all', // In one-on-one, could be specific peer
        offer: offer
      }
    });
  }

  private async handleOffer(offer: RTCSessionDescriptionInit, from?: string) {
    if (!this.peerConnection || !this.config) return;

    if (from) {
      this.remotePeerId = from;
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // Send answer back
    await this.signalingChannel.send({
      type: 'broadcast',
      event: 'answer',
      payload: {
        from: this.config.peerId,
        to: this.remotePeerId || 'all', // Send to offerer when known
        answer: answer
      }
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit, from?: string) {
    if (!this.peerConnection) return;

    if (from) {
      this.remotePeerId = from;
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) return;

    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private async sendIceCandidate(candidate: RTCIceCandidate) {
    if (!this.config) return;

    await this.signalingChannel.send({
      type: 'broadcast',
      event: 'ice-candidate',
      payload: {
        from: this.config.peerId,
        to: this.remotePeerId || 'all',
        candidate: candidate.toJSON()
      }
    });
  }

  disconnect() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.signalingChannel) {
      supabase.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }

    this.localStream = null;
    this.config = null;
    this.remotePeerId = null;
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }
}
