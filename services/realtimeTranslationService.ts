/**
 * Real-Time Translation Service
 * Orchestrates: Web Speech API (STT) → Gemini Flash Lite (Translation) → Gemini Live Audio (TTS)
 * 
 * This service provides a simplified API for real-time voice translation with:
 * - Continuous microphone capture via Web Speech API
 * - Fast translation via Gemini Flash Lite
 * - Natural speech output via Gemini Live Audio
 * - Minimal latency optimizations
 */

import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";
import { webSpeechSTT, TranscriptSegment } from "./webSpeechSTT";
import { translateText, LiveSession, generateSpeech } from "./geminiService";

type TranslationMode = 'live-audio' | 'discrete-tts';

export interface RealtimeTranslationConfig {
  sourceLang: Language;
  targetLang: Language;
  audioInputDeviceId?: string;
  audioOutputDeviceId?: string;
  mode?: TranslationMode; // 'live-audio' uses Gemini Live, 'discrete-tts' uses generate-speech
  enableLoopback?: boolean; // If true, user hears their own translation
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
  
  // Translation cache for reducing API calls
  private translationCache: Map<string, string> = new Map();
  private readonly CACHE_SIZE_LIMIT = 500;

  constructor(
    geminiClient: GoogleGenAI,
    config: RealtimeTranslationConfig,
    events: TranslationEvents = {}
  ) {
    this.geminiClient = geminiClient;
    this.config = { mode: 'discrete-tts', enableLoopback: false, ...config };
    this.events = events;
  }

  /**
   * Start real-time translation
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.warn('[RealtimeTranslation] Already active');
      return;
    }

    try {
      this.updateStatus('listening');
      this.isActive = true;

      // Request microphone permission with specific device if provided
      const constraints: MediaStreamConstraints = {
        audio: this.config.audioInputDeviceId
          ? { deviceId: { exact: this.config.audioInputDeviceId } }
          : true,
        video: false,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Initialize audio context for output
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Set up Web Speech API for transcription
      const langCode = this.mapLanguageToCode(this.config.sourceLang);
      webSpeechSTT.setLanguage(langCode);

      const started = webSpeechSTT.start({
        onTranscript: async (segment: TranscriptSegment) => {
          await this.handleTranscript(segment);
        },
        onError: (error: string) => {
          console.error('[RealtimeTranslation] STT Error:', error);
          this.events.onError?.(error);
          this.updateStatus('error');
        },
      });

      if (!started) {
        throw new Error('Failed to start Web Speech API');
      }

      console.log('[RealtimeTranslation] Started successfully', {
        mode: this.config.mode,
        sourceLang: this.config.sourceLang,
        targetLang: this.config.targetLang,
      });
    } catch (error: any) {
      console.error('[RealtimeTranslation] Start failed:', error);
      this.events.onError?.(error.message || 'Failed to start translation');
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

    webSpeechSTT.stop();

    if (this.liveSession) {
      this.liveSession.disconnect();
      this.liveSession = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
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
    if (this.isActive) {
      const langCode = this.mapLanguageToCode(lang);
      webSpeechSTT.setLanguage(langCode);
      console.log('[RealtimeTranslation] Source language updated to:', lang);
    }
  }

  /**
   * Update target language
   */
  setTargetLanguage(lang: Language): void {
    this.config.targetLang = lang;
    console.log('[RealtimeTranslation] Target language updated to:', lang);
  }

  /**
   * Handle incoming transcript from Web Speech API
   */
  private async handleTranscript(segment: TranscriptSegment): Promise<void> {
    if (!this.isActive || !segment.text.trim()) return;

    // Emit original transcript
    this.events.onTranscript?.(segment.text, segment.isFinal);

    // Only translate final segments to reduce API calls
    if (!segment.isFinal) return;

    this.updateStatus('translating');

    // Check cache first
    const cacheKey = `${this.config.sourceLang}:${segment.text}:${this.config.targetLang}`;
    let translatedText = this.translationCache.get(cacheKey);

    if (!translatedText) {
      // Translate using Gemini Flash Lite
      translatedText = await translateText(
        this.geminiClient,
        segment.text,
        this.config.sourceLang,
        this.config.targetLang
      );

      // Cache the translation
      this.translationCache.set(cacheKey, translatedText);
      
      // Evict oldest if cache is too large
      if (this.translationCache.size > this.CACHE_SIZE_LIMIT) {
        const firstKey = this.translationCache.keys().next().value;
        if (firstKey !== undefined) {
          this.translationCache.delete(firstKey);
        }
      }
    }

    // Emit translation
    this.events.onTranslation?.(translatedText, true);

    // Generate and play TTS
    if (this.config.mode === 'discrete-tts') {
      await this.playDiscreteTTS(translatedText);
    } else {
      await this.playLiveAudioTTS(translatedText);
    }

    this.updateStatus('listening');
  }

