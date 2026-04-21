import { describe, expect, it } from 'vitest';

import { RuntimeSpeechRenderer } from '../integrations/runtime/runtime-speech-renderer.js';
import { collectStreamingTextToSpeech } from '../integrations/gateways/buffered-streaming-tts.js';

describe('runtime speech renderer', () => {
  it('renders message text from a step through batch tts', async () => {
    const renderer = new RuntimeSpeechRenderer({
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
    });

    const speech = await renderer.renderStep({
      id: 'step-1',
      stepNumber: 1,
      inputs: [],
      context: [],
      modelResponse: {
        segments: [{ kind: 'message', text: 'hello speech' }],
        actionRequests: [],
        continuation: 'stop',
      },
      modelUsage: null,
      modelMetadata: null,
      actionResults: [],
      continuation: 'stop',
      startedAt: '2026-04-19T14:00:00.000Z',
      finishedAt: '2026-04-19T14:00:01.000Z',
    });

    expect(new TextDecoder().decode(speech?.bytes)).toBe('hello speech');
  });

  it('renders message text from a step through streaming tts', async () => {
    const renderer = new RuntimeSpeechRenderer({
      tts: {
        async synthesize(request) {
          return {
            mimeType: 'audio/wav',
            bytes: new TextEncoder().encode(request.text),
          };
        },
      },
    });

    const stream = await renderer.renderStepStream({
      id: 'step-1',
      stepNumber: 1,
      inputs: [],
      context: [],
      modelResponse: {
        segments: [{ kind: 'message', text: 'stream speech' }],
        actionRequests: [],
        continuation: 'stop',
      },
      modelUsage: null,
      modelMetadata: null,
      actionResults: [],
      continuation: 'stop',
      startedAt: '2026-04-19T14:00:00.000Z',
      finishedAt: '2026-04-19T14:00:01.000Z',
    });
    const collected = await collectStreamingTextToSpeech(stream!);

    expect(new TextDecoder().decode(collected.bytes)).toBe('stream speech');
  });
});
