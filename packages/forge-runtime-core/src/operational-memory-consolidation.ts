import { countTokens } from 'agent-runtime-core';
import type { ConversationMessage, ConversationStore } from 'agent-runtime-core/integrations';
import { generateText, type LanguageModel } from 'ai';

import { normalizeOperationalMemoryText } from './conversation-model-messages.js';
import {
  estimateMessageUnits,
  readOperationalMemoryState,
  takeOperationalMemoryBatch,
} from './operational-memory-state.js';
import {
  buildReflectorPrompt,
  buildReflectorSystemPrompt,
  parseReflectorOutput,
} from './operational-memory-prompting.js';
import type { CreateRuntimeAgentSessionOptions } from './runtime-agent-session.js';

type Diagnostics = {
  record(event: {
    at: number;
    scope: string;
    phase: string;
    metrics?: Record<string, number | string | null>;
    detail?: Record<string, unknown> | null;
  }): void;
};

export async function consolidateOperationalMemory(input: {
  threadId: string;
  resourceId: string;
  store: ConversationStore;
  limits: NonNullable<CreateRuntimeAgentSessionOptions['checkpointedOmLimits']>;
  model: LanguageModel;
  agentSystemPrompt?: string;
  onCheckpointAdvanced?: CreateRuntimeAgentSessionOptions['onCheckpointAdvanced'];
  diagnostics?: Diagnostics;
}) {
  const reflectionBudget = Math.max(
    1,
    input.limits.totalContextTokens -
      input.limits.recentRawTokens -
      input.limits.rawObservationBatchTokens -
      input.limits.observationReflectionBatchTokens,
  );

  while (true) {
    const state = await readOperationalMemoryState({
      threadId: input.threadId,
      store: input.store,
      recentTokenLimit: input.limits.recentRawTokens,
    });
    const checkpoint = state.checkpointSummaryMessage;

    input.diagnostics?.record({
      at: Date.now(),
      scope: 'operational-memory-consolidation',
      phase: 'state-loaded',
      metrics: {
        observationTokenCount: state.metrics.observationTokenCount,
        reflectionTokenCount: state.metrics.reflectionTokenCount,
        reflectionBudget,
        checkpointGeneration: checkpoint?.operationalMemoryGeneration ?? 0,
      },
    });

    if (
      state.metrics.observationTokenCount >= input.limits.observationReflectionBatchTokens &&
      state.observationMessages.length > 0
    ) {
      await consolidateObservations(input, state.observationMessages);
      continue;
    }

    if (state.metrics.reflectionTokenCount >= reflectionBudget && state.reflectionMessages.length > 0) {
      await consolidateReflections(input, state.reflectionMessages, checkpoint, reflectionBudget);
      continue;
    }

    return;
  }
}

async function consolidateObservations(
  input: Parameters<typeof consolidateOperationalMemory>[0],
  observations: ConversationMessage[],
) {
  const batch = takeOperationalMemoryBatch({
    messages: observations,
    tokenLimit: input.limits.observationReflectionBatchTokens,
  });
  const supportText = takeSupportText(
    observations.slice(batch.messages.length).map(extractMessageText),
    input.limits.reflectionSupportTokens,
  );
  const text = await generateConsolidatedText({
    model: input.model,
    agentSystemPrompt: input.agentSystemPrompt,
    texts: [supportText, ...batch.messages.map(extractMessageText)],
  });
  const generation = (await getLatestGeneration(input.store, input.threadId)) + 1;
  const reflectionId = `reflection:${generation}`;

  await input.store.appendMessage({
    id: reflectionId,
    threadId: input.threadId,
    role: 'assistant',
    parts: [{ type: 'text', text }],
    operationalMemoryType: 'reflection',
    operationalMemoryGeneration: generation,
    createdAt: batch.messages[0].createdAt,
  });
  await replaceMessages(input.store, input.threadId, batch.messages, reflectionId);

  input.diagnostics?.record({
    at: Date.now(),
    scope: 'operational-memory-consolidation',
    phase: 'reflection-persisted',
    metrics: { generation, sourceMessageCount: batch.messages.length },
  });
}

