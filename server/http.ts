import http, { IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';

import { RecorderConfig } from './config';
import type { Logger } from './logger';

enum SessionType {
  Live = 'live',
  Completed = 'completed'
}

export interface ApiContext {
  config: RecorderConfig;
  logger: Logger;
}

export interface ApiServer {
  close: () => Promise<void>;
  port: number;
}

export function startApiServer(context: ApiContext): ApiServer {
  const { config, logger } = context;
  const apiLogger = logger.child({ component: 'http' });
  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(context, req, res);
    } catch (error) {
      apiLogger.error({ error }, 'Unhandled error in HTTP server');
      sendJson(res, 500, { error: 'internal_error' });
    }
  });

  server.listen(config.httpPort, () => {
    apiLogger.info({ port: config.httpPort }, 'HTTP API server listening');
  });

  return {
    port: config.httpPort,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
    }
  };
}

async function handleRequest(context: ApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/recordings' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => undefined as any);
    const meetingUrl = safeString(body?.meetingUrl);
    const botName = safeString(body?.botName) || 'HopFast';
    const durationSecRaw = body?.durationSec;
    const durationSec = Number.isFinite(Number(durationSecRaw)) ? Number(durationSecRaw) : undefined;

    if (!meetingUrl || !/^https?:\/\//i.test(meetingUrl)) {
      return sendJson(res, 400, { error: 'invalid_meeting_url' });
    }

    const args = [path.join(process.cwd(), 'meetbot.js'), meetingUrl, botName];
    if (Number.isFinite(durationSec)) {
      args.push(String(durationSec));
    }

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: true
    });
    child.unref();

    return sendJson(res, 202, { status: 'started', pid: child.pid, meetingUrl, botName, durationSec });
  }

  if (pathname === '/api/sessions/live' && req.method === 'GET') {
    const data = await listLiveSessions(context);
    return sendJson(res, 200, { items: data });
  }

  if (pathname === '/api/sessions/completed' && req.method === 'GET') {
    const data = await listCompletedSessions(context);
    return sendJson(res, 200, { items: data });
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 3 && segments[0] === 'api' && segments[1] === 'sessions') {
    const id = segments[2];
    const tail = segments.slice(3);
    if (!tail.length && req.method === 'GET') {
      const details = await getSessionDetails(context, id);
      if (!details) {
        return sendJson(res, 404, { error: 'not_found' });
      }
      return sendJson(res, 200, details);
    }
    if (tail.length >= 1 && tail[0] === 'files' && req.method === 'GET') {
      return await serveSessionFile(context, id, tail.slice(1).join('/'), res);
    }
  }

  sendJson(res, 404, { error: 'not_found' });
}

async function listLiveSessions(context: ApiContext): Promise<any[]> {
  const root = path.join(context.config.recordingsRoot, 'live');
  const items: any[] = [];
  if (!fs.existsSync(root)) return items;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(root, entry.name);
    const stats = await fs.promises.stat(fullPath);
    items.push({
      id: entry.name,
      type: SessionType.Live,
      createdAt: stats.birthtime?.toISOString?.() ?? undefined,
      path: relPath(context, fullPath)
    });
  }
  items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return items;
}

async function listCompletedSessions(context: ApiContext): Promise<any[]> {
  const root = path.join(context.config.recordingsRoot, 'completed');
  const items: any[] = [];
  if (!fs.existsSync(root)) return items;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(root, entry.name);
    const manifestPath = path.join(fullPath, 'archive.json');
    const summaryPath = path.join(fullPath, 'session-summary.json');
    let manifest: any = null;
    let summary: any = null;
    try { if (fs.existsSync(manifestPath)) manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')); } catch {}
    try { if (fs.existsSync(summaryPath)) summary = JSON.parse(await fs.promises.readFile(summaryPath, 'utf8')); } catch {}
    const startedAt = manifest?.startedAt || summary?.metadata?.startedAtIso;
    const archivedAt = manifest?.archivedAt;
    const meetingUrl = manifest?.meetingUrl || summary?.metadata?.meetingUrl;
    items.push({
      id: entry.name,
      type: SessionType.Completed,
      meetingUrl,
      startedAt,
      archivedAt,
      path: relPath(context, fullPath)
    });
  }
  items.sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
  return items;
}

