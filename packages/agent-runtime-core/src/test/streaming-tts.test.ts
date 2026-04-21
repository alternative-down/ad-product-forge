import { describe, expect, it } from 'vitest';

import {
  BufferedStreamingTextToSpeechGateway,
  collectStreamingTextToSpeech,
  consumeStreamingTextToSpeech,
} from '../integrations/gateways/buffered-streaming-tts.js';

describe('streaming text to speech helpers', () => {
  it('adapts batch tts into a streaming response and can collect it back', async () => {
    const gateway = new BufferedStreamingTextToSpeechGateway({
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
    });

    const streamResponse = await gateway.synthesizeStream({
      text: 'hello stream',
    });
    const collected = await collectStreamingTextToSpeech(streamResponse);

    expect(collected.mimeType).toBe('audio/wav');
    expect(new TextDecoder().decode(collected.bytes)).toBe('hello stream');
  });

  it('consumes streamed chunks through a callback', async () => {
    const gateway = new BufferedStreamingTextToSpeechGateway({
      tts: {
        async synthesize() {
          return {
            mimeType: 'audio/wav',
            bytes: new Uint8Array([1, 2, 3]),
          };
        },
      },
    });
    const chunks: number[] = [];
    const response = await gateway.synthesizeStream({
      text: 'ignored',
    });

    await consumeStreamingTextToSpeech(response, async (chunk) => {
      chunks.push(...chunk.bytes);
    });

    expect(chunks).toEqual([1, 2, 3]);
  });
});
