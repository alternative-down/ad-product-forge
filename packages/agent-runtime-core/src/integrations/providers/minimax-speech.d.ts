import type { TextToSpeechGateway, TextToSpeechRequest, TextToSpeechResponse } from '../gateways/speech.js';
type MiniMaxFetch = typeof fetch;
export type MiniMaxTextToSpeechGatewayOptions = {
    apiKey: string;
    model?: string;
    voiceId?: string;
    baseURL?: string;
    fetch?: MiniMaxFetch;
};
export declare class MiniMaxTextToSpeechGateway implements TextToSpeechGateway {
    private readonly apiKey;
    private readonly model;
    private readonly voiceId;
    private readonly baseURL;
    private readonly fetchImpl;
    constructor(options: MiniMaxTextToSpeechGatewayOptions);
    synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse>;
}
export {};
