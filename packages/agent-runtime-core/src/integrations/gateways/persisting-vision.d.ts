import type { BlobStore } from '../assets/blob-store.js';
import type { VisionGateway, VisionImageInput, VisionRequest, VisionResponse } from './vision.js';
export type PersistingVisionGatewayOptions = {
    vision: VisionGateway;
    blobs: BlobStore;
    createBlobMetadata?(context: {
        request: VisionRequest;
        image: VisionImageInput;
        imageIndex: number;
        response: VisionResponse;
    }): Record<string, unknown> | undefined;
};
export declare class PersistingVisionGateway implements VisionGateway {
    private readonly vision;
    private readonly blobs;
    private readonly createBlobMetadata;
    constructor(options: PersistingVisionGatewayOptions);
    analyze(request: VisionRequest): Promise<VisionResponse>;
}
