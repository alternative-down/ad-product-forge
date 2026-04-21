import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { createSkillContextPlugin } from '../integrations/extensions/skill-context.js';
import { InMemorySkillRegistry } from '../integrations/skills/in-memory-skill-registry.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('skill context plugin', () => {
  it('injects relevant skills into runtime context', async () => {
    const registry = new InMemorySkillRegistry();
    const runtime = new AgentRuntime({
      runtimeId: 'skill-runtime',
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'use the build skill' }],
        actionRequests: [],
        continuation: 'stop',
      })),
    });

    await registry.register({
      id: 'build-skill',
      name: 'Build Validation',
      description: 'Run builds and inspect failures',
      instructions: 'Use npm run build and inspect stdout and stderr.',
    });
    runtime.use(createSkillContextPlugin({ registry }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'task',
      payload: { text: 'Please validate the build output before shipping.' },
    });
    const result = await runtime.run();
    const skillEntry = result.steps[0]?.context.find((entry) => entry.kind === 'skill');

    expect(skillEntry?.title).toContain('Build Validation');
  });
});
