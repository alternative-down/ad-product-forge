import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';

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
    async createCheckpoint() {
      return state;
    },
  } as unknown as CheckpointedConversationMemory;
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
  it('projects checkpointed conversation state into forge OM state without inventing checkpoints', async () => {
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
        recentTokenCount: 6,
        overflowMessageCount: 0,
        overflowTokenCount: 0,
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
      limits: {
        totalContextTokens: 50_000,
        recentRawTokens: 10_000,
        rawObservationBatchTokens: 5_000,
        observationReflectionBatchTokens: 5_000,
      },
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

    expect(savedState?.checkpointGeneration).toBeNull();
    expect(savedState?.checkpointSummary).toBeNull();
    expect(savedState?.observationBlocks).toHaveLength(1);
    expect(savedState?.latestMetrics?.rawMessageCount).toBe(2);
    expect(savedState?.latestMetrics?.recentRawTokenLimit).toBe(10_000);
    expect(savedState?.latestMetrics?.observationTriggerTokenLimit).toBe(5_000);
    expect(savedState?.latestMetrics?.reflectionTriggerTokenLimit).toBe(5_000);
    expect(savedState?.latestMetrics?.reflectionBudget).toBe(30_000);
    expect(checkpointPayload).toBeNull();
  });

  it('moves excess raw tokens into overflow metrics when the raw budget is exceeded', async () => {
    const updatedAt = new Date().toISOString();
    const state = createConversationMemory({
      threadId: 'thread-1',
      checkpointMessageId: null,
      recentMessageIds: ['message-1', 'message-2'],
      overflowMessageIds: [],
      observations: [],
      metrics: {
        recentMessageCount: 1,
        recentTokenCount: 5,
        overflowMessageCount: 1,
        overflowTokenCount: 5,
        observationCount: 0,
        totalActiveMessageCount: 2,
      },
      updatedAt,
    });
    const messages: ConversationMessage[] = [
      {
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        parts: [{ type: 'text', text: '12345678901234567890' }],
        createdAt: updatedAt,
      },
      {
        id: 'message-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'abcdefghijabcdefghij' }],
        createdAt: updatedAt,
      },
    ];
    const store = createStateStore();
    const observer = createCheckpointedOmCompatibilityObserver({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      conversationStore: createConversationStore(messages),
      conversationMemory: state,
      stateStore: store.store,
      limits: {
        totalContextTokens: 50_000,
        recentRawTokens: 5,
        rawObservationBatchTokens: 5_000,
        observationReflectionBatchTokens: 5_000,
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

    expect(savedState?.latestMetrics?.recentRawMessageCount).toBe(1);
    expect(savedState?.latestMetrics?.recentRawTokenCount).toBe(5);
    expect(savedState?.latestMetrics?.overflowMessageCount).toBe(1);
    expect(savedState?.latestMetrics?.overflowTokenCount).toBe(5);
  });

  it('projects older observations into reflections when the active observation budget is exceeded', async () => {
    const updatedAt = new Date().toISOString();
    const state = createConversationMemory({
      threadId: 'thread-1',
      checkpointMessageId: 'message-2',
      recentMessageIds: ['message-3'],
      overflowMessageIds: [],
      observations: [
        {
          id: 'observation-1',
          text: 'First observation block',
          sourceMessageIds: ['message-1'],
          createdAt: updatedAt,
          units: 6,
        },
        {
          id: 'observation-2',
          text: 'Second observation block',
          sourceMessageIds: ['message-2'],
          createdAt: updatedAt,
          units: 6,
        },
      ],
      metrics: {
        recentMessageCount: 1,
        recentTokenCount: 1,
        overflowMessageCount: 0,
        overflowTokenCount: 0,
        observationCount: 2,
        totalActiveMessageCount: 1,
      },
      updatedAt,
    });
    const store = createStateStore();
    let checkpointPayload: {
      reflections: Array<{ recordId: string }>;
      observations: Array<{ blockId: string }>;
    } | null = null;

    const observer = createCheckpointedOmCompatibilityObserver({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      conversationStore: createConversationStore([{
        id: 'message-3',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'latest' }],
        createdAt: updatedAt,
      }]),
      conversationMemory: state,
      stateStore: store.store,
      limits: {
        totalContextTokens: 25,
        recentRawTokens: 10,
        rawObservationBatchTokens: 5,
        observationReflectionBatchTokens: 6,
      },
      reflectionModel: new MockLanguageModelV3({
        doGenerate: async () => ({
          content: [{
            type: 'text',
            text: '<reflection>Reflection for the first observation.</reflection>',
          }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 1,
              text: 1,
              reasoning: 0,
            },
          },
          warnings: [],
        }),
      }),
      async onCheckpointAdvanced(input) {
        checkpointPayload = {
          reflections: input.reflections.map((reflection) => ({
            recordId: reflection.recordId,
          })),
          observations: input.observations.map((observation) => ({
            blockId: observation.blockId,
          })),
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
    const archivedPayload = checkpointPayload as {
      reflections: Array<{ recordId: string }>;
      observations: Array<{ blockId: string }>;
    } | null;

    expect(savedState?.latestMetrics?.activeObservationBlockCount).toBe(0);
    expect(savedState?.latestMetrics?.activeReflectionBlockCount).toBe(0);
    expect(savedState?.observationBlocks.filter((block) => block.reflectedGeneration === null)).toHaveLength(0);
    expect(savedState?.observationBlocks.filter((block) => block.reflectedGeneration !== null)).toHaveLength(0);

    if (!archivedPayload) {
      throw new Error('expected checkpoint payload');
    }

    expect(archivedPayload.reflections).toHaveLength(2);
    expect(archivedPayload.observations).toHaveLength(2);
    expect(archivedPayload.observations.map((observation) => observation.blockId)).toEqual([
      'observation-1',
      'observation-2',
    ]);
  });
});
