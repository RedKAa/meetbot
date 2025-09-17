export interface RecorderConfig {
    env: 'development' | 'production' | 'test';
    port: number;
    recordingsRoot: string;
    enableMixedAudio: boolean;
    enablePerParticipantAudio: boolean;
    enableVideoCapture: boolean;
    phoWhisperWebhookUrl?: string;
}
export declare function loadConfig(env?: NodeJS.ProcessEnv): RecorderConfig;
