"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_PORT = 8765;
const DEFAULT_RECORDINGS_DIR = path_1.default.resolve(process.cwd(), 'recordings');
function loadConfig(env = process.env) {
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
function normaliseEnv(value) {
    switch ((value ?? '').toLowerCase()) {
        case 'production':
            return 'production';
        case 'test':
            return 'test';
        default:
            return 'development';
    }
}
function normalisePort(value, fallback) {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        return fallback;
    }
    return parsed;
}
function normalisePath(customPath, fallback) {
    if (customPath && customPath.trim().length > 0) {
        return path_1.default.resolve(customPath.trim());
    }
    return fallback;
}
function normaliseBoolean(value, fallback) {
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
function ensureDir(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
//# sourceMappingURL=config.js.map