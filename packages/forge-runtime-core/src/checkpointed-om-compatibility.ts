import type {
  CheckpointedConversationMemory,
  CheckpointedConversationState,
  ConversationStore,
  RuntimeObserver,
} from 'agent-runtime-core/integrations';

import type {
  CheckpointedOmCheckpointPackageInput,
  CheckpointedOmState,
  CheckpointedOmStateStore,
} from './checkpointed-om.js';

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function createEmptyCheckpointedOmState(): CheckpointedOmState {
  return {
    version: 1,
    checkpointGeneration: null,
    checkpointSummary: null,
    observationBlocks: [],
    activeReflectionBlocks: [],
    latestMetrics: null,
  };
}

export type CheckpointedOmCompatibilityObserverOptions = {
  threadId: string;
  resourceId: string;
  conversationStore: ConversationStore;
  conversationMemory: CheckpointedConversationMemory;
  stateStore: CheckpointedOmStateStore;
  limits: {
    totalContextTokens: number;
    recentRawTokens: number;
    rawObservationBatchTokens: number;
    observationReflectionBatchTokens: number;
  };
  onCheckpointAdvanced?: (input: CheckpointedOmCheckpointPackageInput) => Promise<void>;
};

export function createCheckpointedOmCompatibilityObserver(
  input: CheckpointedOmCompatibilityObserverOptions,
): RuntimeObserver {
  let lastCheckpointMessageId: string | null = null;

  return {
    name: 'forge-checkpointed-om-compatibility',
    async onAfterStep() {
      const state = await input.conversationMemory.getState();
      const messages = await input.conversationStore.listMessages({
        threadId: input.threadId,
      });
      const compatibleState = buildCompatibleState(state, messages, input.limits);
      const previousCheckpointMessageId = lastCheckpointMessageId;

      await input.stateStore.saveState({
        threadId: input.threadId,
        resourceId: input.resourceId,
        state: compatibleState,
      });

      lastCheckpointMessageId = state.checkpointMessageId;

      if (
        !input.onCheckpointAdvanced
        || !state.checkpointMessageId
        || state.checkpointMessageId === previousCheckpointMessageId
        || !compatibleState.checkpointSummary
        || compatibleState.checkpointGeneration === null
      ) {
        return;
      }

      await input.onCheckpointAdvanced({
        threadId: input.threadId,
        resourceId: input.resourceId,
        fromGeneration:
          previousCheckpointMessageId === null
            ? null
            : compatibleState.checkpointGeneration - 1,
        toGeneration: compatibleState.checkpointGeneration,
        checkpointSummary: compatibleState.checkpointSummary,
        reflections: [],
        observations: compatibleState.observationBlocks.map((observationBlock) => ({
          blockId: observationBlock.id,
          tokenCount: observationBlock.tokenCount,
          createdAt: observationBlock.createdAt,
          lastObservedAt: observationBlock.lastObservedAt,
          reflectedGeneration:
            observationBlock.reflectedGeneration
            ?? compatibleState.checkpointGeneration
            ?? 0,
          text: observationBlock.text,
        })),
      });
    },
  };
}

function buildCompatibleState(
  state: CheckpointedConversationState,
  messages: Array<{
    id: string;
    parts: Array<{ type: string; text?: string }>;
    createdAt: string;
  }>,
  limits: CheckpointedOmCompatibilityObserverOptions['limits'],
): CheckpointedOmState {
  const rawMessages = state.recentMessageIds
    .map((messageId) => messages.find((message) => message.id === messageId))
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
  const rawMessageText = rawMessages
    .flatMap((message) => message.parts)
    .filter((part): part is { type: string; text: string } => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
  const checkpointSummary = state.checkpointMessageId
    ? {
      text: state.observations.length > 0
        ? state.observations[state.observations.length - 1]!.text
        : rawMessageText,
      tokenCount: estimateTokenCount(
        state.observations.length > 0
          ? state.observations[state.observations.length - 1]!.text
          : rawMessageText,
      ),
      upToGeneration: state.observations.length,
      updatedAt: state.updatedAt,
    }
    : null;

  return {
    ...createEmptyCheckpointedOmState(),
    checkpointGeneration: state.checkpointMessageId ? state.observations.length : null,
    checkpointSummary,
    observationBlocks: state.observations.map((observation, index) => ({
      id: observation.id,
      tokenCount: observation.units,
      createdAt: observation.createdAt,
      lastObservedAt: observation.createdAt,
      reflectedGeneration: index + 1 <= state.observations.length ? index + 1 : null,
      text: observation.text,
    })),
    latestMetrics: {
      rawMessageCount: rawMessages.length,
      recentRawMessageCount: rawMessages.length,
      recentRawTokenCount: estimateTokenCount(rawMessageText),
      recentRawTokenLimit: limits.recentRawTokens,
      overflowMessageCount: state.metrics.overflowMessageCount,
      overflowTokenCount: 0,
      observationTriggerTokenLimit: limits.rawObservationBatchTokens,
      activeObservationBlockCount: state.observations.length,
      observationTokenCount: state.observations.reduce((total, observation) => total + observation.units, 0),
      reflectionTriggerTokenLimit: limits.observationReflectionBatchTokens,
      activeReflectionBlockCount: 0,
      reflectionTokenCount: 0,
      reflectionBudget: Math.max(
        0,
        limits.totalContextTokens
          - limits.recentRawTokens
          - limits.rawObservationBatchTokens
          - limits.observationReflectionBatchTokens,
      ),
      checkpointTokenCount: checkpointSummary?.tokenCount ?? 0,
      checkpointSummaryUpToGeneration: checkpointSummary?.upToGeneration ?? null,
      latestThreadMessageAt: messages[messages.length - 1]?.createdAt ?? null,
      updatedAt: state.updatedAt,
    },
  };
}
