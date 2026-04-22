import { generateText, type LanguageModel } from 'ai';
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
    const messageTokenCount = estimateTokenCount(extractMessageText(message));

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
  reflectionModel?: LanguageModel;
  agentSystemPrompt?: string;
  onCheckpointAdvanced?: (input: CheckpointedOmCheckpointPackageInput) => Promise<void>;
};

export function createCheckpointedOmCompatibilityObserver(
  input: CheckpointedOmCompatibilityObserverOptions,
): RuntimeObserver {
  return {
    name: 'forge-checkpointed-om-compatibility',
    async onAfterStep() {
      const conversationState = await input.conversationMemory.getState();
      const previousState = await input.stateStore.loadState({
        threadId: input.threadId,
        resourceId: input.resourceId,
      }) ?? createEmptyCheckpointedOmState();
      const messages = await input.conversationStore.listMessages({
        threadId: input.threadId,
      });
      const result = await buildCompatibleState({
        previousState,
        conversationState,
        messages,
        limits: input.limits,
        reflectionModel: input.reflectionModel,
        agentSystemPrompt: input.agentSystemPrompt,
      });

      await input.stateStore.saveState({
        threadId: input.threadId,
        resourceId: input.resourceId,
        state: result.state,
      });

      if (!input.onCheckpointAdvanced || !result.checkpointPayload) {
        return;
      }

      await input.onCheckpointAdvanced({
        ...result.checkpointPayload,
        threadId: input.threadId,
        resourceId: input.resourceId,
      });
    },
  };
}

