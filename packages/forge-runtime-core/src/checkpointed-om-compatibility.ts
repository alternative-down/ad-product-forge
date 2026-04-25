import { generateText, type LanguageModel } from 'ai';
import type {
  ConversationMessage,
  ConversationStore,
  RuntimeObserver,
} from 'agent-runtime-core/integrations';

import type { CheckpointedOmCheckpointPackageInput } from './checkpointed-om.js';
import {
  normalizeOperationalMemoryText,
} from './conversation-model-messages.js';
import { estimateMessageUnits, readOperationalMemoryState, takeOperationalMemoryBatch } from './operational-memory-state.js';
import {
  buildReflectorPrompt,
  buildReflectorSystemPrompt,
  parseReflectorOutput,
} from './operational-memory-prompting.js';

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
  let latestPersistedGeneration = await getLatestOperationalMemoryGeneration(
    input.conversationStore,
    input.threadId,
  );
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
        observationMessages: reflectionBatch.messages,
      });
      const generationCount = latestPersistedGeneration + 1;
      const reflectionId = `reflection:${generationCount}`;
      const createdAt = new Date().toISOString();

      await input.conversationStore.appendMessage({
        id: reflectionId,
        threadId: input.threadId,
        role: 'assistant',
        parts: [{
          type: 'text',
          text: reflectionText,
        }],
        operationalMemoryType: 'reflection',
        operationalMemoryGeneration: generationCount,
        createdAt,
      });
      latestPersistedGeneration = generationCount;
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
        reflectionMessages: checkpointBatch.messages,
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
        role: 'assistant',
        parts: [{
          type: 'text',
          text: checkpointText,
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
            tokenCount: estimateTokenCount(checkpointText),
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

async function getLatestOperationalMemoryGeneration(store: ConversationStore, threadId: string) {
  const messages = await store.listMessages({
    threadId,
    order: 'asc',
  });

  return messages.reduce((maxGeneration, message) => {
    if (typeof message.operationalMemoryGeneration !== 'number') {
      return maxGeneration;
    }

    return Math.max(maxGeneration, message.operationalMemoryGeneration);
  }, 0);
}

function extractMessageText(message: ConversationMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' | 'reasoning' }> =>
      part.type === 'text' || part.type === 'reasoning')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

async function generateReflectionText(input: {
  model: LanguageModel;
  agentSystemPrompt?: string;
  supportText: string;
  observationMessages: ConversationMessage[];
}) {
  const selectedText = input.observationMessages
    .map((message) => extractMessageText(message))
    .filter(Boolean)
    .join('\n');
  const result = await generateText({
    model: input.model,
    system: buildAlignedOmInstructions(
      buildReflectorSystemPrompt(),
      input.agentSystemPrompt,
    ),
    prompt: buildReflectorPrompt(
      [input.supportText.trim(), selectedText].filter(Boolean).join('\n'),
    ),
  });
  const parsed = parseReflectorOutput(result.text);
  const text = normalizeOperationalMemoryText(parsed.observations);

  if (!text) {
    throw new Error('Checkpointed OM reflector returned no observations');
  }

  return text;
}

async function generateCheckpointSummaryText(input: {
  model: LanguageModel;
  agentSystemPrompt?: string;
  previousSummary: string | null;
  reflectionMessages: ConversationMessage[];
}) {
  const reflectionText = input.reflectionMessages
    .map((message) => extractMessageText(message))
    .filter(Boolean)
    .join('\n');
  const result = await generateText({
    model: input.model,
    system: buildAlignedOmInstructions(
      buildReflectorSystemPrompt(),
      input.agentSystemPrompt,
    ),
    prompt: buildReflectorPrompt(
      [input.previousSummary?.trim(), reflectionText].filter(Boolean).join('\n\n'),
    ),
  });
  const parsed = parseReflectorOutput(result.text);
  const text = normalizeOperationalMemoryText(parsed.observations);

  if (!text) {
    throw new Error('Checkpointed OM checkpoint summarizer returned no observations');
  }

  return text;
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
