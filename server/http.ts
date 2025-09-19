import http, { IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { RecorderConfig } from './config';
import type { Logger } from './logger';

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
  // CORS + common headers
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

  // API routes
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/recordings' && req.method === 'POST') {
    const body = await readJsonBody(req).catch(() => undefined as any);
    const meetingUrl = safeString(body?.meetingUrl);
    const botName = safeString(body?.botName) || 'HopFast';
    const durationSec = Number.isFinite(Number(body?.durationSec)) ? Number(body?.durationSec) : undefined;

    if (!meetingUrl || !/^https?:\/\//i.test(meetingUrl)) {
      return sendJson(res, 400, { error: 'invalid_meeting_url' });
    }

    const args = [path.join(process.cwd(), 'meetbot.js'), meetingUrl, botName];
    if (Number.isFinite(durationSec)) {
      args.push(String(durationSec));
    }

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'ignore', // detach but do not inherit stdio noise
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

  // Details and file serving: /api/sessions/:id and /api/sessions/:id/files/*
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'sessions') {
    const id = parts[2];
    const tail = parts.slice(3);
    if (tail.length === 0 && req.method === 'GET') {
      const details = await getSessionDetails(context, id);
      if (!details) return sendJson(res, 404, { error: 'not_found' });
      return sendJson(res, 200, details);
    }
    if (tail.length >= 1 && tail[0] === 'files' && req.method === 'GET') {
      return await serveSessionFile(context, id, tail.slice(1).join('/'), res);
    }
  }

  // Static UI under docs/ui
  await serveUi(res, pathname);
}

async function listLiveSessions(context: ApiContext): Promise<any[]> {
  const root = path.join(context.config.recordingsRoot, 'live');
  const items: any[] = [];
  if (!fs.existsSync(root)) return items;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    const st = await fs.promises.stat(full);
    items.push({ id: e.name, type: 'live', createdAt: st.birthtime.toISOString?.() || undefined, path: relPath(context, full) });
  }
  items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return items;
}

async function listCompletedSessions(context: ApiContext): Promise<any[]> {
  const root = path.join(context.config.recordingsRoot, 'completed');
  const items: any[] = [];
  if (!fs.existsSync(root)) return items;
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    const manifestPath = path.join(full, 'archive.json');
    const summaryPath = path.join(full, 'session-summary.json');
    let manifest: any = null;
    let summary: any = null;
    try { if (fs.existsSync(manifestPath)) manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')); } catch {}
    try { if (fs.existsSync(summaryPath)) summary = JSON.parse(await fs.promises.readFile(summaryPath, 'utf8')); } catch {}
    const startedAt = manifest?.startedAt || summary?.metadata?.startedAtIso;
    const archivedAt = manifest?.archivedAt;
    const meetingUrl = manifest?.meetingUrl || summary?.metadata?.meetingUrl;
    items.push({ id: e.name, type: 'completed', meetingUrl, startedAt, archivedAt, path: relPath(context, full) });
  }
  items.sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
  return items;
}

