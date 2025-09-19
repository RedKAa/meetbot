import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { Logger } from './logger';
import { getConfig } from './config';

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
  duration?: number;
}

export interface SummarizationResult {
  success: boolean;
  summary?: string;
  error?: string;
  duration?: number;
}

export interface PhoWhisperConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

export class PhoWhisperService {
  private logger: Logger;
  private config: PhoWhisperConfig;

  constructor(logger: Logger) {
    this.logger = logger;
    const appConfig = getConfig();
    const webhook = appConfig.phoWhisperWebhookUrl;
    if (!webhook) {
      throw new Error('phoWhisperWebhookUrl/PHO_WHISPER_WEBHOOK_URL is not configured');
    }

    this.config = {
      baseUrl: webhook,
      timeout: 300000, // 5 minutes
      retries: 3,
      retryDelay: 5000 // 5 seconds
    };
  }

  /**
   * Transcribe audio file to text
   */
  async transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
    const startTime = Date.now();
    
    try {
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const stats = fs.statSync(audioFilePath);
      this.logger.info(`Transcribing audio file: ${audioFilePath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      const result = await this.makeRequestWithRetry(async () => {
        const formData = new FormData();
        formData.append('audio', fs.createReadStream(audioFilePath));

        const response = await fetchWithTimeout(`${this.config.baseUrl}/transcribe`, {
          method: 'POST',
          body: formData as any,
          headers: (formData as any).getHeaders?.() ?? {}
        }, this.config.timeout);

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
          error.status = response.status;
          throw error;
        }

        const data = await response.json() as any;
        return data.data || data.text || '';
      }, `transcribe audio: ${audioFilePath}`);

      const duration = Date.now() - startTime;
      this.logger.info(`Transcription completed in ${duration}ms`);

      return {
        success: true,
        text: result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error({ error: errorMessage }, `Transcription failed after ${duration}ms:`);
      
      return {
        success: false,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * Summarize text using PhoWhisper API
   */
  async summarizeText(text: string, context?: string): Promise<SummarizationResult> {
    const startTime = Date.now();
    
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text content is empty');
      }

      this.logger.info(`Summarizing text content (${text.length} characters)`);

      const result = await this.makeRequestWithRetry(async () => {
        const payload = {
          content: text,
          context: context || 'meeting transcript'
        };

        const response = await fetchWithTimeout(`${this.config.baseUrl}/summarize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }, this.config.timeout);

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
          error.status = response.status;
          throw error;
        }

        const data = await response.json() as any;
        return data.data || data.summary || '';
      }, `summarize text: ${context || 'general summary'}`);

      const duration = Date.now() - startTime;
      this.logger.info(`Summarization completed in ${duration}ms`);

      return {
        success: true,
        summary: result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error({ error: errorMessage }, `Summarization failed after ${duration}ms:`);
      
      return {
        success: false,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * Process meeting folder: transcribe audio files and generate summaries
   */
  async processMeetingFolder(meetingFolderPath: string): Promise<void> {
    this.logger.info(`Processing meeting folder: ${meetingFolderPath}`);

    try {
      // Create transcripts and summaries directories
      const transcriptsDir = path.join(meetingFolderPath, 'transcripts');
      const summariesDir = path.join(meetingFolderPath, 'summaries');
      const participantsTranscriptsDir = path.join(transcriptsDir, 'participants');
      const participantsSummariesDir = path.join(summariesDir, 'participants');

      await fs.promises.mkdir(transcriptsDir, { recursive: true });
      await fs.promises.mkdir(summariesDir, { recursive: true });
      await fs.promises.mkdir(participantsTranscriptsDir, { recursive: true });
      await fs.promises.mkdir(participantsSummariesDir, { recursive: true });

      // Process mixed audio
      const mixedAudioPath = path.join(meetingFolderPath, 'mixed_audio.wav');
      if (fs.existsSync(mixedAudioPath)) {
        await this.processMixedAudio(mixedAudioPath, transcriptsDir, summariesDir);
      }

      // Process participant audio files
      const participantsDir = path.join(meetingFolderPath, 'participants');
      if (fs.existsSync(participantsDir)) {
        await this.processParticipantAudio(participantsDir, participantsTranscriptsDir, participantsSummariesDir);
      }

      this.logger.info(`Meeting processing completed: ${meetingFolderPath}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process meeting folder: ${errorMessage}`);
      throw error;
    }
  }

  private async processMixedAudio(audioPath: string, transcriptsDir: string, summariesDir: string): Promise<void> {
    this.logger.info('Processing mixed audio for transcription and summarization');

    const transcriptionResult = await this.transcribeAudio(audioPath);
    
    if (transcriptionResult.success && transcriptionResult.text) {
      const transcriptPath = path.join(transcriptsDir, 'mixed_transcript.txt');
      await fs.promises.writeFile(transcriptPath, transcriptionResult.text, 'utf8');
      this.logger.info(`Mixed transcript saved: ${transcriptPath}`);

      const summaryResult = await this.summarizeText(
        transcriptionResult.text,
        'Complete meeting transcript - provide overall meeting summary'
      );

      if (summaryResult.success && summaryResult.summary) {
        const summaryPath = path.join(summariesDir, 'meeting_summary.txt');
        await fs.promises.writeFile(summaryPath, summaryResult.summary, 'utf8');
        this.logger.info(`Meeting summary saved: ${summaryPath}`);
      }
    }
  }

  private async processParticipantAudio(
    participantsDir: string,
    transcriptsDir: string,
    summariesDir: string
  ): Promise<void> {
    const participants = await fs.promises.readdir(participantsDir);
    
    for (const participantFolder of participants) {
      const participantPath = path.join(participantsDir, participantFolder);
      const stat = await fs.promises.stat(participantPath);
      
      if (!stat.isDirectory()) continue;

      this.logger.info(`Processing participant: ${participantFolder}`);

      const audioFiles = await fs.promises.readdir(participantPath);
      const combinedAudioFile = audioFiles.find(file => file.startsWith('combined_') && file.endsWith('.wav'));
      
      if (!combinedAudioFile) {
        this.logger.warn(`No combined audio file found for participant: ${participantFolder}`);
        continue;
      }

      const audioPath = path.join(participantPath, combinedAudioFile);
      const participantName = participantFolder.split('_')[0];

      const transcriptionResult = await this.transcribeAudio(audioPath);
      
      if (transcriptionResult.success && transcriptionResult.text) {
        const transcriptPath = path.join(transcriptsDir, `${participantName}_transcript.txt`);
        await fs.promises.writeFile(transcriptPath, transcriptionResult.text, 'utf8');
        this.logger.info(`Participant transcript saved: ${transcriptPath}`);

        const summaryResult = await this.summarizeText(
          transcriptionResult.text,
          `Transcript from participant ${participantName} - summarize their contributions and key points`
        );

        if (summaryResult.success && summaryResult.summary) {
          const summaryPath = path.join(summariesDir, `${participantName}_summary.txt`);
          await fs.promises.writeFile(summaryPath, summaryResult.summary, 'utf8');
          this.logger.info(`Participant summary saved: ${summaryPath}`);
        }
      }
    }
  }

  private async findAudioFiles(meetingPath: string): Promise<string[]> {
    const audioFiles: string[] = [];
    const mixedAudioPath = path.join(meetingPath, 'mixed_audio.wav');
    if (fs.existsSync(mixedAudioPath)) {
      audioFiles.push(mixedAudioPath);
    }

    const participantsDir = path.join(meetingPath, 'participants');
    if (fs.existsSync(participantsDir)) {
      const participants = await fs.promises.readdir(participantsDir);
      for (const participantFolder of participants) {
        const participantPath = path.join(participantsDir, participantFolder);
        const stat = await fs.promises.stat(participantPath);
        if (stat.isDirectory()) {
          const files = await fs.promises.readdir(participantPath);
          const combinedAudioFile = files.find(file => file.startsWith('combined_') && file.endsWith('.wav'));
          if (combinedAudioFile) {
            audioFiles.push(path.join(participantPath, combinedAudioFile));
          }
        }
      }
    }

    return audioFiles;
  }

  private extractParticipantId(fileName: string): string | undefined {
    const match = fileName.match(/^(.+?)_/);
    return match ? match[1] : undefined;
  }

  private async generateSummaries(
    transcripts: Array<{ file: string; transcript: string; participantId?: string }>,
    summariesDir: string,
    logger: any
  ): Promise<void> {
    const combinedText = transcripts.map(t => `${t.file}: ${t.transcript}`).join('\n\n');
    try {
      const overallSummary = await this.summarizeText(
        combinedText,
        'Complete meeting transcript - provide overall meeting summary'
      );
      
      if (overallSummary.success && overallSummary.summary) {
        const summaryPath = path.join(summariesDir, 'meeting_summary.txt');
        await fs.promises.writeFile(summaryPath, overallSummary.summary, 'utf8');
        logger.info({ summaryPath }, 'Overall meeting summary saved');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to generate overall meeting summary');
    }

    const participantsSummaryDir = path.join(summariesDir, 'participants');
    await fs.promises.mkdir(participantsSummaryDir, { recursive: true });

    for (const transcript of transcripts) {
      if (transcript.participantId) {
        try {
          const participantSummary = await this.summarizeText(
            transcript.transcript,
            `Transcript from participant ${transcript.participantId} - summarize their contributions and key points`
          );
          
          if (participantSummary.success && participantSummary.summary) {
            const summaryPath = path.join(participantsSummaryDir, `${transcript.participantId}_summary.txt`);
            await fs.promises.writeFile(summaryPath, participantSummary.summary, 'utf8');
            logger.info({ summaryPath }, 'Participant summary saved');
          }
        } catch (error) {
          logger.error({ error, participantId: transcript.participantId }, 'Failed to generate participant summary');
        }
      }
    }
  }

  private async makeRequestWithRetry<T>(requestFn: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn({ 
          attempt, 
          maxRetries: this.config.retries, 
          error: lastError.message,
          context 
        }, 'Request failed, retrying...');
        
        if (!this.isRetryableError(error)) {
          this.logger.error({ error: lastError.message, context }, 'Non-retryable error encountered');
          throw lastError;
        }
        
        if (attempt < this.config.retries) {
          const delayMs = this.calculateBackoffDelay(attempt);
          await this.delay(delayMs);
        }
      }
    }
    
    this.logger.error({ 
      maxRetries: this.config.retries, 
      error: lastError!.message,
      context 
    }, 'All retry attempts exhausted');
    throw lastError!;
  }

  private isRetryableError(error: any): boolean {
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.name === 'AbortError') {
      return true;
    }
    if (error.status >= 500 && error.status < 600) {
      return true;
    }
    if (error.status === 429) {
      return true;
    }
    if (error.status >= 400 && error.status < 500) {
      return false;
    }
    return true;
  }

  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function fetchWithTimeout(resource: string, options: any, timeoutMs: number): Promise<import('node-fetch').Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs | 0));
  try {
    const opts = { ...(options || {}), signal: controller.signal } as any;
    return await fetch(resource, opts);
  } finally {
    clearTimeout(timer);
  }
}


