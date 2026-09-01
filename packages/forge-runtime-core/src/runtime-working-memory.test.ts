import { describe, expect, it } from 'vitest';

import {
  createUpdateWorkingMemoryTool,
  createWorkingMemoryPlugin,
} from './runtime-working-memory.js';

function createWorkingMemoryStore() {
  let record: {
    threadId: string;
    resourceId: string;
    workingMemory: string;
    updatedAt: string;
  } | null = null;

  return {
    store: {
      async read() {
        return record;
      },
      async write(input: { threadId: string; resourceId: string; workingMemory: string }) {
        record = {
          ...input,
          updatedAt: new Date().toISOString(),
        };
      },
    },
    getRecord() {
      return record;
    },
  };
}

describe('runtime working memory', () => {
  it('updates working memory through the tool', async () => {
    const memory = createWorkingMemoryStore();
    const tool = createUpdateWorkingMemoryTool({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      store: memory.store,
    });

    const result = await tool.execute(
      {
        workingMemory: {
          direction: {
            currentMission: 'Keep the release notes concise.',
          },
        },
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-1',
        stepNumber: 1,
        toolCallId: 'tool-1',
      },
    );

    expect(result).toEqual({ updated: true });
    expect(memory.getRecord()?.workingMemory).toBe(
      JSON.stringify({
        direction: {
          currentMission: 'Keep the release notes concise.',
        },
      }),
    );
  });

  it('merges only the provided working memory fields', async () => {
    const memory = createWorkingMemoryStore();
    const tool = createUpdateWorkingMemoryTool({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      store: memory.store,
    });

    await memory.store.write({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      workingMemory: JSON.stringify({
        identity: {
          roleCore: 'Own frontend delivery',
        },
        direction: {
          currentMission: 'Ship the redesign',
        },
      }),
    });
    await tool.execute(
      {
        workingMemory: {
          direction: {
            successDefinition: 'Users can navigate the new IA without friction.',
          },
        },
      },
      {
        runtimeId: 'runtime-1',
        stepId: 'step-2',
        stepNumber: 2,
        toolCallId: 'tool-2',
      },
    );

    expect(memory.getRecord()?.workingMemory).toBe(
      JSON.stringify({
        identity: {
          roleCore: 'Own frontend delivery',
        },
        direction: {
          currentMission: 'Ship the redesign',
          successDefinition: 'Users can navigate the new IA without friction.',
        },
      }),
    );
  });

  it('provides working memory as runtime context', async () => {
    const memory = createWorkingMemoryStore();

    await memory.store.write({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      workingMemory: 'Track the active deployment issue.',
    });

    const plugin = createWorkingMemoryPlugin({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      store: memory.store,
    });
    const entries = await plugin.provideContext?.({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      pendingInputs: [],
      steps: [],
      lastActionResults: [],
    });

    expect(entries).toHaveLength(1);
    expect(entries?.[0]?.kind).toBe('working-memory');
  });
});
