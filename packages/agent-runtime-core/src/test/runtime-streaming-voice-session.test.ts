import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { BufferedRealtimeTextToSpeechGateway } from '../integrations/gateways/buffered-realtime-tts.js';
import { RuntimeMessageChunkStream } from '../integrations/runtime/runtime-message-chunk-stream.js';
import { RuntimeStreamingVoiceSession } from '../integrations/runtime/runtime-streaming-voice-session.js';
import { FakeStreamingStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime streaming voice session', () => {
  it('renders message chunks through realtime text to speech', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'stream-voice-runtime',
      model: new FakeStreamingStepModelAdapter(() => ({
        segments: [
          { kind: 'message', text: 'hello ' },
          { kind: 'message', text: 'world' },
        ],
        actionRequests: [],
        continuation: 'stop',
      })),
    });
    const heard: string[] = [];

    await runtime.dispatch({
      id: 'input-1',
      type: 'chat',
      payload: { text: 'start' },
    });

    const stepStream = await runtime.streamStep();

    expect(stepStream).not.toBeNull();

    const messageStream = new RuntimeMessageChunkStream(stepStream!.events);
    const voiceSession = new RuntimeStreamingVoiceSession({
      messageStream,
      tts: new BufferedRealtimeTextToSpeechGateway({
        tts: {
          async synthesize(request) {
            return {
              mimeType: 'audio/wav',
              bytes: new TextEncoder().encode(request.text),
            };
          },
        },
      }),
      runtimeId: 'stream-voice-runtime',
      onAudioChunk: async ({ chunk }) => {
        heard.push(new TextDecoder().decode(chunk.bytes));
      },
    });
    const activeSession = await voiceSession.start();

    await Promise.all([
      stepStream!.completion,
      activeSession.completion,
    ]);

    expect(heard).toEqual(['hello ', 'world']);
  });
});