async function consolidateReflections(
  input: Parameters<typeof consolidateOperationalMemory>[0],
  reflections: ConversationMessage[],
  previousCheckpoint: ConversationMessage | null,
  reflectionBudget: number,
) {
  const batch = takeOperationalMemoryBatch({ messages: reflections, tokenLimit: reflectionBudget });
  const text = await generateConsolidatedText({
    model: input.model,
    agentSystemPrompt: input.agentSystemPrompt,
    texts: [
      previousCheckpoint ? extractMessageText(previousCheckpoint) : '',
      ...batch.messages.map(extractMessageText),
    ],
  });
  const generation = batch.messages.reduce(
    (maximum, message) => Math.max(maximum, message.operationalMemoryGeneration ?? 0),
    previousCheckpoint?.operationalMemoryGeneration ?? 0,
  );
  const checkpointId = `checkpoint-summary:${generation}`;
  const createdAt = batch.messages.at(-1)?.createdAt ?? batch.messages[0].createdAt;

  await input.store.appendMessage({
    id: checkpointId,
    threadId: input.threadId,
    role: 'assistant',
    parts: [{ type: 'text', text }],
    operationalMemoryType: 'checkpoint-summary',
    operationalMemoryGeneration: generation,
    createdAt,
  });
  await replaceMessages(input.store, input.threadId, batch.messages, checkpointId);
  if (previousCheckpoint) {
    await input.store.updateMessageReplacement({
      threadId: input.threadId,
      messageId: previousCheckpoint.id,
      replacedByMessageId: checkpointId,
    });
  }

  input.diagnostics?.record({
    at: Date.now(),
    scope: 'operational-memory-consolidation',
    phase: 'checkpoint-persisted',
    metrics: { generation, sourceMessageCount: batch.messages.length },
  });

  await input.onCheckpointAdvanced?.({
    threadId: input.threadId,
    resourceId: input.resourceId,
    fromGeneration: previousCheckpoint?.operationalMemoryGeneration ?? null,
    toGeneration: generation,
    checkpointSummary: {
      text,
      tokenCount: Math.max(1, countTokens(text)),
      upToGeneration: generation,
      updatedAt: createdAt,
    },
    reflections: batch.messages.map((message) => ({
      recordId: message.id,
      generationCount: message.operationalMemoryGeneration ?? generation,
      tokenCount: estimateMessageUnits(message),
      createdAt: message.createdAt,
      text: extractMessageText(message),
    })),
    observations: [],
  });
}

async function generateConsolidatedText(input: {
  model: LanguageModel;
  agentSystemPrompt?: string;
  texts: string[];
}) {
  const baseSystemPrompt = buildReflectorSystemPrompt();
  const alignedSystemPrompt = input.agentSystemPrompt?.trim()
    ? [
        baseSystemPrompt,
        '<main_agent_system_prompt>',
        'Use this main-agent prompt only as alignment context.',
        input.agentSystemPrompt.trim(),
        '</main_agent_system_prompt>',
      ].join('\n\n')
    : baseSystemPrompt;
  const result = await generateText({
    model: input.model,
    system: alignedSystemPrompt,
    prompt: buildReflectorPrompt(input.texts.map((text) => text.trim()).filter(Boolean).join('\n\n')),
  });
  const text = normalizeOperationalMemoryText(parseReflectorOutput(result.text).observations);

  if (!text) {
    throw new Error('Operational memory consolidation returned empty text');
  }

  return text;
}

async function replaceMessages(
  store: ConversationStore,
  threadId: string,
  messages: ConversationMessage[],
  replacementId: string,
) {
  await Promise.all(
    messages.map((message) =>
      store.updateMessageReplacement({
        threadId,
        messageId: message.id,
        replacedByMessageId: replacementId,
      }),
    ),
  );
}

async function getLatestGeneration(store: ConversationStore, threadId: string) {
  const messages = await store.listMessages({ threadId, order: 'asc' });

  return messages.reduce(
    (maximum, message) => Math.max(maximum, message.operationalMemoryGeneration ?? 0),
    0,
  );
}

function extractMessageText(message: ConversationMessage) {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: 'text' | 'reasoning' }> =>
        part.type === 'text' || part.type === 'reasoning',
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function takeSupportText(texts: string[], tokenLimit: number) {
  const selected: string[] = [];
  let usedTokens = 0;

  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index]?.trim();
    if (!text) continue;
    const tokenCount = Math.max(1, countTokens(text));
    if (usedTokens + tokenCount > tokenLimit) break;
    selected.unshift(text);
    usedTokens += tokenCount;
  }

  return selected.join('\n');
}
