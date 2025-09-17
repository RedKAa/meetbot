import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';

import { loadConfig, RecorderConfig } from './config';
import { logger as rootLogger } from './logger';
import type { Logger } from './logger';
import { Session } from './session';

export interface RecorderContext {
  config: RecorderConfig;
  logger: Logger;
}

export interface RecorderServer {
  close: () => Promise<void>;
}

export function createRecorderContext(env: NodeJS.ProcessEnv = process.env): RecorderContext {
  const config = loadConfig(env);
  const contextLogger = rootLogger.child({ module: 'recorder', port: config.port });
  ensureLiveDir(config);
  contextLogger.info({ recordingsRoot: config.recordingsRoot }, 'Recorder context initialised');

  return {
    config,
    logger: contextLogger
  };
}

export function startRecorderServer(context: RecorderContext = createRecorderContext()): RecorderServer {
  const { config, logger } = context;
  const wss = new WebSocketServer({ port: config.port });

  logger.info({ port: config.port }, 'Recorder WebSocket server listening');

  wss.on('connection', (socket, request) => {
    const remote = extractRemote(request);
    new Session({
      config,
      logger: logger.child({ component: 'session' }),
      socket,
      remoteAddress: remote.remoteAddress,
      userAgent: remote.userAgent
    });
  });

  wss.on('error', error => {
    logger.error({ error }, 'WebSocket server error');
  });

  const shutdown = async () => {
    logger.info('Shutting down recorder WebSocket server');
    await new Promise<void>((resolve, reject) => {
      wss.close(err => (err ? reject(err) : resolve()));
    });
  };

  process.once('SIGINT', () => {
    shutdown().finally(() => process.exit(0));
  });

  return {
    close: shutdown
  };
}

if (require.main === module) {
  startRecorderServer();
}

function extractRemote(request: IncomingMessage): { remoteAddress?: string; userAgent?: string | string[] } {
  return {
    remoteAddress: request.socket.remoteAddress ?? undefined,
    userAgent: request.headers['user-agent']
  };
}

function ensureLiveDir(config: RecorderConfig): void {
  const liveDir = path.join(config.recordingsRoot, 'live');
  ensureDir(liveDir);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}


