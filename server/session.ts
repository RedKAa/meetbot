import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { WebSocket, RawData } from 'ws';

import type { RecorderConfig } from './config';
import type { Logger } from './logger';
import {
  AudioFilesSummary,
  AudioFormat,
  AudioFormatUpdateEvent,
  FrameType,
  RecorderJsonEvent,
  SessionMetadataSnapshot,
  SessionStatsSnapshot,
  SessionSummary,
  UsersUpdateEvent
} from './types';
import { WavWriter, convertFloat32ToInt16 } from './audio';
import { PhoWhisperService } from './pho-whisper';
import { DeepgramService } from './deepgram-service';

const TELEMETRY_FILE = 'telemetry.ndjson';
const SUMMARY_FILE = 'session-summary.json';
const MIXED_AUDIO_FILE = 'mixed_audio.wav';
const PARTICIPANTS_DIR = 'participants';

interface SessionDeps {
  config: RecorderConfig;
  logger: Logger;
  socket: WebSocket;
  remoteAddress?: string;
  userAgent?: string | string[];
}

interface MetadataState {
  meetingUrl?: string;
  botName?: string;
  audioFormat?: AudioFormat;
}

interface ParticipantInfo {
  deviceId: string;
  displayName?: string;
  fullName?: string;
  isCurrentUser?: boolean;
}

interface ParticipantWriterState {
  label: string;
  writer: WavWriter;
  files: string[];
}

export class Session {
  readonly id = randomUUID();

