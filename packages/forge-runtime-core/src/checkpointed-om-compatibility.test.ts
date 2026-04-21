import { describe, expect, it } from 'vitest';

import { createCheckpointedOmCompatibilityObserver } from './checkpointed-om-compatibility.js';
import type { CheckpointedOmState, CheckpointedOmStateStore } from './checkpointed-om.js';
import type {
  CheckpointedConversationMemory,
  CheckpointedConversationState,
  ConversationMessage,
  ConversationStore,
} from 'agent-runtime-core/integrations';

function createConversationStore(messages: ConversationMessage[]): ConversationStore {
  return {
    async upsertThread() {},
    async getThread() {
      return null;
    },
    async listThreads() {
      return [];
    },
    async appendMessage() {},
    async listMessages() {
      return messages;
    },
  };
}

function createConversationMemory(state: CheckpointedConversationState): CheckpointedConversationMemory {
  return {
    async getState() {
      return state;
    },
  } as CheckpointedConversationMemory;
}

function createStateStore() {
  let savedState: CheckpointedOmState | null = null;

  const store: CheckpointedOmStateStore = {
    async loadState() {
      return savedState;
    },
    async saveState(input) {
      savedState = input.state;
    },
  };

  return {
    store,
    getSavedState() {
      return savedState;
    },
  };
}

describe('createCheckpointedOmCompatibilityObserver', () => {
  it('projects checkpointed conversation state into forge OM state', async () => {
    const updatedAt = new Date().toISOString();
    const state = createConversationMemory({
      threadId: 'thread-1',
      checkpointMessageId: 'message-2',
      recentMessageIds: ['message-1', 'message-2'],
      overflowMessageIds: [],
      observations: [
        {
          id: 'observation-1',
          text: 'The agent confirmed the deployment issue.',
          sourceMessageIds: ['message-1', 'message-2'],
          createdAt: updatedAt,
          units: 11,
        },
      ],
      metrics: {
        recentMessageCount: 2,
        overflowMessageCount: 0,
        observationCount: 1,
        totalActiveMessageCount: 2,
      },
      updatedAt,
    });
    const messages: ConversationMessage[] = [
      {
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What happened?' }],
        createdAt: updatedAt,
      },
      {
        id: 'message-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'The deployment failed.' }],
        createdAt: updatedAt,
      },
    ];
    const store = createStateStore();
    let checkpointPayload:
      | {
          toGeneration: number;
          checkpointSummary: { text: string };
        }
      | null = null;

    const observer = createCheckpointedOmCompatibilityObserver({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      conversationStore: createConversationStore(messages),
      conversationMemory: state,
      stateStore: store.store,
      async onCheckpointAdvanced(input) {
        checkpointPayload = {
          toGeneration: input.toGeneration,
          checkpointSummary: {
            text: input.checkpointSummary.text,
          },
        };
      },
    });

    await observer.onAfterStep?.({
      runtimeId: 'runtime-1',
      record: {
        id: 'step-1',
        stepNumber: 1,
        inputs: [],
        context: [],
        modelResponse: {
          segments: [],
          actionRequests: [],
          continuation: 'stop',
        },
        modelUsage: null,
        modelMetadata: null,
        actionResults: [],
        continuation: 'stop',
        startedAt: updatedAt,
        finishedAt: updatedAt,
      },
      snapshot: {
        runtimeId: 'runtime-1',
        status: 'idle',
        pendingInputs: [],
        lastActionResults: [],
        steps: [],
      },
    });

    const savedState = store.getSavedState();

    expect(savedState?.checkpointGeneration).toBe(1);
    expect(savedState?.checkpointSummary?.text).toBe('The agent confirmed the deployment issue.');
    expect(savedState?.observationBlocks).toHaveLength(1);
    expect(savedState?.latestMetrics?.rawMessageCount).toBe(2);
    expect(checkpointPayload).toEqual({
      toGeneration: 1,
      checkpointSummary: {
        text: 'The agent confirmed the deployment issue.',
      },
    });
  });
});
