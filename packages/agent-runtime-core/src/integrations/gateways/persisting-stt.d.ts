import type { BlobStore } from '../assets/blob-store.js';
import type { SpeechToTextGateway, SpeechToTextRequest, SpeechToTextResponse } from './speech.js';
export type PersistingSpeechToTextGatewayOptions = {
    stt: SpeechToTextGateway;
    blobs: BlobStore;
    createBlobMetadata?(context: {
        request: SpeechToTextRequest;
        response: SpeechToTextResponse;
    }): Record<string, unknown> | undefined;
};
export declare class PersistingSpeechToTextGateway implements SpeechToTextGateway {
    private readonly stt;
    private readonly blobs;
    private readonly createBlobMetadata;
    constructor(options: PersistingSpeechToTextGatewayOptions);
    transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResponse>;
}
