import http, { IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';

import { RecorderConfig } from './config';
import type { Logger } from './logger';
import { loginUser, registerUser, isValidEmail, isValidPassword } from './auth';

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
  // Enhanced CORS configuration for web_2 integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

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
    const botName = safeString(body?.botName) || context.config.botName;
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

  // Authentication endpoints
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    return handleLogin(req, res);
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    return handleRegister(req, res);
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
  // Try live sessions first
  let sessionPath = path.join(context.config.recordingsRoot, 'live', `session_${id}`);
  let summaryPath = path.join(sessionPath, 'session-summary.json');
  
  try {
    const summaryData = await fs.promises.readFile(summaryPath, 'utf-8');
    const sessionDetails = JSON.parse(summaryData);
    return await enrichSessionDetails(sessionDetails, sessionPath);
  } catch (error) {
    // Try completed sessions
    const completedPath = path.join(context.config.recordingsRoot, 'completed');
    const entries = await fs.promises.readdir(completedPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(id.slice(0, 8))) {
        sessionPath = path.join(completedPath, entry.name);
        summaryPath = path.join(sessionPath, 'session-summary.json');
        try {
          const summaryData = await fs.promises.readFile(summaryPath, 'utf-8');
          const sessionDetails = JSON.parse(summaryData);
          return await enrichSessionDetails(sessionDetails, sessionPath);
        } catch (error) {
          // Continue searching
        }
      }
    }
  }

  return null;
}

async function enrichSessionDetails(sessionDetails: any, sessionPath: string): Promise<any> {
  try {
    // Add overall meeting summary and transcript
    const mixedAudioSummaryPath = path.join(sessionPath, 'mixed_audio.wav.summary.json');
    const mixedAudioTranscriptPath = path.join(sessionPath, 'mixed_audio.wav.transcript.json');
    
    try {
      const summaryData = await fs.promises.readFile(mixedAudioSummaryPath, 'utf-8');
      sessionDetails.overallSummary = JSON.parse(summaryData);
    } catch (error) {
      sessionDetails.overallSummary = null;
    }
    
    try {
      const transcriptData = await fs.promises.readFile(mixedAudioTranscriptPath, 'utf-8');
      sessionDetails.overallTranscript = JSON.parse(transcriptData);
    } catch (error) {
      sessionDetails.overallTranscript = null;
    }

    // Add participant details
    const participantsPath = path.join(sessionPath, 'participants');
    try {
      const participantEntries = await fs.promises.readdir(participantsPath, { withFileTypes: true });
      const participantDetails = [];

      for (const entry of participantEntries) {
        if (entry.isDirectory()) {
          const participantPath = path.join(participantsPath, entry.name);
          const participantDetail: any = {
            id: entry.name,
            audioFiles: [],
            transcripts: [],
            summaries: []
          };

          // Get all files for this participant
          try {
            const participantFiles = await fs.promises.readdir(participantPath);
            
            for (const file of participantFiles) {
              const filePath = path.join(participantPath, file);
              
              if (file.endsWith('.wav')) {
                participantDetail.audioFiles.push({
                  filename: file,
                  path: `participants/${entry.name}/${file}`
                });
              } else if (file.endsWith('.transcript.json')) {
                try {
                  const transcriptData = await fs.promises.readFile(filePath, 'utf-8');
                  participantDetail.transcripts.push({
                    filename: file,
                    data: JSON.parse(transcriptData)
                  });
                } catch (error) {
                  // Skip invalid transcript files
                }
              } else if (file.endsWith('.summary.json')) {
                try {
                  const summaryData = await fs.promises.readFile(filePath, 'utf-8');
                  participantDetail.summaries.push({
                    filename: file,
                    data: JSON.parse(summaryData)
                  });
                } catch (error) {
                  // Skip invalid summary files
                }
              }
            }
          } catch (error) {
            // Skip participants with unreadable directories
          }

          participantDetails.push(participantDetail);
        }
      }

      sessionDetails.participantDetails = participantDetails;
    } catch (error) {
      sessionDetails.participantDetails = [];
    }

    // Add audio files information
    sessionDetails.audioFiles = {
      mixedAudio: 'mixed_audio.wav'
    };

    return sessionDetails;
  } catch (error) {
    return sessionDetails;
  }
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
  // Try live sessions first
  let sessionPath = path.join(context.config.recordingsRoot, 'live', `session_${id}`);
  let filePath = path.join(sessionPath, relativePath);
  
  if (!fs.existsSync(filePath)) {
    // Try completed sessions
    const completedPath = path.join(context.config.recordingsRoot, 'completed');
    const entries = await fs.promises.readdir(completedPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(id.slice(0, 8))) {
        sessionPath = path.join(completedPath, entry.name);
        filePath = path.join(sessionPath, relativePath);
        if (fs.existsSync(filePath)) break;
      }
    }
  }
  
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  
  // Security check for path traversal
  const resolvedBase = path.resolve(sessionPath);
  const resolvedTarget = path.resolve(filePath);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    sendJson(res, 400, { error: 'bad_path' });
    return;
  }
  
  if (!fs.statSync(resolvedTarget).isFile()) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  
  // Serve the file
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
  return path.relative(context.config.recordingsRoot, fullPath);
}

// Authentication handlers
async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return sendJson(res, 400, { success: false, error: 'Email and password are required' });
    }

    if (!isValidEmail(email)) {
      return sendJson(res, 400, { success: false, error: 'Invalid email format' });
    }

    const result = await loginUser(email, password);

    if (result.success) {
      return sendJson(res, 200, {
        success: true,
        user: result.user
      });
    } else {
      return sendJson(res, 401, { success: false, error: result.error });
    }
  } catch (error) {
    return sendJson(res, 500, { success: false, error: 'Internal server error' });
  }
}

async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return sendJson(res, 400, { success: false, error: 'Email and password are required' });
    }

    if (!isValidEmail(email)) {
      return sendJson(res, 400, { success: false, error: 'Invalid email format' });
    }

    if (!isValidPassword(password)) {
      return sendJson(res, 400, { success: false, error: 'Password must be at least 6 characters long' });
    }

    const result = await registerUser(email, password);

    if (result.success) {
      return sendJson(res, 201, { success: true });
    } else {
      return sendJson(res, 400, { success: false, error: result.error });
    }
  } catch (error) {
    return sendJson(res, 500, { success: false, error: 'Internal server error' });
  }
}