  private readonly baseDir: string;
  private readonly telemetryPath: string;
  private readonly telemetryStream: fs.WriteStream;
  private readonly stats: SessionStatsSnapshot = {
    jsonMessages: 0,
    mixedAudioFrames: 0,
    participantAudioFrames: 0,
    videoFrames: 0,
    encodedVideoChunks: 0,
    unknownFrames: 0
  };
  private readonly metadata: SessionMetadataSnapshot;
  private readonly metaState: MetadataState = {};
  private readonly sessionLogger: Logger;
  private readonly participantInfo = new Map<string, ParticipantInfo>();
  private readonly participantWriters = new Map<string, ParticipantWriterState>();
  private readonly participantLabels = new Map<string, string>();
  private readonly audioFiles: AudioFilesSummary = {};
  private mixedAudioWriter?: WavWriter;
  private pendingMixedAudio: Buffer[] = [];
  private pendingParticipantAudio = new Map<string, Buffer[]>();
  private warnedMissingMixedFormat = false;
  private warnedMissingParticipantFormat = false;
  private readonly startHr = process.hrtime.bigint();
  private lastMessageHr = this.startHr;
  private closed = false;
  private inactivityTimer?: NodeJS.Timeout;
  private readonly INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly deps: SessionDeps) {
    const { config, logger, socket, remoteAddress, userAgent } = deps;

    this.sessionLogger = logger.child({ sessionId: this.id });
    
    // Create session folder
    const sessionFolder = `session_${this.id}`;
    this.baseDir = path.join(config.recordingsRoot, 'live', sessionFolder);
    ensureDir(this.baseDir);

    this.telemetryPath = path.join(this.baseDir, TELEMETRY_FILE);
    this.telemetryStream = fs.createWriteStream(this.telemetryPath, { flags: 'a' });

    this.metadata = {
      sessionId: this.id,
      port: config.port,
      recordingsRoot: config.recordingsRoot,
      remoteAddress,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
      startedAtIso: new Date().toISOString()
    };

    this.sessionLogger.info('Session connected');

    socket.on('message', (data: RawData) => this.handleMessage(data));
    socket.once('close', () => this.close('client_close'));
    socket.once('error', (err: Error) => this.close('socket_error', err));

    // Start inactivity monitoring
    this.resetInactivityTimer();
  }

  handleMessage(message: RawData): void {
    if (this.closed) {
      return;
    }

    const buf = normaliseMessage(message);
    if (!buf.length) {
      return;
    }

    this.lastMessageHr = process.hrtime.bigint();
    this.resetInactivityTimer();

    try {
      this.dispatch(buf);
    } catch (error) {
      this.sessionLogger.error({ error }, 'Failed to dispatch frame');
      this.stats.unknownFrames += 1;
    }
  }

  private dispatch(buffer: Buffer): void {
    if (buffer.length < 4) {
      throw new Error('Frame shorter than header');
    }

    const frameType = buffer.readInt32LE(0) as FrameType;

    switch (frameType) {
      case FrameType.Json: {
        const payload = buffer.subarray(4).toString('utf8');
        this.handleJson(payload);
        break;
      }
      case FrameType.Video: {
        this.stats.videoFrames += 1;
        break;
      }
      case FrameType.MixedAudio: {
        this.stats.mixedAudioFrames += 1;
        this.handleMixedAudio(buffer.subarray(4));
        break;
      }
      case FrameType.EncodedVideo: {
        this.stats.encodedVideoChunks += 1;
        break;
      }
      case FrameType.ParticipantAudio: {
        this.stats.participantAudioFrames += 1;
        this.handleParticipantAudio(buffer.subarray(4));
        break;
      }
      default: {
        this.stats.unknownFrames += 1;
        this.sessionLogger.warn({ frameType }, 'Unknown frame type');
        break;
      }
    }
  }

  private handleJson(raw: string): void {
    this.stats.jsonMessages += 1;
    this.telemetryStream.write(raw + '\n');

    try {
      const parsed = JSON.parse(raw) as RecorderJsonEvent;
      this.applyMetadata(parsed);
    } catch (error) {
      this.sessionLogger.warn({ error }, 'Failed to parse JSON payload');
    }
  }

  private applyMetadata(event: RecorderJsonEvent): void {
    if (!event || typeof event !== 'object') {
      return;
    }

    if (event.type === 'SessionStarted') {
      if (typeof event.meetingUrl === 'string') {
        this.metaState.meetingUrl = event.meetingUrl;
      }
      if (typeof event.botName === 'string') {
        this.metaState.botName = event.botName;
      }
    }

    if (event.type === 'AudioFormatUpdate' && event.format) {
      this.handleAudioFormatUpdate(event as AudioFormatUpdateEvent);
    }

    if (event.type === 'UsersUpdate') {
      this.handleUsersUpdate(event as UsersUpdateEvent);
    }

    if (event.type === 'MeetingStatusChange') {
      this.handleMeetingStatusChange(event as any);
    }

    if (!this.metaState.meetingUrl) {
      const fallbackUrl = (event as Record<string, unknown>).meetingUrl;
      if (typeof fallbackUrl === 'string') {
        this.metaState.meetingUrl = fallbackUrl;
      }
    }
  }

  private handleAudioFormatUpdate(event: AudioFormatUpdateEvent): void {
    const format = event.format;
    if (!format || typeof format.sampleRate !== 'number') {
      return;
    }
    const normalised: AudioFormat = {
      sampleRate: format.sampleRate,
      numberOfChannels: format.numberOfChannels ?? 1,
      numberOfFrames: format.numberOfFrames,
      format: format.format
    };
    this.metaState.audioFormat = normalised;
    this.metadata.audioFormat = normalised;

    this.flushPendingAudio(normalised);
  }

  private flushPendingAudio(format: AudioFormat): void {
    if (this.pendingMixedAudio.length && this.deps.config.enableMixedAudio) {
      const writer = this.ensureMixedAudioWriter(format);
      if (writer) {
        for (const chunk of this.pendingMixedAudio) {
          writer.write(convertFloat32ToInt16(chunk));
        }
      }
      this.pendingMixedAudio = [];
    }

    if (this.pendingParticipantAudio.size && this.deps.config.enablePerParticipantAudio) {
      for (const [participantId, buffers] of this.pendingParticipantAudio.entries()) {
        if (!buffers.length) {
          continue;
        }
        const writerState = this.ensureParticipantWriter(participantId, format);
        if (!writerState) {
          continue;
        }
        for (const chunk of buffers) {
          writerState.writer.write(convertFloat32ToInt16(chunk));
        }
      }
      this.pendingParticipantAudio.clear();
    }
  }


  private handleUsersUpdate(event: UsersUpdateEvent): void {
    const candidates = [
      ...(Array.isArray(event.newUsers) ? event.newUsers : []),
      ...(Array.isArray(event.updatedUsers) ? event.updatedUsers : [])
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      const deviceId = typeof candidate['deviceId'] === 'string' ? candidate['deviceId'] : undefined;
      if (!deviceId) {
        continue;
      }
      const info: ParticipantInfo = {
        deviceId,
        displayName: typeof candidate['displayName'] === 'string' ? candidate['displayName'] : undefined,
        fullName: typeof candidate['fullName'] === 'string' ? candidate['fullName'] : undefined,
        isCurrentUser: typeof candidate['isCurrentUser'] === 'boolean' ? candidate['isCurrentUser'] : undefined
      };
      this.participantInfo.set(deviceId, info);
    }
  }

  private handleMixedAudio(payload: Buffer): void {
    if (!this.deps.config.enableMixedAudio) {
      return;
    }
    if (!payload.length) {
      return;
    }
    const format = this.metaState.audioFormat;
    if (!format) {
      this.pendingMixedAudio.push(Buffer.from(payload));
      if (!this.warnedMissingMixedFormat) {
        this.sessionLogger.warn('Mixed audio received before AudioFormatUpdate');
        this.warnedMissingMixedFormat = true;
      }
      return;
    }

    const writer = this.ensureMixedAudioWriter(format);
    if (!writer) {
      return;
    }
    const pcm = convertFloat32ToInt16(payload);
    writer.write(pcm);
  }

  private handleParticipantAudio(payload: Buffer): void {
    if (!this.deps.config.enablePerParticipantAudio) {
      return;
    }
    if (payload.length < 1) {
      return;
    }

    const idLength = payload.readUInt8(0);
    const idStart = 1;
    const idEnd = idStart + idLength;
    if (payload.length < idEnd) {
      this.sessionLogger.warn('Participant audio payload shorter than participantId length');
      return;
    }

    const participantId = payload.subarray(idStart, idEnd).toString('utf8');
    const audioData = payload.subarray(idEnd);
    if (!audioData.length) {
      return;
    }

    const format = this.metaState.audioFormat;
    if (!format) {
      const queue = this.pendingParticipantAudio.get(participantId) ?? [];
      queue.push(Buffer.from(audioData));
      this.pendingParticipantAudio.set(participantId, queue);
      if (!this.warnedMissingParticipantFormat) {
        this.sessionLogger.warn('Participant audio received before AudioFormatUpdate');
        this.warnedMissingParticipantFormat = true;
      }
      return;
    }

    const writerState = this.ensureParticipantWriter(participantId, format);
    if (!writerState) {
      return;
    }

    const pcm = convertFloat32ToInt16(audioData);
    writerState.writer.write(pcm);
  }

  private ensureMixedAudioWriter(format: AudioFormat): WavWriter | undefined {
    if (this.mixedAudioWriter) {
      return this.mixedAudioWriter;
    }

    const filePath = path.join(this.baseDir, MIXED_AUDIO_FILE);
    this.mixedAudioWriter = new WavWriter({ filePath, format });
    const relative = path.relative(this.baseDir, filePath) || path.basename(filePath);
    this.audioFiles.mixed = this.audioFiles.mixed ?? [];
    if (!this.audioFiles.mixed.includes(relative)) {
      this.audioFiles.mixed.push(relative);
    }
    return this.mixedAudioWriter;
  }

  private ensureParticipantWriter(participantId: string, format: AudioFormat): ParticipantWriterState | undefined {
    const existing = this.participantWriters.get(participantId);
    if (existing) {
      return existing;
    }

    const info = this.participantInfo.get(participantId);
    let label = this.participantLabels.get(participantId);
    if (!label) {
      label = buildParticipantLabel(participantId, info);
      this.participantLabels.set(participantId, label);
    }
    const participantDir = path.join(this.baseDir, PARTICIPANTS_DIR, label);
    ensureDir(participantDir);
    const fileName = `combined_${label}.wav`;
    const filePath = path.join(participantDir, fileName);
    const writer = new WavWriter({ filePath, format });
    const relative = path.relative(this.baseDir, filePath);

    const state: ParticipantWriterState = { label, writer, files: [relative] };
    this.participantWriters.set(participantId, state);

    this.audioFiles.participants = this.audioFiles.participants ?? {};
    this.audioFiles.participants[label] = state.files;

    return state;
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    
    this.inactivityTimer = setTimeout(() => {
      this.sessionLogger.warn('Session inactive for too long, closing');
      this.close('inactivity_timeout');
    }, this.INACTIVITY_TIMEOUT_MS);
  }

  private handleMeetingStatusChange(event: any): void {
    if (event.change === 'removed_from_meeting') {
      this.sessionLogger.info('Bot was removed from meeting, closing session');
      this.close('removed_from_meeting');
    }
  }

  close(reason: string, error?: unknown): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    // Clear inactivity timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = undefined;
    }

    const { socket } = this.deps;

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }

    const durationMs = Number(process.hrtime.bigint() - this.startHr) / 1_000_000;
    const idleMs = Number(process.hrtime.bigint() - this.lastMessageHr) / 1_000_000;

    this.metadata.meetingUrl = this.metaState.meetingUrl ?? this.metadata.meetingUrl;
    this.metadata.botName = this.metaState.botName ?? this.metadata.botName;
    this.metadata.audioFormat = this.metaState.audioFormat ?? this.metadata.audioFormat;
    this.metadata.audioFiles = this.audioFiles;
    this.metadata.participants = Array.from(this.participantInfo.values());

    const finalize = async () => {
      await this.closeAudioWriters();

      const summary: SessionSummary = {
        sessionId: this.id,
        reason,
        durationMs,
        idleMsBeforeClose: idleMs,
        stats: this.stats,
        metadata: this.metadata,
        error: error instanceof Error ? error.message : undefined
      };

      const summaryPath = path.join(this.baseDir, SUMMARY_FILE);
      await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));

      const archiveInfo = await this.archiveSession(summary);
      if (archiveInfo) {
        this.metadata.archivePath = archiveInfo.archiveRelativePath;
        this.metadata.manifestPath = archiveInfo.manifestRelativePath;

        const enrichedSummary: SessionSummary = {
          ...summary,
          metadata: {
            ...summary.metadata,
            archivePath: archiveInfo.archiveRelativePath,
            manifestPath: archiveInfo.manifestRelativePath
          }
        };

        const archivedSummaryPath = path.join(archiveInfo.archivePath, SUMMARY_FILE);
        await fs.promises.writeFile(archivedSummaryPath, JSON.stringify(enrichedSummary, null, 2));

        this.sessionLogger.info({ reason, durationMs, idleMs, archivePath: archiveInfo.archiveRelativePath }, 'Session closed');
      } else {
        this.sessionLogger.info({ reason, durationMs, idleMs }, 'Session closed');
      }
    };

    if (this.telemetryStream.closed) {
      void finalize().catch(err => {
        this.sessionLogger.error({ err }, 'Failed to finalise session summary');
      });
    } else {
      this.telemetryStream.end(() => {
        void finalize().catch(err => {
          this.sessionLogger.error({ err }, 'Failed to finalise session summary');
        });
      });
    }
  }

  private async archiveSession(summary: SessionSummary): Promise<{ archivePath: string; archiveRelativePath: string; manifestRelativePath: string } | null> {
    const completedRoot = path.join(this.deps.config.recordingsRoot, 'completed');
    ensureDir(completedRoot);

    const baseName = buildArchiveFolderName(this.metaState.meetingUrl, summary.metadata.startedAtIso, this.id);
    let destination = path.join(completedRoot, baseName);
    let attempt = 1;
    while (await pathExists(destination)) {
      const suffix = String(attempt++).padStart(2, '0');
      destination = path.join(completedRoot, baseName + '_' + suffix);
    }

    try {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.rename(this.baseDir, destination);
    } catch (err) {
      this.sessionLogger.error({ err }, 'Failed to archive session directory');
      return null;
    }

    const files = await listRelativeFiles(destination);
    const manifest = {
      sessionId: summary.sessionId,
      meetingUrl: this.metaState.meetingUrl ?? null,
      botName: this.metaState.botName ?? null,
      startedAt: summary.metadata.startedAtIso,
      archivedAt: new Date().toISOString(),
      files
    };

    const manifestPath = path.join(destination, 'archive.json');
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const archiveRelativePath = path.relative(this.deps.config.recordingsRoot, destination);
    const manifestRelativePath = path.relative(this.deps.config.recordingsRoot, manifestPath);

    // Process with PhoWhisper if configured
    this.processPhoWhisper(destination).catch(err => {
      this.sessionLogger.error({ err }, 'PhoWhisper processing failed, but archive completed successfully');
    });

    return { archivePath: destination, archiveRelativePath, manifestRelativePath };
  }

  private async closeAudioWriters(): Promise<void> {
    const closures: Array<Promise<void>> = [];

    if (this.mixedAudioWriter) {
      closures.push(
        this.mixedAudioWriter.close().catch(err => {
          this.sessionLogger.error({ err }, 'Failed to close mixed audio writer');
        })
      );
    }

    for (const state of this.participantWriters.values()) {
      closures.push(
        state.writer.close().catch(err => {
          this.sessionLogger.error({ err, participantLabel: state.label }, 'Failed to close participant audio writer');
        })
      );
    }

    await Promise.all(closures);
  }

  private async processPhoWhisper(archivePath: string): Promise<void> {
    try {
      const { config } = this.deps;
      
      // Use DeepgramService with enhanced summarization
      const deepgramService = new DeepgramService();
      
      // Enable summarization based on configuration
      const enableSummarization = config.enableAutoSummarization ?? true;
      
      this.sessionLogger.info({ 
        archivePath, 
        enableSummarization, 
        provider: config.summarizationProvider,
        language: config.summarizationLanguage 
      }, 'Starting transcription and summarization');
      
      await deepgramService.processMeetingFolder(archivePath, enableSummarization);
      
      this.sessionLogger.info({ archivePath }, 'Deepgram processing with summarization completed successfully');
    } catch (error) {
      this.sessionLogger.error({ error, archivePath }, 'Deepgram processing failed');
      throw error;
    }
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normaliseMessage(message: RawData): Buffer {
  if (Buffer.isBuffer(message)) {
    return message;
  }
  if (Array.isArray(message)) {
    return Buffer.concat(message.map(chunk => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))));
  }
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message);
  }
  return Buffer.alloc(0);
}

