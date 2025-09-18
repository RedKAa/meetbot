import fs from 'fs';
import path from 'path';

export interface RecorderConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  recordingsRoot: string;
  enableMixedAudio: boolean;
  enablePerParticipantAudio: boolean;
  enableVideoCapture: boolean;
  phoWhisperWebhookUrl?: string;
}

const DEFAULT_PORT = 8765;
const DEFAULT_RECORDINGS_DIR = path.resolve(process.cwd(), 'recordings');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RecorderConfig {
  const nodeEnv = normaliseEnv(env.NODE_ENV);

  const port = normalisePort(env.WS_PORT, DEFAULT_PORT);
  const recordingsRoot = normalisePath(env.RECORDINGS_ROOT, DEFAULT_RECORDINGS_DIR);
  ensureDir(recordingsRoot);

  return {
    env: nodeEnv,
    port,
    recordingsRoot,
    enableMixedAudio: normaliseBoolean(env.SEND_MIXED_AUDIO, true),
    enablePerParticipantAudio: normaliseBoolean(env.SEND_PER_PARTICIPANT_AUDIO, true),
    enableVideoCapture: normaliseBoolean(env.CAPTURE_VIDEO_FRAMES, false),
    phoWhisperWebhookUrl: typeof env.PHO_WHISPER_WEBHOOK_URL === 'string' && env.PHO_WHISPER_WEBHOOK_URL.trim().length > 0
      ? env.PHO_WHISPER_WEBHOOK_URL.trim()
      : undefined
  };
}

function normaliseEnv(value?: string): RecorderConfig['env'] {
  switch ((value ?? '').toLowerCase()) {
    case 'production':
      return 'production';
    case 'test':
      return 'test';
    default:
      return 'development';
  }
}

function normalisePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalisePath(customPath: string | undefined, fallback: string): string {
  if (customPath && customPath.trim().length > 0) {
    return path.resolve(customPath.trim());
  }
  return fallback;
}

function normaliseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  const lowered = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(lowered)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(lowered)) {
    return false;
  }
  return fallback;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Global config instance
let globalConfig: RecorderConfig | null = null;

export function getConfig(): RecorderConfig {
  if (!globalConfig) {
    globalConfig = loadConfig();
  }
  return globalConfig;
}

