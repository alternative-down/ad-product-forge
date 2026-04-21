import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { getStepContextText } from '../core/step-context.js';
import { createInMemoryRecallPlugin } from '../integrations/extensions/in-memory-recall.js';
import { createRecentInputsPlugin } from '../integrations/extensions/recent-inputs.js';
import { createRecentStepsPlugin } from '../integrations/extensions/recent-steps.js';
import { createStaticContextPlugin } from '../integrations/extensions/static-context.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('extensions', () => {
  it('adds recent step output into later context', async () => {
    const seenRecentEntries: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-recent',
      model: new FakeStepModelAdapter((request) => {
        const recentEntry = request.context.find((entry) => entry.kind === 'recent-step');

        if (recentEntry) {
          seenRecentEntries.push(getStepContextText(recentEntry));
        }

        return {
          segments: [{ kind: 'message', text: `step-${request.stepNumber}` }],
          actionRequests: [],
          continuation: request.stepNumber === 1 ? 'continue' : 'stop',
        };
      }),
    });

    runtime.use(createRecentStepsPlugin());

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { message: 'hello' },
    });

    await runtime.run();

    expect(seenRecentEntries).toEqual(['step-1']);
  });

  it('adds static context entries', async () => {
    const seenTitles: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-static',
      model: new FakeStepModelAdapter((request) => {
        seenTitles.push(...request.context.map((entry) => entry.title));
        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    runtime.use(createStaticContextPlugin({
      entries: [{
        id: 'static',
        kind: 'static',
        title: 'Global Instructions',
        text: 'Always stay concise.',
      }],
    }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { message: 'hello' },
    });

    await runtime.step();

    expect(seenTitles).toContain('Global Instructions');
  });

  it('dedupes recalled documents across steps', async () => {
    const recallTitles: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-recall',
      model: new FakeStepModelAdapter((request) => {
        const recallEntries = request.context.filter((entry) => entry.kind === 'recall');
        recallTitles.push(...recallEntries.map((entry) => entry.title));

        return {
          segments: [{ kind: 'message', text: `step-${request.stepNumber}` }],
          actionRequests: [],
          continuation: request.stepNumber === 1 ? 'continue' : 'stop',
        };
      }),
    });

    runtime.use(createInMemoryRecallPlugin({
      maxItems: 2,
      dedupeWindow: 5,
      buildQuery() {
        return 'smith';
      },
      retrieve() {
        return [
          { id: 'doc-1', text: 'Blacksmith pricing rules', score: 0.95 },
          { id: 'doc-2', text: 'Iron supplier notes', score: 0.88 },
        ];
      },
    }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'event',
      payload: { message: 'hello' },
    });

    await runtime.run();

    expect(recallTitles).toEqual([
      'Recall 1 - score 0.95',
      'Recall 2 - score 0.88',
    ]);
  });

  it('injects recent input history without requiring a journal', async () => {
    const seenRecentInputTexts: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-recent-inputs',
      model: new FakeStepModelAdapter((request) => {
        const recentInputEntry = request.context.find((entry) => entry.kind === 'recent-input');

        if (recentInputEntry) {
          seenRecentInputTexts.push(getStepContextText(recentInputEntry));
        }

        return {
          segments: [{ kind: 'message', text: `step-${request.stepNumber}` }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });

    runtime.use(createRecentInputsPlugin({
      maxInputs: 3,
    }));

    await runtime.dispatch({
      id: 'input-1',
      type: 'chat',
      payload: { text: 'first' },
    });
    await runtime.run();

    await runtime.dispatch({
      id: 'input-2',
      type: 'chat',
      payload: { text: 'second' },
    });
    await runtime.run();

    expect(seenRecentInputTexts).toEqual(['{\n  "text": "first"\n}']);
  });
});
