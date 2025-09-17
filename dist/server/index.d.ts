import { RecorderConfig } from './config';
import type { Logger } from './logger';
export interface RecorderContext {
    config: RecorderConfig;
    logger: Logger;
}
export interface RecorderServer {
    close: () => Promise<void>;
}
export declare function createRecorderContext(env?: NodeJS.ProcessEnv): RecorderContext;
export declare function startRecorderServer(context?: RecorderContext): RecorderServer;
