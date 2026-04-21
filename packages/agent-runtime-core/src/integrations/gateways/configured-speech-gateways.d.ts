import type { RealtimeSpeechSynthesisAudioEvent, RealtimeTextToSpeechGateway, RealtimeTextToSpeechSession, RealtimeTranscriptionEvent, RealtimeSpeechToTextGateway, RealtimeSpeechToTextSession, SpeechToTextGateway, SpeechToTextRequest, SpeechToTextResponse, StreamingTextToSpeechGateway, StreamingTextToSpeechResponse, TextToSpeechGateway, TextToSpeechRequest, TextToSpeechResponse } from './speech.js';
export type ConfiguredTextToSpeechGatewayOptions = {
    base: TextToSpeechGateway;
    voiceId?: string;
    headers?: Record<string, string>;
};
export declare class ConfiguredTextToSpeechGateway implements TextToSpeechGateway {
    private readonly base;
    private readonly voiceId;
    private readonly headers;
    constructor(options: ConfiguredTextToSpeechGatewayOptions);
    synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse>;
}
export type ConfiguredStreamingTextToSpeechGatewayOptions = {
    base: StreamingTextToSpeechGateway;
    voiceId?: string;
    headers?: Record<string, string>;
};
export declare class ConfiguredStreamingTextToSpeechGateway implements StreamingTextToSpeechGateway {
    private readonly base;
    private readonly voiceId;
    private readonly headers;
    constructor(options: ConfiguredStreamingTextToSpeechGatewayOptions);
    synthesizeStream(request: TextToSpeechRequest): Promise<StreamingTextToSpeechResponse>;
}
export type ConfiguredRealtimeTextToSpeechGatewayOptions = {
    base: RealtimeTextToSpeechGateway;
    voiceId?: string;
    headers?: Record<string, string>;
};
export declare class ConfiguredRealtimeTextToSpeechGateway implements RealtimeTextToSpeechGateway {
    private readonly base;
    private readonly voiceId;
    private readonly headers;
    constructor(options: ConfiguredRealtimeTextToSpeechGatewayOptions);
    createSession(options?: {
        voiceId?: string;
        headers?: Record<string, string>;
        onAudioChunk?(event: RealtimeSpeechSynthesisAudioEvent): Promise<void> | void;
    }): Promise<RealtimeTextToSpeechSession>;
}
export type ConfiguredSpeechToTextGatewayOptions = {
    base: SpeechToTextGateway;
    language?: string;
    headers?: Record<string, string>;
};
export declare class ConfiguredSpeechToTextGateway implements SpeechToTextGateway {
    private readonly base;
    private readonly language;
    private readonly headers;
    constructor(options: ConfiguredSpeechToTextGatewayOptions);
    transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResponse>;
}
export type ConfiguredRealtimeSpeechToTextGatewayOptions = {
    base: RealtimeSpeechToTextGateway;
    language?: string;
    headers?: Record<string, string>;
};
export declare class ConfiguredRealtimeSpeechToTextGateway implements RealtimeSpeechToTextGateway {
    private readonly base;
    private readonly language;
    private readonly headers;
    constructor(options: ConfiguredRealtimeSpeechToTextGatewayOptions);
    createSession(options?: {
        language?: string;
        headers?: Record<string, string>;
        onTranscription?(event: RealtimeTranscriptionEvent): Promise<void> | void;
    }): Promise<RealtimeSpeechToTextSession>;
}
