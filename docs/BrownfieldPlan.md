# meetbot Brownfield Implementation Plan

## Purpose
Establish a staged plan for evolving the existing Playwright-based Meet bot into a production-ready recorder that captures audio, participant context, and meeting metadata while remaining compatible with the current browser payload. This document stops at design decisions and sequencing so the implementation can be reviewed before coding begins.

## Current Snapshot
- `meetbot.js` launches a headful Chromium session, injects helper libraries, joins a Google Meet room, and exposes `window.ws` for a localhost WebSocket backend but never enables media streaming.
- `scripts/google_meet_chromedriver_payload.js` already intercepts RTC tracks, captions, chat, and protobuf collections, emitting JSON + binary frames over the WebSocket protocol described in `ProjectOverview.md`.
- There is no backend listener at `ws://localhost:8765`, so all telemetry is currently dropped. No meeting artifacts are persisted.
- Repository has no runtime configuration layer, persistence helpers, or tests around the recording flow yet.

## Guiding Principles
1. Keep the in-browser payload untouched unless backend requirements make a change unavoidable.
2. Prioritise deterministic storage (stable directories, file naming, and metadata schemas) so later services can consume outputs without scraping logs.
3. Prefer streaming writes over in-memory buffering to deal with long meetings and avoid data loss on crashes.
4. Surface observability hooks (structured logs, metrics) early to make debugging real meetings practical.

## Target Architecture
- **meetbot (Playwright runner)**: Joins meetings, ensures `window.ws.enableMediaSending()` fires post-admission, and forwards launch metadata (meeting URL, bot name, timestamps) to the backend over the first JSON payload.
- **Recording service (new Node.js process)**: Listens on port 8765, tracks per-connection session state, decodes binary envelopes, and streams artifacts to disk under `recordings/meeting_<id>_<timestamp>/` as outlined in the overview.
- **Post-processing hooks**: After a meeting folder is sealed, enqueue a PhoWhisper transcription job and optional summarisation. Initial implementation can emit a JSON manifest or drop a message on a queue.

## Data Flow Summary
1. meetbot injects payload and joins a room.
2. Once admitted, meetbot calls `window.ws.enableMediaSending()`, unlocking audio/video emission.
3. Payload pushes JSON control messages and audio/video binary frames to the backend.
4. Backend writes mixed audio and per-speaker tracks incrementally, maintains participant metadata, and records lifecycle events.
5. When the meeting ends (remote close or inactivity timeout), backend finalises WAV headers, writes metadata JSON, and triggers downstream processing.

## Implementation Phases

### Phase 0: Infrastructure Prep
- Add `.env` or config module for ports, output root, PhoWhisper endpoint, and feature flags (video capture, per-speaker audio, etc.).
- Introduce shared `logger` utility (e.g., pino) with formats suitable for long-running services.
- Define TypeScript types for WebSocket envelopes, participant records, and persisted metadata. Place them in `server/` so both runtime and future tests can reuse them.

### Phase 1: WebSocket Ingestion Service
- Build `server/index.ts` (compiled via existing `tsc` setup) that:
  - Uses `ws` to accept client connections, rejecting non-localhost origins for now.
  - Stores per-connection context (session UUID, meeting URL, bot identity, handshake timestamps).
  - Streams incoming frames into a per-session queue for processing on a worker thread or async reducer.
- Implement binary parser that reads the 4-byte message type and dispatches to handlers for JSON, mixed audio, per-participant audio, and (future) video chunks.
- Create directory scaffolding on first payload: `recordings/meeting_<id>_<ISO8601>/participants/...`.
- Persist raw JSON telemetry (`UsersUpdate`, `DeviceOutputsUpdate`, etc.) to rolling NDJSON files for replay/debugging.

### Phase 2: meetbot Handshake Updates
- After the Playwright flow confirms admission (`Ask to join` resolved, `Join` clicked), invoke `page.evaluate(() => window.ws?.enableMediaSending?.())` with retry/backoff logic until it succeeds or times out.
- Send an explicit `SessionStarted` JSON message containing meeting URL, bot display name, and ISO start timestamp so the backend can hydrate metadata before other frames arrive.
- Add configuration knob to disable auto-enable for debugging.

