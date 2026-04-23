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
    observationSupportTokens?: number;
    reflectionSupportTokens?: number;
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
      await syncCheckpointedOmCompatibility(input);
    },
  };
}

export async function syncCheckpointedOmCompatibility(
  input: CheckpointedOmCompatibilityObserverOptions,
) {
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

  if (input.reflectionModel) {
    if (sumActiveObservationTokens(observationBlocks) >= input.limits.observationReflectionBatchTokens) {
      const activeObservationTexts = observationBlocks
        .filter((block) => block.reflectedGeneration === null)
        .map((block) => block.text);
      const batch = takeActiveObservationBatch({
        observationBlocks,
        tokenLimit: input.limits.observationReflectionBatchTokens,
      });

      if (batch.length > 0) {
        const reflectionText = await generateReflectionText({
          model: input.reflectionModel,
          agentSystemPrompt: input.agentSystemPrompt,
          supportText: takeSupportText(
            activeObservationTexts.slice(0, Math.max(0, activeObservationTexts.length - batch.length)),
            input.limits.reflectionSupportTokens ?? 2_000,
          ),
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
  }

  const archivedReflections: typeof activeReflectionBlocks = [];

  if (input.reflectionModel) {
    while (sumReflectionTokens(activeReflectionBlocks) >= reflectionBudget && activeReflectionBlocks.length > 0) {
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
      rawMessageCount: input.conversationState.metrics.totalActiveMessageCount,
      recentRawMessageCount: input.conversationState.metrics.recentMessageCount,
      recentRawTokenCount: input.conversationState.metrics.recentTokenCount,
      recentRawTokenLimit: input.limits.recentRawTokens,
      overflowMessageCount: input.conversationState.metrics.overflowMessageCount,
      overflowTokenCount: input.conversationState.metrics.overflowTokenCount,
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
  supportText: string;
  observations: string[];
}) {
  const result = await generateText({
    model: input.model,
    system: buildAlignedOmInstructions(
      buildReflectorSystemPrompt(),
      input.agentSystemPrompt,
    ),
    prompt: buildReflectorPrompt([input.supportText, input.observations.join('\n')].filter(Boolean).join('\n')),
  });
  const text = parseReflectorOutput(result.text).observations.trim();

  if (!text) {
    throw new Error('Checkpointed OM reflector returned no observations');
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
    system: buildAlignedOmInstructions(
      buildReflectorSystemPrompt(),
      input.agentSystemPrompt,
    ),
    prompt: buildReflectorPrompt(
      [input.previousSummary, input.archivedReflections.join('\n\n')].filter(Boolean).join('\n\n'),
    ),
  });
  const text = parseReflectorOutput(result.text).observations.trim();

  if (!text) {
    throw new Error('Checkpointed OM checkpoint summarizer returned no observations');
  }

  return text;
}

function buildReflectorSystemPrompt() {
  return [
    'You compress batches of observations into a smaller durable reflection.',
    'Preserve concrete facts, decisions, active work, unresolved risks, and anything that would matter later.',
    'Do not drop operational detail that would still matter for continuity.',
    'Return XML with a single <observations>...</observations> block.',
  ].join('\n');
}

function buildAlignedOmInstructions(baseInstructions: string, agentSystemPrompt?: string) {
  const prompt = agentSystemPrompt?.trim();

  if (!prompt) {
    return baseInstructions;
  }

  return [
    baseInstructions,
    '<main_agent_system_prompt>',
    'Use the following main agent system prompt as alignment context. Keep observations, reflections, and checkpoint summaries aligned with the same role, scope, operating style, and priorities.',
    prompt,
    '</main_agent_system_prompt>',
  ].join('\n\n');
}

function buildReflectorPrompt(observations: string) {
  return [
    'Compress the observations below into a tighter reflection.',
    'Preserve the important details while removing redundancy.',
    '',
    '<observations>',
    observations,
    '</observations>',
  ].join('\n');
}

function parseReflectorOutput(output: string) {
  const match = output.match(/<observations>([\s\S]*?)<\/observations>/i);
  return {
    observations: (match?.[1] ?? output).trim(),
  };
}

function takeSupportText(observations: string[], tokenLimit: number) {
  if (tokenLimit <= 0) {
    return '';
  }

  const selected: string[] = [];
  let usedTokens = 0;

  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const text = observations[index]?.trim();

    if (!text) {
      continue;
    }

    const tokenCount = estimateTokenCount(text);

    if (usedTokens + tokenCount > tokenLimit) {
      break;
    }

    selected.unshift(text);
    usedTokens += tokenCount;
  }

  return selected.join('\n');
}
