import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { getStepContextParts } from '../core/step-context.js';
import type { StepContextPart } from '../core/types.js';
import {
  createMultimodalContextFormatter,
  createMultimodalRuntimeInputPayload,
  isMultimodalRuntimeInputPayload,
} from '../integrations/runtime/multimodal-input.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('multimodal input integration', () => {
  it('detects multimodal runtime payloads', () => {
    expect(isMultimodalRuntimeInputPayload({
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'image', mimeType: 'image/png', bytes: new Uint8Array([1]) },
      ],
    })).toBe(true);
    expect(isMultimodalRuntimeInputPayload({
      text: 'hello',
    })).toBe(false);
  });

  it('formats multimodal input payloads into step context parts', async () => {
    const seenParts: StepContextPart[][] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'multimodal-input-runtime',
      contextFormatter: createMultimodalContextFormatter(),
      model: new FakeStepModelAdapter((request) => {
        seenParts.push(...request.context.map((entry) => getStepContextParts(entry)));

        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'vision-frame',
      payload: createMultimodalRuntimeInputPayload([
        { type: 'text', text: 'screen frame' },
        { type: 'image', mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) },
      ]),
    });
    await runtime.step();

    expect(seenParts).toEqual([[
      { type: 'text', text: 'screen frame' },
      { type: 'image', mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) },
    ]]);
  });

  it('falls back to the default formatter for plain payloads', async () => {
    const seenKinds: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'multimodal-fallback-runtime',
      contextFormatter: createMultimodalContextFormatter(),
      model: new FakeStepModelAdapter((request) => {
        seenKinds.push(...request.context.map((entry) => entry.kind));

        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'hello' },
    });
    await runtime.step();

    expect(seenKinds).toEqual(['input:event']);
  });
});
