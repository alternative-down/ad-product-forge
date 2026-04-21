import type { AudioChunk, TextToSpeechRequest } from '../gateways/speech.js';
import type { RealtimeSpeechRuntimeBridge } from './realtime-speech-runtime-bridge.js';
import type { RealtimeSpeechRuntimeSession } from './realtime-speech-runtime-bridge.js';
import type { RuntimeMessageEvent, RuntimeMessageStream } from './runtime-message-stream.js';
import type { RuntimeSpeechRenderer } from './runtime-speech-renderer.js';
export type RuntimeVoiceSessionOptions = {
    speechBridge: RealtimeSpeechRuntimeBridge;
    messageStream: RuntimeMessageStream;
    renderer: RuntimeSpeechRenderer;
    runtimeId?: string;
    renderMode?: 'batch' | 'stream' | 'off';
    createSpeechRequest?(event: RuntimeMessageEvent): Omit<TextToSpeechRequest, 'text'>;
    onText?(event: RuntimeMessageEvent): Promise<void> | void;
    onSpeech?(context: {
        event: RuntimeMessageEvent;
        response: {
            mimeType: string;
            bytes: Uint8Array;
        };
    }): Promise<void> | void;
    onSpeechStream?(context: {
        event: RuntimeMessageEvent;
        response: {
            mimeType: string;
            stream: AsyncIterable<AudioChunk>;
        };
    }): Promise<void> | void;
};
export declare class RuntimeVoiceSession {
    private readonly speechBridge;
    private readonly messageStream;
    private readonly renderer;
    private readonly runtimeId;
    private readonly renderMode;
    private readonly createSpeechRequest;
    private readonly onText;
    private readonly onSpeech;
    private readonly onSpeechStream;
    constructor(options: RuntimeVoiceSessionOptions);
    start(options?: {
        language?: string;
        headers?: Record<string, string>;
    }): Promise<ActiveRuntimeVoiceSession>;
    private handleMessageEvent;
}
export type ActiveRuntimeVoiceSessionOptions = {
    speechSession: RealtimeSpeechRuntimeSession;
    close(): Promise<void>;
};
export declare class ActiveRuntimeVoiceSession {
    private readonly speechSession;
    private readonly closeSession;
    constructor(options: ActiveRuntimeVoiceSessionOptions);
    get id(): string;
    pushAudio(chunk: AudioChunk): Promise<void>;
    listTranscriptions(): import("../index.js").RealtimeTranscriptionEvent[];
    close(): Promise<void>;
}
