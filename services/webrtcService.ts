/**
 * WebRTC Service for Peer-to-Peer Audio/Video Connections
 * Uses Supabase Realtime for signaling
 */

import { supabase } from './supabaseClient';

export interface PeerConnectionConfig {
  roomId: string;
  peerId: string;
  isHost: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: PeerConnectionConfig | null = null;
  private signalingChannel: any = null;

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
        config.onRemoteStream(event.streams[0]);
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
        if (payload.to === this.config!.peerId) {
          await this.handleOffer(payload.offer);
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (payload.to === this.config!.peerId) {
          await this.handleAnswer(payload.answer);
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.to === this.config!.peerId) {
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

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (!this.peerConnection || !this.config) return;

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // Send answer back
    await this.signalingChannel.send({
      type: 'broadcast',
      event: 'answer',
      payload: {
        from: this.config.peerId,
        to: this.config.peerId, // Send to offerer
        answer: answer
      }
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;

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
        to: 'all',
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
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }
}
