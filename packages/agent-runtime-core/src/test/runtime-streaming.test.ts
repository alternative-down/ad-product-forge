import { describe, expect, it } from 'vitest';

import { createTextStepContextEntry, getStepContextParts } from '../core/step-context.js';
import { AgentRuntime } from '../core/runtime.js';
import { RuntimeMessageChunkStream } from '../integrations/runtime/runtime-message-chunk-stream.js';
import { FakeStepModelAdapter, FakeStreamingStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('runtime streaming', () => {
  it('streams message deltas from a streaming model', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-streaming',
      model: new FakeStreamingStepModelAdapter(() => ({
        segments: [
          { kind: 'message', text: 'hello ' },
          { kind: 'message', text: 'world' },
        ],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'chat',
      payload: { text: 'stream' },
    });

    const stepStream = await runtime.streamStep();

    expect(stepStream).not.toBeNull();

    const chunkStream = new RuntimeMessageChunkStream(stepStream!.events);
    const chunks: string[] = [];

    for await (const event of chunkStream) {
      chunks.push(event.text);
    }

    const result = await stepStream!.completion;

    expect(chunks).toEqual(['hello ', 'world']);
    expect(result.record.modelResponse.segments).toEqual([
      { kind: 'message', text: 'hello ' },
      { kind: 'message', text: 'world' },
    ]);
  });

  it('falls back to a completed stream when the model is batch-only', async () => {
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-streaming-fallback',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'batch result' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'run' },
    });

    const stepStream = await runtime.streamStep();

    expect(stepStream).not.toBeNull();

    const events = [];

    for await (const event of stepStream!.events) {
      events.push(event);
    }

    const result = await stepStream!.completion;

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('step-complete');
    expect(result.record.modelResponse.segments[0]?.text).toBe('batch result');
  });

  it('supports multimodal context entries with image parts', async () => {
    const seenParts: Array<ReturnType<typeof getStepContextParts>> = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-multimodal-context',
      model: new FakeStepModelAdapter((request) => {
        seenParts.push(...request.context.map((entry) => getStepContextParts(entry)));

        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    runtime.use({
      name: 'multimodal-context',
      provideContext() {
        return [
          createTextStepContextEntry({
            id: 'note-1',
            kind: 'note',
            title: 'Note',
            text: 'visible text',
          }),
          {
            id: 'image-1',
            kind: 'vision',
            title: 'Screenshot',
            content: [
              { type: 'text', text: 'current frame' },
              { type: 'image', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
            ],
          },
        ];
      },
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'inspect' },
    });

    await runtime.step();

    expect(seenParts.some((parts) => parts.some((part) => part.type === 'image'))).toBe(true);
  });
});
