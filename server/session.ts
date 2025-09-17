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
  private readonly audioFiles: AudioFilesSummary = {};
  private mixedAudioWriter?: WavWriter;
  private warnedMissingMixedFormat = false;
  private warnedMissingParticipantFormat = false;
  private readonly startHr = process.hrtime.bigint();
  private lastMessageHr = this.startHr;
  private closed = false;

  constructor(private readonly deps: SessionDeps) {
    const { config, logger, socket, remoteAddress, userAgent } = deps;

    this.sessionLogger = logger.child({ sessionId: this.id });
    this.baseDir = path.join(config.recordingsRoot, 'live', `session_${this.id}`);
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
    this.metaState.audioFormat = {
      sampleRate: format.sampleRate,
      numberOfChannels: format.numberOfChannels ?? 1,
      numberOfFrames: format.numberOfFrames,
      format: format.format
    };
    this.metadata.audioFormat = this.metaState.audioFormat;
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
    const label = buildParticipantLabel(participantId, info);
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

  close(reason: string, error?: unknown): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

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

      this.sessionLogger.info({ reason, durationMs, idleMs }, 'Session closed');
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
  const nameSource = info?.displayName || info?.fullName || 'participant';
  const namePart = sanitizeSegment(nameSource) || 'participant';
  const idPart = sanitizeSegment(participantId).slice(-8) || 'id';
  return `${namePart}_${idPart}`;
}

function sanitizeSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .toLowerCase();
}

