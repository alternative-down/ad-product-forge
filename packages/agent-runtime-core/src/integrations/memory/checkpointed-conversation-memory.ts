import { randomUUID } from 'node:crypto';

import type { StepContextEntry } from '../../core/types.js';
import { createConversationMessageContextEntry } from '../conversations/context-entries.js';
import type { ConversationMessage, ConversationStore } from '../conversations/contracts.js';

import type { CheckpointedConversationObservation, CheckpointedConversationState } from './checkpointed-conversation-state-store.js';

export type CheckpointedConversationObserverRequest = {
  threadId: string;
  messages: ConversationMessage[];
};

export type CheckpointedConversationObserverResponse = {
  text: string;
};

export interface CheckpointedConversationObserver {
  observe(
    request: CheckpointedConversationObserverRequest,
  ): Promise<CheckpointedConversationObserverResponse>;
}

export type CheckpointedConversationMemoryOptions = {
  threadId: string;
  store: ConversationStore;
  recentTokenLimit?: number;
  overflowObservationTokenLimit?: number;
  observer?: CheckpointedConversationObserver;
};

type RawConversationMessage = {
  id: string;
  groupId: string;
  createdAt: Date;
  tokenCount: number;
  message: ConversationMessage;
};

type NormalizedCheckpointedConversationState = CheckpointedConversationState & {
  recentMessageIds: string[];
  overflowMessageIds: string[];
};

export class CheckpointedConversationMemory {
  private readonly threadId: string;
  private readonly store: ConversationStore;
  private readonly recentTokenLimit: number | null;
  private readonly overflowObservationTokenLimit: number | null;
  private readonly observer: CheckpointedConversationObserver | null;

  constructor(options: CheckpointedConversationMemoryOptions) {
    this.threadId = options.threadId;
    this.store = options.store;
    this.recentTokenLimit = options.recentTokenLimit ?? null;
    this.overflowObservationTokenLimit = options.overflowObservationTokenLimit ?? null;
    this.observer = options.observer ?? null;
  }

  async sync(): Promise<CheckpointedConversationState> {
    const state = await this.loadState();

    return state;
  }

  async stabilize(): Promise<CheckpointedConversationState> {
    let state = await this.loadState();
    let previousLoopSignature: string | null = null;

    if (!this.observer) {
      return state;
    }

    while (shouldObserveOverflow({
      state,
      overflowObservationTokenLimit: this.overflowObservationTokenLimit,
    })) {
      const loopSignature = JSON.stringify({
        checkpointMessageId: state.checkpointMessageId,
        overflowMessageIds: state.overflowMessageIds,
        overflowTokenCount: state.metrics.overflowTokenCount,
      });

      if (previousLoopSignature === loopSignature) {
        throw new Error(`Checkpointed conversation memory made no progress: ${loopSignature}`);
      }

      previousLoopSignature = loopSignature;

      try {
        const observation = await this.consolidateOneOverflowBatch(state);

        if (!observation) {
          return state;
        }
      } catch (error) {
        console.warn(
          '[CheckpointedConversationMemory] Observation batch failed; preserving prior progress and stopping OM drain for this cycle.',
          error,
        );
        return this.loadState();
      }

      state = await this.loadState();
    }

    return state;
  }

  async renderContext(): Promise<StepContextEntry[]> {
    const messages = await this.renderActiveMessages();

    return messages.map((message) => createConversationMessageContextEntry(message));
  }

  async renderActiveMessages(): Promise<ConversationMessage[]> {
    const state = await this.loadState();
    const visibleMessages = await this.store.listOperationalMemoryMessages({
      threadId: this.threadId,
    });
    const visibleMessageMap = new Map(visibleMessages.map((message) => [message.id, message]));

    return [
      ...state.overflowMessageIds,
      ...state.recentMessageIds,
    ]
      .map((messageId) => visibleMessageMap.get(messageId))
      .filter((message): message is ConversationMessage => Boolean(message));
  }

  async getState(): Promise<CheckpointedConversationState> {
    return this.loadState();
  }

  private async consolidateOneOverflowBatch(
    state: NormalizedCheckpointedConversationState,
  ): Promise<CheckpointedConversationObservation | null> {
    if (!this.observer) {
      return null;
    }

    if (state.overflowMessageIds.length === 0) {
      return null;
    }

    const visibleMessages = await this.store.listOperationalMemoryMessages({
      threadId: this.threadId,
    });
    const overflowMessageIdSet = new Set(state.overflowMessageIds);
    const overflowMessages = buildRawConversationMessages(
      visibleMessages.filter((message) =>
        !message.operationalMemoryType && overflowMessageIdSet.has(message.id)),
    );
    const observationBatch = takeRawMessageBatch({
      messages: overflowMessages,
      tokenLimit: this.overflowObservationTokenLimit,
    });

    if (observationBatch.messages.length === 0) {
      return null;
    }

    const response = await this.observer.observe({
      threadId: this.threadId,
      messages: observationBatch.messages.map((entry) => entry.message),
    });
    const observationId = `observation:${randomUUID()}`;
    const observationText = response.text.trim();
    const observation: CheckpointedConversationObservation = {
      id: observationId,
      text: observationText,
      sourceMessageIds: observationBatch.messages.map((entry) => entry.id),
      createdAt: new Date().toISOString(),
      units: estimateTextUnits(observationText),
    };

    await this.store.appendMessage({
      id: observationId,
      threadId: this.threadId,
      role: 'assistant',
      parts: [{
        type: 'text',
        text: observationText,
      }],
      operationalMemoryType: 'observation',
      createdAt: observation.createdAt,
    });
    await Promise.all(observation.sourceMessageIds.map((messageId) =>
      this.store.updateMessageReplacement({
        threadId: this.threadId,
        messageId,
        replacedByMessageId: observationId,
      })));

    return observation;
  }

