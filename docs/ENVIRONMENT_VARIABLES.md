# Environment Variables Configuration

## New Summarization Features

The following environment variables have been added to support enhanced meeting summarization:

### ENABLE_AUTO_SUMMARIZATION
- **Type**: Boolean
- **Default**: `true`
- **Description**: Enable automatic summarization when meetings end
- **Example**: `ENABLE_AUTO_SUMMARIZATION=true`

### SUMMARIZATION_PROVIDER
- **Type**: String
- **Options**: `openai` | `deepgram` | `pho-whisper` | `auto`
- **Default**: `auto`
- **Description**: Choose which AI service to use for summarization
  - `openai`: Use OpenAI GPT models for high-quality summarization (RECOMMENDED)
  - `deepgram`: Use Deepgram's built-in summarization (English only)
  - `pho-whisper`: Use PhoWhisper service for Vietnamese
  - `auto`: Automatically choose based on API key availability and language
- **Example**: `SUMMARIZATION_PROVIDER=openai`

### SUMMARIZATION_LANGUAGE
- **Type**: String
- **Default**: `vi`
- **Description**: Language for transcription and summarization
  - `en` or `en-US`: English (enables Deepgram's advanced summarization)
  - `vi`: Vietnamese (uses custom keyword-based summarization)
- **Example**: `SUMMARIZATION_LANGUAGE=vi`

### OPENAI_API_KEY
- **Type**: String
- **Required**: Only if using OpenAI summarization
- **Description**: Your OpenAI API key for GPT-4 summarization
- **Example**: `OPENAI_API_KEY=sk-proj-abcd1234...`
- **Get API Key**: https://platform.openai.com/api-keys

### OPENAI_MODEL
- **Type**: String
- **Default**: `gpt-4o-mini`
- **Description**: Which OpenAI model to use for summarization
  - `gpt-4o-mini`: Fast and cost-effective (RECOMMENDED)
  - `gpt-4o`: More powerful but slower and more expensive
  - `gpt-4-turbo`: Good balance of quality and speed
- **Example**: `OPENAI_MODEL=gpt-4o-mini`

## Complete Configuration Example

```env
# Environment
NODE_ENV=development
LOG_LEVEL=debug

# WebSocket Server
WS_PORT=8765

# HTTP API Server
HTTP_PORT=3000

# Recording Settings
RECORDINGS_ROOT=./recordings
SEND_MIXED_AUDIO=true
SEND_PER_PARTICIPANT_AUDIO=true
CAPTURE_VIDEO_FRAMES=false

# Bot Configuration
BOT_NAME=MeetBot AI

# AI Services
DEEPGRAM_API_KEY=your_deepgram_api_key_here
PHO_WHISPER_WEBHOOK_URL=http://your-pho-whisper-server.com

# OpenAI Integration (NEW - RECOMMENDED)
OPENAI_API_KEY=sk-proj-your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Enhanced Summarization (NEW)
ENABLE_AUTO_SUMMARIZATION=true
SUMMARIZATION_PROVIDER=openai
SUMMARIZATION_LANGUAGE=vi
```

## How It Works

### OpenAI Summarization (RECOMMENDED)
1. Set `SUMMARIZATION_PROVIDER=openai` and add `OPENAI_API_KEY`
2. High-quality AI summaries for both Vietnamese and English
3. Automatically extracts:
   - **Overall Summary**: 2-3 paragraph meeting overview
   - **Key Points**: Important discussion points
   - **Action Items**: Tasks and assignments
   - **Decisions**: Conclusions and approvals
   - **Topics**: Main subjects discussed
4. Works with any language, optimized for Vietnamese business meetings

### For English Meetings (Deepgram)
1. Set `SUMMARIZATION_LANGUAGE=en` and `SUMMARIZATION_PROVIDER=deepgram`
2. Uses Deepgram's built-in AI summarization
3. Fallback to OpenAI if available, then custom summarization

### For Vietnamese Meetings (Custom)
1. Keep `SUMMARIZATION_LANGUAGE=vi` (default)
2. Uses enhanced keyword-based summarization when OpenAI unavailable
3. Extracts key points using Vietnamese meeting patterns

### Automatic Mode (Smart Selection)
1. Set `SUMMARIZATION_PROVIDER=auto`
2. Priority order:
   - **First**: OpenAI (if API key available) → Best quality
   - **Second**: Deepgram (if English + summary available)
   - **Third**: Custom extractive summarization → Always works

### Cost Considerations
- **OpenAI**: ~$0.001-0.01 per meeting (depending on length and model)
- **Deepgram**: Included with transcription
- **Custom**: Free but lower quality
