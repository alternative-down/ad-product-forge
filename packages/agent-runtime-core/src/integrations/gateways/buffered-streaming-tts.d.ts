import type { AudioChunk, StreamingTextToSpeechGateway, StreamingTextToSpeechResponse, TextToSpeechGateway, TextToSpeechRequest, TextToSpeechResponse } from './speech.js';
export type BufferedStreamingTextToSpeechGatewayOptions = {
    tts: TextToSpeechGateway;
};
export declare class BufferedStreamingTextToSpeechGateway implements StreamingTextToSpeechGateway {
    private readonly tts;
    constructor(options: BufferedStreamingTextToSpeechGatewayOptions);
    synthesizeStream(request: TextToSpeechRequest): Promise<StreamingTextToSpeechResponse>;
}
export declare function collectStreamingTextToSpeech(response: StreamingTextToSpeechResponse): Promise<TextToSpeechResponse>;
export declare function consumeStreamingTextToSpeech(response: StreamingTextToSpeechResponse, onChunk: (chunk: AudioChunk) => Promise<void> | void): Promise<void>;
