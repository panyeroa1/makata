/**
 * Translation Pipeline Service
 * Orchestrates STT → Translation → TTS flow with caching
 */

import { GoogleGenAI } from "@google/genai";
import { Language } from "../types";
import { translateText, generateSpeech } from "./geminiService";
import { TranscriptSegment as WebSpeechSegment, webSpeechSTT } from "./webSpeechSTT";
import { supabase } from "./supabaseClient";

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
    
    if (this.config.useWebSpeech) {
      webSpeechSTT.stop();
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
   * Start Web Speech API pipeline
   */
  private startWebSpeechPipeline() {
    // Set language based on source config
    const langCode = this.mapLanguageToCode(this.config.sourceLang);
    webSpeechSTT.setLanguage(langCode);

    // Start recognition
    const started = webSpeechSTT.start({
      onTranscript: async (segment: WebSpeechSegment) => {
        await this.processSegment(segment.text, segment.isFinal, segment.id);
      },
      onError: (error: string) => {
        console.error('[Pipeline] STT Error:', error);
        this.callbacks.onError?.(error);
      },
    });

    if (!started) {
      this.callbacks.onError?.('Failed to start Web Speech API');
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
  private async generateAndEmitTTS(text: string, targetLang: Language) {
    try {
      const audioBase64 = await generateSpeech(this.config.geminiClient, text, targetLang);
      
      if (audioBase64 && this.callbacks.onTTSReady) {
        this.callbacks.onTTSReady(audioBase64);
      }
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
