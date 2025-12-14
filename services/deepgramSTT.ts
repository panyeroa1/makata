
import { createClient, LiveClient, LiveConnectionState, LiveTranscriptionEvents } from "@deepgram/sdk";

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

export class DeepgramSTT {
  private client: LiveClient | null = null; // LiveClient is the interface returned by listen.live
  private connection: ReturnType<LiveClient['listen']['live']> | null = null; // The connection object
  private isConnected: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private apiKey: string;
  private onTranscriptCallback: TranscriptCallback | null = null;
  private onErrorCallback: ErrorCallback | null = null;
  private label: string = '';
  private segmentCounter: number = 0;
  private stream: MediaStream | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Start transcription
   */
  async start(
    stream: MediaStream, 
    callbacks: {
        onTranscript: TranscriptCallback;
        onError?: ErrorCallback;
    },
    label: string = ''
  ): Promise<boolean> {
    if (this.isConnected) {
        console.warn('DeepgramSTT already connected');
        return true;
    }

    this.onTranscriptCallback = callbacks.onTranscript;
    this.onErrorCallback = callbacks.onError || null;
    this.label = label;
    this.stream = stream;

    try {
      const deepgram = createClient(this.apiKey);
      
      // Initialize connection
      // We use 'nova-3' model as requested
      this.connection = deepgram.listen.live({
        model: "nova-3",
        language: "en-US", // Default to US English, but multi support acts on this base
        smart_format: true,
        diarize: true, // Speaker diarization
        interim_results: true,
        endpointing: 300, // Waits 300ms of silence to determine end of utterance
      });

      // Event Listeners
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram connection opened");
        this.isConnected = true;
        
        // Start sending audio
        this.startSendingAudio(stream);
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log("Deepgram connection closed");
        this.isConnected = false;
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        this.handleTranscript(data);
      });

      this.connection.on(LiveTranscriptionEvents.Error, (err: any) => {
        console.error("Deepgram error", err);
        if (this.onErrorCallback) this.onErrorCallback(err.message || 'Deepgram Error');
      });
      
      return true;

    } catch (error: any) {
      console.error('Failed to start Deepgram:', error);
      if (this.onErrorCallback) this.onErrorCallback(error.message);
      return false;
    }
  }

  private startSendingAudio(stream: MediaStream) {
    if (!this.connection) return;

    // Use MediaRecorder to get audio blobs
    const mimeType = 'audio/webm';
    
    // Check if browser supports webm
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.warn('audio/webm not supported, checking other types');
        // Fallbacks logic could go here, but Chrome/Edge/Firefox support webm
    }

    this.mediaRecorder = new MediaRecorder(stream, { mimeType });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.connection && this.connection.getReadyState() === 1) { // 1 = OPEN
        this.connection.send(event.data);
      }
    };

    this.mediaRecorder.start(250); // Send chunks every 250ms
  }

  private handleTranscript(data: any) {
    // console.log("Deepgram Raw Data:", data);
    
    // Safety check for transcript structure
    const received = data.channel.alternatives[0];
    if (!received || !received.transcript) return;

    const transcript = received.transcript;
    if (transcript.trim().length === 0) return;

    const isFinal = data.is_final;
    
    // Prepend Label if exists (e.g. "Mario: Hello")
    // Note: We only prepend this for the UI consumption side usually, 
    // but the request said "it must write Mario:".
    const labeledText = this.label ? `${this.label}: ${transcript}` : transcript;

    const segment: TranscriptSegment = {
        id: `dg-${this.segmentCounter}-${isFinal ? 'final' : 'partial'}`,
        text: labeledText,
        isFinal,
        startMs: Date.now(), // Rough approximation
        endMs: Date.now(),
        confidence: received.confidence
    };

    if (this.onTranscriptCallback) {
        this.onTranscriptCallback(segment);
    }
    
    if (isFinal) {
        this.segmentCounter++;
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
        this.mediaRecorder = null;
    }
    
    if (this.connection) {
        // Deepgram SDK 3.x+ uses requestClose() or finish() depending on version, 
        // SDK 3.x commonly just .finish() meant for closing the message stream
        this.connection.requestClose(); 
        this.connection = null;
    }

    this.isConnected = false;
    this.stream = null;
  }
}