function buildParticipantLabel(participantId: string, info?: ParticipantInfo): string {
  const randomPart = generateRandomDigits(3);
  const nameSource = info?.fullName || info?.displayName || 'participant';
  const namePart = normalizeParticipantName(nameSource);
  const deviceSuffix = extractDeviceSuffix(participantId);
  return `${namePart}_${deviceSuffix}_${randomPart}`;
}

function normalizeParticipantName(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
  return normalized.length ? normalized.slice(0, 48) : 'participant';
}

function extractDeviceSuffix(participantId: string): string {
  const numericMatch = participantId.match(/(\d+)(?!.*\d)/);
  if (numericMatch) {
    return numericMatch[1];
  }
  const digits = participantId.replace(/[^0-9]/g, '');
  if (digits.length) {
    return digits.slice(-3);
  }
  return 'id';
}

function generateRandomDigits(count: number): string {
  const min = Math.pow(10, count - 1);
  const max = Math.pow(10, count) - 1;
  const value = Math.floor(Math.random() * (max - min + 1)) + min;
  return String(value);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listRelativeFiles(root: string): Promise<Array<{ path: string; size: number }>> {
  const files: Array<{ path: string; size: number }> = [];
  await collectRelativeFiles(root, root, files);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function collectRelativeFiles(current: string, base: string, acc: Array<{ path: string; size: number }>): Promise<void> {
  const entries = await fs.promises.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectRelativeFiles(fullPath, base, acc);
    } else if (entry.isFile()) {
      const stats = await fs.promises.stat(fullPath);
      acc.push({ path: path.relative(base, fullPath).replace(/\\\\/g, '/'), size: stats.size });
    }
  }
}

function buildArchiveFolderName(meetingUrl: string | undefined, startedAtIso: string | undefined, sessionId: string): string {
  const meetingSlug = sanitizeArchiveSegment(extractMeetingSlug(meetingUrl));
  const timestamp = formatArchiveTimestamp(startedAtIso);
  const sessionSlug = sessionId.slice(0, 8);
  return 'meeting_' + meetingSlug + '_' + timestamp + '_' + sessionSlug;
}

function extractMeetingSlug(meetingUrl: string | undefined): string {
  if (!meetingUrl) {
    return 'unknown';
  }
  try {
    const parsed = new URL(meetingUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments.pop() ?? parsed.hostname;
  } catch {
    return meetingUrl;
  }
}

function formatArchiveTimestamp(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }
  const fallback = iso ?? new Date().toISOString();
  return fallback.replace(/[^0-9A-Za-z]+/g, '').slice(0, 16) || 'timestamp';
}

function sanitizeArchiveSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'segment';
}

