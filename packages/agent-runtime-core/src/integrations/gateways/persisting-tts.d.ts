import type { BlobStore } from '../assets/blob-store.js';
import type { StreamingTextToSpeechGateway, StreamingTextToSpeechResponse, TextToSpeechGateway, TextToSpeechRequest, TextToSpeechResponse } from './speech.js';
export type PersistingTextToSpeechGatewayOptions = {
    tts: TextToSpeechGateway;
    blobs: BlobStore;
    createBlobMetadata?(context: {
        request: TextToSpeechRequest;
        response: TextToSpeechResponse;
    }): Record<string, unknown> | undefined;
};
export declare class PersistingTextToSpeechGateway implements TextToSpeechGateway {
    private readonly tts;
    private readonly blobs;
    private readonly createBlobMetadata;
    constructor(options: PersistingTextToSpeechGatewayOptions);
    synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse>;
}
export type PersistingStreamingTextToSpeechGatewayOptions = {
    tts: StreamingTextToSpeechGateway;
    blobs: BlobStore;
    createBlobMetadata?(context: {
        request: TextToSpeechRequest;
        response: TextToSpeechResponse;
    }): Record<string, unknown> | undefined;
};
export declare class PersistingStreamingTextToSpeechGateway implements StreamingTextToSpeechGateway {
    private readonly tts;
    private readonly blobs;
    private readonly createBlobMetadata;
    constructor(options: PersistingStreamingTextToSpeechGatewayOptions);
    synthesizeStream(request: TextToSpeechRequest): Promise<StreamingTextToSpeechResponse>;
}
