## Project Overview

### meetbot.js
- Launches Playwright Chromium with `puppeteer-extra` stealth evasions disabled for media detection.
- Injects `window.initialData` before page scripts load and loads helper libs (`protobuf.min.js`, `pako.min.js`, `google_meet_chromedriver_payload.js`).
- Joins a Google Meet link headfully, fills the bot display name, and force-disables mic/camera before clicking any "Join"/"Ask to join" button that matches a large selector set (multi-language support).
- Calls `window._initwsc()` right after the join click so the injected payload connects to `ws://localhost:8765`.
- Currently **does not** call `window.ws.enableMediaSending()`, so no audio/video frames leave the page unless we add that extra evaluate step after admission.

### scripts/google_meet_chromedriver_payload.js
- Runs inside the Meet tab and wires core telemetry managers: `StyleManager`, `UserManager`, `CaptionManager`, `VideoTrackManager`, `ReceiverManager`, `ChatMessageManager`, `BotOutputManager`.
- Uses `FetchInterceptor` to decode `SyncMeetingSpaceCollections` protobuf payloads and maintain live participant metadata + device outputs.
- Uses `RTCPeerConnection` interception to:
  - Observe `collections`, `captions`, and `media-director` data channels (chat, captions, and other control events).
  - Intercept every audio/video `MediaStreamTrack` to copy frames before returning them to Meet.
- Aggregates mixed audio (sums multi-channel to mono) and per-participant audio (by matching `getContributingSources` -> participant device IDs) and queues them for WebSocket send.
- Sends Google Meet UI state updates (`UsersUpdate`, `DeviceOutputsUpdate`, `ChatMessage`, `CaptionUpdate`, `SilenceStatus`, errors, etc.) as JSON messages.
- Exposes `BotOutputManager` helpers for the bot to play PCM audio, display images, or stream videos back into the meeting via `navigator.mediaDevices.getUserMedia` override. There is no command dispatcher yet, so these must be triggered manually (e.g. via JSON handler we have to add).

## WebSocket Contract (window.ws -> localhost:8765)

### Connection lifecycle
- `window._initwsc()` instantiates `new WebSocketClient()` and stores it at `window.ws`.
- The client never retries on close; the server must be running before Playwright joins the meeting.
- Media streaming is gated behind `window.ws.enableMediaSending()` / `.disableMediaSending()` which toggles `mediaSendingEnabled` and kicks off `StyleManager.start()`.

### Binary message types
- **1 JSON**: 4 byte little-endian type header + UTF-8 JSON payload. Envelope always has a top-level `type` field (examples below).
- **2 VIDEO**: `[type:int32][timestamp:int64][streamIdLength:int32][streamId:bytes][width:int32][height:int32][frameData:I420 bytes]`. Frame data is raw planar I420 copied from `VideoFrame.copyTo`.
- **3 AUDIO (mixed)**: `[type:int32][Float32 PCM samples]`. Samples are mono Float32; use the latest `AudioFormatUpdate.format` to know `sampleRate` and `numberOfFrames` for buffering.
- **4 ENCODED_MP4_CHUNK**: `[type:int32]` header + an opaque MP4 blob. Not currently produced by the payload but kept for future screen recording options.
- **5 PER_PARTICIPANT_AUDIO**: `[type:int32][participantIdLength:uint8][participantId:utf8][Float32 PCM samples]`. These are per-loudest-speaker chunks derived from RTP contributing sources.

### JSON message catalogue
Typical `type` values emitted so far:
- `UsersUpdate`: lists `newUsers`, `removedUsers`, `updatedUsers` with `deviceId`, `displayName`, `fullName`, `status`, etc. Keys map back to Google Meet device IDs.
- `DeviceOutputsUpdate`: active audio/video stream IDs per participant (`deviceId`, `outputType`, `streamId`, `disabled`). Needed to map `streamId` -> participant when saving audio/video.
- `AudioFormatUpdate`: first chunk after a format change (`numberOfFrames`, `sampleRate`, `numberOfChannels`, etc.). Use it to size WAV headers.
- `SilenceStatus`: 1 Hz volume checks from the mixed audio analyser.
- `MemoryUsage`: periodic Playwright page heap info for monitoring.
- `ChatStatusChange`, `ChatMessage`: chat UI ready signal and new Meet chat posts.
- `CaptionUpdate`: live caption messages when `window.initialData.collectCaptions === true`.
- `MeetingStatusChange`: currently reports `removed_from_meeting` if the bot is kicked.
- `UiInteraction` / `Error`: diagnostic events whenever the DOM automation bumps into unexpected states.

## Target recording layout
```
recordings/
  meeting_<meetingId>_<ISO8601Timestamp>/
    meeting_metadata.json
    mixed_audio.wav
    participants_summary.json
    participants/
      <displayName>_<deviceId>/
        info.json
        activity.log
        combined_<displayName>_<deviceId>.wav
        audio_tracks/
          track_<deviceId>_<trackId>_<timestamp>.wav
```

## Gaps to close for an MVP
1. **WebSocket server**: implement `server/index.js` (or similar) that listens on port 8765, parses the binary framing above, and persists data under `recordings/`. Persist per-connection context (meeting URL, bot name, timestamps) so metadata files can be written once the meeting ends.
2. **Auto-enable media streaming**: after the Meet tab finishes admission, call `page.evaluate(() => window.ws?.enableMediaSending?.())` in `meetbot.js`. Without it, every `send*` helper exits early.
3. **Audio persistence**: convert Float32 samples to 16-bit little-endian PCM, write streaming WAV files for mixed audio and per-participant tracks, and roll files when participants change speaking state. Track sample rate from `AudioFormatUpdate` and add silence padding if chunks arrive late.
4. **Participant/session metadata**: maintain a mapping of `deviceId` -> participant info using `UsersUpdate` and `DeviceOutputsUpdate`. Use it to create `info.json`, `activity.log` (join/leave/speaking events), and populate `participants_summary.json`.
5. **Video chunks (optional for MVP)**: decide whether to store raw I420 frames or transcode them. For an initial version we can drop video frames but keep timestamps for possible future use.
6. **Meeting lifecycle detection**: derive meeting start/end timestamps from the first `UsersUpdate` + last activity (e.g. bot removed or all participants left). Finalise WAV headers and metadata, then hand off.
7. **PhoWhisper hand-off**: after each meeting folder is sealed, enqueue a job (cron or message queue) that pushes the mixed audio or per-speaker WAVs into PhoWhisper for ASR, stores transcripts next to the meeting folder, runs summarisation per-speaker + whole meeting, and writes outputs (e.g. `transcripts/`, `summaries/`).
8. **Command channel (future)**: extend `WebSocketClient.handleMessage` so the backend can trigger `botOutputManager` actions (play PCM, display image, etc.) to fully automate the bot persona.

## Pending decisions / open questions
- What identifier should seed `meeting_<meetingId>`? Currently only the Meet URL is known client-side. We may need to hash the URL + start timestamp or let the server assign an ID via a JSON command back to the page.
- How long should per-participant buffers wait before writing a new track file? (Impacts diarisation accuracy for PhoWhisper.)
- Do we need the mixed audio stream once per-speaker WAVs exist, or should we keep both for redundancy?