async function getSessionDetails(context: ApiContext, id: string): Promise<any | null> {
  const { recordingsRoot } = context.config;
  const livePath = path.join(recordingsRoot, 'live', id);
  const completedPath = path.join(recordingsRoot, 'completed', id);
  let baseDir: string | null = null;
  let kind: SessionType | null = null;
  if (fs.existsSync(livePath)) { baseDir = livePath; kind = SessionType.Live; }
  else if (fs.existsSync(completedPath)) { baseDir = completedPath; kind = SessionType.Completed; }
  if (!baseDir || !kind) return null;

  const summaryPath = path.join(baseDir, 'session-summary.json');
  const archivePath = path.join(baseDir, 'archive.json');
  let summary: any = null;
  let manifest: any = null;
  try { if (fs.existsSync(summaryPath)) summary = JSON.parse(await fs.promises.readFile(summaryPath, 'utf8')); } catch {}
  try { if (fs.existsSync(archivePath)) manifest = JSON.parse(await fs.promises.readFile(archivePath, 'utf8')); } catch {}

  const exists = (rel: string) => fs.existsSync(path.join(baseDir!, rel));
  const files = {
    mixedAudio: exists('mixed_audio.wav') ? 'mixed_audio.wav' : null,
    mixedTranscript: exists(path.join('transcripts', 'mixed_transcript.txt')) ? 'transcripts/mixed_transcript.txt' : null,
    meetingSummary: exists(path.join('summaries', 'meeting_summary.txt')) ? 'summaries/meeting_summary.txt' : null
  } as const;

  const participants: Array<{ label: string; audio?: string | null; transcript?: string | null; summary?: string | null }> = [];
  const participantsDir = path.join(baseDir, 'participants');
  if (fs.existsSync(participantsDir)) {
    const labels = await fs.promises.readdir(participantsDir);
    for (const label of labels) {
      const participantDir = path.join(participantsDir, label);
      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(participantDir);
      } catch {
        continue;
      }
      if (!stats.isDirectory()) continue;
      const audioFile = findFirst(participantDir, name => /^combined_.*\.wav$/i.test(name));
      const nameStem = label.split('_')[0];
      const transcriptFile = path.join('transcripts', 'participants', `${nameStem}_transcript.txt`).replace(/\\/g, '/');
      const summaryFile = path.join('summaries', 'participants', `${nameStem}_summary.txt`).replace(/\\/g, '/');
      participants.push({
        label,
        audio: audioFile ? path.posix.join('participants', label.replace(/\\/g, '/'), audioFile).replace(/\\/g, '/') : null,
        transcript: fs.existsSync(path.join(baseDir, transcriptFile)) ? transcriptFile : null,
        summary: fs.existsSync(path.join(baseDir, summaryFile)) ? summaryFile : null
      });
    }
  }

  return {
    id,
    kind,
    manifest,
    summary,
    files,
    participants
  };
}

function findFirst(dir: string, predicate: (name: string) => boolean): string | null {
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (predicate(entry)) return entry;
    }
  } catch {
    return null;
  }
  return null;
}

async function serveSessionFile(context: ApiContext, id: string, relativePath: string, res: ServerResponse): Promise<void> {
  const { recordingsRoot } = context.config;
  const normalised = relativePath.replace(/\\+/g, '/').replace(/\.\.+/g, '.');
  const livePath = path.join(recordingsRoot, 'live', id);
  const completedPath = path.join(recordingsRoot, 'completed', id);
  const baseDir = fs.existsSync(livePath) ? livePath : fs.existsSync(completedPath) ? completedPath : null;
  if (!baseDir) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, normalised);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    sendJson(res, 400, { error: 'bad_path' });
    return;
  }

  if (!fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isFile()) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', guessContentType(resolvedTarget));
  fs.createReadStream(resolvedTarget).pipe(res);
}

function guessContentType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve());
    req.on('error', reject);
  });
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function sendJson(res: ServerResponse, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function relPath(context: ApiContext, fullPath: string): string {
  return path.relative(context.config.recordingsRoot, fullPath).replace(/\\\\/g, '/');
}
