import { describe, expect, it } from 'vitest';

import { BufferedRealtimeSpeechToTextGateway } from '../integrations/gateways/buffered-realtime-speech.js';

describe('buffered realtime speech gateway', () => {
  it('buffers audio and emits a final transcription on close', async () => {
    const events: Array<{ text: string; isFinal: boolean }> = [];
    const gateway = new BufferedRealtimeSpeechToTextGateway({
      stt: {
        async transcribe(request) {
          return {
            text: Buffer.from(request.audio.bytes).toString('utf8'),
          };
        },
      },
    });
    const session = await gateway.createSession({
      onTranscription(event) {
        events.push({
          text: event.text,
          isFinal: event.isFinal,
        });
      },
    });

    await session.pushAudio({
      mimeType: 'audio/wav',
      bytes: new TextEncoder().encode('hello '),
    });
    await session.pushAudio({
      mimeType: 'audio/wav',
      bytes: new TextEncoder().encode('world'),
    });
    await session.close();

    expect(events).toEqual([{
      text: 'hello world',
      isFinal: true,
    }]);
  });
});
