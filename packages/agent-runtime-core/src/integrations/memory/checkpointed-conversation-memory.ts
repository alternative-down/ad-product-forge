import { randomUUID } from 'node:crypto';

import type { StepContextEntry } from '../../core/types.js';
import { createConversationMessageContextEntry } from '../conversations/context-entries.js';
import type { ConversationMessage, ConversationStore } from '../conversations/contracts.js';

import type {
  CheckpointedConversationObservation,
  CheckpointedConversationState,
  CheckpointedConversationStateStore,
} from './checkpointed-conversation-state-store.js';

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
  stateStore: CheckpointedConversationStateStore;
  recentTokenLimit?: number;
  overflowObservationTokenLimit?: number;
  maxObservationCount?: number;
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
  private readonly stateStore: CheckpointedConversationStateStore;
  private readonly recentTokenLimit: number | null;
  private readonly overflowObservationTokenLimit: number | null;
  private readonly maxObservationCount: number;
  private readonly observer: CheckpointedConversationObserver | null;

  constructor(options: CheckpointedConversationMemoryOptions) {
    this.threadId = options.threadId;
    this.store = options.store;
    this.stateStore = options.stateStore;
    this.recentTokenLimit = options.recentTokenLimit ?? null;
    this.overflowObservationTokenLimit = options.overflowObservationTokenLimit ?? null;
    this.maxObservationCount = options.maxObservationCount ?? 20;
    this.observer = options.observer ?? null;
  }

  async sync(): Promise<CheckpointedConversationState> {
    const previousState = await this.loadState();
    const rawMessages = await this.listVisibleRawMessages(previousState);
    const rawBands = splitRawMessagesByRecentReserve({
      messages: rawMessages,
      recentTokenLimit: this.recentTokenLimit,
    });
    const nextState = createNextState({
      previousState,
      rawBands,
    });

    await this.stateStore.save(nextState);
    return nextState;
  }

  async createCheckpoint(messageId: string): Promise<CheckpointedConversationState> {
    const currentState = await this.loadState();
    const messagesAfterCheckpoint = await this.listMessagesAfterCheckpoint(messageId);
    const activeMessageIds = new Set(messagesAfterCheckpoint.map((message) => message.id));
    const nextState: NormalizedCheckpointedConversationState = {
      ...currentState,
      checkpointMessageId: messageId,
      recentMessageIds: [],
      overflowMessageIds: [],
      observations: currentState.observations.filter((observation) =>
        observation.sourceMessageIds.some((sourceMessageId) => activeMessageIds.has(sourceMessageId))),
      updatedAt: new Date().toISOString(),
      metrics: {
        recentMessageCount: 0,
        recentTokenCount: 0,
        overflowMessageCount: 0,
        overflowTokenCount: 0,
        observationCount: 0,
        totalActiveMessageCount: 0,
      },
    };

    await this.stateStore.save(nextState);
    return this.sync();
  }

  async stabilize(): Promise<CheckpointedConversationState> {
    let state = normalizeCheckpointedConversationState(this.threadId, await this.sync());
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
        observationCount: state.observations.length,
      });

      if (previousLoopSignature === loopSignature) {
        throw new Error(`Checkpointed conversation memory made no progress: ${loopSignature}`);
      }

      previousLoopSignature = loopSignature;

      try {
        const observation = await this.consolidateOneOverflowBatch();

        if (!observation) {
          return state;
        }
      } catch (error) {
        console.warn(
          '[CheckpointedConversationMemory] Observation batch failed; preserving prior progress and stopping OM drain for this cycle.',
          error,
        );
        return normalizeCheckpointedConversationState(this.threadId, await this.sync());
      }

      state = normalizeCheckpointedConversationState(this.threadId, await this.sync());
    }

    return state;
  }

  async renderContext(): Promise<StepContextEntry[]> {
    const messages = await this.renderActiveMessages();

    return messages.map((message) => createConversationMessageContextEntry(message));
  }

  async renderActiveMessages(): Promise<ConversationMessage[]> {
    return this.renderMessagesByIds((state) => [
      ...state.overflowMessageIds,
      ...state.recentMessageIds,
    ]);
  }

  async getState(): Promise<CheckpointedConversationState> {
    return this.sync();
  }

  private async renderMessagesByIds(
    selectMessageIds: (state: NormalizedCheckpointedConversationState) => string[],
  ): Promise<ConversationMessage[]> {
    const state = normalizeCheckpointedConversationState(this.threadId, await this.sync());
    const visibleMessages = await this.listVisibleRawMessages(state);
    const visibleMessageMap = new Map(visibleMessages.map((message) => [message.id, message.message]));

    return selectMessageIds(state)
      .map((messageId) => visibleMessageMap.get(messageId))
      .filter((message): message is ConversationMessage => Boolean(message));
  }

  private async consolidateOneOverflowBatch(): Promise<CheckpointedConversationObservation | null> {
    if (!this.observer) {
      await this.sync();
      return null;
    }

    const state = normalizeCheckpointedConversationState(this.threadId, await this.sync());

    if (state.overflowMessageIds.length === 0) {
      return null;
    }

    const visibleMessages = await this.listVisibleRawMessages(state);
    const overflowMessageIdSet = new Set(state.overflowMessageIds);
    const overflowMessages = visibleMessages.filter((message) => overflowMessageIdSet.has(message.id));
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
    const observation: CheckpointedConversationObservation = {
      id: `observation:${randomUUID()}`,
      text: response.text,
      sourceMessageIds: observationBatch.messages.map((entry) => entry.id),
      createdAt: new Date().toISOString(),
      units: estimateTextUnits(response.text),
    };
    const nextState: NormalizedCheckpointedConversationState = {
      ...state,
      observations: [...state.observations, observation].slice(-this.maxObservationCount),
      updatedAt: new Date().toISOString(),
    };

    await this.stateStore.save(nextState);
    await this.sync();
    return observation;
  }

  private async listVisibleRawMessages(
    state: NormalizedCheckpointedConversationState,
  ): Promise<RawConversationMessage[]> {
    const messages = await this.listMessagesAfterCheckpoint(state.checkpointMessageId);
    const replacedMessageIds = new Set(
      state.observations.flatMap((observation) => observation.sourceMessageIds),
    );

    return buildRawConversationMessages(
      messages.filter((message) => !replacedMessageIds.has(message.id)),
    );
  }

  private async listMessagesAfterCheckpoint(checkpointMessageId: string | null) {
    return this.store.listMessages({
      threadId: this.threadId,
      order: 'asc',
      ...(checkpointMessageId ? { afterMessageId: checkpointMessageId } : {}),
    });
  }

  private async loadState(): Promise<NormalizedCheckpointedConversationState> {
    return normalizeCheckpointedConversationState(
      this.threadId,
      await this.stateStore.load(this.threadId),
    );
  }
}

