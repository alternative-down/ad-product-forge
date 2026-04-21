import type { StepRecord } from '../../core/types.js';
import type { StreamingTextToSpeechGateway, StreamingTextToSpeechResponse, TextToSpeechGateway, TextToSpeechRequest, TextToSpeechResponse } from '../gateways/speech.js';
export type RuntimeSpeechRendererOptions = {
    tts?: TextToSpeechGateway;
    streamingTts?: StreamingTextToSpeechGateway;
};
export declare class RuntimeSpeechRenderer {
    private readonly tts;
    private readonly streamingTts;
    constructor(options: RuntimeSpeechRendererOptions);
    renderText(text: string, request?: Omit<TextToSpeechRequest, 'text'>): Promise<TextToSpeechResponse | null>;
    renderTextStream(text: string, request?: Omit<TextToSpeechRequest, 'text'>): Promise<StreamingTextToSpeechResponse | null>;
    renderStep(record: StepRecord, request?: Omit<TextToSpeechRequest, 'text'>): Promise<TextToSpeechResponse | null>;
    renderStepStream(record: StepRecord, request?: Omit<TextToSpeechRequest, 'text'>): Promise<StreamingTextToSpeechResponse | null>;
}
