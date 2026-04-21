import type { RealtimeTextToSpeechGateway, RealtimeTextToSpeechSession, StreamingTextToSpeechGateway, TextToSpeechGateway } from './speech.js';
export type BufferedRealtimeTextToSpeechGatewayOptions = {
    streamingTts?: StreamingTextToSpeechGateway;
    tts?: TextToSpeechGateway;
};
export declare class BufferedRealtimeTextToSpeechGateway implements RealtimeTextToSpeechGateway {
    private readonly streamingTts;
    constructor(options: BufferedRealtimeTextToSpeechGatewayOptions);
    createSession(options?: {
        voiceId?: string;
        headers?: Record<string, string>;
        onAudioChunk?(event: {
            chunk: {
                mimeType: string;
                bytes: Uint8Array;
            };
            isFinal?: boolean;
        }): Promise<void> | void;
    }): Promise<RealtimeTextToSpeechSession>;
}
