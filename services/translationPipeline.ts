/**
 * Translation Pipeline Service
 * Orchestrates STT → Translation → TTS flow with caching
 */

import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";
import { translateText, generateSpeech, generateStreamSpeech } from "./geminiService";
// import { TranscriptSegment as WebSpeechSegment, webSpeechSTT } from "./webSpeechSTT"; 
import { DeepgramSTT, TranscriptSegment } from "./deepgramSTT";
import { supabase } from "./supabaseClient";
import { AudioQueue } from "./audioQueue";
import { decodePcmAudioData } from "./audioUtils";

interface TranslationCacheEntry {
  sourceText: string;
  /**
   * Language of the original text. This is stored so that cache entries can be
   * distinguished when the same source text is translated from different
   * languages. Without including the source language, a translation from
   * another language could be incorrectly reused.
   */
  sourceLang: Language;
  targetLang: Language;
  translatedText: string;
  timestamp: number;
}

interface PipelineConfig {
  roomId: string;
  speakerId: string;
  sourceLang: Language;
  targetLang: Language;
  useWebSpeech: boolean; // true = Web Speech API, false = Gemini STT
  enableTTS: boolean;
  geminiClient: GoogleGenAI;
}

interface PipelineCallbacks {
  onTranscript?: (original: string, isFinal: boolean) => void;
  onTranslation?: (translated: string, isFinal: boolean) => void;
  onTTSReady?: (audioBase64: string) => void;
  onError?: (error: string) => void;
}

export class TranslationPipeline {
  private config: PipelineConfig;
  private callbacks: PipelineCallbacks;
  private translationCache: Map<string, TranslationCacheEntry> = new Map();
  private isActive: boolean = false;
  private processedSegments: Set<string> = new Set();
  
  private sttService: DeepgramSTT | null = null;
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioQueue | null = null;

  // Cache settings
  private readonly CACHE_TTL_MS = 3600000; // 1 hour
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(config: PipelineConfig, callbacks: PipelineCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Start the translation pipeline
   */
  async start() {
    if (this.isActive) {
      console.warn('[Pipeline] Already active');
      return;
    }

    this.isActive = true;
    console.log('[Pipeline] Starting with config:', {
      useWebSpeech: this.config.useWebSpeech,
      sourceLang: this.config.sourceLang,
      targetLang: this.config.targetLang,
    });

    if (this.config.useWebSpeech) {
      this.startWebSpeechPipeline();
    } else {
      // Gemini STT would be handled by existing LiveSession in App.tsx
      console.log('[Pipeline] Using Gemini STT (handled externally)');
    }
  }

  /**
   * Stop the pipeline
   */
  stop() {
    this.isActive = false;
    
    if (this.sttService) {
        this.sttService.stop();
        this.sttService = null;
    }

    console.log('[Pipeline] Stopped');
  }

  /**
   * Process a transcript segment (can be called from external STT source)
   */
  async processSegment(text: string, isFinal: boolean, segmentId?: string) {
    if (!this.isActive || !text.trim()) return;

    // Avoid reprocessing
    if (segmentId && this.processedSegments.has(segmentId)) {
      return;
    }

    // Emit original transcript
    if (this.callbacks.onTranscript) {
      this.callbacks.onTranscript(text, isFinal);
    }

    // Save segment to database (if final)
    let dbSegmentId: string | null = null;
    if (isFinal) {
      dbSegmentId = await this.saveSegment(text);
      if (segmentId) {
        this.processedSegments.add(segmentId);
      }
    }

    // Translate
    const translatedText = await this.translateWithCache(text, this.config.targetLang);

    if (!translatedText) {
      this.callbacks.onError?.('Translation failed');
      return;
    }

    // Emit translation
    if (this.callbacks.onTranslation) {
      this.callbacks.onTranslation(translatedText, isFinal);
    }

    // Save translation to database (if final and we have segment ID)
    if (isFinal && dbSegmentId) {
      await this.saveTranslation(dbSegmentId, translatedText, this.config.targetLang);
    }

    // Generate TTS (optional, only for final segments)
    if (this.config.enableTTS && isFinal) {
      await this.generateAndEmitTTS(translatedText, this.config.targetLang);
    }
  }

  /**
   * Start Deepgram STT Pipeline (formerly Web Speech)
   */
  private async startWebSpeechPipeline() {
    // We are replacing Web Speech with Deepgram as per requirements
    const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY || '';
    if (!apiKey) {
        this.callbacks.onError?.('Deepgram API Key missing');
        return;
    }

    const stt = new DeepgramSTT(apiKey);
    // Store reference to stop later? 
    // Ideally TranslationPipeline should manage stt instance in a property.
    // For now, I'll add a private property 'sttService'.
    (this as any).sttService = stt;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        await stt.start(
            stream,
            {
                onTranscript: async (segment: TranscriptSegment) => {
                    await this.processSegment(segment.text, segment.isFinal, segment.id);
                },
                onError: (error: string) => {
                    console.error('[Pipeline] STT Error:', error);
                    this.callbacks.onError?.(error);
                }
            },
            this.config.speakerId // Use speaker ID as label
        );
    } catch (e: any) {
        console.error('Failed to start STT:', e);
        this.callbacks.onError?.(e.message);
    }
  }

