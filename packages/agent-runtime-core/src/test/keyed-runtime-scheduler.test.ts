import { describe, expect, it } from 'vitest';

import { InMemoryRuntimeTargetRegistry } from '../integrations/scheduler/in-memory-runtime-target-registry.js';
import { KeyedRuntimeScheduler } from '../integrations/scheduler/keyed-runtime-scheduler.js';

describe('keyed runtime scheduler', () => {
  it('dispatches scheduled input into a runtime resolved by id', async () => {
    const dispatchedInputs: string[] = [];
    const registry = new InMemoryRuntimeTargetRegistry();
    const scheduler = new KeyedRuntimeScheduler({ registry });

    registry.register('runtime-1', {
      async dispatch(input) {
        dispatchedInputs.push(input.id);
      },
      async run() {
        return {
          steps: [],
          snapshot: {
            runtimeId: 'runtime-1',
            status: 'idle',
            pendingInputs: [],
            lastActionResults: [],
            steps: [],
          },
        };
      },
    });

    scheduler.scheduleInput({
      runtimeId: 'runtime-1',
      input: {
        id: 'input-1',
        type: 'tick',
        payload: { value: 1 },
      },
      delayMs: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(dispatchedInputs).toEqual(['input-1']);
    scheduler.dispose();
  });
});
