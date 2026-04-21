import type { AudioChunk, RealtimeSpeechToTextGateway, RealtimeSpeechToTextSession, RealtimeTranscriptionEvent } from '../gateways/speech.js';
import { type RuntimeInputTarget } from './runtime-input-bridge.js';
export type RealtimeSpeechDispatchTarget = RuntimeInputTarget;
export type RealtimeSpeechRuntimeBridgeOptions = {
    runtime: RealtimeSpeechDispatchTarget;
    stt: RealtimeSpeechToTextGateway;
    inputType?: string;
    includeInterim?: boolean;
    eventToInput?(event: RealtimeTranscriptionEvent): {
        id?: string;
        type?: string;
        payload: Record<string, unknown>;
    };
};
export declare class RealtimeSpeechRuntimeBridge {
    private readonly stt;
    private readonly includeInterim;
    private readonly inputBridge;
    constructor(options: RealtimeSpeechRuntimeBridgeOptions);
    startSession(options?: {
        language?: string;
        headers?: Record<string, string>;
    }): Promise<RealtimeSpeechRuntimeSession>;
}
export type RealtimeSpeechRuntimeSessionOptions = {
    session: RealtimeSpeechToTextSession;
    transcripts: RealtimeTranscriptionEvent[];
};
export declare class RealtimeSpeechRuntimeSession {
    private readonly session;
    private readonly transcripts;
    constructor(options: RealtimeSpeechRuntimeSessionOptions);
    get id(): string;
    pushAudio(chunk: AudioChunk): Promise<void>;
    listTranscriptions(): RealtimeTranscriptionEvent[];
    close(): Promise<void>;
}
