import type { ConversationMessage, ConversationStore } from 'agent-runtime-core/integrations';

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
  groupId: string;
  tokenCount: number;
  messages: ConversationMessage[];
};

export async function readOperationalMemoryState(input: {
  threadId: string;
  store: ConversationStore;
  recentTokenLimit: number;
}) {
  const messages = await input.store.listOperationalMemoryMessages({
    threadId: input.threadId,
  });
  const checkpointSummaryMessage = messages.find((message) => message.operationalMemoryType === 'checkpoint-summary') ?? null;
  const reflectionMessages = messages.filter((message) => message.operationalMemoryType === 'reflection');
  const observationMessages = messages.filter((message) => message.operationalMemoryType === 'observation');
  const rawMessages = messages.filter((message) => !message.operationalMemoryType);
  const rawBands = splitRawMessagesByRecentReserve({
    messages: rawMessages,
    recentTokenLimit: input.recentTokenLimit,
  });

  return {
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
      observationTokenCount: observationMessages.reduce((total, message) => total + estimateMessageUnits(message), 0),
      reflectionTokenCount: reflectionMessages.reduce((total, message) => total + estimateMessageUnits(message), 0),
      checkpointTokenCount: checkpointSummaryMessage ? estimateMessageUnits(checkpointSummaryMessage) : 0,
      latestThreadMessageAt: messages.at(-1)?.createdAt ?? null,
    },
  } satisfies OperationalMemoryState;
}

export function estimateMessageUnits(message: ConversationMessage) {
  const text = getMessageBudgetText(message);

  if (text) {
    return Math.max(1, Math.ceil(text.length / 4));
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
  const recentGroupIds = new Set<string>();
  let recentTokenCount = 0;

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];

    if (recentTokenCount + group.tokenCount > input.recentTokenLimit) {
      break;
    }

    recentGroupIds.add(group.groupId);
    recentTokenCount += group.tokenCount;
  }

  const recentMessages: ConversationMessage[] = [];
  const overflowMessages: ConversationMessage[] = [];
  let overflowTokenCount = 0;

  for (const message of input.messages) {
    if (recentGroupIds.has(getMessageGroupId(message))) {
      recentMessages.push(message);
      continue;
    }

    overflowMessages.push(message);
    overflowTokenCount += estimateMessageUnits(message);
  }

  return {
    recentMessages,
    recentTokenCount,
    overflowMessages,
    overflowTokenCount,
  };
}

function groupRawConversationMessages(messages: ConversationMessage[]) {
  const orderedGroups: GroupedRawMessages[] = [];
  const groupMap = new Map<string, GroupedRawMessages>();

  for (const message of messages) {
    const groupId = getMessageGroupId(message);
    const existingGroup = groupMap.get(groupId);

    if (existingGroup) {
      existingGroup.messages.push(message);
      existingGroup.tokenCount += estimateMessageUnits(message);
      continue;
    }

    const nextGroup = {
      groupId,
      tokenCount: estimateMessageUnits(message),
      messages: [message],
    };

    groupMap.set(groupId, nextGroup);
    orderedGroups.push(nextGroup);
  }

  return orderedGroups;
}

function getMessageGroupId(message: ConversationMessage) {
  const toolCallIds = getMessageToolCallIds(message);

  if (toolCallIds.length === 1) {
    return `tool-call:${toolCallIds[0]}`;
  }

  return `message:${message.id}`;
}

function getMessageToolCallIds(message: ConversationMessage) {
  const toolInvocations = Array.isArray(message.metadata?.toolInvocations)
    ? message.metadata.toolInvocations
    : [];
  const toolResults = Array.isArray(message.metadata?.toolResults)
    ? message.metadata.toolResults
    : [];
  const toolCallIds = new Set<string>();

  for (const item of [...toolInvocations, ...toolResults]) {
    if (
      typeof item === 'object'
      && item !== null
      && 'toolCallId' in item
      && typeof item.toolCallId === 'string'
      && item.toolCallId.trim()
    ) {
      toolCallIds.add(item.toolCallId);
    }
  }

  return Array.from(toolCallIds);
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
    .filter((part): part is Extract<typeof part, { type: 'text' | 'reasoning' }> =>
      part.type === 'text' || part.type === 'reasoning')
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

    const toolName = typeof toolInvocation.toolName === 'string'
      ? toolInvocation.toolName
      : 'unknown';
    const args = serializeBudgetValue(toolInvocation.args);

    return [[
      `Tool call: ${toolName}`,
      args,
    ].filter(Boolean).join('\n')];
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

    const toolName = typeof toolResult.toolName === 'string'
      ? toolResult.toolName
      : 'unknown';
    const result = serializeBudgetValue(toolResult.result);

    return [[
      `Tool result: ${toolName}`,
      result,
    ].filter(Boolean).join('\n')];
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
