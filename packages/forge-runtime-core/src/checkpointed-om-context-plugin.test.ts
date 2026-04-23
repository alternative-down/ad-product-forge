import { describe, expect, it } from 'vitest';

import { createCheckpointedOmContextPlugin } from './checkpointed-om-context-plugin.js';

describe('createCheckpointedOmContextPlugin', () => {
  it('renders checkpoint summary, reflections, and active observations into system context entries', async () => {
    const plugin = createCheckpointedOmContextPlugin({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      stateStore: {
        async loadState() {
          return {
            version: 1 as const,
            checkpointGeneration: 3,
            checkpointSummary: {
              text: 'The deployment branch already contains the migration fix.',
              tokenCount: 12,
              upToGeneration: 3,
              updatedAt: '2026-04-22T00:00:00.000Z',
            },
            observationBlocks: [{
              id: 'observation-1',
              text: 'The agent still needs to verify the rollout on staging.',
              tokenCount: 10,
              createdAt: '2026-04-22T00:00:00.000Z',
              lastObservedAt: '2026-04-22T00:00:00.000Z',
              reflectedGeneration: null,
            }],
            activeReflectionBlocks: [{
              recordId: 'reflection-1',
              generationCount: 4,
              tokenCount: 10,
              createdAt: '2026-04-22T00:00:00.000Z',
              text: 'Recent rollout work is concentrated on migration validation and staging confirmation.',
            }],
            latestMetrics: null,
          };
        },
        async saveState() {
          throw new Error('not used');
        },
      },
    });

    const entries = await plugin.provideContext?.({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      pendingInputs: [],
      steps: [],
      lastActionResults: [],
    });

    expect(entries?.map((entry) => ({
      kind: entry.kind,
      text: entry.content?.[0]?.type === 'text' ? entry.content[0].text : null,
    }))).toEqual([
      {
        kind: 'system-instruction',
        text: expect.stringContaining('Checkpoint summary:'),
      },
      {
        kind: 'system-instruction',
        text: expect.stringContaining('Active reflections:'),
      },
      {
        kind: 'system-instruction',
        text: expect.stringContaining('Active observations:'),
      },
    ]);
  });

  it('skips malformed om blocks without text', async () => {
    const plugin = createCheckpointedOmContextPlugin({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      stateStore: {
        async loadState() {
          return {
            version: 1 as const,
            checkpointGeneration: 3,
            checkpointSummary: {
              text: null,
              tokenCount: 12,
              upToGeneration: 3,
              updatedAt: '2026-04-22T00:00:00.000Z',
            },
            observationBlocks: [{
              id: 'observation-1',
              text: undefined,
              tokenCount: 10,
              createdAt: '2026-04-22T00:00:00.000Z',
              lastObservedAt: '2026-04-22T00:00:00.000Z',
              reflectedGeneration: null,
            }],
            activeReflectionBlocks: [{
              recordId: 'reflection-1',
              generationCount: 4,
              tokenCount: 10,
              createdAt: '2026-04-22T00:00:00.000Z',
              text: undefined,
            }],
            latestMetrics: null,
          } as unknown as PluginStateLoadStateShape;
        },
        async saveState() {
          throw new Error('not used');
        },
      },
    });

    const entries = await plugin.provideContext?.({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      pendingInputs: [],
      steps: [],
      lastActionResults: [],
    });

    expect(entries).toEqual([]);
  });
});

type PluginStateLoadStateShape = {
  version: 1;
  checkpointGeneration: number;
  checkpointSummary: {
    text: string;
    tokenCount: number;
    upToGeneration: number;
    updatedAt: string;
  } | null;
  observationBlocks: Array<{
    id: string;
    text: string;
    tokenCount: number;
    createdAt: string;
    lastObservedAt: string;
    reflectedGeneration: number | null;
  }>;
  activeReflectionBlocks: Array<{
    recordId: string;
    generationCount: number;
    tokenCount: number;
    createdAt: string;
    text: string;
  }>;
  latestMetrics: null;
};
