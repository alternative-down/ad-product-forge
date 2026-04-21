import { describe, expect, it } from 'vitest';

import { RuntimeInputBridge } from '../integrations/runtime/runtime-input-bridge.js';

describe('runtime input bridge', () => {
  it('pushes mapped events into the runtime target', async () => {
    const dispatched: Array<{ id: string; type: string; payload: Record<string, unknown> }> = [];
    const bridge = new RuntimeInputBridge({
      runtime: {
        async dispatch(input) {
          dispatched.push({
            id: input.id,
            type: input.type,
            payload: input.payload as Record<string, unknown>,
          });
        },
      },
      eventToInput(event: { text: string }) {
        return {
          type: 'external-event',
          payload: {
            text: event.text,
          },
        };
      },
    });

    await bridge.push({
      text: 'hello',
    });

    expect(dispatched[0]?.type).toBe('external-event');
    expect(dispatched[0]?.payload.text).toBe('hello');
  });
});
