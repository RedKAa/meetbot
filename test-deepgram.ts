import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { loadConfig } from './server/config';
import { DeepgramService } from './server/deepgram-service';

// Test configuration
const logger = pino({ name: 'deepgram-test' });

async function testDeepgramIntegration() {
  try {
    logger.info('Starting Deepgram integration test...');

    // Load configuration
    const config = loadConfig();
    logger.info({ config: { deepgramApiKey: config.deepgramApiKey ? '***' : undefined } }, 'Configuration loaded');

    if (!config.deepgramApiKey) {
      logger.error('DEEPGRAM_API_KEY not found in environment variables');
      process.exit(1);
    }

    // Test meeting folder path
    const testMeetingPath = path.join(config.recordingsRoot, 'test-meeting-deepgram');
    
    // Check if test meeting folder exists
    if (!fs.existsSync(testMeetingPath)) {
      logger.warn({ testMeetingPath }, 'Test meeting folder not found, creating sample structure...');
      
      // Create test folder structure
      fs.mkdirSync(testMeetingPath, { recursive: true });
      fs.mkdirSync(path.join(testMeetingPath, 'participants'), { recursive: true });
      
      logger.info('Created test folder structure. Please add some audio files (.wav, .mp3, .m4a) to test transcription.');
      logger.info(`Test folder: ${testMeetingPath}`);
      return;
    }

    // Check for audio files
    const audioFiles = findAudioFiles(testMeetingPath);
    if (audioFiles.length === 0) {
      logger.warn({ testMeetingPath }, 'No audio files found in test meeting folder');
      logger.info('Please add some audio files (.wav, .mp3, .m4a) to test transcription.');
      return;
    }

    logger.info({ audioFiles: audioFiles.map(f => path.basename(f)) }, 'Found audio files for testing');

    // Initialize Deepgram service
    const deepgramService = new DeepgramService(config.deepgramApiKey);
    logger.info('DeepgramService initialized successfully');

    // Process the meeting folder
    logger.info({ testMeetingPath }, 'Processing meeting folder with Deepgram...');
    const results = await deepgramService.processMeetingFolder(testMeetingPath);

    // Log results
    logger.info({
      transcriptCount: Object.keys(results.transcripts).length,
      overallSummary: results.summaries.overall.summary.substring(0, 100) + '...',
      participantSummaries: Object.keys(results.summaries.participants).length
    }, 'Deepgram processing completed successfully');

    // Verify output files
    const transcriptsDir = path.join(testMeetingPath, 'transcripts');
    const summariesDir = path.join(testMeetingPath, 'summaries');

    if (fs.existsSync(transcriptsDir)) {
      const transcriptFiles = fs.readdirSync(transcriptsDir);
      logger.info({ transcriptFiles }, 'Generated transcript files');
    }

    if (fs.existsSync(summariesDir)) {
      const summaryFiles = fs.readdirSync(summariesDir);
      logger.info({ summaryFiles }, 'Generated summary files');
    }

    logger.info('✅ Deepgram integration test completed successfully!');

  } catch (error) {
    logger.error({ error }, '❌ Deepgram integration test failed');
    process.exit(1);
  }
}

function findAudioFiles(folderPath: string): string[] {
  const audioExtensions = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
  const files: string[] = [];

  function scanDirectory(dir: string) {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          scanDirectory(itemPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (audioExtensions.includes(ext)) {
            files.push(itemPath);
          }
        }
      }
    } catch (error) {
      logger.error({ error, dir }, 'Error scanning directory');
    }
  }

  scanDirectory(folderPath);
  return files;
}

// Run the test
testDeepgramIntegration().catch((error) => {
  logger.error({ error }, 'Unhandled error in Deepgram test');
  process.exit(1);
});