  private async loadState(): Promise<NormalizedCheckpointedConversationState> {
    const messages = await this.store.listOperationalMemoryMessages({
      threadId: this.threadId,
    });
    const checkpointMessage = [...messages].reverse().find((message) =>
      message.operationalMemoryType === 'checkpoint-summary') ?? null;
    const rawMessages = buildRawConversationMessages(
      messages.filter((message) => !message.operationalMemoryType),
    );
    const rawBands = splitRawMessagesByRecentReserve({
      messages: rawMessages,
      recentTokenLimit: this.recentTokenLimit,
    });
    const observationMessages = messages.filter((message) => message.operationalMemoryType === 'observation');

    return {
      threadId: this.threadId,
      checkpointMessageId: checkpointMessage?.id ?? null,
      recentMessageIds: rawBands.recentMessages.map((message) => message.id),
      overflowMessageIds: rawBands.overflowMessages.map((message) => message.id),
      observations: observationMessages.map((message) => ({
        id: message.id,
        text: getMessageText(message),
        sourceMessageIds: [],
        createdAt: message.createdAt,
        units: estimateMessageUnits(message),
      })),
      metrics: {
        recentMessageCount: rawBands.recentMessages.length,
        recentTokenCount: rawBands.recentTokenCount,
        overflowMessageCount: rawBands.overflowMessages.length,
        overflowTokenCount: rawBands.overflowTokenCount,
        observationCount: observationMessages.length,
        totalActiveMessageCount: rawMessages.length,
      },
      updatedAt: messages.at(-1)?.createdAt ?? new Date().toISOString(),
    };
  }
}

export function estimateTextUnits(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateMessageUnits(message: ConversationMessage) {
  const text = getMessageBudgetText(message);

  if (text) {
    return estimateTextUnits(text);
  }

  return 1;
}

function getMessageText(message: ConversationMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' | 'reasoning' }> =>
      part.type === 'text' || part.type === 'reasoning')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
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

function buildRawConversationMessages(messages: ConversationMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    groupId: getMessageGroupId(message),
    createdAt: new Date(message.createdAt),
    tokenCount: estimateMessageUnits(message),
    message,
  }));
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

function splitRawMessagesByRecentReserve(input: {
  messages: RawConversationMessage[];
  recentTokenLimit: number | null;
}) {
  const groups = groupRawConversationMessages(input.messages);
  const recentGroupIds = new Set<string>();
  let recentTokenCount = 0;

  if (input.recentTokenLimit === null) {
    for (const group of groups) {
      recentGroupIds.add(group.groupId);
      recentTokenCount += group.tokenCount;
    }
  } else {
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index];

      if (recentTokenCount + group.tokenCount > input.recentTokenLimit) {
        break;
      }

      recentGroupIds.add(group.groupId);
      recentTokenCount += group.tokenCount;
    }
  }

  const recentMessages: RawConversationMessage[] = [];
  const overflowMessages: RawConversationMessage[] = [];
  let overflowTokenCount = 0;

  for (const message of input.messages) {
    if (recentGroupIds.has(message.groupId)) {
      recentMessages.push(message);
      continue;
    }

    overflowMessages.push(message);
    overflowTokenCount += message.tokenCount;
  }

  return {
    recentMessages,
    recentTokenCount,
    overflowMessages,
    overflowTokenCount,
  };
}

function groupRawConversationMessages(messages: RawConversationMessage[]) {
  const orderedGroups: Array<{
    groupId: string;
    tokenCount: number;
    messages: RawConversationMessage[];
  }> = [];
  const groupMap = new Map<string, {
    groupId: string;
    tokenCount: number;
    messages: RawConversationMessage[];
  }>();

  for (const message of messages) {
    const existingGroup = groupMap.get(message.groupId);

    if (existingGroup) {
      existingGroup.messages.push(message);
      existingGroup.tokenCount += message.tokenCount;
      continue;
    }

    const nextGroup = {
      groupId: message.groupId,
      tokenCount: message.tokenCount,
      messages: [message],
    };

    groupMap.set(message.groupId, nextGroup);
    orderedGroups.push(nextGroup);
  }

  return orderedGroups;
}

function takeRawMessageBatch(input: {
  messages: RawConversationMessage[];
  tokenLimit: number | null;
}) {
  const selected: RawConversationMessage[] = [];
  let tokenCount = 0;

  for (const group of groupRawConversationMessages(input.messages)) {
    selected.push(...group.messages);
    tokenCount += group.tokenCount;

    if (input.tokenLimit !== null && tokenCount >= input.tokenLimit) {
      break;
    }
  }

  return {
    messages: selected,
    tokenCount,
  };
}

function shouldObserveOverflow(input: {
  state: NormalizedCheckpointedConversationState;
  overflowObservationTokenLimit: number | null;
}) {
  if (input.state.overflowMessageIds.length === 0) {
    return false;
  }

  if (input.overflowObservationTokenLimit === null) {
    return true;
  }

  return input.state.metrics.overflowTokenCount >= input.overflowObservationTokenLimit;
}
