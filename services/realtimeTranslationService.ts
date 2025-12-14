/**
 * Real-Time Translation Service
 * Orchestrates: Deepgram (STT) → Gemini Flash Lite (Translation) → Gemini Live Audio (TTS)
 */

import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";
// import { webSpeechSTT, WebSpeechSTT, TranscriptSegment } from "./webSpeechSTT"; // REMOVED
import { DeepgramSTT, TranscriptSegment } from "./deepgramSTT";
import { transcriptLogger } from "./transcriptLogger";
import { translateText, LiveSession, generateSpeech } from "./geminiService";
import { decodePcmAudioData } from "./audioUtils";

type TranslationMode = 'live-audio' | 'discrete-tts';

export interface RealtimeTranslationConfig {
  sourceLang: Language;
  targetLang: Language;
  audioInputDeviceId?: string;
  audioOutputDeviceId?: string;
  mode?: TranslationMode;
  enableLoopback?: boolean;
  speakerLabel?: string; // e.g. "Mario" or "Host Shared Tab"
  deepgramApiKey?: string;
}

export interface TranslationEvents {
  onTranscript?: (original: string, isFinal: boolean) => void;
  onTranslation?: (translated: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: 'idle' | 'listening' | 'translating' | 'speaking' | 'error') => void;
}

export class RealtimeTranslationService {
  private geminiClient: GoogleGenAI;
  private config: RealtimeTranslationConfig;
  private events: TranslationEvents;
  private isActive: boolean = false;
  private liveSession: LiveSession | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  
  // Use Deepgram instead of WebSpeech
  private sttService: DeepgramSTT;
  
  // Translation cache
  private translationCache: Map<string, string> = new Map();
  private readonly CACHE_SIZE_LIMIT = 500;

  constructor(
    geminiClient: GoogleGenAI,
    config: RealtimeTranslationConfig,
    events: TranslationEvents = {}
  ) {
    this.geminiClient = geminiClient;
    this.config = { mode: 'discrete-tts', enableLoopback: false, speakerLabel: 'User', ...config };
    this.events = events;

    const apiKey = config.deepgramApiKey || import.meta.env.VITE_DEEPGRAM_API_KEY || '';
    this.sttService = new DeepgramSTT(apiKey);
  }

