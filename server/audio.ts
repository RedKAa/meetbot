import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';

import type { AudioFormat } from './types';

export interface WavWriterOptions {
  filePath: string;
  format: AudioFormat;
}

export class WavWriter {
  private readonly stream: fs.WriteStream;
  private bytesWritten = 0;
  private closed = false;

  constructor(private readonly options: WavWriterOptions) {
    ensureDir(path.dirname(options.filePath));

    this.stream = fs.createWriteStream(options.filePath);
    this.stream.write(createWaveHeader(options.format, 0));
  }

  write(buffer: Buffer): boolean {
    if (this.closed) {
      return false;
    }

    this.bytesWritten += buffer.length;
    return this.stream.write(buffer);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    this.stream.end();
    await finished(this.stream).catch(() => undefined);

    const header = createWaveHeader(this.options.format, this.bytesWritten);
    const handle = await fs.promises.open(this.options.filePath, 'r+');
    try {
      await handle.write(header, 0, header.length, 0);
    } finally {
      await handle.close();
    }
  }
}

export function convertFloat32ToInt16(floatBuffer: Buffer): Buffer {
  const sampleCount = floatBuffer.length / 4;
  const int16Buffer = Buffer.alloc(sampleCount * 2);

  for (let i = 0; i < sampleCount; i++) {
    let sample = floatBuffer.readFloatLE(i * 4);
    if (!Number.isFinite(sample)) {
      sample = 0;
    }
    sample = Math.max(-1, Math.min(1, sample));
    int16Buffer.writeInt16LE(Math.round(sample * 0x7fff), i * 2);
  }

  return int16Buffer;
}

function createWaveHeader(format: AudioFormat, dataLength: number): Buffer {
  const header = Buffer.alloc(44);
  const numChannels = Math.max(1, format.numberOfChannels ?? 1);
  const sampleRate = Math.max(1, format.sampleRate ?? 48000);
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const chunkSize = 36 + dataLength;

  header.write('RIFF', 0); // ChunkID
  header.writeUInt32LE(chunkSize, 4); // ChunkSize
  header.write('WAVE', 8); // Format
  header.write('fmt ', 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat (PCM)
  header.writeUInt16LE(numChannels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  header.write('data', 36); // Subchunk2ID
  header.writeUInt32LE(dataLength, 40); // Subchunk2Size

  return header;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

