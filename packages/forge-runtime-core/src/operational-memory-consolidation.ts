import { countTokens } from 'agent-runtime-core';
import type { ConversationMessage, ConversationStore } from 'agent-runtime-core/integrations';
import { generateText, type LanguageModel } from 'ai';

import { normalizeOperationalMemoryText } from './conversation-model-messages.js';
import { forgeDebug } from './debug.js';
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
import { calculateOperationalMemoryReflectionBudget } from './operational-memory-budget.js';

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
  const startedAt = Date.now();
  let pass = 0;
  const reflectionBudget = calculateOperationalMemoryReflectionBudget(input.limits);

  while (true) {
    pass += 1;
    const passStartedAt = Date.now();
    const state = await readOperationalMemoryState({
      threadId: input.threadId,
      store: input.store,
      recentTokenLimit: input.limits.recentRawTokens,
    });
    const checkpoint = state.checkpointSummaryMessage;

    forgeDebug({
      scope: 'operational-memory-consolidation',
      level: 'info',
      message: 'consolidation pass state loaded',
      context: {
        threadId: input.threadId,
        pass,
        passDurationMs: Date.now() - passStartedAt,
        elapsedMs: Date.now() - startedAt,
        rawMessageCount: state.metrics.rawMessageCount,
        recentRawMessageCount: state.metrics.recentRawMessageCount,
        recentRawTokenCount: state.metrics.recentRawTokenCount,
        overflowMessageCount: state.metrics.overflowMessageCount,
        overflowTokenCount: state.metrics.overflowTokenCount,
        observationTokenCount: state.metrics.observationTokenCount,
        reflectionTokenCount: state.metrics.reflectionTokenCount,
        checkpointTokenCount: state.metrics.checkpointTokenCount,
        reflectionBudget,
        checkpointGeneration: checkpoint?.operationalMemoryGeneration ?? 0,
      },
    });

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
      forgeDebug({
        scope: 'operational-memory-consolidation',
        level: 'info',
        message: 'observation consolidation starting',
        context: { threadId: input.threadId, pass },
      });
      await consolidateObservations(input, state.observationMessages);
      continue;
    }

    if (state.metrics.reflectionTokenCount >= reflectionBudget && state.reflectionMessages.length > 0) {
      forgeDebug({
        scope: 'operational-memory-consolidation',
        level: 'info',
        message: 'reflection consolidation starting',
        context: { threadId: input.threadId, pass },
      });
      await consolidateReflections(input, state.reflectionMessages, checkpoint, reflectionBudget);
      continue;
    }

    forgeDebug({
      scope: 'operational-memory-consolidation',
      level: 'info',
      message: 'consolidation completed',
      context: { threadId: input.threadId, passCount: pass, durationMs: Date.now() - startedAt },
    });
    return;
  }
}

async function consolidateObservations(
  input: Parameters<typeof consolidateOperationalMemory>[0],
  observations: ConversationMessage[],
) {
  const startedAt = Date.now();
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
  const createdAt = batch.messages.at(-1)?.createdAt ?? batch.messages[0].createdAt;

  await persistConsolidatedMessage(input.store, {
    id: reflectionId,
    threadId: input.threadId,
    role: 'assistant',
    parts: [{ type: 'text', text }],
    operationalMemoryType: 'reflection',
    operationalMemoryGeneration: generation,
    createdAt,
  });
  await replaceMessages(input.store, input.threadId, batch.messages, reflectionId);

  forgeDebug({
    scope: 'operational-memory-consolidation',
    level: 'info',
    message: 'reflection persisted',
    context: {
      threadId: input.threadId,
      generation,
      durationMs: Date.now() - startedAt,
      sourceMessageCount: batch.messages.length,
      sourceTokenCount: batch.tokenCount,
      outputTokenCount: Math.max(1, countTokens(text)),
    },
  });

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
  const startedAt = Date.now();
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

  await persistConsolidatedMessage(input.store, {
    id: checkpointId,
    threadId: input.threadId,
    role: 'assistant',
    parts: [{ type: 'text', text }],
    operationalMemoryType: 'checkpoint-summary',
    operationalMemoryGeneration: generation,
    createdAt,
  });
  await replaceMessages(input.store, input.threadId, batch.messages, checkpointId);
  if (previousCheckpoint && previousCheckpoint.id !== checkpointId) {
    await input.store.updateMessageReplacement({
      threadId: input.threadId,
      messageId: previousCheckpoint.id,
      replacedByMessageId: checkpointId,
    });
  }

  forgeDebug({
    scope: 'operational-memory-consolidation',
    level: 'info',
    message: 'checkpoint persisted',
    context: {
      threadId: input.threadId,
      generation,
      durationMs: Date.now() - startedAt,
      sourceMessageCount: batch.messages.length,
      sourceTokenCount: batch.tokenCount,
      outputTokenCount: Math.max(1, countTokens(text)),
      previousCheckpointGeneration: previousCheckpoint?.operationalMemoryGeneration ?? null,
    },
  });

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
  const agentSystemPrompt = input.agentSystemPrompt?.trim() ?? '';
  const alignedSystemPrompt = agentSystemPrompt !== ''
    ? [
        baseSystemPrompt,
        '<main_agent_system_prompt>',
        'Use this main-agent prompt only as alignment context.',
        agentSystemPrompt,
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

async function persistConsolidatedMessage(
  store: ConversationStore,
  message: ConversationMessage,
): Promise<void> {
  try {
    await store.appendMessage(message);
  } catch (error) {
    if (!isPrimaryKeyConflict(error)) {
      throw error;
    }

    const existingMessage = (await store.listMessages({
      threadId: message.threadId,
      order: 'asc',
    })).find((candidate) => candidate.id === message.id);

    if (
      existingMessage === undefined ||
      existingMessage.operationalMemoryType !== message.operationalMemoryType ||
      existingMessage.operationalMemoryGeneration !== message.operationalMemoryGeneration
    ) {
      throw error;
    }

    await store.updateMessage({
      threadId: message.threadId,
      messageId: message.id,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata,
      operationalMemoryType: message.operationalMemoryType,
      operationalMemoryGeneration: message.operationalMemoryGeneration,
    });
  }
}

function isPrimaryKeyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';

  return (
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    message.includes('SQLITE_CONSTRAINT_PRIMARYKEY') ||
    message.includes('UNIQUE constraint failed')
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
