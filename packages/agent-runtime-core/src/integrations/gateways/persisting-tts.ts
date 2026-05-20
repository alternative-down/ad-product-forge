import { randomUUID } from 'node:crypto';

import type { BlobStore } from '../assets/blob-store.js';
import { collectStreamingTextToSpeech } from './buffered-streaming-tts.js';
import type {
  AudioChunk,
  StreamingTextToSpeechGateway,
  StreamingTextToSpeechResponse,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResponse,
} from './speech.js';

export type PersistingTextToSpeechGatewayOptions = {
  tts: TextToSpeechGateway;
  blobs: BlobStore;
  createBlobMetadata?(context: {
    request: TextToSpeechRequest;
    response: TextToSpeechResponse;
  }): Record<string, unknown> | undefined;
};

export class PersistingTextToSpeechGateway implements TextToSpeechGateway {
  private readonly tts: TextToSpeechGateway;
  private readonly blobs: BlobStore;
  private readonly createBlobMetadata: PersistingTextToSpeechGatewayOptions['createBlobMetadata'];

  constructor(options: PersistingTextToSpeechGatewayOptions) {
    this.tts = options.tts;
    this.blobs = options.blobs;
    this.createBlobMetadata = options.createBlobMetadata;
  }

  async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
    const response = await this.tts.synthesize(request);

    await writeBlobRecord({
      blobs: this.blobs,
      request,
      response,
      createBlobMetadata: this.createBlobMetadata,
    });

    return response;
  }
}

export type PersistingStreamingTextToSpeechGatewayOptions = {
  tts: StreamingTextToSpeechGateway;
  blobs: BlobStore;
  createBlobMetadata?(context: {
    request: TextToSpeechRequest;
    response: TextToSpeechResponse;
  }): Record<string, unknown> | undefined;
};

export class PersistingStreamingTextToSpeechGateway implements StreamingTextToSpeechGateway {
  private readonly tts: StreamingTextToSpeechGateway;
  private readonly blobs: BlobStore;
  private readonly createBlobMetadata: PersistingStreamingTextToSpeechGatewayOptions['createBlobMetadata'];

  constructor(options: PersistingStreamingTextToSpeechGatewayOptions) {
    this.tts = options.tts;
    this.blobs = options.blobs;
    this.createBlobMetadata = options.createBlobMetadata;
  }

  async synthesizeStream(request: TextToSpeechRequest): Promise<StreamingTextToSpeechResponse> {
    const response = await this.tts.synthesizeStream(request);
    const bufferedResponse = await collectStreamingTextToSpeech(response);

    await writeBlobRecord({
      blobs: this.blobs,
      request,
      response: bufferedResponse,
      createBlobMetadata: this.createBlobMetadata,
    });

    return {
      mimeType: bufferedResponse.mimeType,
      stream: createSingleChunkStream(bufferedResponse),
    };
  }
}

async function writeBlobRecord(options: {
  blobs: BlobStore;
  request: TextToSpeechRequest;
  response: TextToSpeechResponse;
  createBlobMetadata?(context: {
    request: TextToSpeechRequest;
    response: TextToSpeechResponse;
  }): Record<string, unknown> | undefined;
}) {
  await options.blobs.write({
    id: randomUUID(),
    mimeType: options.response.mimeType,
    bytes: options.response.bytes,
    createdAt: new Date().toISOString(),
    metadata: options.createBlobMetadata?.({
      request: options.request,
      response: options.response,
    }),
  });
}

async function* createSingleChunkStream(response: TextToSpeechResponse): AsyncIterable<AudioChunk> {
  yield {
    mimeType: response.mimeType,
    bytes: response.bytes,
  };
}
