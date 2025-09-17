import pino, { LoggerOptions, Logger } from 'pino';

export type { Logger } from 'pino';

export interface LoggerConfig extends LoggerOptions {
  name?: string;
}

const defaultLevel = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export function createLogger(options: LoggerConfig = {}): Logger {
  const { name, ...rest } = options;
  const merged: LoggerOptions = {
    level: defaultLevel,
    ...rest,
    base: {
      pid: process.pid,
      name: name ?? (rest.base as Record<string, unknown> | undefined)?.['name'] ?? undefined,
      ...rest.base
    }
  };

  return pino(merged);
}

export const logger = createLogger({ name: 'meetbot-recorder' });

