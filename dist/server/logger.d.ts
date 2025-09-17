import pino, { LoggerOptions, Logger } from 'pino';
export type { Logger } from 'pino';
export interface LoggerConfig extends LoggerOptions {
    name?: string;
}
export declare function createLogger(options?: LoggerConfig): Logger;
export declare const logger: pino.Logger;
