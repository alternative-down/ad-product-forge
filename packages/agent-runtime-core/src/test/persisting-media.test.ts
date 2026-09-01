import { describe, expect, it } from 'vitest';

import { InMemoryBlobStore } from '../integrations/assets/in-memory-blob-store.js';
import { PersistingImageGenerationGateway } from '../integrations/gateways/persisting-image-generation.js';
import {
  PersistingStreamingTextToSpeechGateway,
  PersistingTextToSpeechGateway,
} from '../integrations/gateways/persisting-tts.js';
import { PersistingSpeechToTextGateway } from '../integrations/gateways/persisting-stt.js';
import { collectStreamingTextToSpeech } from '../integrations/gateways/buffered-streaming-tts.js';

describe('persisting media gateways', () => {
  it('persists synthesized audio blobs from batch tts', async () => {
    const blobs = new InMemoryBlobStore();
    const gateway = new PersistingTextToSpeechGateway({
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
      blobs,
      createBlobMetadata: ({ request }) => ({
        text: request.text,
      }),
    });

    const response = await gateway.synthesize({
      text: 'hello audio',
    });
    const records = await blobs.list();

    expect(new TextDecoder().decode(response.bytes)).toBe('hello audio');
    expect(records).toHaveLength(1);
    expect(records[0]?.mimeType).toBe('audio/wav');
    expect(records[0]?.metadata).toEqual({
      text: 'hello audio',
    });
  });

  it('persists synthesized audio blobs from streaming tts and preserves playback data', async () => {
    const blobs = new InMemoryBlobStore();
    const gateway = new PersistingStreamingTextToSpeechGateway({
      tts: {
        async synthesizeStream(request) {
          return {
            mimeType: 'audio/wav',
            stream: createAudioStream(request.text),
          };
        },
      },
      blobs,
    });

    const response = await gateway.synthesizeStream({
      text: 'hello stream audio',
    });
    const collected = await collectStreamingTextToSpeech(response);
    const records = await blobs.list();

    expect(new TextDecoder().decode(collected.bytes)).toBe('hello stream audio');
    expect(records).toHaveLength(1);
    expect(new TextDecoder().decode(records[0]?.bytes ?? new Uint8Array())).toBe(
      'hello stream audio',
    );
  });

  it('persists generated images', async () => {
    const blobs = new InMemoryBlobStore();
    const gateway = new PersistingImageGenerationGateway({
      imageGeneration: {
        async generate(request) {
          return {
            images: [
              {
                mimeType: 'image/png',
                bytes: new TextEncoder().encode(`${request.prompt}:1`),
              },
              {
                mimeType: 'image/png',
                bytes: new TextEncoder().encode(`${request.prompt}:2`),
              },
            ],
          };
        },
      },
      blobs,
      createBlobMetadata: ({ request, imageIndex }) => ({
        prompt: request.prompt,
        imageIndex,
      }),
    });

    const response = await gateway.generate({
      prompt: 'castle',
    });
    const records = await blobs.list();

    expect(response.images).toHaveLength(2);
    expect(records).toHaveLength(2);
    expect(records[0]?.metadata).toEqual({
      prompt: 'castle',
      imageIndex: 0,
    });
    expect(records[1]?.metadata).toEqual({
      prompt: 'castle',
      imageIndex: 1,
    });
  });

  it('persists transcribed audio input blobs', async () => {
    const blobs = new InMemoryBlobStore();
    const gateway = new PersistingSpeechToTextGateway({
      stt: {
        async transcribe() {
          return {
            text: 'transcribed audio',
          };
        },
      },
      blobs,
      createBlobMetadata: ({ response }) => ({
        transcript: response.text,
      }),
    });

    const response = await gateway.transcribe({
      audio: {
        mimeType: 'audio/wav',
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
      language: 'en',
    });
    const records = await blobs.list();

    expect(response.text).toBe('transcribed audio');
    expect(records).toHaveLength(1);
    expect(records[0]?.mimeType).toBe('audio/wav');
    expect(records[0]?.metadata).toEqual({
      transcript: 'transcribed audio',
    });
  });
});

async function* createAudioStream(text: string) {
  const bytes = new TextEncoder().encode(text);
  const halfwayIndex = Math.ceil(bytes.length / 2);

  yield {
    mimeType: 'audio/wav',
    bytes: bytes.slice(0, halfwayIndex),
  };
  yield {
    mimeType: 'audio/wav',
    bytes: bytes.slice(halfwayIndex),
  };
}
