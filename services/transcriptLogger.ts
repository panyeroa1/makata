
import { supabase } from './supabaseClient';

export interface TranscriptEntry {
  session_id: string;
  speaker_id: string; // The label or user ID
  content: string;
  timestamp: string;
}

class TranscriptLogger {
  private buffer: string[] = [];
  private lastSpeaker: string = '';
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY = 5000; // Wait 5s of silence or distinct break before effectively 'paragraphing'
  
  // Actually, for "every paragraph", we can rely on Deepgram's punctuation.
  // But to be robust, we'll save every "final" utterance that looks complete.

  /**
   * Log a transcript segment.
   * We expect 'content' to already optionally have "Speaker:" prefix, 
   * but for DB we might want structured columns.
   * 
   * If the content has "Label: Text", we parse it.
   */
  async logSegment(sessionId: string, rawContent: string) {
    // 1. Parse speaker if present
    let speaker = 'Unknown';
    let text = rawContent;

    const match = rawContent.match(/^([^:]+):\s+(.+)$/);
    if (match) {
        speaker = match[1];
        text = match[2];
    }

    if (!text.trim()) return;

    // 2. Direct save for now (User said "every paragraph without interrupting", 
    // usually implies robust saving of completed thoughts)
    // Deepgram "is_final" is usually a sentence or valid phrase.
    
    // We will save individual rows for each utterance for granularity.
    try {
        const { error } = await supabase
            .from('transcripts')
            .insert({
                session_id: sessionId,
                speaker_id: speaker,
                content: text,
                // created_at is automatic usually, but good to ensure ordering
                timestamp: new Date().toISOString() 
            });

        if (error) {
            console.error('Failed to save transcript to Supabase:', error);
        } else {
            // console.log('Saved transcript:', text.substring(0, 20) + '...');
        }
    } catch (e) {
        console.error('Error logging transcript:', e);
    }
  }
}

export const transcriptLogger = new TranscriptLogger();
