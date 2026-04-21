import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { createUsageMeterPlugin } from '../integrations/extensions/usage-meter.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';
import { InMemoryUsageMeter } from '../integrations/usage/in-memory-usage-meter.js';

describe('InMemoryUsageMeter', () => {
  it('records and lists compute usage per runtime', async () => {
    const meter = new InMemoryUsageMeter();

    await meter.record({
      runtimeId: 'runtime-1',
      provider: 'openai',
      modelId: 'gpt-test',
      inputTokens: 100,
      outputTokens: 20,
      recordedAt: '2026-01-01T00:00:00.000Z',
    });

    const records = await meter.list('runtime-1');

    expect(records).toHaveLength(1);
    expect(records[0]?.inputTokens).toBe(100);
  });

  it('records usage from runtime steps through the plugin', async () => {
    const meter = new InMemoryUsageMeter();
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-usage',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
        usage: {
          inputTokens: 30,
          outputTokens: 10,
          totalTokens: 40,
        },
        metadata: {
          provider: 'test-provider',
          modelId: 'test-model',
        },
      })),
    });

    runtime.use(createUsageMeterPlugin({
      meter,
    }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { text: 'hello' },
    });
    await runtime.run();

    const records = await meter.list('runtime-usage');

    expect(records).toHaveLength(1);
    expect(records[0]?.provider).toBe('test-provider');
    expect(records[0]?.modelId).toBe('test-model');
    expect(records[0]?.inputTokens).toBe(30);
  });
});
