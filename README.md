# MeetBot - Google Meet Recording Bot

MeetBot là một bot tự động ghi âm cuộc họp Google Meet với khả năng thu thập audio theo từng người tham gia và metadata chi tiết.

## Tính năng

- 🎙️ **Ghi âm chất lượng cao**: Thu thập audio mixed và per-participant
- 👥 **Theo dõi người tham gia**: Metadata chi tiết về người join/leave
- 💬 **Captions & Chat**: Thu thập live captions và chat messages
- 📊 **Activity logs**: Theo dõi hoạt động speaking của từng người
- 🔄 **Auto-archiving**: Tự động archive và tạo manifest sau khi meeting kết thúc
- ⏱️ **Lifecycle detection**: Tự động detect meeting end và inactivity timeout

## Cấu trúc Project

```
meetbot/
├── meetbot.js              # Playwright runner - joins meetings
├── scripts/
│   └── google_meet_chromedriver_payload.js  # Browser payload
├── server/                 # Recording WebSocket server
│   ├── index.ts           # Main server entry
│   ├── session.ts         # Session management
│   ├── audio.ts           # Audio processing
│   ├── config.ts          # Configuration
│   └── types.ts           # TypeScript types
├── recordings/             # Output directory
│   ├── live/              # Active sessions
│   └── completed/         # Archived meetings
└── docs/                   # Documentation
```

## Cài đặt

### Prerequisites

- Node.js 18+ 
- npm hoặc yarn
- Windows/macOS/Linux

### Setup

1. **Clone repository**
```bash
git clone <repository-url>
cd meetbot
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment**
```bash
copy .env.example .env
# Hoặc trên Linux/macOS: cp .env.example .env
```

4. **Build TypeScript**
```bash
npm run build
```

## Cấu hình

Chỉnh sửa file `.env`:

```env
# Environment
NODE_ENV=development
LOG_LEVEL=debug

# WebSocket Server
WS_PORT=8765

# Recording Settings
RECORDINGS_ROOT=./recordings
SEND_MIXED_AUDIO=true
SEND_PER_PARTICIPANT_AUDIO=true
CAPTURE_VIDEO_FRAMES=false

# Optional: PhoWhisper integration
PHO_WHISPER_WEBHOOK_URL=http://your-pho-whisper-server.com
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

### PhoWhisper Integration

MeetBot integrates with PhoWhisper for automatic Vietnamese transcription and summarization. When a meeting ends, the system automatically:

1. Processes all recorded audio files
2. Generates transcripts for each participant
3. Creates meeting summaries (overall and per-participant)
4. Stores results in `transcripts/` and `summaries/` folders within each archived meeting

### Deepgram Integration

MeetBot also supports Deepgram API for Vietnamese transcription as an alternative to PhoWhisper:

1. **High-quality Vietnamese transcription** using Deepgram's Nova-2 model
2. **Automatic summarization** with extractive approach for Vietnamese content
3. **Per-participant analysis** with speaker diarization
4. **Fallback summarization** when advanced AI models are not available

To use Deepgram instead of PhoWhisper, set the `DEEPGRAM_API_KEY` environment variable. The system will automatically use DeepgramService for transcription and summarization.

- **PHO_WHISPER_WEBHOOK_URL**: Base URL for your PhoWhisper service
- The service expects `/transcribe` and `/summarize` endpoints
- Transcription and summarization happen automatically after meetings end
- Results are saved in `transcripts/` and `summaries/` folders within each archived meeting

## Sử dụng

### 1. Khởi động Recording Server

```bash
# Development mode (with auto-reload)
npm run dev:server

# Production mode
npm run start:server
```

Server sẽ listen trên `ws://localhost:8765`

### 2. Chạy Bot để Join Meeting

```bash
node meetbot.js <meeting-url> [bot-name] [duration-seconds]
```

**Ví dụ:**
```bash
# Join meeting với tên "RecordingBot" trong 30 phút
node meetbot.js "https://meet.google.com/abc-defg-hij" "RecordingBot" 1800

# Sử dụng default settings
node meetbot.js "https://meet.google.com/abc-defg-hij"
```

Bot sẽ tự động:
- Kết nối tới WebSocket server
- Enable media streaming
- Ghi âm từ tất cả participants
- Detect meeting lifecycle events
- Archive recordings khi meeting kết thúc
- Xử lý recordings với PhoWhisper để transcription và summarization

### Testing PhoWhisper Integration

Để test PhoWhisper integration với existing meeting recordings:

```bash
npm run test:pho-whisper
```

Script này sẽ:
- Tìm completed meeting recordings
- Xử lý chúng qua PhoWhisper
- Tạo transcripts và summaries
- Verify output files được tạo đúng

### Testing Deepgram Integration

Test the Deepgram integration:

```bash
npm run test:deepgram
```

