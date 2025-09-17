import type { AudioFormat } from './types';
export interface WavWriterOptions {
    filePath: string;
    format: AudioFormat;
}
export declare class WavWriter {
    private readonly options;
    private readonly stream;
    private bytesWritten;
    private closed;
    constructor(options: WavWriterOptions);
    write(buffer: Buffer): boolean;
    close(): Promise<void>;
}
export declare function convertFloat32ToInt16(floatBuffer: Buffer): Buffer;
