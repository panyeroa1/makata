/**
 * Web Speech API STT Service
 * Provides live speech-to-text transcription using the browser's native Web Speech API
 * Note: Uses 'any' types for browser API compatibility
 */

export interface TranscriptSegment {
  id: string;
  text: string;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  confidence: number;
}

export type TranscriptCallback = (segment: TranscriptSegment) => void;
export type ErrorCallback = (error: string) => void;

export class WebSpeechSTT {
  private recognition: any = null; // SpeechRecognition type from lib.dom.d.ts
  private isRecognizing: boolean = false;
  private language: string = 'en-US';
  private onTranscriptCallback: TranscriptCallback | null = null;
  private onErrorCallback: ErrorCallback | null = null;
  private segmentStartTime: number = 0;
  private segmentCounter: number = 0;

  constructor() {
    // Check for browser support
    const SpeechRecognitionAPI = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      console.warn('Web Speech API not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.setupRecognition();
  }

  private setupRecognition() {
    if (!this.recognition) return;

    // Configuration
    this.recognition.continuous = true;
    this.recognition.interimResults = true; // Enable partial results
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.language;

    // Event handlers
    this.recognition.onstart = () => {
      console.log('[WebSpeechSTT] Recognition started');
      this.isRecognizing = true;
      this.segmentStartTime = Date.now();
    };

    this.recognition.onresult = (event: any) => {
      const results = event.results;
      
      for (let i = event.resultIndex; i < results.length; i++) {
        const result = results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;
        const isFinal = result.isFinal;

        const segment: TranscriptSegment = {
          id: `seg-${this.segmentCounter}-${isFinal ? 'final' : 'partial'}`,
          text: transcript,
          isFinal,
          startMs: this.segmentStartTime,
          endMs: Date.now(),
          confidence
        };

        if (this.onTranscriptCallback) {
          this.onTranscriptCallback(segment);
        }

        // If final, increment counter and reset start time
        if (isFinal) {
          this.segmentCounter++;
          this.segmentStartTime = Date.now();
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('[WebSpeechSTT] Recognition error:', event.error);
      
      const errorMessage = this.mapErrorMessage(event.error);
      if (this.onErrorCallback) {
        this.onErrorCallback(errorMessage);
      }

      // Auto-restart on network errors (common in continuous mode)
      if (event.error === 'network' && this.isRecognizing) {
        console.log('[WebSpeechSTT] Network error, attempting restart...');
        setTimeout(() => this.restart(), 1000);
      }
    };

    this.recognition.onend = () => {
      console.log('[WebSpeechSTT] Recognition ended');
      
      // Auto-restart if we expect it to be running
      if (this.isRecognizing) {
        console.log('[WebSpeechSTT] Auto-restarting...');
        this.recognition?.start();
      }
    };
  }

  private mapErrorMessage(error: string): string {
    const errorMap: Record<string, string> = {
      'no-speech': 'No speech detected. Please try again.',
      'audio-capture': 'No microphone found. Please check your audio settings.',
      'not-allowed': 'Microphone permission denied.',
      'network': 'Network error. Please check your connection.',
      'aborted': 'Speech recognition was aborted.',
      'service-not-allowed': 'Speech recognition service not allowed.',
    };
    return errorMap[error] || `Speech recognition error: ${error}`;
  }

  /**
   * Start continuous speech recognition
   */
  start(callbacks: {
    onTranscript: TranscriptCallback;
    onError?: ErrorCallback;
  }): boolean {
    if (!this.recognition) {
      callbacks.onError?.('Web Speech API not supported');
      return false;
    }

    if (this.isRecognizing) {
      console.warn('[WebSpeechSTT] Already recognizing');
      return false;
    }

    this.onTranscriptCallback = callbacks.onTranscript;
    this.onErrorCallback = callbacks.onError || null;
    
    try {
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('[WebSpeechSTT] Failed to start:', error);
      callbacks.onError?.('Failed to start speech recognition');
      return false;
    }
  }

  /**
   * Stop speech recognition
   */
  stop() {
    if (!this.recognition || !this.isRecognizing) return;

    this.isRecognizing = false;
    this.recognition.stop();
  }

  /**
   * Restart speech recognition (useful for error recovery)
   */
  restart() {
    this.stop();
    setTimeout(() => {
      if (this.onTranscriptCallback) {
        this.start({
          onTranscript: this.onTranscriptCallback,
          onError: this.onErrorCallback || undefined
        });
      }
    }, 500);
  }

  /**
   * Change the language for recognition
   */
  setLanguage(lang: string) {
    const wasRecognizing = this.isRecognizing;
    
    if (wasRecognizing) {
      this.stop();
    }

    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }

    if (wasRecognizing && this.onTranscriptCallback) {
      // Restart with new language
      this.start({
        onTranscript: this.onTranscriptCallback,
        onError: this.onErrorCallback || undefined
      });
    }
  }

  /**
   * Check if Web Speech API is supported
   */
  static isSupported(): boolean {
    return !!(
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Get current recognition state
   */
  isActive(): boolean {
    return this.isRecognizing;
  }

  /**
   * Get current language
   */
  getLanguage(): string {
    return this.language;
  }
}

// Export singleton instance
export const webSpeechSTT = new WebSpeechSTT();
