import { describe, expect, it } from 'vitest';

import { RuntimeEventStream } from '../core/runtime-events.js';
import { AgentRuntime } from '../core/runtime.js';
import { RealtimeSpeechRuntimeBridge } from '../integrations/runtime/realtime-speech-runtime-bridge.js';
import { RuntimeMessageStream } from '../integrations/runtime/runtime-message-stream.js';
import { RuntimeSpeechRenderer } from '../integrations/runtime/runtime-speech-renderer.js';
import { ActiveRuntimeVoiceSession, RuntimeVoiceSession } from '../integrations/runtime/runtime-voice-session.js';
import { collectStreamingTextToSpeech } from '../integrations/gateways/buffered-streaming-tts.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime voice session', () => {
  it('connects realtime speech input to runtime output through batch tts', async () => {
    const eventStream = new RuntimeEventStream();
    const messageStream = new RuntimeMessageStream({
      subscribe: eventStream.subscribe.bind(eventStream),
    });
    const runtime = new AgentRuntime({
      runtimeId: 'voice-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'voice reply' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });
    let transcriptionHandler:
      | ((event: { id: string; text: string; isFinal: boolean; language?: string }) => Promise<void> | void)
      | undefined;
    const renderedAudio: string[] = [];

    runtime.observe(eventStream.createObserver());

    const speechBridge = new RealtimeSpeechRuntimeBridge({
      runtime,
      stt: {
        async createSession(options) {
          transcriptionHandler = options?.onTranscription;

          return {
            id: 'stt-session',
            async pushAudio() {},
            async close() {},
          };
        },
      },
    });
    const voiceSession = new RuntimeVoiceSession({
      speechBridge,
      messageStream,
      renderer: new RuntimeSpeechRenderer({
        tts: {
          async synthesize(request) {
            return {
              mimeType: 'audio/wav',
              bytes: new TextEncoder().encode(request.text),
            };
          },
        },
      }),
      runtimeId: 'voice-runtime',
      onSpeech: async ({ response }) => {
        renderedAudio.push(new TextDecoder().decode(response.bytes));
      },
    });
    const activeSession = await voiceSession.start();

    expect(activeSession).toBeInstanceOf(ActiveRuntimeVoiceSession);

    await transcriptionHandler?.({
      id: 'transcript-1',
      text: 'hello runtime',
      isFinal: true,
      language: 'en',
    });
    await runtime.run();

    expect(activeSession.listTranscriptions()).toHaveLength(1);
    expect(renderedAudio).toEqual(['voice reply']);

    await activeSession.close();
    messageStream.close();
  });

  it('can render runtime output through streaming tts', async () => {
    const eventStream = new RuntimeEventStream();
    const messageStream = new RuntimeMessageStream({
      subscribe: eventStream.subscribe.bind(eventStream),
    });
    const runtime = new AgentRuntime({
      runtimeId: 'voice-stream-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'streamed reply' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });
    let transcriptionHandler:
      | ((event: { id: string; text: string; isFinal: boolean; language?: string }) => Promise<void> | void)
      | undefined;
    let renderedAudio = '';
    let resolveRenderedAudio: (() => void) | null = null;
    const renderedAudioPromise = new Promise<void>((resolve) => {
      resolveRenderedAudio = resolve;
    });

    runtime.observe(eventStream.createObserver());

    const speechBridge = new RealtimeSpeechRuntimeBridge({
      runtime,
      stt: {
        async createSession(options) {
          transcriptionHandler = options?.onTranscription;

          return {
            id: 'stt-stream-session',
            async pushAudio() {},
            async close() {},
          };
        },
      },
    });
    const voiceSession = new RuntimeVoiceSession({
      speechBridge,
      messageStream,
      renderer: new RuntimeSpeechRenderer({
        tts: {
          async synthesize(request) {
            return {
              mimeType: 'audio/wav',
              bytes: new TextEncoder().encode(request.text),
            };
          },
        },
      }),
      runtimeId: 'voice-stream-runtime',
      renderMode: 'stream',
      onSpeechStream: async ({ response }) => {
        const collected = await collectStreamingTextToSpeech(response);

        renderedAudio = new TextDecoder().decode(collected.bytes);
        resolveRenderedAudio?.();
      },
    });
    const activeSession = await voiceSession.start();

    await transcriptionHandler?.({
      id: 'transcript-1',
      text: 'hello runtime',
      isFinal: true,
      language: 'en',
    });
    await runtime.run();
    await renderedAudioPromise;

    expect(renderedAudio).toBe('streamed reply');

    await activeSession.close();
    messageStream.close();
  });
});
