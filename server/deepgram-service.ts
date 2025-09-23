import { createClient } from '@deepgram/sdk';
import fs from 'fs';
import path from 'path';
import { getConfig } from './config';
import { TranscriptionResult, SummaryResult } from './types';
import { OpenAIService } from './openai-service';

// Deepgram API response interface
interface DeepgramSummaryResponse {
  result: string;
  short: string;
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
   * Transcribe audio file using Deepgram API with optional summarization
   * @param audioFilePath Path to the audio file
   * @param language Language code (default: 'vi' for Vietnamese)
   * @param enableSummarization Whether to enable Deepgram's built-in summarization
   * @returns Transcription result with optional summary
   */
  async transcribeAudio(audioFilePath: string, language: string = 'vi', enableSummarization: boolean = false): Promise<TranscriptionResult> {
    try {
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      console.log(`[DeepgramService] Transcribing audio file: ${audioFilePath} (summarization: ${enableSummarization})`);
      
      // Read the audio file
      const audioBuffer = fs.readFileSync(audioFilePath);
      
      // Configure transcription options
      const options: any = {
        model: 'whisper',
        language: language,
        smart_format: true,
        punctuate: true,
        diarize: true,
        utterances: true,
      };

      // Enable summarization for English content or when specifically requested
      if (enableSummarization && (language === 'en' || language === 'en-US')) {
        options.summarize = 'v2';
        console.log(`[DeepgramService] Enabling Deepgram summarization for ${language}`);
      } else {
        options.summarize = false;
        console.log(`[DeepgramService] Deepgram summarization disabled for language: ${language}`);
      }

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

      // Extract Deepgram's summary if available
      let deepgramSummary: string | undefined;
      if (response.result.summary && response.result.summary.short) {
        deepgramSummary = response.result.summary.short;
        console.log(`[DeepgramService] Deepgram summary extracted: ${deepgramSummary?.length || 0} characters`);
      }

      console.log(`[DeepgramService] Transcription completed. Duration: ${duration}s, Confidence: ${confidence}`);

      return {
        text: transcript,
        confidence,
        duration,
        language,
        deepgramSummary
      };
    } catch (error) {
      console.error(`[DeepgramService] Transcription failed for ${audioFilePath}:`, error);
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate summary using OpenAI, with fallback to Deepgram or custom approach
   * @param text Text to summarize
   * @param context Optional context for the summary
   * @param deepgramSummary Pre-generated summary from Deepgram API
   * @returns Enhanced summary result
   */
  async summarizeText(text: string, context?: string, deepgramSummary?: string): Promise<SummaryResult> {
    try {
      if (!text || text.trim().length === 0) {
        return {
          summary: 'Không có nội dung để tóm tắt.',
          keyPoints: [],
          actionItems: [],
          decisions: [],
          topics: [],
          source: 'custom',
          generatedAt: new Date().toISOString()
        };
      }

      const config = getConfig();
      console.log(`[DeepgramService] Generating summary for text (${text.length} characters) using provider: ${config.summarizationProvider}`);

      // Determine which summarization service to use
      let provider: 'openai' | 'deepgram' | 'pho-whisper' | 'custom';
      
      if (config.summarizationProvider === 'auto') {
        // Auto-select based on availability and language
        if (config.openaiApiKey) {
          provider = 'openai';
        } else if (deepgramSummary && config.summarizationLanguage === 'en') {
          provider = 'deepgram';
        } else {
          provider = 'custom';
        }
      } else {
        provider = config.summarizationProvider as 'openai' | 'deepgram' | 'pho-whisper';
      }

      // Try OpenAI first if available and selected
      if (provider === 'openai' && config.openaiApiKey) {
        try {
          console.log(`[DeepgramService] Using OpenAI for summarization`);
          const openaiService = new OpenAIService();
          const result = await openaiService.summarizeMeetingTranscript(
            text, 
            context, 
            config.summarizationLanguage
          );
          console.log(`[DeepgramService] OpenAI summary generated successfully`);
          return result;
        } catch (openaiError) {
          console.warn(`[DeepgramService] OpenAI summarization failed, falling back:`, openaiError);
          // Continue to fallback options
        }
      }

      // Fallback to Deepgram built-in summary if available
      if (deepgramSummary && deepgramSummary.trim().length > 0) {
        console.log(`[DeepgramService] Using Deepgram's built-in summary as fallback`);
        const keyPoints = this.extractKeyPoints(text);
        return {
          summary: context ? `${context}\n\n${deepgramSummary}` : deepgramSummary,
          keyPoints,
          actionItems: this.extractActionItems(text),
          decisions: this.extractDecisions(text),
          topics: this.extractTopics(text),
          source: 'deepgram',
          generatedAt: new Date().toISOString()
        };
      }

      // Final fallback: custom extractive summarization
      console.log(`[DeepgramService] Using custom extractive summarization as final fallback`);
      return this.generateCustomSummary(text, context);

    } catch (error) {
      console.error('[DeepgramService] Summarization failed:', error);
      throw new Error(`Summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate participant summary using OpenAI or fallback
   */
  async summarizeParticipantText(text: string, participantName: string, deepgramSummary?: string): Promise<SummaryResult> {
    try {
      const config = getConfig();
      
      // Try OpenAI first if available
      if (config.openaiApiKey && (config.summarizationProvider === 'openai' || config.summarizationProvider === 'auto')) {
        try {
          const openaiService = new OpenAIService();
          return await openaiService.summarizeParticipantContribution(
            text, 
            participantName, 
            config.summarizationLanguage
          );
        } catch (openaiError) {
          console.warn(`[DeepgramService] OpenAI participant summarization failed for ${participantName}:`, openaiError);
        }
      }

      // Fallback to basic summarization
      return this.generateCustomSummary(text, `Tóm tắt phát biểu của ${participantName}:`);
      
    } catch (error) {
      console.error(`[DeepgramService] Participant summarization failed for ${participantName}:`, error);
      throw error;
    }
  }

  /**
   * Custom extractive summarization (fallback method)
   */
  private generateCustomSummary(text: string, context?: string): SummaryResult {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Take first few sentences and last few sentences as summary
    const summaryLength = Math.min(3, Math.ceil(sentences.length * 0.3));
    const summarySentences = [
      ...sentences.slice(0, Math.ceil(summaryLength / 2)),
      ...sentences.slice(-Math.floor(summaryLength / 2))
    ];

    const finalSummary = context 
      ? `${context}\n\n${summarySentences.join('. ')}`
      : summarySentences.join('. ');

    return {
      summary: finalSummary.trim(),
      keyPoints: this.extractKeyPoints(text),
      actionItems: this.extractActionItems(text),
      decisions: this.extractDecisions(text),
      topics: this.extractTopics(text),
      source: 'custom',
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Extract key points using Vietnamese meeting patterns
   */
  private extractKeyPoints(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const keywordPatterns = [
      /quyết định|kết luận|thống nhất/i,
      /nhiệm vụ|công việc|phân công/i,
      /thời gian|deadline|hạn chót/i,
      /vấn đề|khó khăn|thách thức/i,
      /giải pháp|đề xuất|kiến nghị/i
    ];

    return sentences.filter(sentence => 
      keywordPatterns.some(pattern => pattern.test(sentence))
    ).slice(0, 5).map(point => point.trim());
  }

  /**
   * Extract action items from text
   */
  private extractActionItems(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const actionPatterns = [
      /phải|cần|sẽ|phân công|giao|thực hiện/i,
      /deadline|hạn|hoàn thành|bàn giao/i
    ];

    return sentences.filter(sentence => 
      actionPatterns.some(pattern => pattern.test(sentence))
    ).slice(0, 3).map(item => item.trim());
  }

  /**
   * Extract decisions from text
   */
  private extractDecisions(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const decisionPatterns = [
      /quyết định|kết luận|thống nhất|chốt|đồng ý/i,
      /phê duyệt|thông qua|chấp thuận/i
    ];

    return sentences.filter(sentence => 
      decisionPatterns.some(pattern => pattern.test(sentence))
    ).slice(0, 3).map(decision => decision.trim());
  }

  /**
   * Extract topics from text
   */
  private extractTopics(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const topicPatterns = [
      /về|liên quan|thảo luận|bàn luận|vấn đề/i,
      /dự án|kế hoạch|chiến lược|mục tiêu/i
    ];

    return sentences.filter(sentence => 
      topicPatterns.some(pattern => pattern.test(sentence))
    ).slice(0, 5).map(topic => topic.trim());
  }

  /**
   * Process a meeting folder with audio files
   * @param meetingFolderPath Path to the meeting folder
   * @returns Processing results
   */
  async processMeetingFolder(meetingFolderPath: string, enableSummarization: boolean = true): Promise<{
    transcripts: { [filename: string]: TranscriptionResult };
    summaries: { overall: SummaryResult; participants: { [participantId: string]: SummaryResult } };
  }> {
    try {
      console.log(`[DeepgramService] Processing meeting folder: ${meetingFolderPath} (summarization: ${enableSummarization})`);

      if (!fs.existsSync(meetingFolderPath)) {
        throw new Error(`Meeting folder not found: ${meetingFolderPath}`);
      }

      // Get configuration for language detection
      const config = getConfig();
      const language = config.summarizationLanguage || 'vi';

      // Find audio files recursively
      const audioFiles = this.findAudioFiles(meetingFolderPath);
      console.log(`[DeepgramService] Found ${audioFiles.length} audio files`);

      const transcripts: { [filename: string]: TranscriptionResult } = {};
      const participantTranscripts: { [participantId: string]: string } = {};
      const participantDeepgramSummaries: { [participantId: string]: string } = {};

      // Process each audio file with enhanced transcription
      for (const audioFile of audioFiles) {
        try {
          // Enable Deepgram summarization for English content
          const shouldUseDGSummary = enableSummarization && (language === 'en' || language === 'en-US');
          const result = await this.transcribeAudio(audioFile, language, shouldUseDGSummary);
          
          const filename = path.basename(audioFile);
          transcripts[filename] = result;

          // Save transcript in the same directory as the audio file
          const audioDir = path.dirname(audioFile);
          const transcriptPath = path.join(audioDir, `${filename}.transcript.json`);
          fs.writeFileSync(transcriptPath, JSON.stringify(result, null, 2));

          // Collect participant transcripts and summaries
          const participantId = this.extractParticipantId(filename);
          if (participantId) {
            participantTranscripts[participantId] = result.text;
            if (result.deepgramSummary) {
              participantDeepgramSummaries[participantId] = result.deepgramSummary;
            }
          }
        } catch (error) {
          console.error(`[DeepgramService] Failed to process ${audioFile}:`, error);
        }
      }

      // Generate summaries with Deepgram summaries if available
      const summaries = await this.generateSummariesInPlace(transcripts, participantTranscripts, audioFiles, participantDeepgramSummaries);

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
   * Generate summaries and save them alongside audio files
   */
  private async generateSummariesInPlace(
    transcripts: { [filename: string]: TranscriptionResult },
    participantTranscripts: { [participantId: string]: string },
    audioFiles: string[],
    participantDeepgramSummaries: { [participantId: string]: string } = {}
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
      
      // Save overall summary next to mixed_audio.wav
      const mixedAudioFile = audioFiles.find(file => path.basename(file) === 'mixed_audio.wav');
      if (mixedAudioFile) {
        const overallDeepgramSummary = mixedAudioTranscript.deepgramSummary;
        const overallSummary = await this.summarizeText(overallText, 'Tóm tắt cuộc họp:', overallDeepgramSummary);
        const summaryPath = path.join(path.dirname(mixedAudioFile), 'mixed_audio.wav.summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(overallSummary, null, 2));
      }
    } else {
      // Fallback: combine all participant transcripts
      overallText = Object.values(participantTranscripts).join(' ');
    }
    
    const overallSummary = await this.summarizeText(overallText, 'Tóm tắt cuộc họp:', mixedAudioTranscript?.deepgramSummary);

    // Generate per-participant summaries and save them next to their audio files
    const participantSummaries: { [participantId: string]: SummaryResult } = {};
    
    // Also generate summaries for all audio files, even if they have empty transcripts
    for (const audioFile of audioFiles) {
      const filename = path.basename(audioFile);
      const participantId = this.extractParticipantId(filename);
      
      if (participantId && transcripts[filename]) {
        const text = transcripts[filename].text;
        
        try {
          // Generate summary even for empty or short text, use Deepgram summary if available
          const deepgramSummary = participantDeepgramSummaries[participantId];
          const summary = await this.summarizeParticipantText(text, participantId, deepgramSummary);
          participantSummaries[participantId] = summary;
          
          // Save summary next to the audio file
          const summaryPath = path.join(path.dirname(audioFile), `${filename}.summary.json`);
          fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
          
          console.log(`[DeepgramService] Generated summary for ${participantId}: ${summaryPath}`);
        } catch (error) {
          console.error(`[DeepgramService] Failed to generate summary for participant ${participantId}:`, error);
        }
      }
    }

    return {
      overall: overallSummary,
      participants: participantSummaries
    };
  }

  /**
   * Find audio files in the meeting folder
   */
  private findAudioFiles(folderPath: string): string[] {
    const audioExtensions = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
    const files: string[] = [];

    const findFilesRecursively = (currentPath: string) => {
      try {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (audioExtensions.includes(ext)) {
              files.push(itemPath);
            }
          } else if (stat.isDirectory()) {
            // Recursively search in subdirectories
            findFilesRecursively(itemPath);
          }
        }
      } catch (error) {
        console.error(`[DeepgramService] Error reading folder ${currentPath}:`, error);
      }
    };

    findFilesRecursively(folderPath);
    return files;
  }

  /**
   * Extract participant ID from filename
   */
  private extractParticipantId(filename: string): string | null {
    // Look for patterns like "participant_123", "user_456", or "combined_hoangnguyen_363_219"
    let match = filename.match(/(?:participant|user)_(\w+)/i);
    if (match) {
      return match[1];
    }
    
    // Also check for pattern like "combined_hoangnguyen_363_219"
    match = filename.match(/combined_([^_]+_\d+_\d+)/i);
    if (match) {
      return match[1];
    }
    
    return null;
  }

  /**
   * Generate overall and per-participant summaries with Deepgram integration
   */
  private async generateSummaries(
    transcripts: { [filename: string]: TranscriptionResult },
    participantTranscripts: { [participantId: string]: string },
    summariesDir: string,
    participantSummaries: { [participantId: string]: string } = {}
  ): Promise<{
    overall: SummaryResult;
    participants: { [participantId: string]: SummaryResult };
  }> {
    // Generate overall summary - use mixed_audio.wav if available, otherwise combine participant transcripts
    let overallText = '';
    let overallDeepgramSummary: string | undefined;
    const mixedAudioTranscript = transcripts['mixed_audio.wav'];
    
    if (mixedAudioTranscript) {
      // Use mixed audio transcript as it contains the complete meeting
      overallText = mixedAudioTranscript.text;
      overallDeepgramSummary = mixedAudioTranscript.deepgramSummary;
    } else {
      // Fallback: combine all participant transcripts
      overallText = Object.values(participantTranscripts).join(' ');
    }
    
    // Generate overall summary with Deepgram summary if available
    const overallSummary = await this.summarizeText(overallText, 'Tóm tắt cuộc họp:', overallDeepgramSummary);
    
    // Save overall summary as meeting-summary.json at root level (same level as mixed_audio.wav)
    const meetingSummaryPath = path.join(path.dirname(summariesDir), 'meeting-summary.json');
    fs.writeFileSync(meetingSummaryPath, JSON.stringify(overallSummary, null, 2));
    
    // Also save in summaries directory for backward compatibility
    const overallSummaryPath = path.join(summariesDir, 'overall_summary.json');
    fs.writeFileSync(overallSummaryPath, JSON.stringify(overallSummary, null, 2));

    // Generate per-participant summaries
    const participantSummaryResults: { [participantId: string]: SummaryResult } = {};
    
    for (const [participantId, text] of Object.entries(participantTranscripts)) {
      try {
        // Use Deepgram summary if available for this participant
        const deepgramSummary = participantSummaries[participantId];
        const summary = await this.summarizeText(text, `Tóm tắt phát biểu của ${participantId}:`, deepgramSummary);
        participantSummaryResults[participantId] = summary;
        
        // Save participant summary
        const participantSummaryPath = path.join(summariesDir, `participant_${participantId}_summary.json`);
        fs.writeFileSync(participantSummaryPath, JSON.stringify(summary, null, 2));
      } catch (error) {
        console.error(`[DeepgramService] Failed to generate summary for participant ${participantId}:`, error);
      }
    }

    return {
      overall: overallSummary,
      participants: participantSummaryResults
    };
  }
}

export default DeepgramService;