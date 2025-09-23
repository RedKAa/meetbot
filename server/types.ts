export enum FrameType {
  Json = 1,
  Video = 2,
  MixedAudio = 3,
  EncodedVideo = 4,
  ParticipantAudio = 5
}

export interface AudioFormat {
  sampleRate: number;
  numberOfChannels: number;
  numberOfFrames?: number;
  format?: string;
}

export interface AudioFormatUpdateEvent {
  type: 'AudioFormatUpdate';
  format: AudioFormat;
}

export interface SessionStartedEvent {
  type: 'SessionStarted';
  meetingUrl?: string;
  botName?: string;
  startedAt?: string;
}

export interface UsersUpdateEvent {
  type: 'UsersUpdate';
  meetingUrl?: string;
  newUsers?: Array<Record<string, unknown>>;
  removedUsers?: Array<Record<string, unknown>>;
  updatedUsers?: Array<Record<string, unknown>>;
}

export type RecorderJsonEvent =
  | SessionStartedEvent
  | UsersUpdateEvent
  | AudioFormatUpdateEvent
  | ({ type: string } & Record<string, unknown>);

export interface SessionStatsSnapshot {
  jsonMessages: number;
  mixedAudioFrames: number;
  participantAudioFrames: number;
  videoFrames: number;
  encodedVideoChunks: number;
  unknownFrames: number;
}

export interface AudioFilesSummary {
  mixed?: string[];
  participants?: Record<string, string[]>;
}

export interface SessionMetadataSnapshot {
  sessionId: string;
  port: number;
  recordingsRoot: string;
  meetingUrl?: string;
  botName?: string;
  remoteAddress?: string;
  userAgent?: string;
  startedAtIso: string;
  audioFormat?: AudioFormat;
  audioFiles?: AudioFilesSummary;
  archivePath?: string;
  manifestPath?: string;
  participants?: Array<{
    deviceId: string;
    displayName?: string;
    fullName?: string;
    isCurrentUser?: boolean;
  }>;
}

export interface SessionSummary {
  sessionId: string;
  reason: string;
  durationMs: number;
  idleMsBeforeClose: number;
  stats: SessionStatsSnapshot;
  metadata: SessionMetadataSnapshot;
  error?: string;
}

// New interfaces for enhanced summarization
export interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
  language: string;
  deepgramSummary?: string; // Summary from Deepgram API
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  source: 'deepgram' | 'custom' | 'pho-whisper' | 'openai'; // Track source of summary
  confidence?: number;
  generatedAt: string;
  actionItems?: string[];
  decisions?: string[];
  topics?: string[];
}

