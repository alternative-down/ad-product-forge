import { randomUUID } from 'node:crypto';

import type { BlobStore } from '../assets/blob-store.js';
import type {
  GeneratedImage,
  ImageGenerationGateway,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from './image-generation.js';

export type PersistingImageGenerationGatewayOptions = {
  imageGeneration: ImageGenerationGateway;
  blobs: BlobStore;
  createBlobMetadata?(context: {
    request: ImageGenerationRequest;
    image: GeneratedImage;
    imageIndex: number;
  }): Record<string, unknown> | undefined;
};

export class PersistingImageGenerationGateway implements ImageGenerationGateway {
  private readonly imageGeneration: ImageGenerationGateway;
  private readonly blobs: BlobStore;
  private readonly createBlobMetadata: PersistingImageGenerationGatewayOptions['createBlobMetadata'];

  constructor(options: PersistingImageGenerationGatewayOptions) {
    this.imageGeneration = options.imageGeneration;
    this.blobs = options.blobs;
    this.createBlobMetadata = options.createBlobMetadata;
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const response = await this.imageGeneration.generate(request);

    for (const [imageIndex, image] of response.images.entries()) {
      await this.blobs.write({
        id: randomUUID(),
        mimeType: image.mimeType,
        bytes: image.bytes,
        createdAt: new Date().toISOString(),
        metadata: this.createBlobMetadata?.({
          request,
          image,
          imageIndex,
        }),
      });
    }

    return response;
  }
}
