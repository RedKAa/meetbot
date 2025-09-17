"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WavWriter = void 0;
exports.convertFloat32ToInt16 = convertFloat32ToInt16;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("stream/promises");
class WavWriter {
    options;
    stream;
    bytesWritten = 0;
    closed = false;
    constructor(options) {
        this.options = options;
        ensureDir(path_1.default.dirname(options.filePath));
        this.stream = fs_1.default.createWriteStream(options.filePath);
        this.stream.write(createWaveHeader(options.format, 0));
    }
    write(buffer) {
        if (this.closed) {
            return false;
        }
        this.bytesWritten += buffer.length;
        return this.stream.write(buffer);
    }
    async close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.stream.end();
        await (0, promises_1.finished)(this.stream).catch(() => undefined);
        const header = createWaveHeader(this.options.format, this.bytesWritten);
        const handle = await fs_1.default.promises.open(this.options.filePath, 'r+');
        try {
            await handle.write(header, 0, header.length, 0);
        }
        finally {
            await handle.close();
        }
    }
}
exports.WavWriter = WavWriter;
function convertFloat32ToInt16(floatBuffer) {
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
function createWaveHeader(format, dataLength) {
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
function ensureDir(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
//# sourceMappingURL=audio.js.map