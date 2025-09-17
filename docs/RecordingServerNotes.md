# Recording Server Notes

## Phase 1 Status
- `server/index.ts` boots a WebSocket server on the configured port, wiring in the Phase 0 config/logging helpers.
- Each connection is handled by `server/session.ts`, which tracks frame counts, appends JSON payloads to `telemetry.ndjson`, and writes `session-summary.json` on close.
- meetbot now emits a `SessionStarted` handshake after the bot is admitted, seeding metadata for `session-summary.json`.
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
- `SEND_MIXED_AUDIO`: enable mixed-audio persistence in later phases (default `true`).
- `SEND_PER_PARTICIPANT_AUDIO`: enable per-speaker audio persistence in later phases (default `true`).
- `CAPTURE_VIDEO_FRAMES`: enable video capture in later phases (default `false`).
- `PHO_WHISPER_WEBHOOK_URL`: optional downstream webhook for PhoWhisper hand-offs.

## Output Layout
For each client connection the server creates `recordings/live/session_<uuid>/` containing:
- `telemetry.ndjson`: line-delimited JSON payloads from the Meet payload.
- `session-summary.json`: connection stats, metadata (bot/meeting URL when available), and closure reason.

Mixed audio (`recordings/live/session_<uuid>/mixed_audio.wav`) and per-participant audio (`recordings/live/session_<uuid>/participants/.../combined_*.wav`) are persisted as 16-bit WAV files. Video frames are still counted but not stored yet.

## Shutdown
Send `Ctrl+C` (SIGINT) to stop the server. Active sessions flush telemetry and write summaries before exit.

## Next Steps
- Phase 3: expand metadata handling (activity logs, summary aggregation) and wire PhoWhisper dispatch.
- Phase 4: add optional video frame persistence or transcoding if needed.


