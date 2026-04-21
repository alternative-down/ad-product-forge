import type { TextToSpeechGateway, TextToSpeechRequest, TextToSpeechResponse } from './speech.js';
export type SpeechSynthesisEvent = {
    text: string;
    voiceId?: string;
    mimeType: string;
    size: number;
    recordedAt: string;
};
export interface SpeechSynthesisRecorder {
    record(event: SpeechSynthesisEvent): Promise<void> | void;
}
export declare class InMemorySpeechSynthesisRecorder implements SpeechSynthesisRecorder {
    private readonly events;
    record(event: SpeechSynthesisEvent): Promise<void>;
    list(): SpeechSynthesisEvent[];
}
export type RecordingTextToSpeechGatewayOptions = {
    base: TextToSpeechGateway;
    recorder: SpeechSynthesisRecorder;
};
export declare class RecordingTextToSpeechGateway implements TextToSpeechGateway {
    private readonly base;
    private readonly recorder;
    constructor(options: RecordingTextToSpeechGatewayOptions);
    synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse>;
}