async function getSessionDetails(context: ApiContext, id: string): Promise<any | null> {
  const { recordingsRoot } = context.config;
  const live = path.join(recordingsRoot, 'live', id);
  const completed = path.join(recordingsRoot, 'completed', id);
  let base: string | null = null;
  let kind: 'live' | 'completed' | null = null;
  if (fs.existsSync(live)) { base = live; kind = 'live'; }
  else if (fs.existsSync(completed)) { base = completed; kind = 'completed'; }
  if (!base || !kind) return null;

  const summaryPath = path.join(base, 'session-summary.json');
  const archivePath = path.join(base, 'archive.json');
  let summary: any = null;
  let manifest: any = null;
  try { if (fs.existsSync(summaryPath)) summary = JSON.parse(await fs.promises.readFile(summaryPath, 'utf8')); } catch {}
  try { if (fs.existsSync(archivePath)) manifest = JSON.parse(await fs.promises.readFile(archivePath, 'utf8')); } catch {}

  // Discover common files
  const exists = (rel: string) => fs.existsSync(path.join(base!, rel));
  const files = {
    mixedAudio: exists('mixed_audio.wav') ? 'mixed_audio.wav' : null,
    mixedTranscript: exists(path.join('transcripts', 'mixed_transcript.txt')) ? 'transcripts/mixed_transcript.txt' : null,
    meetingSummary: exists(path.join('summaries', 'meeting_summary.txt')) ? 'summaries/meeting_summary.txt' : null,
  };

  // Per-participant assets
  const participants: Array<{ label: string; audio?: string | null; transcript?: string | null; summary?: string | null }> = [];
  const participantsDir = path.join(base, 'participants');
  if (fs.existsSync(participantsDir)) {
    const dirs = await fs.promises.readdir(participantsDir);
    for (const d of dirs) {
      const dirPath = path.join(participantsDir, d);
      try {
        const st = await fs.promises.stat(dirPath);
        if (!st.isDirectory()) continue;
      } catch { continue; }
      const audioFile = findFirst(dirPath, f => /^combined_.*\.wav$/i.test(f));
      const transcriptPath = path.join(base, 'transcripts', 'participants');
      const summaryPath = path.join(base, 'summaries', 'participants');
      const nameStem = d.split('_')[0];
      const transcriptFile = path.join('transcripts', 'participants', `${nameStem}_transcript.txt`);
      const summaryFile = path.join('summaries', 'participants', `${nameStem}_summary.txt`);
      participants.push({
        label: d,
        audio: audioFile ? path.posix.join('participants', d.replace(/\\/g, '/'), audioFile).replace(/\\/g, '/') : null,
        transcript: fs.existsSync(path.join(base, transcriptFile)) ? transcriptFile.replace(/\\/g, '/') : null,
        summary: fs.existsSync(path.join(base, summaryFile)) ? summaryFile.replace(/\\/g, '/') : null
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

function findFirst(dir: string, pred: (name: string) => boolean): string | null {
  try {
    const list = fs.readdirSync(dir);
    for (const f of list) if (pred(f)) return f;
  } catch {}
  return null;
}

async function serveSessionFile(context: ApiContext, id: string, rel: string, res: ServerResponse): Promise<void> {
  const { recordingsRoot } = context.config;
  const safeRel = rel.replace(/\\+/g, '/').replace(/\.+/g, '.');
  const livePath = path.join(recordingsRoot, 'live', id);
  const completedPath = path.join(recordingsRoot, 'completed', id);
  const base = fs.existsSync(livePath) ? livePath : fs.existsSync(completedPath) ? completedPath : null;
  if (!base) return sendJson(res, 404, { error: 'not_found' });
  const full = path.resolve(base, safeRel);
  if (!full.startsWith(path.resolve(base))) return sendJson(res, 400, { error: 'bad_path' });
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return sendJson(res, 404, { error: 'not_found' });

  // basic content-type
  const ctype = guessContentType(full);
  res.statusCode = 200;
  res.setHeader('Content-Type', ctype);
  fs.createReadStream(full).pipe(res);
}

function guessContentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
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

async function serveUi(res: ServerResponse, pathname: string): Promise<void> {
  const uiRoot = path.join(process.cwd(), 'docs', 'ui');
  const requested = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(uiRoot, requested);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    res.statusCode = 200;
    res.setHeader('Content-Type', guessContentType(full));
    fs.createReadStream(full).pipe(res);
    return;
  }
  // fallback: index
  const index = path.join(uiRoot, 'index.html');
  if (fs.existsSync(index)) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(index).pipe(res);
    return;
  }
  sendJson(res, 404, { error: 'not_found' });
}

function safeString(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (d: Buffer) => chunks.push(d));
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
function relPath(context: ApiContext, full: string): string {
  return path.relative(context.config.recordingsRoot, full).replace(/\\\\/g, '/');
}



