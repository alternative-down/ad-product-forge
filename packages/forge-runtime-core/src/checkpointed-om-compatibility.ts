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

function extractMessageText(message: {
  parts: Array<{ type: string; text?: string }>;
}) {
  return message.parts
    .filter((part): part is { type: string; text: string } => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function partitionActiveMessages(input: {
  messages: Array<{
    id: string;
    parts: Array<{ type: string; text?: string }>;
  }>;
  recentRawTokenLimit: number;
}) {
  const recentRawMessages: typeof input.messages = [];
  const overflowMessages: typeof input.messages = [];
  let recentRawTokenCount = 0;

  for (const message of [...input.messages].reverse()) {
    const messageText = extractMessageText(message);
    const messageTokenCount = estimateTokenCount(messageText);

    if (
      recentRawMessages.length === 0
      || recentRawTokenCount + messageTokenCount <= input.recentRawTokenLimit
    ) {
      recentRawMessages.unshift(message);
      recentRawTokenCount += messageTokenCount;
      continue;
    }

    overflowMessages.unshift(message);
  }

  return {
    recentRawMessages,
    overflowMessages,
    recentRawTokenCount,
    overflowTokenCount: overflowMessages.reduce(
      (total, message) => total + estimateTokenCount(extractMessageText(message)),
      0,
    ),
  };
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
  const activeMessages = [...state.overflowMessageIds, ...state.recentMessageIds]
    .map((messageId) => messages.find((message) => message.id === messageId))
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
  const activeMessageBands = partitionActiveMessages({
    messages: activeMessages,
    recentRawTokenLimit: limits.recentRawTokens,
  });
  const rawMessageText = activeMessageBands.recentRawMessages
    .map((message) => extractMessageText(message))
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
  const visibleObservations = selectVisibleObservations({
    observations: state.observations,
    observationTokenLimit: limits.observationReflectionBatchTokens,
  });

  return {
    ...createEmptyCheckpointedOmState(),
    checkpointGeneration: state.checkpointMessageId ? state.observations.length : null,
    checkpointSummary,
    observationBlocks: visibleObservations.map((observation) => ({
      id: observation.id,
      tokenCount: observation.units,
      createdAt: observation.createdAt,
      lastObservedAt: observation.createdAt,
      reflectedGeneration: null,
      text: observation.text,
    })),
    latestMetrics: {
      rawMessageCount: activeMessages.length,
      recentRawMessageCount: activeMessageBands.recentRawMessages.length,
      recentRawTokenCount: activeMessageBands.recentRawTokenCount,
      recentRawTokenLimit: limits.recentRawTokens,
      overflowMessageCount: activeMessageBands.overflowMessages.length,
      overflowTokenCount: activeMessageBands.overflowTokenCount,
      observationTriggerTokenLimit: limits.rawObservationBatchTokens,
      activeObservationBlockCount: visibleObservations.length,
      observationTokenCount: visibleObservations.reduce((total, observation) => total + observation.units, 0),
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

function selectVisibleObservations(input: {
  observations: CheckpointedConversationState['observations'];
  observationTokenLimit: number;
}) {
  const visibleObservations: CheckpointedConversationState['observations'] = [];
  let tokenCount = 0;

  for (const observation of [...input.observations].reverse()) {
    if (
      visibleObservations.length > 0
      && tokenCount + observation.units > input.observationTokenLimit
    ) {
      break;
    }

    visibleObservations.unshift(observation);
    tokenCount += observation.units;
  }

  return visibleObservations;
}
