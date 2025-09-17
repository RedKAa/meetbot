"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const ws_1 = require("ws");
const types_1 = require("./types");
const audio_1 = require("./audio");
const TELEMETRY_FILE = 'telemetry.ndjson';
const SUMMARY_FILE = 'session-summary.json';
const MIXED_AUDIO_FILE = 'mixed_audio.wav';
const PARTICIPANTS_DIR = 'participants';
class Session {
    deps;
    id = (0, crypto_1.randomUUID)();
    baseDir;
    telemetryPath;
    telemetryStream;
    stats = {
        jsonMessages: 0,
        mixedAudioFrames: 0,
        participantAudioFrames: 0,
        videoFrames: 0,
        encodedVideoChunks: 0,
        unknownFrames: 0
    };
    metadata;
    metaState = {};
    sessionLogger;
    participantInfo = new Map();
    participantWriters = new Map();
    audioFiles = {};
    mixedAudioWriter;
    warnedMissingMixedFormat = false;
    warnedMissingParticipantFormat = false;
    startHr = process.hrtime.bigint();
    lastMessageHr = this.startHr;
    closed = false;
    constructor(deps) {
        this.deps = deps;
        const { config, logger, socket, remoteAddress, userAgent } = deps;
        this.sessionLogger = logger.child({ sessionId: this.id });
        this.baseDir = path_1.default.join(config.recordingsRoot, 'live', `session_${this.id}`);
        ensureDir(this.baseDir);
        this.telemetryPath = path_1.default.join(this.baseDir, TELEMETRY_FILE);
        this.telemetryStream = fs_1.default.createWriteStream(this.telemetryPath, { flags: 'a' });
        this.metadata = {
            sessionId: this.id,
            port: config.port,
            recordingsRoot: config.recordingsRoot,
            remoteAddress,
            userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
            startedAtIso: new Date().toISOString()
        };
        this.sessionLogger.info('Session connected');
        socket.on('message', (data) => this.handleMessage(data));
        socket.once('close', () => this.close('client_close'));
        socket.once('error', (err) => this.close('socket_error', err));
    }
    handleMessage(message) {
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
        }
        catch (error) {
            this.sessionLogger.error({ error }, 'Failed to dispatch frame');
            this.stats.unknownFrames += 1;
        }
    }
    dispatch(buffer) {
        if (buffer.length < 4) {
            throw new Error('Frame shorter than header');
        }
        const frameType = buffer.readInt32LE(0);
        switch (frameType) {
            case types_1.FrameType.Json: {
                const payload = buffer.subarray(4).toString('utf8');
                this.handleJson(payload);
                break;
            }
            case types_1.FrameType.Video: {
                this.stats.videoFrames += 1;
                break;
            }
            case types_1.FrameType.MixedAudio: {
                this.stats.mixedAudioFrames += 1;
                this.handleMixedAudio(buffer.subarray(4));
                break;
            }
            case types_1.FrameType.EncodedVideo: {
                this.stats.encodedVideoChunks += 1;
                break;
            }
            case types_1.FrameType.ParticipantAudio: {
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
    handleJson(raw) {
        this.stats.jsonMessages += 1;
        this.telemetryStream.write(raw + '\n');
        try {
            const parsed = JSON.parse(raw);
            this.applyMetadata(parsed);
        }
        catch (error) {
            this.sessionLogger.warn({ error }, 'Failed to parse JSON payload');
        }
    }
    applyMetadata(event) {
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
            this.handleAudioFormatUpdate(event);
        }
        if (event.type === 'UsersUpdate') {
            this.handleUsersUpdate(event);
        }
        if (!this.metaState.meetingUrl) {
            const fallbackUrl = event.meetingUrl;
            if (typeof fallbackUrl === 'string') {
                this.metaState.meetingUrl = fallbackUrl;
            }
        }
    }
    handleAudioFormatUpdate(event) {
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
    handleUsersUpdate(event) {
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
            const info = {
                deviceId,
                displayName: typeof candidate['displayName'] === 'string' ? candidate['displayName'] : undefined,
                fullName: typeof candidate['fullName'] === 'string' ? candidate['fullName'] : undefined,
                isCurrentUser: typeof candidate['isCurrentUser'] === 'boolean' ? candidate['isCurrentUser'] : undefined
            };
            this.participantInfo.set(deviceId, info);
        }
    }
    handleMixedAudio(payload) {
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
        const pcm = (0, audio_1.convertFloat32ToInt16)(payload);
        writer.write(pcm);
    }
    handleParticipantAudio(payload) {
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
        const pcm = (0, audio_1.convertFloat32ToInt16)(audioData);
        writerState.writer.write(pcm);
    }
    ensureMixedAudioWriter(format) {
        if (this.mixedAudioWriter) {
            return this.mixedAudioWriter;
        }
        const filePath = path_1.default.join(this.baseDir, MIXED_AUDIO_FILE);
        this.mixedAudioWriter = new audio_1.WavWriter({ filePath, format });
        const relative = path_1.default.relative(this.baseDir, filePath) || path_1.default.basename(filePath);
        this.audioFiles.mixed = this.audioFiles.mixed ?? [];
        if (!this.audioFiles.mixed.includes(relative)) {
            this.audioFiles.mixed.push(relative);
        }
        return this.mixedAudioWriter;
    }
    ensureParticipantWriter(participantId, format) {
        const existing = this.participantWriters.get(participantId);
        if (existing) {
            return existing;
        }
        const info = this.participantInfo.get(participantId);
        const label = buildParticipantLabel(participantId, info);
        const participantDir = path_1.default.join(this.baseDir, PARTICIPANTS_DIR, label);
        ensureDir(participantDir);
        const fileName = `combined_${label}.wav`;
        const filePath = path_1.default.join(participantDir, fileName);
        const writer = new audio_1.WavWriter({ filePath, format });
        const relative = path_1.default.relative(this.baseDir, filePath);
        const state = { label, writer, files: [relative] };
        this.participantWriters.set(participantId, state);
        this.audioFiles.participants = this.audioFiles.participants ?? {};
        this.audioFiles.participants[label] = state.files;
        return state;
    }
    close(reason, error) {
        if (this.closed) {
            return;
        }
        this.closed = true;
        const { socket } = this.deps;
        if (socket.readyState === ws_1.WebSocket.OPEN || socket.readyState === ws_1.WebSocket.CONNECTING) {
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
            const summary = {
                sessionId: this.id,
                reason,
                durationMs,
                idleMsBeforeClose: idleMs,
                stats: this.stats,
                metadata: this.metadata,
                error: error instanceof Error ? error.message : undefined
            };
            const summaryPath = path_1.default.join(this.baseDir, SUMMARY_FILE);
            await fs_1.default.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2));
            this.sessionLogger.info({ reason, durationMs, idleMs }, 'Session closed');
        };
        if (this.telemetryStream.closed) {
            void finalize().catch(err => {
                this.sessionLogger.error({ err }, 'Failed to finalise session summary');
            });
        }
        else {
            this.telemetryStream.end(() => {
                void finalize().catch(err => {
                    this.sessionLogger.error({ err }, 'Failed to finalise session summary');
                });
            });
        }
    }
    async closeAudioWriters() {
        const closures = [];
        if (this.mixedAudioWriter) {
            closures.push(this.mixedAudioWriter.close().catch(err => {
                this.sessionLogger.error({ err }, 'Failed to close mixed audio writer');
            }));
        }
        for (const state of this.participantWriters.values()) {
            closures.push(state.writer.close().catch(err => {
                this.sessionLogger.error({ err, participantLabel: state.label }, 'Failed to close participant audio writer');
            }));
        }
        await Promise.all(closures);
    }
}
exports.Session = Session;
function ensureDir(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
function normaliseMessage(message) {
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
function buildParticipantLabel(participantId, info) {
    const nameSource = info?.displayName || info?.fullName || 'participant';
    const namePart = sanitizeSegment(nameSource) || 'participant';
    const idPart = sanitizeSegment(participantId).slice(-8) || 'id';
    return `${namePart}_${idPart}`;
}
function sanitizeSegment(value) {
    return value
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48)
        .toLowerCase();
}
//# sourceMappingURL=session.js.map