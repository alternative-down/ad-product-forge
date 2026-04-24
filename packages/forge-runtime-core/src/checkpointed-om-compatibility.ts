import { generateText, type LanguageModel } from 'ai';
import type {
  ConversationMessage,
  ConversationStore,
  RuntimeObserver,
} from 'agent-runtime-core/integrations';

import type { CheckpointedOmCheckpointPackageInput } from './checkpointed-om.js';
import { estimateMessageUnits, readOperationalMemoryState, takeOperationalMemoryBatch } from './operational-memory-state.js';

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export type CheckpointedOmCompatibilityObserverOptions = {
  threadId: string;
  resourceId: string;
  conversationStore: ConversationStore;
  conversationMemory?: unknown;
  stateStore?: unknown;
  limits: {
    totalContextTokens: number;
    recentRawTokens: number;
    rawObservationBatchTokens: number;
    observationReflectionBatchTokens: number;
    observationSupportTokens: number;
    reflectionSupportTokens: number;
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
  if (!input.reflectionModel) {
    return;
  }

  const reflectionBudget = Math.max(
    0,
    input.limits.totalContextTokens
      - input.limits.recentRawTokens
      - input.limits.rawObservationBatchTokens
      - input.limits.observationReflectionBatchTokens,
  );
  const checkpointSummaryMessage = await getCheckpointSummaryMessage(input.conversationStore, input.threadId);
  let checkpointGeneration = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;
  let checkpointSummaryText = checkpointSummaryMessage ? extractMessageText(checkpointSummaryMessage) : null;

  while (true) {
    const state = await readOperationalMemoryState({
      threadId: input.threadId,
      store: input.conversationStore,
      recentTokenLimit: input.limits.recentRawTokens,
    });

    if (state.metrics.observationTokenCount >= input.limits.observationReflectionBatchTokens) {
      const reflectionBatch = takeOperationalMemoryBatch({
        messages: state.observationMessages,
        tokenLimit: input.limits.observationReflectionBatchTokens,
      });
      const supportText = takeSupportText(
        state.observationMessages
          .slice(reflectionBatch.messages.length)
          .map((message) => extractMessageText(message)),
        input.limits.reflectionSupportTokens,
      );
      const reflectionText = await generateReflectionText({
        model: input.reflectionModel,
        agentSystemPrompt: input.agentSystemPrompt,
        supportText,
        observations: reflectionBatch.messages.map((message) => extractMessageText(message)),
      });
      const generationCount = checkpointGeneration + state.reflectionMessages.length + 1;
      const reflectionId = `reflection:${generationCount}`;
      const createdAt = new Date().toISOString();

      await input.conversationStore.appendMessage({
        id: reflectionId,
        threadId: input.threadId,
        role: 'system',
        parts: [{
          type: 'text',
          text: renderReflectionText(reflectionText),
        }],
        operationalMemoryType: 'reflection',
        operationalMemoryGeneration: generationCount,
        createdAt,
      });
      await Promise.all(reflectionBatch.messages.map((message) =>
        input.conversationStore.updateMessageReplacement({
          threadId: input.threadId,
          messageId: message.id,
          replacedByMessageId: reflectionId,
        })));
      continue;
    }

    if (state.metrics.reflectionTokenCount >= reflectionBudget) {
      const checkpointBatch = takeOperationalMemoryBatch({
        messages: state.reflectionMessages,
        tokenLimit: reflectionBudget,
      });
      const checkpointText = await generateCheckpointSummaryText({
        model: input.reflectionModel,
        agentSystemPrompt: input.agentSystemPrompt,
        previousSummary: checkpointSummaryText,
        archivedReflections: checkpointBatch.messages.map((message) => extractMessageText(message)),
      });
      checkpointGeneration = checkpointBatch.messages
        .map((message) => message.operationalMemoryGeneration ?? 0)
        .reduce((maxGeneration, generation) => Math.max(maxGeneration, generation), checkpointGeneration);
      checkpointSummaryText = checkpointText;
      const checkpointId = `checkpoint-summary:${checkpointGeneration}`;
      const createdAt = new Date().toISOString();

      await input.conversationStore.appendMessage({
        id: checkpointId,
        threadId: input.threadId,
        role: 'system',
        parts: [{
          type: 'text',
          text: renderCheckpointSummaryText(checkpointText),
        }],
        operationalMemoryType: 'checkpoint-summary',
        operationalMemoryGeneration: checkpointGeneration,
        createdAt,
      });
      await Promise.all([
        ...checkpointBatch.messages.map((message) =>
          input.conversationStore.updateMessageReplacement({
            threadId: input.threadId,
            messageId: message.id,
            replacedByMessageId: checkpointId,
          })),
        ...(checkpointSummaryMessage
          ? [input.conversationStore.updateMessageReplacement({
              threadId: input.threadId,
              messageId: checkpointSummaryMessage.id,
              replacedByMessageId: checkpointId,
            })]
          : []),
      ]);

      if (input.onCheckpointAdvanced) {
        await input.onCheckpointAdvanced({
          threadId: input.threadId,
          resourceId: input.resourceId,
          fromGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
          toGeneration: checkpointGeneration,
          checkpointSummary: {
            text: checkpointText,
            tokenCount: estimateTokenCount(renderCheckpointSummaryText(checkpointText)),
            upToGeneration: checkpointGeneration,
            updatedAt: createdAt,
          },
          reflections: checkpointBatch.messages.map((message) => ({
            recordId: message.id,
            generationCount: message.operationalMemoryGeneration ?? checkpointGeneration,
            tokenCount: estimateMessageUnits(message),
            createdAt: message.createdAt,
            text: extractMessageText(message),
          })),
          observations: [],
        });
      }

      continue;
    }

    return;
  }
}

async function getCheckpointSummaryMessage(store: ConversationStore, threadId: string) {
  const messages = await store.listOperationalMemoryMessages({
    threadId,
  });

  return [...messages].reverse().find((message) => message.operationalMemoryType === 'checkpoint-summary') ?? null;
}

function extractMessageText(message: ConversationMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' | 'reasoning' }> =>
      part.type === 'text' || part.type === 'reasoning')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function renderReflectionText(text: string) {
  return ['Active reflection:', text.trim()].join('\n');
}

function renderCheckpointSummaryText(text: string) {
  return ['Checkpoint summary:', text.trim()].join('\n');
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
