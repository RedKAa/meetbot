# Recording Server Notes

## Phase 1 Status
- `server/index.ts` boots a WebSocket server on the configured port, wiring in the Phase 0 config/logging helpers.
- Each connection is handled by `server/session.ts`, which tracks frame counts, appends JSON payloads to `telemetry.ndjson`, and writes `session-summary.json` on close.
- meetbot emits a `SessionStarted` handshake after the bot is admitted, seeding metadata for `session-summary.json` and the archive manifest.
- Feature flags from `.env` (mixed/per-speaker audio, video capture) are available for later phases but currently only influence logging/plan decisions.

## Running the Server
1. Copy env defaults if needed: `Copy-Item .env.example .env`
2. Install deps: `npm install`
3. Build TypeScript once: `npm run build`
4. Start in watch mode: `npm run dev:server`
   - or run the compiled build: `npm run start:server`

Both scripts load `.env` automatically via `dotenv-cli`. Logs appear on stdout via Pino.

## Environment Variables
- `NODE_ENV`: runtime environment (`development` by default).
- `LOG_LEVEL`: Pino log level (defaults to `debug` unless `NODE_ENV=production`).
- `WS_PORT`: WebSocket listen port (default `8765`).
- `RECORDINGS_ROOT`: root folder for meeting artifacts (defaults to `<repo>/recordings`).
- `SEND_MIXED_AUDIO`: enable mixed-audio persistence (default `true`).
- `SEND_PER_PARTICIPANT_AUDIO`: enable per-speaker audio persistence (default `true`).
- `CAPTURE_VIDEO_FRAMES`: enable video capture in later phases (default `false`).
- `PHO_WHISPER_WEBHOOK_URL`: optional downstream webhook for PhoWhisper hand-offs.

## Output Layout
While a meeting is running the recorder writes to `recordings/live/session_<uuid>/`:
- `telemetry.ndjson`: line-delimited JSON payloads from the Meet page.
- `session-summary.json`: rolling connection stats and metadata snapshot.
- `mixed_audio.wav`: mixed-channel PCM audio (16-bit LE PCMs).
- `participants/<label>/combined_<label>.wav`: per-speaker PCM audio alongside `info.json` and `activity.log`.

After `close()` completes the entire folder is moved to `recordings/completed/meeting_<slug>_<timestamp>_<session>/` and the following extras are produced:
- `archive.json`: manifest describing all files (relative paths + sizes) plus meeting metadata.
- Updated `session-summary.json` with `archivePath` / `manifestPath` fields referencing the archived location.

## Shutdown
Send `Ctrl+C` (SIGINT) to stop the server. Active sessions flush telemetry, seal recordings, move them under `recordings/completed/`, and write the archive manifest before exit.

## Next Steps
- Phase 3: expand metadata handling (activity logs, summary aggregation) and wire PhoWhisper dispatch.
- Phase 4: add optional video frame persistence or transcoding if needed.