  /**
   * Translate with caching
   */
  private async translateWithCache(text: string, targetLang: Language): Promise<string> {
    // Check cache
    // Include the source language as part of the cache key to avoid returning
    // translations that were generated for the same text but a different
    // source language. Without the source language in the key, the cache
    // might return a translation that was produced from an unrelated source
    // language, leading to incorrect results (e.g., "Hola" in Spanish vs.
    // Italian). See https://developer.mozilla.org for details on caching
    // strategies.

    const cacheKey = `${this.config.sourceLang}_${text}_${targetLang}`;
    const cached = this.translationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      console.log('[Pipeline] Cache hit for:', text.substring(0, 30));
      return cached.translatedText;
    }

    // Translate
    try {
      const translated = await translateText(
        this.config.geminiClient,
        text,
        this.config.sourceLang,
        targetLang
      );

      // Cache result
      this.translationCache.set(cacheKey, {
        sourceText: text,
        sourceLang: this.config.sourceLang,
        targetLang,
        translatedText: translated,
        timestamp: Date.now(),
      });

      // Evict old entries if cache is too large
      if (this.translationCache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.translationCache.keys().next().value;
        if (firstKey !== undefined) {
          this.translationCache.delete(firstKey);
        }
      }

      return translated;
    } catch (error) {
      console.error('[Pipeline] Translation error:', error);
      return '';
    }
  }

  /**
   * Generate and emit TTS audio
   */
  /**
   * Generate and emit TTS audio
   */
  private async generateAndEmitTTS(text: string, targetLang: Language) {
    try {
      // Use efficient streaming TTS with sequencing
      const voiceName = 'Orus'; // Default or from config? Config doesn't have voice.
      
      const audioGenerator = await generateStreamSpeech(
          this.config.geminiClient,
          text,
          targetLang,
          voiceName
      );

      if (!audioGenerator) return;
      if (!this.sttService) return; // or check audioContext? Pipeline doesn't usually hold context?
      
      // We need AudioContext for Queue. Local or passed?
      // RealtimeTranslationService creates its own.
      // We should probably create one here if not existing.
      if (!(this as any).audioContext) {
           (this as any).audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
           (this as any).audioQueue = new AudioQueue((this as any).audioContext);
      }
      
      const ctx = (this as any).audioContext;
      const queue = (this as any).audioQueue as AudioQueue;
      
      const chunks: string[] = [];
      for await (const chunk of audioGenerator) {
          chunks.push(chunk);
      }
      
      if (chunks.length > 0) {
          const totalBase64 = chunks.join('');
          const audioBuffer = decodePcmAudioData(totalBase64, ctx, 24000, 1);
          
          queue.enqueue({
               id: Date.now().toString(),
               buffer: audioBuffer,
               onStart: () => {
                   // Notify playback start?
                   if (this.callbacks.onTTSReady) {
                       // We used to pass audioBase64. Now we handle playback.
                       // Maybe pass empty string or specific signal?
                       // App.tsx logic: if (audioBase64) decode...
                       // If we pass null/empty, App.tsx won't play.
                       // But we need to signal "SPEAKING" state.
                       // App.tsx: source.onended = () => setPipelineState('LISTENING')
                       // We can't easily trigger the 'LISTENING' state in App.tsx from here if we don't pass control.
                       // However, App.tsx sets 'SPEAKING' when onTTSReady is called.
                   }
               },
               onEnd: () => {
                   // We need a way to callback "done speaking".
                   // The current callbacks don't support "onTTSFinished".
                   // We might need to add it or hack it.
               }
          });
      }
      
      // Legacy callback support: We MUST update App.tsx to NOT play audio if we do it here.
      // OR, we stick to App.tsx playing it, but we use Queue IN App.tsx?
      // Updating TranslationPipeline is cleaner encapsulation.
      // We will update App.tsx to ignore audioBase64 if not provided, OR we provide valid base64 but App.tsx acts as dummy?
      
      // Let's go with: TranslationPipeline handles playback via Queue.
      // We call onTTSReady(null) or similar? 
      // But App.tsx signature expects string.
      
      // Let's modify App.tsx first to remove playback logic?
      // No, modifying Service first.
      
    } catch (error) {
      console.error('[Pipeline] TTS error:', error);
    }
  }

  /**
   * Save segment to database
   */
  private async saveSegment(text: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('segments')
        .insert({
          room_id: this.config.roomId,
          speaker_id: this.config.speakerId,
          start_ms: Date.now(),
          end_ms: Date.now(),
          text,
          is_final: true,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('[Pipeline] Failed to save segment:', error);
      return null;
    }
  }

  /**
   * Save translation to database
   */
  private async saveTranslation(segmentId: string, text: string, targetLang: Language) {
    try {
      await supabase.from('translations').insert({
        segment_id: segmentId,
        target_lang: targetLang,
        text,
      });
    } catch (error) {
      console.error('[Pipeline] Failed to save translation:', error);
    }
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
      // Add more as needed
    };

    return map[lang] || 'en-US';
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.translationCache.clear();
    console.log('[Pipeline] Cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.translationCache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }
}
