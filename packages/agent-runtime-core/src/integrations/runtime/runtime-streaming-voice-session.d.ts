import type { AudioChunk, RealtimeTextToSpeechGateway } from '../gateways/speech.js';
import type { RuntimeMessageChunkEvent, RuntimeMessageChunkStream } from './runtime-message-chunk-stream.js';
export type RuntimeStreamingVoiceSessionOptions = {
    messageStream: RuntimeMessageChunkStream;
    tts: RealtimeTextToSpeechGateway;
    runtimeId?: string;
    sessionOptions?: {
        voiceId?: string;
        headers?: Record<string, string>;
    };
    onTextChunk?(event: RuntimeMessageChunkEvent): Promise<void> | void;
    onAudioChunk?(context: {
        event: RuntimeMessageChunkEvent;
        chunk: AudioChunk;
        isFinal?: boolean;
    }): Promise<void> | void;
};
export declare class RuntimeStreamingVoiceSession {
    private readonly messageStream;
    private readonly tts;
    private readonly runtimeId;
    private readonly sessionOptions;
    private readonly onTextChunk;
    private readonly onAudioChunk;
    constructor(options: RuntimeStreamingVoiceSessionOptions);
    start(): Promise<{
        id: string;
        completion: Promise<void>;
        close: () => Promise<void>;
    }>;
}