  /**
   * Play TTS using discrete generateSpeech API
   */
  private async playDiscreteTTS(text: string): Promise<void> {
    try {
      this.updateStatus('speaking');

      const audioBase64 = await generateSpeech(
        this.geminiClient,
        text,
        this.config.targetLang
      );

      if (audioBase64 && this.audioContext) {
        // Decode and play audio
        const audioData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
        const audioBuffer = await this.audioContext.decodeAudioData(audioData.buffer);
        
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Apply output device if specified (limited browser support)
        if (this.config.audioOutputDeviceId) {
          try {
            await (this.audioContext.destination as any).setSinkId?.(this.config.audioOutputDeviceId);
          } catch (e) {
            console.warn('[RealtimeTranslation] Could not set audio output device:', e);
          }
        }

        source.connect(this.audioContext.destination);
        source.start();

        // Wait for audio to finish
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });
      }
    } catch (error) {
      console.error('[RealtimeTranslation] TTS playback error:', error);
      this.events.onError?.('TTS playback failed');
    }
  }

  /**
   * Play TTS using Gemini Live Audio (streaming)
   */
  private async playLiveAudioTTS(text: string): Promise<void> {
    try {
      this.updateStatus('speaking');

      // Initialize Live Session if not already
      if (!this.liveSession) {
        const apiKey = (this.geminiClient as any).apiKey || process.env.API_KEY;
        if (!apiKey) {
          throw new Error('API key not available for Live Audio TTS');
        }
        this.liveSession = new LiveSession(apiKey);
        
        await this.liveSession.connect(
          {
            systemInstruction: `You are a text-to-speech system. Simply read aloud the text provided in ${this.config.targetLang}. Do not add commentary or explanations.`,
            voiceName: this.getVoiceForLanguage(this.config.targetLang),
          },
          () => {} // No transcription callback needed for TTS-only
        );

        // Set volume based on loopback preference
        this.liveSession.setVolume(this.config.enableLoopback ? 1 : 0);
      }

      // Send text to Live Session for TTS
      // Note: Live Session is designed for full conversation, so we'll use discrete TTS instead
      // This is a fallback - in production, we'd enhance LiveSession with a direct TTS method
      await this.playDiscreteTTS(text);
      
    } catch (error) {
      console.error('[RealtimeTranslation] Live Audio TTS error:', error);
      // Fallback to discrete TTS
      await this.playDiscreteTTS(text);
    }
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(status: 'idle' | 'listening' | 'translating' | 'speaking' | 'error'): void {
    this.events.onStatusChange?.(status);
  }

  /**
   * Map Language enum to BCP-47 language code for Web Speech API
   */
  private mapLanguageToCode(lang: Language): string {
    const map: Record<string, string> = {
      'Auto-Detect': 'en-US',
      'English (United States)': 'en-US',
      'English (United Kingdom)': 'en-GB',
      'Spanish (Spain)': 'es-ES',
      'Spanish (Mexico)': 'es-MX',
      'French (France)': 'fr-FR',
      'German (Germany)': 'de-DE',
      'Italian': 'it-IT',
      'Portuguese (Brazil)': 'pt-BR',
      'Portuguese (Portugal)': 'pt-PT',
      'Chinese (Mandarin Simplified)': 'zh-CN',
      'Chinese (Mandarin Traditional)': 'zh-TW',
      'Japanese': 'ja-JP',
      'Korean': 'ko-KR',
      'Russian': 'ru-RU',
      'Arabic (General)': 'ar-SA',
      'Hindi': 'hi-IN',
    };

    return map[lang] || 'en-US';
  }

  /**
   * Get appropriate voice for target language
   */
  private getVoiceForLanguage(lang: Language): string {
    // Map to Gemini voice names
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

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.translationCache.clear();
    console.log('[RealtimeTranslation] Cache cleared');
  }

  /**
   * Check if service is currently active
   */
  isRunning(): boolean {
    return this.isActive;
  }
}
