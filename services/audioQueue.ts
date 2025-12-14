
import { decodePcmAudioData } from "./audioUtils";

interface AudioQueueItem {
  id: string;
  buffer: AudioBuffer;
  onStart?: () => void;
  onEnd?: () => void;
}

export class AudioQueue {
  private queue: AudioQueueItem[] = [];
  private isPlaying: boolean = false;
  private audioContext: AudioContext;
  private gapMs: number = 500; // 0.5s gap

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  enqueue(item: AudioQueueItem) {
    this.queue.push(item);
    if (!this.isPlaying) {
        this.processQueue();
    }
  }

  private async processQueue() {
    if (this.queue.length === 0) {
        this.isPlaying = false;
        return;
    }

    this.isPlaying = true;
    const item = this.queue.shift();
    if (!item) return;

    try {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = item.buffer;
        source.connect(this.audioContext.destination);

        if (item.onStart) item.onStart();

        source.start();

        await new Promise<void>((resolve) => {
            source.onended = () => {
                if (item.onEnd) item.onEnd();
                resolve();
            };
        });

        // Gap after playback
        await new Promise(resolve => setTimeout(resolve, this.gapMs));

    } catch (e) {
        console.error("Error processing audio queue item", e);
    }

    // Process next
    this.processQueue();
  }

  clear() {
      this.queue = [];
      this.isPlaying = false;
      // Ideally stop current source, but simpler for now
  }
}
