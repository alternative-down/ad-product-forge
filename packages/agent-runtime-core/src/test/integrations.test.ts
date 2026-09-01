import { describe, expect, it } from 'vitest';

import { MiniMaxImageGenerationGateway } from '../integrations/providers/minimax-image.js';
import { MiniMaxTextToSpeechGateway } from '../integrations/providers/minimax-speech.js';

describe('MiniMax integrations', () => {
  it('decodes TTS audio from hex payloads', async () => {
    const gateway = new MiniMaxTextToSpeechGateway({
      apiKey: 'test',
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: {
              audio: Buffer.from('hello', 'utf8').toString('hex'),
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    });
    const result = await gateway.synthesize({
      text: 'hello',
    });

    expect(Buffer.from(result.bytes).toString('utf8')).toBe('hello');
  });

  it('decodes generated images from base64 payloads', async () => {
    const gateway = new MiniMaxImageGenerationGateway({
      apiKey: 'test',
      fetch: async () =>
        new Response(
          JSON.stringify({
            data: {
              image_base64: [Buffer.from('image', 'utf8').toString('base64')],
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    });
    const result = await gateway.generate({
      prompt: 'draw a forge',
    });

    expect(Buffer.from(result.images[0]?.bytes ?? []).toString('utf8')).toBe('image');
  });
});
