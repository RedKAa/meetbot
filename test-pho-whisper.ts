#!/usr/bin/env tsx

import path from 'path';
import fs from 'fs';
import { PhoWhisperService } from './server/pho-whisper';
import { loadConfig } from './server/config';
import pino from 'pino';

const logger = pino({ name: 'pho-whisper-test' });

async function testPhoWhisperIntegration() {
  try {
    // Load configuration
    const config = loadConfig();
    
    if (!config.phoWhisperWebhookUrl) {
      logger.error('PHO_WHISPER_WEBHOOK_URL not configured in .env file');
      process.exit(1);
    }

    logger.info({ webhookUrl: config.phoWhisperWebhookUrl }, 'Testing PhoWhisper integration');

    // Find a sample meeting folder to test with
    const recordingsRoot = config.recordingsRoot;
    const completedDir = path.join(recordingsRoot, 'completed');
    
    if (!fs.existsSync(completedDir)) {
      logger.error({ completedDir }, 'No completed meetings directory found');
      process.exit(1);
    }

    const meetings = fs.readdirSync(completedDir).filter(item => {
      const itemPath = path.join(completedDir, item);
      return fs.statSync(itemPath).isDirectory();
    });

    if (meetings.length === 0) {
      logger.error('No completed meetings found for testing');
      process.exit(1);
    }

    // Use the first meeting for testing
    const testMeetingPath = path.join(completedDir, meetings[0]);
    logger.info({ testMeetingPath }, 'Testing with meeting folder');

    // Check if meeting has audio files
    const hasAudio = await checkForAudioFiles(testMeetingPath);
    if (!hasAudio) {
      logger.error({ testMeetingPath }, 'No audio files found in test meeting');
      process.exit(1);
    }

    // Test PhoWhisper service
    const phoWhisperService = new PhoWhisperService();
    
    logger.info('Starting PhoWhisper processing...');
    const startTime = Date.now();
    
    await phoWhisperService.processMeetingFolder(testMeetingPath);
    
    const duration = Date.now() - startTime;
    logger.info({ duration }, 'PhoWhisper processing completed successfully');

    // Verify output files were created
    await verifyOutputFiles(testMeetingPath);
    
    logger.info('✅ PhoWhisper integration test completed successfully!');
    
  } catch (error) {
    logger.error({ error }, '❌ PhoWhisper integration test failed');
    process.exit(1);
  }
}

async function checkForAudioFiles(meetingPath: string): Promise<boolean> {
  // Check for mixed audio
  const mixedAudioPath = path.join(meetingPath, 'mixed_audio.wav');
  if (fs.existsSync(mixedAudioPath)) {
    return true;
  }

  // Check for participant audio files
  const participantsDir = path.join(meetingPath, 'participants');
  if (fs.existsSync(participantsDir)) {
    const participants = fs.readdirSync(participantsDir);
    
    for (const participantFolder of participants) {
      const participantPath = path.join(participantsDir, participantFolder);
      const stat = fs.statSync(participantPath);
      
      if (stat.isDirectory()) {
        const files = fs.readdirSync(participantPath);
        const hasAudioFile = files.some(file => file.endsWith('.wav'));
        
        if (hasAudioFile) {
          return true;
        }
      }
    }
  }

  return false;
}

async function verifyOutputFiles(meetingPath: string): Promise<void> {
  const transcriptsDir = path.join(meetingPath, 'transcripts');
  const summariesDir = path.join(meetingPath, 'summaries');
  
  // Check if directories were created
  if (!fs.existsSync(transcriptsDir)) {
    throw new Error('Transcripts directory was not created');
  }
  
  if (!fs.existsSync(summariesDir)) {
    throw new Error('Summaries directory was not created');
  }
  
  // Check for transcript files
  const transcriptFiles = fs.readdirSync(transcriptsDir);
  logger.info({ transcriptFiles }, 'Transcript files created');
  
  // Check for summary files
  const summaryFiles = fs.readdirSync(summariesDir);
  logger.info({ summaryFiles }, 'Summary files created');
  
  // Verify meeting summary exists
  const meetingSummaryPath = path.join(summariesDir, 'meeting_summary.txt');
  if (fs.existsSync(meetingSummaryPath)) {
    const summaryContent = fs.readFileSync(meetingSummaryPath, 'utf8');
    logger.info({ summaryLength: summaryContent.length }, 'Meeting summary generated');
  }
  
  // Check for participant summaries
  const participantsSummaryDir = path.join(summariesDir, 'participants');
  if (fs.existsSync(participantsSummaryDir)) {
    const participantSummaries = fs.readdirSync(participantsSummaryDir);
    logger.info({ participantSummaries }, 'Participant summaries created');
  }
}

if (require.main === module) {
  testPhoWhisperIntegration();
}

export { testPhoWhisperIntegration };