async function buildCompatibleState(input: {
  previousState: CheckpointedOmState;
  conversationState: CheckpointedConversationState;
  messages: Array<{
    id: string;
    parts: Array<{ type: string; text?: string }>;
    createdAt: string;
  }>;
  limits: CheckpointedOmCompatibilityObserverOptions['limits'];
  reflectionModel?: LanguageModel;
  agentSystemPrompt?: string;
}) {
  const activeMessages = [...input.conversationState.overflowMessageIds, ...input.conversationState.recentMessageIds]
    .map((messageId) => input.messages.find((message) => message.id === messageId))
    .filter((message): message is NonNullable<typeof message> => Boolean(message));
  const activeMessageBands = partitionActiveMessages({
    messages: activeMessages,
    recentRawTokenLimit: input.limits.recentRawTokens,
  });
  const reflectionBudget = Math.max(
    0,
    input.limits.totalContextTokens
      - input.limits.recentRawTokens
      - input.limits.rawObservationBatchTokens
      - input.limits.observationReflectionBatchTokens,
  );
  const observationBlocks = reconcileObservationBlocks({
    previousBlocks: input.previousState.observationBlocks,
    observations: input.conversationState.observations,
  });
  const activeReflectionBlocks = [...input.previousState.activeReflectionBlocks];
  const previousCheckpointGeneration = input.previousState.checkpointGeneration;
  let checkpointGeneration = input.previousState.checkpointGeneration;
  let checkpointSummary = input.previousState.checkpointSummary;

  if (
    checkpointSummary === null
    && checkpointGeneration === null
    && input.conversationState.checkpointMessageId
    && input.conversationState.observations.length > 0
  ) {
    checkpointGeneration = input.conversationState.observations.length;
    checkpointSummary = {
      text: input.conversationState.observations[input.conversationState.observations.length - 1]!.text,
      tokenCount: input.conversationState.observations[input.conversationState.observations.length - 1]!.units,
      upToGeneration: checkpointGeneration,
      updatedAt: input.conversationState.updatedAt,
    };
  }

  if (input.reflectionModel) {
    while (sumActiveObservationTokens(observationBlocks) >= input.limits.observationReflectionBatchTokens) {
      const batch = takeActiveObservationBatch({
        observationBlocks,
        tokenLimit: input.limits.observationReflectionBatchTokens,
      });

      if (batch.length === 0) {
        break;
      }

      const reflectionText = await generateReflectionText({
        model: input.reflectionModel,
        agentSystemPrompt: input.agentSystemPrompt,
        reflections: activeReflectionBlocks.map((block) => block.text),
        observations: batch.map((block) => block.text),
      });
      const generationCount = (activeReflectionBlocks.at(-1)?.generationCount ?? checkpointGeneration ?? 0) + 1;
      const createdAt = new Date().toISOString();

      activeReflectionBlocks.push({
        recordId: `reflection:${generationCount}`,
        generationCount,
        tokenCount: estimateTokenCount(reflectionText),
        createdAt,
        text: reflectionText,
      });

      for (const observation of batch) {
        observation.reflectedGeneration = generationCount;
      }
    }
  }

  const archivedReflections: typeof activeReflectionBlocks = [];

  if (input.reflectionModel) {
    while (sumReflectionTokens(activeReflectionBlocks) > reflectionBudget && activeReflectionBlocks.length > 0) {
      const removed = activeReflectionBlocks.shift();

      if (!removed) {
        break;
      }

      archivedReflections.push(removed);
    }

    if (archivedReflections.length > 0) {
      checkpointGeneration = archivedReflections[archivedReflections.length - 1]?.generationCount ?? checkpointGeneration;
      checkpointSummary = {
        text: await generateCheckpointSummaryText({
          model: input.reflectionModel,
          agentSystemPrompt: input.agentSystemPrompt,
          previousSummary: checkpointSummary?.text ?? null,
          archivedReflections: archivedReflections.map((reflection) => reflection.text),
        }),
        tokenCount: 0,
        upToGeneration: checkpointGeneration ?? 0,
        updatedAt: new Date().toISOString(),
      };
      checkpointSummary.tokenCount = estimateTokenCount(checkpointSummary.text);
    }
  }

  const archivedObservations = checkpointGeneration === null
    ? []
    : observationBlocks.filter((block) =>
      block.reflectedGeneration !== null
      && block.reflectedGeneration <= checkpointGeneration
      && (
        previousCheckpointGeneration === null
        || block.reflectedGeneration > previousCheckpointGeneration
      ),
    );
  const visibleObservationBlocks = checkpointGeneration === null
    ? observationBlocks
    : observationBlocks.filter((block) =>
      block.reflectedGeneration === null
      || block.reflectedGeneration > checkpointGeneration,
    );
  const state: CheckpointedOmState = {
    version: 1,
    checkpointGeneration,
    checkpointSummary,
    observationBlocks: visibleObservationBlocks,
    activeReflectionBlocks,
    latestMetrics: {
      rawMessageCount: activeMessages.length,
      recentRawMessageCount: activeMessageBands.recentRawMessages.length,
      recentRawTokenCount: activeMessageBands.recentRawTokenCount,
      recentRawTokenLimit: input.limits.recentRawTokens,
      overflowMessageCount: activeMessageBands.overflowMessages.length,
      overflowTokenCount: activeMessageBands.overflowTokenCount,
      observationTriggerTokenLimit: input.limits.rawObservationBatchTokens,
      activeObservationBlockCount: visibleObservationBlocks.filter((block) => block.reflectedGeneration === null).length,
      observationTokenCount: visibleObservationBlocks
        .filter((block) => block.reflectedGeneration === null)
        .reduce((total, block) => total + block.tokenCount, 0),
      reflectionTriggerTokenLimit: input.limits.observationReflectionBatchTokens,
      activeReflectionBlockCount: activeReflectionBlocks.length,
      reflectionTokenCount: sumReflectionTokens(activeReflectionBlocks),
      reflectionBudget,
      checkpointTokenCount: checkpointSummary?.tokenCount ?? 0,
      checkpointSummaryUpToGeneration: checkpointSummary?.upToGeneration ?? null,
      latestThreadMessageAt: input.messages[input.messages.length - 1]?.createdAt ?? null,
      updatedAt: input.conversationState.updatedAt,
    },
  };

  return {
    state,
    checkpointPayload:
      checkpointGeneration !== null
      && checkpointGeneration !== previousCheckpointGeneration
      && checkpointSummary
        ? {
            fromGeneration: previousCheckpointGeneration,
            toGeneration: checkpointGeneration,
            checkpointSummary,
            reflections: archivedReflections.map((reflection) => ({
              recordId: reflection.recordId,
              generationCount: reflection.generationCount,
              tokenCount: reflection.tokenCount,
              createdAt: reflection.createdAt,
              text: reflection.text,
            })),
            observations: archivedObservations.map((observation) => ({
              blockId: observation.id,
              tokenCount: observation.tokenCount,
              createdAt: observation.createdAt,
              lastObservedAt: observation.lastObservedAt,
              reflectedGeneration: observation.reflectedGeneration ?? checkpointGeneration,
              text: observation.text,
            })),
          }
        : null,
  };
}

