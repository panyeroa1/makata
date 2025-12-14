import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Language } from "../types";
import { pcmToBase64, decodePcmAudioData } from "./audioUtils";

// --- Discrete Pipeline Services (STT -> Translate -> TTS) ---

export const transcribeAudio = async (
  ai: GoogleGenAI,
  audioBase64: string,
  mimeType: string = "audio/wav"
): Promise<string> => {
  const model = "gemini-2.5-flash";
  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          {
            text: `
            TRANSCRIPTION INSTRUCTION:
            Transcribe the audio VERBATIM. 
            
            CRITICAL RULES:
            1. Capture EVERY filler word ("um", "uh", "ah", "er", "hmm", "like").
            2. Capture EVERY hesitation and stutter (e.g., "I- I- I think...").
            3. Do NOT fix grammar. Do NOT clean up the speech.
            4. Write exactly what is heard, including non-verbal vocalizations.
            `,
          },
        ],
      },
    });
    // Prefer the candidate parts to extract the full transcription text
    const candidate = response.candidates?.[0];
    const parts: any[] | undefined = candidate?.content?.parts;
    if (parts && parts.length > 0) {
      const textParts = parts
        .filter((p: any) => typeof p.text === 'string')
        .map((p: any) => p.text as string)
        .join('');
      if (textParts.trim()) {
        return textParts.trim();
      }
    }
    // Fallback to response.text if available
    return (response as any).text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    return "";
  }
};

export const translateText = async (
  ai: GoogleGenAI,
  text: string,
  sourceLang: Language,
  targetLang: Language
): Promise<string> => {
  // Using Flash-Lite for humanlike style and speed
  const model = "gemini-flash-lite-latest";
  const sourceInstruction = sourceLang === Language.AUTO ? "the detected language" : sourceLang;
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `
      Role: Expert Interpreter with a focus on natural speech patterns.
      Task: Translate the following text from ${sourceInstruction} to ${targetLang}.
      
      CRITICAL GUIDELINES:
      1. **Preserve Disfluencies**: If the input has "um", "ah", "oh", or stutters, you MUST include the equivalent filler words in ${targetLang}.
      2. **Maintain Prosody in Text**: Keep the punctuation and structure that implies the original rhythm (ellipses for pauses, dashes for abrupt stops).
      3. **No Cleanup**: Do not make the text sound "better" or more formal. Keep it raw.
      
      Input Text: "${text}"
      
      Output only the translated text.`,
    });
    // Extract the translation from the candidate's content parts if available
    const candidate = (response as any).candidates?.[0];
    const parts: any[] | undefined = candidate?.content?.parts;
    if (parts && parts.length > 0) {
      const textParts = parts
        .filter((p: any) => typeof p.text === 'string')
        .map((p: any) => p.text as string)
        .join('');
      if (textParts.trim()) {
        return textParts.trim();
      }
    }
    return (response as any).text || "";
  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
};

export const generateSpeech = async (
  ai: GoogleGenAI,
  text: string,
  targetLang: Language,
  voiceName: string = 'Kore'
): Promise<string | null> => {
  const model = "gemini-2.5-flash-native-audio-preview-12-2025";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text }],
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    
    // Extract base64 audio
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts && parts[0]?.inlineData?.data) {
      return parts[0].inlineData.data;
    }
    return null;
  } catch (error) {
    console.error("TTS error:", error);
    return null;
  }
};

// --- Live API Service ---

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null; // Session object from connect
  private audioContext: AudioContext;
  private gainNode: GainNode;
  private nextStartTime: number = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000,
    });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = 0; // Default to muted (Loopback off)
  }

  setVolume(volume: number) {
    // Smooth transition
    this.gainNode.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
  }

  async connect(
    config: {
      systemInstruction: string;
      voiceName?: string;
    },
    onTranscription: (text: string, type: 'user' | 'model') => void
  ): Promise<void> {
    
    // Reset timing
    this.nextStartTime = this.audioContext.currentTime;

    const sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: config.systemInstruction,
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName || 'Puck' } }
        },
        inputAudioTranscription: {}, 
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          console.log("Live session connected");
        },
        onmessage: async (message: LiveServerMessage) => {
          // Handle Audio Output
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
             this.queueAudio(audioData);
          }

          // Handle Transcriptions
          const userText = message.serverContent?.inputTranscription?.text;
          if (userText) {
             onTranscription(userText, 'user');
             // Capture data for "training"
             console.log(`[TRAINING_DATA_LOG] Captured user input for style adaptation: "${userText}"`);
          }

          const modelText = message.serverContent?.outputTranscription?.text;
          if (modelText) onTranscription(modelText, 'model');
          
          // Handle Interruption
          if (message.serverContent?.interrupted) {
            this.clearAudioQueue();
          }
        },
        onclose: () => console.log("Live session closed"),
        onerror: (err) => console.error("Live session error", err),
      },
    });
    
    this.session = await sessionPromise;
  }

  private async queueAudio(base64Data: string) {
    try {
        // Ensure context is running (browsers sometimes suspend it)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const audioBuffer = decodePcmAudioData(base64Data, this.audioContext);
        
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        // Connect to GainNode instead of destination directly
        source.connect(this.gainNode);
        
        // Simple scheduling to prevent overlap/gaps
        const now = this.audioContext.currentTime;
        // If next start time is in the past (because of silence), reset to now
        const startTime = Math.max(this.nextStartTime, now);
        
        source.start(startTime);
        this.nextStartTime = startTime + audioBuffer.duration;
        
        this.sources.add(source);
        source.onended = () => {
            this.sources.delete(source);
        };
    } catch (e) {
        console.error("Error playing audio chunk", e);
    }
  }

  private clearAudioQueue() {
    this.sources.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    this.sources.clear();
    this.nextStartTime = this.audioContext.currentTime;
  }

  sendAudioChunk(pcmData: Float32Array) {
    if (this.session) {
      const base64 = pcmToBase64(pcmData);
      this.session.sendRealtimeInput({
        media: {
          mimeType: "audio/pcm;rate=16000",
          data: base64
        }
      });
    }
  }

  disconnect() {
    this.clearAudioQueue();
    this.session = null;
    this.audioContext.close();
  }
}