### Phase 3: Audio Persistence
- Convert incoming Float32 PCM buffers to 16-bit little-endian on the fly using a shared helper; reuse output for mixed and per-speaker paths.
- Maintain rolling WAV writers per active output stream. Reopen files when participant device IDs change to keep associations accurate.
- Track `AudioFormatUpdate` messages to adjust sample rate and frame sizes; backfill silence when gaps exceed a configurable threshold.
- Write `mixed_audio.wav` continuously; for per-speaker audio, append to `participants/<name>_<deviceId>/audio_tracks/track_<...>.wav`.

### Phase 4: Participant & Session Metadata
- Build an in-memory registry keyed by `deviceId` capturing display name, join/leave timestamps, and speaking status derived from audio events.
- On every `UsersUpdate`/`DeviceOutputsUpdate`, update registry and append events to `participants/<...>/activity.log` (structured text or NDJSON).
- Emit `participants_summary.json` at meeting close containing final stats (total speaking time, join/leave times, device IDs, kick events).
- Write `meeting_metadata.json` summarising meeting URL hash/ID, start/end timestamps, files generated, and PhoWhisper job status placeholder.

### Phase 5: Meeting Lifecycle Detection
- Detect meeting end via: explicit `removed_from_meeting`, WebSocket close, or inactivity timeout (no audio chunks + no participants for N seconds).
- On termination, close all file streams, fix WAV headers (RIFF sizes), flush metadata, and emit a `SessionEnded` log entry.
- Implement crash recovery on startup: scan `recordings/` for unfinished sessions (temp file markers) and finalise or quarantine them.

### Phase 6: PhoWhisper Integration
- Provide a pluggable dispatcher (initially a stub) that takes mixed/per-speaker WAV paths and posts jobs to PhoWhisper.
- Record downstream job references in `meeting_metadata.json` and optionally drop status updates to `transcripts/` when the external service completes.
- Keep integration optional behind a config flag until credentials and SLAs are confirmed.

## Testing & Verification Strategy
- **Unit tests**: message parser, PCM conversion helper, metadata registry state transitions.
- **Integration tests**: simulate `ws` client feeding canned payloads captured from Meet sessions; assert filesystem outputs match expectations.
- **Manual drills**: run meetbot against a sandbox Meet, confirm meeting folder contents, and ensure PhoWhisper hand-off toggles work.
- **Observability checks**: verify structured logs include session IDs and per-event context for correlation.

## Tooling & Developer Experience
- Add npm scripts: `npm run dev:server` (ts-node or tsx watcher), `npm run test` (Jest or Vitest once chosen).
- Document setup steps in `README`: prerequisites, env vars, how to launch backend + meetbot together.
- Consider Docker Compose for bundling Playwright dependencies and backend service once implementation stabilises.

## Risks & Open Questions
- **Meeting ID strategy**: Need deterministic identifier; options include hashing the Meet URL + start timestamp or requesting one from the backend (requires upstream message channel).
- **Long-running audio writers**: Ensure file handles survive >1 hour meetings and that WAV headers stay valid on crash. Might need periodic checkpoints.
- **Per-speaker diarisation accuracy**: Payload assumes `getContributingSources` mapping is stable; verify in real meetings.
- **Security**: Current plan trusts local payload; future hardening may require auth tokens or mutual TLS.
- **PhoWhisper throughput**: Clarify SLA and error handling (retries, rate limits) before enabling by default.

## Next Steps Before Coding
1. Review this plan with stakeholders, confirm directory schema and metadata requirements.
2. Decide on meeting ID generation and PhoWhisper integration scope for MVP vs later.
3. Finalise tech choices (test runner, logger) and ensure dependencies are approved.
4. Once agreed, break phases into tracked work items (tickets) and begin implementation.
