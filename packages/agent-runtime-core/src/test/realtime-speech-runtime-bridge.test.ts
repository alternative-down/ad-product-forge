import { describe, expect, it } from 'vitest';

import { RealtimeSpeechRuntimeBridge } from '../integrations/runtime/realtime-speech-runtime-bridge.js';

describe('realtime speech runtime bridge', () => {
  it('dispatches final transcription events into the runtime target', async () => {
    const dispatched: Array<{ type: string; payload: Record<string, unknown> }> = [];
    let transcriptionHandler:
      | ((event: {
          id: string;
          text: string;
          isFinal: boolean;
          language?: string;
        }) => Promise<void> | void)
      | undefined;
    const bridge = new RealtimeSpeechRuntimeBridge({
      runtime: {
        async dispatch(input) {
          dispatched.push({
            type: input.type,
            payload: input.payload as Record<string, unknown>,
          });
        },
      },
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
    const session = await bridge.startSession();

    await transcriptionHandler?.({
      id: 'event-1',
      text: 'hello world',
      isFinal: true,
      language: 'en',
    });

    expect(session.listTranscriptions()).toHaveLength(1);
    expect(dispatched[0]?.type).toBe('speech-transcript');
    expect(dispatched[0]?.payload.text).toBe('hello world');
  });
});