  /**
   * Start real-time translation
   */
  async start(externalStream?: MediaStream): Promise<void> {
    if (this.isActive) {
      console.warn('[RealtimeTranslation] Already active');
      return;
    }

    try {
      console.log('[RealtimeTranslation] Starting translation service...');
      this.updateStatus('listening');
      this.isActive = true;

      // Step 1: Get Media Stream (if not provided externally)
      if (externalStream) {
        this.mediaStream = externalStream;
        console.log('[RealtimeTranslation] Using external media stream');
      } else {
        console.log('[RealtimeTranslation] Requesting microphone access...');
        const constraints: MediaStreamConstraints = {
            audio: this.config.audioInputDeviceId
            ? { deviceId: { exact: this.config.audioInputDeviceId } }
            : true,
            video: false,
        };
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('[RealtimeTranslation] Microphone access granted');
      }

      // Step 2: Initialize output audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });

      // Step 3: Start Deepgram STT
      console.log('[RealtimeTranslation] Starting Deepgram STT...');
      
      const started = await this.sttService.start(
        this.mediaStream,
        {
            onTranscript: async (segment) => {
                await this.handleTranscript(segment);
            },
            onError: (err) => {
                console.error('[RealtimeTranslation] STT Error:', err);
                this.events.onError?.(err);
            }
        },
        this.config.speakerLabel || 'User'
      );

      if (!started) {
          throw new Error('Failed to start Deepgram STT');
      }

      console.log('[RealtimeTranslation] ✅ Started successfully');
    } catch (error: any) {
      console.error('[RealtimeTranslation] ❌ Start failed:', error);
      this.events.onError?.(error.message || 'Start failed');
      this.updateStatus('error');
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Stop real-time translation
   */
  stop(): void {
    if (!this.isActive) return;

    this.sttService.stop();

    if (this.liveSession) {
      this.liveSession.disconnect();
      this.liveSession = null;
    }

    // Only close stream if we created it (not if passed externally? 
    // actually, usually we want to stop tracks if we own the service logic, 
    // unless sharing stream multiple places. For now, stop tracks.)
    // Update: If external stream (like screen share) is used by video element too, 
    // we might NOT want to stop it here. But usually standard practice.
    if (this.mediaStream) {
    //   this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isActive = false;
    this.updateStatus('idle');
    console.log('[RealtimeTranslation] Stopped');
  }

  /**
   * Update source language
   */
  setSourceLanguage(lang: Language): void {
    this.config.sourceLang = lang;
    // Deepgram handles multi-language or we'd restart with new config.
    // Nova-2/3 with 'multi' or 'en' usually suffices, or we could restart.
    // For now, assuming Nova-3 handles this or parameters are fixed.
    console.log('[RealtimeTranslation] Source language update request (Deepgram manages auto-detect often):', lang);
  }

  /**
   * Update target language
   */
  setTargetLanguage(lang: Language): void {
    this.config.targetLang = lang;
    console.log('[RealtimeTranslation] Target language updated to:', lang);
  }

  /**
   * Handle incoming transcript
   */
  private async handleTranscript(segment: TranscriptSegment): Promise<void> {
    if (!this.isActive || !segment.text.trim()) return;

    // Emit original transcript
    this.events.onTranscript?.(segment.text, segment.isFinal);

    // LOGGING TO SUPABASE
    // We log final segments
    if (segment.isFinal) {
        // Assume session ID is global or passed in config? 
        // For now, use 'current-session' or similar as placeholder if not in config.
        // Ideally config should have sessionId.
        await transcriptLogger.logSegment('active-session', segment.text);
    }

    // Only translate final segments to reduce API calls
    if (!segment.isFinal) return;

    this.updateStatus('translating');

    // Clean text for translation (remove speaker label if needed, or translate whole thing)
    // Actually, usually we translate pure text.
    // Parse "Label: Text" -> "Text"
    let textToTranslate = segment.text;
    const match = segment.text.match(/^[^:]+:\s+(.+)$/);
    if (match) {
        textToTranslate = match[1];
    }

    // Check cache
    const cacheKey = `${this.config.sourceLang}:${textToTranslate}:${this.config.targetLang}`;
    let translatedText = this.translationCache.get(cacheKey);

    if (!translatedText) {
      translatedText = await translateText(
        this.geminiClient,
        textToTranslate,
        this.config.sourceLang,
        this.config.targetLang
      );

      this.translationCache.set(cacheKey, translatedText);
      if (this.translationCache.size > this.CACHE_SIZE_LIMIT) {
        const firstKey = this.translationCache.keys().next().value;
        if (firstKey !== undefined) this.translationCache.delete(firstKey);
      }
    }

    this.events.onTranslation?.(translatedText, true);

    if (this.config.mode === 'discrete-tts') {
      await this.playDiscreteTTS(translatedText);
    } else {
      await this.playLiveAudioTTS(translatedText);
    }

    this.updateStatus('listening');
  }

  private async playDiscreteTTS(text: string): Promise<void> {
    try {
      this.updateStatus('speaking');
      const voiceName = this.getVoiceForLanguage(this.config.targetLang);
      const audioBase64 = await generateSpeech(
        this.geminiClient,
        text,
        this.config.targetLang,
        voiceName
      );

      if (audioBase64 && this.audioContext) {
        const audioBuffer = decodePcmAudioData(audioBase64, this.audioContext, 24000, 1);
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        if (this.config.audioOutputDeviceId) {
          try {
            await (this.audioContext.destination as any).setSinkId?.(this.config.audioOutputDeviceId);
          } catch (e) {
            console.warn('[RealtimeTranslation] Could not set audio output device:', e);
          }
        }
        source.connect(this.audioContext.destination);
        source.start();
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
      }
    } catch (error) {
      console.error('[RealtimeTranslation] TTS playback error:', error);
      this.events.onError?.('TTS playback failed');
    }
  }

  private async playLiveAudioTTS(text: string): Promise<void> {
      // (Simplified reuse of existing logic)
      await this.playDiscreteTTS(text);
  }

  private updateStatus(status: 'idle' | 'listening' | 'translating' | 'speaking' | 'error'): void {
    this.events.onStatusChange?.(status);
  }

  private mapLanguageToCode(lang: Language): string {
    return 'en-US'; // Placeholder, Deepgram configures this in start() usually
  }

  private getVoiceForLanguage(lang: Language): string {
    const voiceMap: Record<string, string> = {
      'English (United States)': 'Puck',
      'English (United Kingdom)': 'Charon',
      'Spanish (Spain)': 'Kore',
      'Spanish (Mexico)': 'Kore',
      'French (France)': 'Fenrir',
      'German (Germany)': 'Aoede',
      'Italian': 'Kore',
      'Portuguese (Brazil)': 'Kore',
      'Japanese': 'Puck',
      'Korean': 'Puck',
      'Chinese (Mandarin Simplified)': 'Puck',
      'Hindi': 'Puck',
    };
    return voiceMap[lang] || 'Puck';
  }

  clearCache(): void {
    this.translationCache.clear();
  }

  isRunning(): boolean {
    return this.isActive;
  }
}
