import { WebSocket, RawData } from 'ws';
import type { RecorderConfig } from './config';
import type { Logger } from './logger';
interface SessionDeps {
    config: RecorderConfig;
    logger: Logger;
    socket: WebSocket;
    remoteAddress?: string;
    userAgent?: string | string[];
}
export declare class Session {
    private readonly deps;
    readonly id: `${string}-${string}-${string}-${string}-${string}`;
    private readonly baseDir;
    private readonly telemetryPath;
    private readonly telemetryStream;
    private readonly stats;
    private readonly metadata;
    private readonly metaState;
    private readonly sessionLogger;
    private readonly participantInfo;
    private readonly participantWriters;
    private readonly audioFiles;
    private mixedAudioWriter?;
    private warnedMissingMixedFormat;
    private warnedMissingParticipantFormat;
    private readonly startHr;
    private lastMessageHr;
    private closed;
    constructor(deps: SessionDeps);
    handleMessage(message: RawData): void;
    private dispatch;
    private handleJson;
    private applyMetadata;
    private handleAudioFormatUpdate;
    private handleUsersUpdate;
    private handleMixedAudio;
    private handleParticipantAudio;
    private ensureMixedAudioWriter;
    private ensureParticipantWriter;
    close(reason: string, error?: unknown): void;
    private closeAudioWriters;
}
export {};
