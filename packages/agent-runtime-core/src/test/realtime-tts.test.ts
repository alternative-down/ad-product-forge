import { describe, expect, it } from 'vitest';

import { BufferedRealtimeTextToSpeechGateway } from '../integrations/gateways/buffered-realtime-tts.js';

describe('realtime text to speech', () => {
  it('adapts batch text to speech to a realtime session', async () => {
    const gateway = new BufferedRealtimeTextToSpeechGateway({
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
    });
    const heard: string[] = [];
    const session = await gateway.createSession({
      onAudioChunk: async ({ chunk }) => {
        heard.push(new TextDecoder().decode(chunk.bytes));
      },
    });

    await session.pushText({
      text: 'hello realtime',
      isFinal: true,
    });
    await session.close();

    expect(heard).toEqual(['hello realtime']);
  });
});
