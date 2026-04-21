import { randomUUID } from 'node:crypto';

import type { BlobStore } from '../assets/blob-store.js';
import type {
  SpeechToTextGateway,
  SpeechToTextRequest,
  SpeechToTextResponse,
} from './speech.js';

export type PersistingSpeechToTextGatewayOptions = {
  stt: SpeechToTextGateway;
  blobs: BlobStore;
  createBlobMetadata?(context: {
    request: SpeechToTextRequest;
    response: SpeechToTextResponse;
  }): Record<string, unknown> | undefined;
};

export class PersistingSpeechToTextGateway implements SpeechToTextGateway {
  private readonly stt: SpeechToTextGateway;
  private readonly blobs: BlobStore;
  private readonly createBlobMetadata: PersistingSpeechToTextGatewayOptions['createBlobMetadata'];

  constructor(options: PersistingSpeechToTextGatewayOptions) {
    this.stt = options.stt;
    this.blobs = options.blobs;
    this.createBlobMetadata = options.createBlobMetadata;
  }

  async transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResponse> {
    const response = await this.stt.transcribe(request);

    await this.blobs.write({
      id: randomUUID(),
      mimeType: request.audio.mimeType,
      bytes: request.audio.bytes,
      createdAt: new Date().toISOString(),
      metadata: this.createBlobMetadata?.({
        request,
        response,
      }),
    });

    return response;
  }
}