This will:
1. Check for Deepgram API key configuration
2. Look for test meeting recordings in `recordings/test-meeting-deepgram/`
3. Process audio files through Deepgram API
4. Verify Vietnamese transcription and summary generation

### 3. Monitoring

Server logs sẽ hiển thị:
- Session connections
- Audio/video frame counts
- Participant join/leave events
- Meeting lifecycle events
- Archive completion

## Output Structure

Sau khi meeting kết thúc, data sẽ được archive trong `recordings/completed/`:

```
recordings/completed/meeting_<slug>_<timestamp>_<session>/
├── archive.json                    # Manifest file
├── session-summary.json           # Session statistics
├── telemetry.ndjson               # Raw telemetry data
├── mixed_audio.wav                # Mixed audio stream
├── transcripts/                   # PhoWhisper transcriptions
│   ├── mixed_audio.txt           # Full meeting transcript
│   └── participants/
│       └── <DisplayName>_<DeviceId>.txt  # Per-participant transcripts
├── summaries/                     # PhoWhisper summaries
│   ├── meeting_summary.txt       # Overall meeting summary
│   └── participants/
│       └── <DisplayName>_<DeviceId>_summary.txt  # Per-participant summaries
└── participants/
    └── <DisplayName>_<DeviceId>/
        ├── info.json              # Participant metadata
        ├── activity.log           # Join/leave/speaking events
        ├── combined_<name>.wav    # Combined audio for participant
        └── audio_tracks/
            └── track_*.wav        # Individual audio tracks
```

## API Events

Bot gửi các JSON events qua WebSocket:

- `SessionStarted`: Meeting metadata
- `UsersUpdate`: Participant join/leave
- `DeviceOutputsUpdate`: Audio/video stream mappings
- `AudioFormatUpdate`: Audio format changes
- `ChatMessage`: Chat messages
- `CaptionUpdate`: Live captions
- `MeetingStatusChange`: Meeting lifecycle events
- `SilenceStatus`: Audio activity detection

## Troubleshooting

### Bot không join được meeting

1. Kiểm tra meeting URL có đúng format không
2. Đảm bảo meeting đang active
3. Check browser permissions (camera/microphone)
4. Xem logs để debug join process

### Server không nhận được audio

1. Verify WebSocket server đang chạy trên port 8765
2. Check browser console có errors không
3. Đảm bảo `enableMediaSending()` được gọi sau khi join
4. Kiểm tra firewall/antivirus blocking connections

### Audio files bị corrupt

1. Check `AudioFormatUpdate` events trong logs
2. Verify sample rate và format consistency
3. Đảm bảo không có gaps trong audio stream
4. Check disk space và permissions

## Development

### Scripts

```bash
npm run build          # Build TypeScript
npm run dev:server     # Development server with watch
npm run start:server   # Production server
```

### Testing

```bash
# Test với sandbox meeting
node meetbot.js "https://meet.google.com/test-room" "TestBot" 60
```

### Debugging

1. Set `LOG_LEVEL=debug` trong `.env`
2. Check browser DevTools console
3. Monitor WebSocket traffic
4. Review `telemetry.ndjson` files

## Architecture

### Flow

1. **meetbot.js** launches Chromium với Playwright
2. **Browser payload** intercepts RTC streams và UI events
3. **WebSocket client** gửi binary frames tới server
4. **Recording server** processes frames và writes to disk
5. **Session archiver** moves completed recordings và tạo manifest

### Security

- Server chỉ accept localhost connections
- No authentication required (local development)
- Audio data không được encrypted in transit
- Meeting URLs và metadata được logged

## Roadmap

- [ ] PhoWhisper integration cho transcription
- [ ] Video frame capture và processing
- [ ] Real-time transcription display
- [ ] Multi-meeting concurrent support
- [ ] Web dashboard cho monitoring
- [ ] Docker containerization

## License

MIT License - see LICENSE file for details.

## Support

Nếu gặp issues:

1. Check logs trong console output
2. Review `recordings/live/` cho active sessions
3. Check `telemetry.ndjson` files cho debugging
4. Create issue với logs và reproduction steps
### React UI

A React-based UI is also available at `/app`.

- Start servers: `npm run dev:server`
- Open: `http://localhost:3000/app`
- Features match the vanilla UI: start recordings, list sessions, review media/transcripts/summaries.

### React Web UI (standalone)

The web interface now lives in `web/` as a Vite + React project.

1. Install dependencies once: `cd web && npm install`
2. Development server (default http://localhost:5173):
   ```bash
   npm run dev
   ```
   Set `VITE_API_BASE` if the API runs somewhere other than `http://localhost:3000`.
3. Build static assets: `npm run build` (outputs to `web/dist/`).

The API continues to serve only `/api/*` endpoints; you can deploy the frontend separately (e.g., CDN or reverse proxy).