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
  completed/
    meeting_<meetingId>_<ISO8601Timestamp>_<sessionId>/
      archive.json                    # Meeting manifest with metadata
      session-summary.json           # Session statistics
      telemetry.ndjson              # Raw telemetry events
      mixed_audio.wav               # Combined audio stream
      transcripts/                  # PhoWhisper transcription results
        mixed_transcript.txt        # Full meeting transcript
        participants/
          <displayName>_transcript.txt
      summaries/                    # PhoWhisper summarization results
        meeting_summary.txt         # Overall meeting summary
        participants/
          <displayName>_summary.txt
      participants/
        <displayName>_<deviceId>/
          info.json                 # Participant metadata
          activity.log             # Join/leave/speaking events
          combined_<displayName>.wav  # Combined audio for participant
          audio_tracks/
            track_*.wav            # Individual audio tracks
  live/                           # Active recording sessions
    session_<sessionId>/
      # Same structure but without transcripts/summaries
```

## Implementation Status

### ✅ Completed MVP Features
1. **WebSocket server** ✅: Implemented `server/index.ts` with TypeScript, listens on port 8765, parses binary framing, and persists data under `recordings/`. Maintains per-connection context with meeting metadata.

2. **Auto-enable media streaming** ✅: Added `enableMediaStreamingWithRetry()` function in `meetbot.js` with retry logic for robust media streaming activation after meeting admission.

3. **Audio persistence** ✅: Implemented in `server/audio.ts` and `server/session.ts` - converts Float32 samples to 16-bit PCM, writes streaming WAV files for mixed audio and per-participant tracks, tracks sample rate from `AudioFormatUpdate`.

4. **Participant/session metadata** ✅: Implemented comprehensive participant tracking in `server/session.ts` - maintains `deviceId` -> participant mapping using `UsersUpdate` and `DeviceOutputsUpdate`, creates `info.json`, `activity.log`, and `participants_summary.json`.

5. **Meeting lifecycle detection** ✅: Added inactivity timeout detection (5 minutes), handles `MeetingStatusChange` events for bot removal, proper session cleanup and archiving when meeting ends.

### 🔄 Next Phase: PhoWhisper Integration
6. **PhoWhisper transcription & summarization**: Implement post-meeting processing pipeline that:
   - Calls `/transcribe` endpoint with audio files to get text transcripts
   - Calls `/summarize` endpoint with transcripts to generate summaries
   - Stores results in meeting folders as `transcripts/` and `summaries/`

### 🚀 Future Enhancements
7. **Video chunks (optional)**: Store raw I420 frames or transcode them for screen recording capabilities.
8. **Command channel**: Extend `WebSocketClient.handleMessage` for backend-triggered bot actions (play PCM, display image, etc.).

## Pending decisions / open questions
- What identifier should seed `meeting_<meetingId>`? Currently only the Meet URL is known client-side. We may need to hash the URL + start timestamp or let the server assign an ID via a JSON command back to the page.
- How long should per-participant buffers wait before writing a new track file? (Impacts diarisation accuracy for PhoWhisper.)
- Do we need the mixed audio stream once per-speaker WAVs exist, or should we keep both for redundancy?



