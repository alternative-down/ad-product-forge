import type { BlobStore } from '../assets/blob-store.js';
import type { GeneratedImage, ImageGenerationGateway, ImageGenerationRequest, ImageGenerationResponse } from './image-generation.js';
export type PersistingImageGenerationGatewayOptions = {
    imageGeneration: ImageGenerationGateway;
    blobs: BlobStore;
    createBlobMetadata?(context: {
        request: ImageGenerationRequest;
        image: GeneratedImage;
        imageIndex: number;
    }): Record<string, unknown> | undefined;
};
export declare class PersistingImageGenerationGateway implements ImageGenerationGateway {
    private readonly imageGeneration;
    private readonly blobs;
    private readonly createBlobMetadata;
    constructor(options: PersistingImageGenerationGatewayOptions);
    generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
}
