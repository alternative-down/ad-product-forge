import { randomUUID } from 'node:crypto';

import type { BlobStore } from '../assets/blob-store.js';
import type {
  VisionGateway,
  VisionImageInput,
  VisionRequest,
  VisionResponse,
} from './vision.js';

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

export class PersistingVisionGateway implements VisionGateway {
  private readonly vision: VisionGateway;
  private readonly blobs: BlobStore;
  private readonly createBlobMetadata: PersistingVisionGatewayOptions['createBlobMetadata'];

  constructor(options: PersistingVisionGatewayOptions) {
    this.vision = options.vision;
    this.blobs = options.blobs;
    this.createBlobMetadata = options.createBlobMetadata;
  }

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    const response = await this.vision.analyze(request);

    for (const [imageIndex, image] of request.images.entries()) {
      await this.blobs.write({
        id: randomUUID(),
        mimeType: image.mimeType,
        bytes: image.bytes,
        createdAt: new Date().toISOString(),
        metadata: this.createBlobMetadata?.({
          request,
          image,
          imageIndex,
          response,
        }),
      });
    }

    return response;
  }
}