function normalizeCheckpointedConversationState(
  threadId: string,
  state: CheckpointedConversationState | null,
): NormalizedCheckpointedConversationState {
  return {
    threadId,
    checkpointMessageId: state?.checkpointMessageId ?? null,
    recentMessageIds: sanitizeMessageIds(state?.recentMessageIds),
    overflowMessageIds: sanitizeMessageIds(state?.overflowMessageIds),
    observations: state?.observations ?? [],
    metrics: state?.metrics ?? {
      recentMessageCount: 0,
      recentTokenCount: 0,
      overflowMessageCount: 0,
      overflowTokenCount: 0,
      observationCount: 0,
      totalActiveMessageCount: 0,
    },
    updatedAt: state?.updatedAt ?? new Date(0).toISOString(),
  };
}

function sanitizeMessageIds(value: string[] | undefined) {
  return (value ?? []).filter((item) => typeof item === 'string' && item.length > 0);
}

function estimateTextUnits(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateMessageUnits(message: ConversationMessage) {
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

function createNextState(input: {
  previousState: NormalizedCheckpointedConversationState;
  rawBands: {
    recentMessages: RawConversationMessage[];
    recentTokenCount: number;
    overflowMessages: RawConversationMessage[];
    overflowTokenCount: number;
  };
}): NormalizedCheckpointedConversationState {
  const recentMessageIds = input.rawBands.recentMessages.map((message) => message.id);
  const overflowMessageIds = input.rawBands.overflowMessages.map((message) => message.id);

  return {
    ...input.previousState,
    recentMessageIds,
    overflowMessageIds,
    metrics: {
      recentMessageCount: recentMessageIds.length,
      recentTokenCount: input.rawBands.recentTokenCount,
      overflowMessageCount: overflowMessageIds.length,
      overflowTokenCount: input.rawBands.overflowTokenCount,
      observationCount: input.previousState.observations.length,
      totalActiveMessageCount: recentMessageIds.length + overflowMessageIds.length,
    },
    updatedAt: new Date().toISOString(),
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
