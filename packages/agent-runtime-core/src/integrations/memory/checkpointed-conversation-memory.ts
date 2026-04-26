import { countTokens } from '../../token-counter.js';
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
  createdAt: Date;
  tokenCount: number;
  message: ConversationMessage;
};

type NormalizedCheckpointedConversationState = CheckpointedConversationState & {
  recentMessageIds: string[];
  overflowMessageIds: string[];
};

type CheckpointedConversationDiagnostics = {
  record(event: {
    at: number;
    scope: string;
    phase: string;
    metrics?: Record<string, number | string | null>;
    detail?: Record<string, unknown> | null;
  }): void;
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

  async sync(input?: {
    diagnostics?: CheckpointedConversationDiagnostics;
  }): Promise<CheckpointedConversationState> {
    const state = await this.loadState();

    input?.diagnostics?.record({
      at: Date.now(),
      scope: 'checkpointed-conversation',
      phase: 'sync-loaded-state',
      metrics: summarizeCheckpointedConversationMetrics(state),
    });

    return state;
  }

  async stabilize(input?: {
    diagnostics?: CheckpointedConversationDiagnostics;
  }): Promise<CheckpointedConversationState> {
    let state = await this.loadState();
    let previousLoopSignature: string | null = null;

    input?.diagnostics?.record({
      at: Date.now(),
      scope: 'checkpointed-conversation',
      phase: 'stabilize-start',
      metrics: summarizeCheckpointedConversationMetrics(state),
    });

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

      input?.diagnostics?.record({
        at: Date.now(),
        scope: 'checkpointed-conversation',
        phase: 'overflow-batch-start',
        metrics: summarizeCheckpointedConversationMetrics(state),
      });

      try {
        const observation = await this.consolidateOneOverflowBatch(state, input?.diagnostics);

        if (!observation) {
          return state;
        }

        input?.diagnostics?.record({
          at: Date.now(),
          scope: 'checkpointed-conversation',
          phase: 'overflow-batch-applied',
          detail: {
            observationId: observation.id,
            observationUnits: observation.units,
            sourceMessageCount: observation.sourceMessageIds.length,
          },
        });
      } catch (error) {
        input?.diagnostics?.record({
          at: Date.now(),
          scope: 'checkpointed-conversation',
          phase: 'overflow-batch-failed',
          metrics: summarizeCheckpointedConversationMetrics(state),
          detail: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        console.warn(
          '[CheckpointedConversationMemory] Observation batch failed; preserving prior progress and stopping OM drain for this cycle.',
          error,
        );
        return this.loadState();
      }

      state = await this.loadState();
    }

    input?.diagnostics?.record({
      at: Date.now(),
      scope: 'checkpointed-conversation',
      phase: 'stabilize-finished',
      metrics: summarizeCheckpointedConversationMetrics(state),
    });

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
    diagnostics?: CheckpointedConversationDiagnostics,
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

    diagnostics?.record({
      at: Date.now(),
      scope: 'checkpointed-conversation',
      phase: 'overflow-batch-selected',
      detail: {
        batchTokenCount: observationBatch.tokenCount,
        batchMessageCount: observationBatch.messages.length,
        sourceMessageIds: observationBatch.messages.map((entry) => entry.id),
      },
    });

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
      createdAt: observationBatch.messages[0].createdAt.toISOString(),
      units: countTokens(observationText),
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

    diagnostics?.record({
      at: Date.now(),
      scope: 'checkpointed-conversation',
      phase: 'overflow-batch-persisted',
      detail: {
        observationId,
        observationTextLength: observationText.length,
        observationUnits: observation.units,
      },
    });

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


export function estimateMessageUnits(message: ConversationMessage) {
  const text = getMessageBudgetText(message);

  if (text) {
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
    createdAt: new Date(message.createdAt),
    tokenCount: estimateMessageUnits(message),
    message,
  }));
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
  const recentGroups: typeof groups = [];
  let recentTokenCount = 0;

  if (input.recentTokenLimit === null) {
    for (const group of groups) {
      recentGroups.push(group);
      recentTokenCount += group.tokenCount;
    }
  } else {
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index];

      if (recentTokenCount + group.tokenCount > input.recentTokenLimit) {
        break;
      }

      recentGroups.unshift(group);
      recentTokenCount += group.tokenCount;
    }
  }
  const overflowGroups = groups.slice(0, groups.length - recentGroups.length);
  const recentMessages = recentGroups.flatMap((group) => group.messages);
  const overflowMessages = overflowGroups.flatMap((group) => group.messages);
  const overflowTokenCount = overflowGroups.reduce((total, group) => total + group.tokenCount, 0);

  return {
    recentMessages,
    recentTokenCount,
    overflowMessages,
    overflowTokenCount,
  };
}

function groupRawConversationMessages(messages: RawConversationMessage[]) {
  const orderedGroups: Array<{
    tokenCount: number;
    messages: RawConversationMessage[];
    toolCallIds: Set<string>;
  }> = [];

  for (const message of messages) {
    const toolCallIds = new Set(getMessageToolCallIds(message.message));
    const previousGroup = orderedGroups.at(-1);

    if (
      previousGroup
      && toolCallIds.size > 0
      && hasToolCallIdOverlap(previousGroup.toolCallIds, toolCallIds)
    ) {
      previousGroup.messages.push(message);
      previousGroup.tokenCount += message.tokenCount;

      for (const toolCallId of toolCallIds) {
        previousGroup.toolCallIds.add(toolCallId);
      }

      continue;
    }

    const nextGroup = {
      tokenCount: message.tokenCount,
      messages: [message],
      toolCallIds,
    };

    orderedGroups.push(nextGroup);
  }

  return orderedGroups;
}

function hasToolCallIdOverlap(left: Set<string>, right: Set<string>) {
  for (const toolCallId of right) {
    if (left.has(toolCallId)) {
      return true;
    }
  }

  return false;
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

function summarizeCheckpointedConversationMetrics(state: NormalizedCheckpointedConversationState) {
  return {
    checkpointMessageId: state.checkpointMessageId,
    recentMessageCount: state.metrics.recentMessageCount,
    recentTokenCount: state.metrics.recentTokenCount,
    overflowMessageCount: state.metrics.overflowMessageCount,
    overflowTokenCount: state.metrics.overflowTokenCount,
    observationCount: state.metrics.observationCount,
    totalActiveMessageCount: state.metrics.totalActiveMessageCount,
  };
}