function reconcileObservationBlocks(input: {
  previousBlocks: CheckpointedOmState['observationBlocks'];
  observations: CheckpointedConversationState['observations'];
}) {
  const previousBlockMap = new Map(input.previousBlocks.map((block) => [block.id, block]));

  return input.observations.map((observation) => ({
    id: observation.id,
    tokenCount: observation.units,
    createdAt: observation.createdAt,
    lastObservedAt: observation.createdAt,
    reflectedGeneration: previousBlockMap.get(observation.id)?.reflectedGeneration ?? null,
    text: observation.text,
  }));
}

function takeActiveObservationBatch(input: {
  observationBlocks: CheckpointedOmState['observationBlocks'];
  tokenLimit: number;
}) {
  const selected: CheckpointedOmState['observationBlocks'] = [];
  let tokenCount = 0;

  for (const block of input.observationBlocks) {
    if (block.reflectedGeneration !== null) {
      continue;
    }

    if (selected.length > 0 && tokenCount + block.tokenCount > input.tokenLimit) {
      break;
    }

    selected.push(block);
    tokenCount += block.tokenCount;
  }

  return selected;
}

function sumActiveObservationTokens(observationBlocks: CheckpointedOmState['observationBlocks']) {
  return observationBlocks
    .filter((block) => block.reflectedGeneration === null)
    .reduce((total, block) => total + block.tokenCount, 0);
}

function sumReflectionTokens(reflectionBlocks: CheckpointedOmState['activeReflectionBlocks']) {
  return reflectionBlocks.reduce((total, block) => total + block.tokenCount, 0);
}

async function generateReflectionText(input: {
  model: LanguageModel;
  agentSystemPrompt?: string;
  reflections: string[];
  observations: string[];
}) {
  const result = await generateText({
    model: input.model,
    system: buildOmSystemPrompt({
      mode: 'reflection',
      agentSystemPrompt: input.agentSystemPrompt,
    }),
    prompt: [
      '<existing_reflections>',
      input.reflections.join('\n\n'),
      '</existing_reflections>',
      '',
      '<observation_batch>',
      input.observations.join('\n\n'),
      '</observation_batch>',
      '',
      'Return only <reflection>...</reflection>.',
    ].join('\n'),
  });
  const text = extractTaggedText(result.text, 'reflection');

  if (!text) {
    throw new Error('Checkpointed OM reflection returned no text');
  }

  return text;
}

async function generateCheckpointSummaryText(input: {
  model: LanguageModel;
  agentSystemPrompt?: string;
  previousSummary: string | null;
  archivedReflections: string[];
}) {
  const result = await generateText({
    model: input.model,
    system: buildOmSystemPrompt({
      mode: 'checkpoint',
      agentSystemPrompt: input.agentSystemPrompt,
    }),
    prompt: [
      '<previous_checkpoint_summary>',
      input.previousSummary ?? '',
      '</previous_checkpoint_summary>',
      '',
      '<archived_reflections>',
      input.archivedReflections.join('\n\n'),
      '</archived_reflections>',
      '',
      'Return only <summary>...</summary>.',
    ].join('\n'),
  });
  const text = extractTaggedText(result.text, 'summary');

  if (!text) {
    throw new Error('Checkpointed OM checkpoint summarizer returned no text');
  }

  return text;
}

function buildOmSystemPrompt(input: {
  mode: 'reflection' | 'checkpoint';
  agentSystemPrompt?: string;
}) {
  const basePrompt = input.mode === 'reflection'
    ? [
        'You compress observation blocks into a durable reflection.',
        'Preserve concrete facts, active work, blockers, decisions, open questions, and useful continuity context.',
        'Remove redundancy.',
      ]
    : [
        'You compress archived reflections into a checkpoint summary.',
        'Preserve the durable state that should survive after older reflections are dropped from the active context.',
        'Remove redundancy and keep continuity-critical facts.',
      ];

  if (!input.agentSystemPrompt?.trim()) {
    return basePrompt.join('\n');
  }

  return [
    basePrompt.join('\n'),
    '<agent_system_prompt>',
    input.agentSystemPrompt.trim(),
    '</agent_system_prompt>',
  ].join('\n\n');
}

function extractTaggedText(text: string, tagName: 'reflection' | 'summary') {
  const match = text.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return (match?.[1] ?? text).trim();
}
