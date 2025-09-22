import { createClient } from '@deepgram/sdk';
import fs from 'fs';
import path from 'path';
import { getConfig } from './config';

export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
  language: string;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
}

export class DeepgramService {
  private client: any;
  private apiKey: string;

  constructor(apiKey?: string) {
    const config = getConfig();
    this.apiKey = apiKey || config.deepgramApiKey || '';
    
    if (!this.apiKey) {
      throw new Error('Deepgram API key is required. Set DEEPGRAM_API_KEY environment variable.');
    }

    this.client = createClient(this.apiKey);
  }

  /**
   * Transcribe audio file using Deepgram API
   * @param audioFilePath Path to the audio file
   * @param language Language code (default: 'vi' for Vietnamese)
   * @returns Transcription result
   */
  async transcribeAudio(audioFilePath: string, language: string = 'vi'): Promise<TranscriptionResult> {
    try {
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      console.log(`[DeepgramService] Transcribing audio file: ${audioFilePath}`);
      
      // Read the audio file
      const audioBuffer = fs.readFileSync(audioFilePath);
      
      // Configure transcription options for Vietnamese
      const options = {
        model: 'nova-2',
        language: language,
        smart_format: true,
        punctuate: true,
        diarize: true,
        utterances: true,
        summarize: false, // We'll handle summarization separately
      };

      // Transcribe the audio
      const response: any = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        options
      );

      if (!response.result || !response.result.results || !response.result.results.channels) {
        throw new Error('Invalid response from Deepgram API');
      }

      const channel = response.result.results.channels[0];
      const transcript = channel.alternatives[0]?.transcript || '';
      const confidence = channel.alternatives[0]?.confidence || 0;
      const duration = response.result.metadata?.duration || 0;

      console.log(`[DeepgramService] Transcription completed. Duration: ${duration}s, Confidence: ${confidence}`);

      return {
        text: transcript,
        confidence,
        duration,
        language
      };
    } catch (error) {
      console.error(`[DeepgramService] Transcription failed for ${audioFilePath}:`, error);
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate summary from text using a simple extractive approach
   * This is a fallback implementation - you can replace with OpenAI or other services
   * @param text Text to summarize
   * @param context Optional context for the summary
   * @returns Summary result
   */
  async summarizeText(text: string, context?: string): Promise<SummaryResult> {
    try {
      if (!text || text.trim().length === 0) {
        return {
          summary: 'Không có nội dung để tóm tắt.',
          keyPoints: []
        };
      }

      console.log(`[DeepgramService] Generating summary for text (${text.length} characters)`);

      // Simple extractive summarization (fallback implementation)
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      
      // Take first few sentences and last few sentences as summary
      const summaryLength = Math.min(3, Math.ceil(sentences.length * 0.3));
      const summarySentences = [
        ...sentences.slice(0, Math.ceil(summaryLength / 2)),
        ...sentences.slice(-Math.floor(summaryLength / 2))
      ];

      // Extract key points (sentences with common Vietnamese meeting keywords)
      const keywordPatterns = [
        /quyết định|kết luận|thống nhất/i,
        /nhiệm vụ|công việc|phân công/i,
        /thời gian|deadline|hạn chót/i,
        /vấn đề|khó khăn|thách thức/i,
        /giải pháp|đề xuất|kiến nghị/i
      ];

      const keyPoints = sentences.filter(sentence => 
        keywordPatterns.some(pattern => pattern.test(sentence))
      ).slice(0, 5);

      const summary = context 
        ? `${context}\n\n${summarySentences.join('. ')}`
        : summarySentences.join('. ');

      console.log(`[DeepgramService] Summary generated with ${keyPoints.length} key points`);

      return {
        summary: summary.trim(),
        keyPoints: keyPoints.map(point => point.trim())
      };
    } catch (error) {
      console.error('[DeepgramService] Summarization failed:', error);
      throw new Error(`Summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a meeting folder with audio files
   * @param meetingFolderPath Path to the meeting folder
   * @returns Processing results
   */
  async processMeetingFolder(meetingFolderPath: string): Promise<{
    transcripts: { [filename: string]: TranscriptionResult };
    summaries: { overall: SummaryResult; participants: { [participantId: string]: SummaryResult } };
  }> {
    try {
      console.log(`[DeepgramService] Processing meeting folder: ${meetingFolderPath}`);

      if (!fs.existsSync(meetingFolderPath)) {
        throw new Error(`Meeting folder not found: ${meetingFolderPath}`);
      }

      // Create output directories
      const transcriptsDir = path.join(meetingFolderPath, 'transcripts');
      const summariesDir = path.join(meetingFolderPath, 'summaries');
      
      if (!fs.existsSync(transcriptsDir)) {
        fs.mkdirSync(transcriptsDir, { recursive: true });
      }
      if (!fs.existsSync(summariesDir)) {
        fs.mkdirSync(summariesDir, { recursive: true });
      }

      // Find audio files
      const audioFiles = this.findAudioFiles(meetingFolderPath);
      console.log(`[DeepgramService] Found ${audioFiles.length} audio files`);

      const transcripts: { [filename: string]: TranscriptionResult } = {};
      const participantTranscripts: { [participantId: string]: string } = {};

      // Process each audio file
      for (const audioFile of audioFiles) {
        try {
          const result = await this.transcribeAudio(audioFile);
          const filename = path.basename(audioFile);
          transcripts[filename] = result;

          // Save individual transcript
          const transcriptPath = path.join(transcriptsDir, `${filename}.json`);
          fs.writeFileSync(transcriptPath, JSON.stringify(result, null, 2));

          // Collect participant transcripts
          const participantId = this.extractParticipantId(filename);
          if (participantId) {
            participantTranscripts[participantId] = result.text;
          }
        } catch (error) {
          console.error(`[DeepgramService] Failed to process ${audioFile}:`, error);
        }
      }

      // Generate summaries
      const summaries = await this.generateSummaries(transcripts, participantTranscripts, summariesDir);

      console.log(`[DeepgramService] Meeting processing completed`);

      return {
        transcripts,
        summaries
      };
    } catch (error) {
      console.error(`[DeepgramService] Meeting processing failed:`, error);
      throw error;
    }
  }

  /**
   * Find audio files in the meeting folder
   */
  private findAudioFiles(folderPath: string): string[] {
    const audioExtensions = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
    const files: string[] = [];

    try {
      const items = fs.readdirSync(folderPath);
      
      for (const item of items) {
        const itemPath = path.join(folderPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (audioExtensions.includes(ext)) {
            files.push(itemPath);
          }
        }
      }
    } catch (error) {
      console.error(`[DeepgramService] Error reading folder ${folderPath}:`, error);
    }

    return files;
  }

  /**
   * Extract participant ID from filename
   */
  private extractParticipantId(filename: string): string | null {
    // Look for patterns like "participant_123" or "user_456"
    const match = filename.match(/(?:participant|user)_(\w+)/i);
    return match ? match[1] : null;
  }

  /**
   * Generate overall and per-participant summaries
   */
  private async generateSummaries(
    transcripts: { [filename: string]: TranscriptionResult },
    participantTranscripts: { [participantId: string]: string },
    summariesDir: string
  ): Promise<{
    overall: SummaryResult;
    participants: { [participantId: string]: SummaryResult };
  }> {
    // Generate overall summary - use mixed_audio.wav if available, otherwise combine participant transcripts
    let overallText = '';
    const mixedAudioTranscript = transcripts['mixed_audio.wav'];
    
    if (mixedAudioTranscript) {
      // Use mixed audio transcript as it contains the complete meeting
      overallText = mixedAudioTranscript.text;
    } else {
      // Fallback: combine all participant transcripts
      overallText = Object.values(participantTranscripts).join(' ');
    }
    
    const overallSummary = await this.summarizeText(overallText, 'Tóm tắt cuộc họp:');
    
    // Save overall summary as meeting-summary.json at root level (same level as mixed_audio.wav)
    const meetingSummaryPath = path.join(path.dirname(summariesDir), 'meeting-summary.json');
    fs.writeFileSync(meetingSummaryPath, JSON.stringify(overallSummary, null, 2));
    
    // Also save in summaries directory for backward compatibility
    const overallSummaryPath = path.join(summariesDir, 'overall_summary.json');
    fs.writeFileSync(overallSummaryPath, JSON.stringify(overallSummary, null, 2));

    // Generate per-participant summaries
    const participantSummaries: { [participantId: string]: SummaryResult } = {};
    
    for (const [participantId, text] of Object.entries(participantTranscripts)) {
      try {
        const summary = await this.summarizeText(text, `Tóm tắt phát biểu của ${participantId}:`);
        participantSummaries[participantId] = summary;
        
        // Save participant summary
        const participantSummaryPath = path.join(summariesDir, `participant_${participantId}_summary.json`);
        fs.writeFileSync(participantSummaryPath, JSON.stringify(summary, null, 2));
      } catch (error) {
        console.error(`[DeepgramService] Failed to generate summary for participant ${participantId}:`, error);
      }
    }

    return {
      overall: overallSummary,
      participants: participantSummaries
    };
  }
}

export default DeepgramService;