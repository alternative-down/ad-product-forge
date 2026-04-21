import { describe, expect, it } from 'vitest';

import { RuntimeDispatchBus } from '../integrations/dispatch/runtime-dispatch-bus.js';

describe('runtime dispatch bus', () => {
  it('dispatches an input to matching subscriptions', async () => {
    const receivedBy: string[] = [];
    const bus = new RuntimeDispatchBus();

    bus.subscribe({
      id: 'all',
      target: {
        async dispatch() {
          receivedBy.push('all');
        },
      },
    });
    bus.subscribe({
      id: 'tick-only',
      filter(input) {
        return input.type === 'tick';
      },
      target: {
        async dispatch() {
          receivedBy.push('tick-only');
        },
      },
    });

    const dispatchedTo = await bus.dispatch({
      id: 'input-1',
      type: 'tick',
      payload: { value: 1 },
    });

    expect(dispatchedTo).toEqual(['all', 'tick-only']);
    expect(receivedBy).toEqual(['all', 'tick-only']);
  });
});
