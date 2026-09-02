import { estimateTokenCount } from 'agent-runtime-core';
import type { ConversationMessage, ConversationStore } from 'agent-runtime-core/integrations';
import { forgeDebug } from './debug.js';

const SUSPICIOUS_MESSAGE_TOKEN_COUNT = 1_000_000;

export type OperationalMemoryState = {
  checkpointSummaryMessage: ConversationMessage | null;
  reflectionMessages: ConversationMessage[];
  observationMessages: ConversationMessage[];
  rawMessages: ConversationMessage[];
  recentRawMessages: ConversationMessage[];
  overflowRawMessages: ConversationMessage[];
  metrics: {
    rawMessageCount: number;
    recentRawMessageCount: number;
    recentRawTokenCount: number;
    overflowMessageCount: number;
    overflowTokenCount: number;
    observationTokenCount: number;
    reflectionTokenCount: number;
    checkpointTokenCount: number;
    latestThreadMessageAt: string | null;
  };
};

type GroupedRawMessages = {
  tokenCount: number;
  messages: ConversationMessage[];
  toolCallIds: Set<string>;
};

export async function readOperationalMemoryState(input: {
  threadId: string;
  store: ConversationStore;
  recentTokenLimit: number;
}) {
  const startedAt = Date.now();
  try {
    const messages = await input.store.listOperationalMemoryMessages({
      threadId: input.threadId,
    });
    const checkpointSummaryMessage =
      messages.find((message) => message.operationalMemoryType === 'checkpoint-summary') ?? null;
    const reflectionMessages = messages.filter(
      (message) => message.operationalMemoryType === 'reflection',
    );
    const observationMessages = messages.filter(
      (message) => message.operationalMemoryType === 'observation',
    );
    const rawMessages = messages.filter((message) => !message.operationalMemoryType);
    const rawBands = splitRawMessagesByRecentReserve({
      messages: rawMessages,
      recentTokenLimit: input.recentTokenLimit,
    });

    const state = {
      checkpointSummaryMessage,
      reflectionMessages,
      observationMessages,
      rawMessages,
      recentRawMessages: rawBands.recentMessages,
      overflowRawMessages: rawBands.overflowMessages,
      metrics: {
        rawMessageCount: rawMessages.length,
        recentRawMessageCount: rawBands.recentMessages.length,
        recentRawTokenCount: rawBands.recentTokenCount,
        overflowMessageCount: rawBands.overflowMessages.length,
        overflowTokenCount: rawBands.overflowTokenCount,
        observationTokenCount: observationMessages.reduce(
          (total, message) => total + estimateMessageUnits(message),
          0,
        ),
        reflectionTokenCount: reflectionMessages.reduce(
          (total, message) => total + estimateMessageUnits(message),
          0,
        ),
        checkpointTokenCount: checkpointSummaryMessage
          ? estimateMessageUnits(checkpointSummaryMessage)
          : 0,
        latestThreadMessageAt: messages.at(-1)?.createdAt ?? null,
      },
    } satisfies OperationalMemoryState;

    forgeDebug({
      scope: 'operational-memory-state',
      level: 'info',
      message: 'operational memory state calculated',
      context: {
        threadId: input.threadId,
        durationMs: Date.now() - startedAt,
        totalMessageCount: messages.length,
        ...state.metrics,
      },
    });

    return state;
  } catch (err) {
    console.warn(
      '[readOperationalMemoryState] Failed to read operational memory state',
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

export function estimateMessageUnits(message: ConversationMessage) {
  const text = getMessageBudgetText(message);

  if (text) {
    const tokenCount = estimateTokenCount(text);
    const maximumPlausibleTokenCount = Math.max(1, Buffer.byteLength(text, 'utf8'));

    if (
      !Number.isSafeInteger(tokenCount) ||
      tokenCount > maximumPlausibleTokenCount ||
      tokenCount >= SUSPICIOUS_MESSAGE_TOKEN_COUNT
    ) {
      forgeDebug({
        scope: 'operational-memory-state',
        level: 'error',
        message: 'suspicious message token count detected',
        context: {
          messageId: message.id,
          threadId: message.threadId,
          role: message.role,
          operationalMemoryType: message.operationalMemoryType ?? 'raw',
          operationalMemoryGeneration: message.operationalMemoryGeneration ?? null,
          tokenCount,
          maximumPlausibleTokenCount,
          textLength: text.length,
          partCount: message.parts.length,
          partTypes: message.parts.map((part) => part.type),
        },
      });
    }

    if (!Number.isSafeInteger(tokenCount) || tokenCount > maximumPlausibleTokenCount) {
      return maximumPlausibleTokenCount;
    }

    return tokenCount;
  }

  return 1;
}

export function takeOperationalMemoryBatch(input: {
  messages: ConversationMessage[];
  tokenLimit: number;
}) {
  const selectedGroups: GroupedRawMessages[] = [];
  let tokenCount = 0;

  for (const group of groupRawConversationMessages(input.messages)) {
    selectedGroups.push(group);
    tokenCount += group.tokenCount;

    if (tokenCount >= input.tokenLimit) {
      break;
    }
  }

  return {
    messages: selectedGroups.flatMap((group) => group.messages),
    tokenCount,
  };
}

function splitRawMessagesByRecentReserve(input: {
  messages: ConversationMessage[];
  recentTokenLimit: number;
}) {
  const groups = groupRawConversationMessages(input.messages);
  const recentGroups: GroupedRawMessages[] = [];
  let recentTokenCount = 0;

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];

    if (recentTokenCount + group.tokenCount > input.recentTokenLimit) {
      break;
    }

    recentGroups.unshift(group);
    recentTokenCount += group.tokenCount;
  }
  const overflowGroups = groups.slice(0, groups.length - recentGroups.length);
  const recentMessages = recentGroups.flatMap((group) => group.messages);
  const overflowMessages = overflowGroups.flatMap((group) => group.messages);

  return {
    recentMessages,
    recentTokenCount,
    overflowMessages,
    overflowTokenCount: overflowGroups.reduce((total, group) => total + group.tokenCount, 0),
  };
}

function groupRawConversationMessages(messages: ConversationMessage[]) {
  const groups: GroupedRawMessages[] = [];
  let currentGroup: GroupedRawMessages | null = null;

  for (const message of messages) {
    const tokenCount = estimateMessageUnits(message);
    const toolCallIds = new Set(
      Array.isArray(message.metadata?.toolInvocations)
        ? message.metadata.toolInvocations
            .filter(
              (tc): tc is { toolCallId: string; toolName: string } =>
                typeof tc === 'object' &&
                tc !== null &&
                typeof tc.toolCallId === 'string' &&
                typeof tc.toolName === 'string',
            )
            .map((tc) => tc.toolCallId)
        : [],
    );

    if (currentGroup !== null && message.role === 'user' && currentGroup.toolCallIds.size === 0) {
      currentGroup = {
        messages: [...currentGroup.messages, message],
        tokenCount: currentGroup.tokenCount + tokenCount,
        toolCallIds: new Set(),
      };
    } else {
      if (currentGroup !== null) {
        groups.push(currentGroup);
      }

      currentGroup = {
        messages: [message],
        tokenCount,
        toolCallIds,
      };
    }
  }

  if (currentGroup !== null) {
    groups.push(currentGroup);
  }

  return groups;
}

function getMessageBudgetText(message: ConversationMessage) {
  return [
    getMessageText(message),
    ...getToolInvocationBudgetTexts(message),
    ...getToolResultBudgetTexts(message),
  ]
    .filter(Boolean)
    .join('\n');
}

function getMessageText(message: ConversationMessage) {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: 'text' | 'reasoning' }> =>
        part.type === 'text' || part.type === 'reasoning',
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function getToolInvocationBudgetTexts(message: ConversationMessage) {
  const toolInvocations = Array.isArray(message.metadata?.toolInvocations)
    ? message.metadata.toolInvocations
    : [];

  return toolInvocations.flatMap((toolInvocation) => {
    if (typeof toolInvocation !== 'object' || toolInvocation === null) {
      return [];
    }

    const toolName =
      typeof toolInvocation.toolName === 'string' ? toolInvocation.toolName : 'unknown';
    const args = serializeBudgetValue(toolInvocation.args);

    return [[`Tool call: ${toolName}`, args].filter(Boolean).join('\n')];
  });
}

function getToolResultBudgetTexts(message: ConversationMessage) {
  const toolResults = Array.isArray(message.metadata?.toolResults)
    ? message.metadata.toolResults
    : [];

  return toolResults.flatMap((toolResult) => {
    if (typeof toolResult !== 'object' || toolResult === null) {
      return [];
    }

    const toolName = typeof toolResult.toolName === 'string' ? toolResult.toolName : 'unknown';
    const result = serializeBudgetValue(toolResult.result);

    return [[`Tool result: ${toolName}`, result].filter(Boolean).join('\n')];
  });
}

function serializeBudgetValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}
