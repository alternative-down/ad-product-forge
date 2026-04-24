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
  recentMessageLimit?: number;
  recentTokenLimit?: number;
  observationTokenLimit?: number;
  overflowObservationTokenLimit?: number;
  maxObservationCount?: number;
  observer?: CheckpointedConversationObserver;
};

type RawConversationUnit = {
  id: string;
  groupId: string;
  parentMessageId: string;
  createdAt: Date;
  tokenCount: number;
  promptMessage: ConversationMessage;
  kind: 'whole' | 'part' | 'tool-invocation' | 'tool-result';
};

type NormalizedCheckpointedConversationState = Omit<
  CheckpointedConversationState,
  'cursorObservedAt'
  | 'cursorObservedRawUnitIds'
  | 'recentRawUnitIds'
  | 'overflowRawUnitIds'
  | 'recentMessageIds'
  | 'overflowMessageIds'
> & {
  cursorObservedAt: string | null;
  cursorObservedRawUnitIds: string[];
  recentRawUnitIds: string[];
  overflowRawUnitIds: string[];
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
    const messages = await this.store.listMessages({
      threadId: this.threadId,
      order: 'asc',
    });
    const rawUnits = getRawUnitsAfterCursor({
      messages,
      state: previousState,
      maxUnitTokens: getMaxRawUnitTokens(this.recentTokenLimit, this.overflowObservationTokenLimit),
    });
    const rawBands = splitRawUnitsByRecentReserve({
      units: rawUnits,
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
    const messages = await this.store.listMessages({
      threadId: this.threadId,
      order: 'asc',
    });
    const messageIndex = messages.findIndex((message) => message.id === messageId);

    if (messageIndex < 0) {
      await this.stateStore.save(currentState);
      return this.sync();
    }

    const observedUnits = sortRawConversationUnitsChronologically(
      messages
        .slice(0, messageIndex + 1)
        .flatMap((message) => splitMessageIntoRawUnits(message, getMaxRawUnitTokens(
          this.recentTokenLimit,
          this.overflowObservationTokenLimit,
        ))),
    );
    const cursorObservedAt = observedUnits.at(-1)?.createdAt?.toISOString() ?? null;
    const cursorObservedRawUnitIds = cursorObservedAt
      ? observedUnits
          .filter((unit) => unit.createdAt.toISOString() === cursorObservedAt)
          .map((unit) => unit.id)
      : [];
    const nextState: NormalizedCheckpointedConversationState = {
      ...currentState,
      checkpointMessageId: messageId,
      cursorObservedAt,
      cursorObservedRawUnitIds,
      recentRawUnitIds: [],
      overflowRawUnitIds: [],
      recentMessageIds: [],
      overflowMessageIds: [],
      updatedAt: new Date().toISOString(),
      metrics: {
        recentMessageCount: 0,
        recentTokenCount: 0,
        overflowMessageCount: 0,
        overflowTokenCount: 0,
        observationCount: currentState.observations.length,
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
        cursorObservedAt: state.cursorObservedAt ?? null,
        cursorObservedRawUnitIds: state.cursorObservedRawUnitIds ?? [],
        overflowRawUnitIds: state.overflowRawUnitIds ?? [],
        overflowTokenCount: state.metrics.overflowTokenCount,
      });

      if (previousLoopSignature === loopSignature) {
        throw new Error(`Checkpointed conversation memory made no progress: ${loopSignature}`);
      }

      previousLoopSignature = loopSignature;

      let observation: CheckpointedConversationObservation | null;

      try {
        observation = await this.consolidateOneOverflowBatch();
      } catch (error) {
        console.warn('[CheckpointedConversationMemory] Observation batch failed; preserving prior progress and stopping OM drain for this cycle.', error);
        return normalizeCheckpointedConversationState(this.threadId, await this.sync());
      }

      if (!observation) {
        return state;
      }

      state = normalizeCheckpointedConversationState(this.threadId, await this.sync());
    }

    return state;
  }

  async renderContext(): Promise<StepContextEntry[]> {
    const messages = await this.renderActiveMessages();

    return messages.map((message) => createConversationMessageContextEntry(message));
  }

  async renderRecentMessages(): Promise<ConversationMessage[]> {
    return this.renderMessagesForRawUnitIds({
      unitIdsSelector(state) {
        return state.recentRawUnitIds ?? [];
      },
    });
  }

  async renderActiveMessages(): Promise<ConversationMessage[]> {
    return this.renderMessagesForRawUnitIds({
      unitIdsSelector(state) {
        return [
          ...(state.overflowRawUnitIds ?? []),
          ...(state.recentRawUnitIds ?? []),
        ];
      },
    });
  }

  private async renderMessagesForRawUnitIds(input: {
    unitIdsSelector(state: NormalizedCheckpointedConversationState): string[];
  }): Promise<ConversationMessage[]> {
    const state = normalizeCheckpointedConversationState(this.threadId, await this.sync());
    const messages = await this.store.listMessages({
      threadId: this.threadId,
      order: 'asc',
    });
    const activeUnits = getRawUnitsAfterCursor({
      messages,
      state,
      maxUnitTokens: getMaxRawUnitTokens(this.recentTokenLimit, this.overflowObservationTokenLimit),
    });
    const activeUnitMap = new Map(activeUnits.map((unit) => [unit.id, unit]));
    const selectedUnits = input.unitIdsSelector(state)
      .map((unitId) => activeUnitMap.get(unitId))
      .filter((unit): unit is RawConversationUnit => Boolean(unit));

    return rebuildMessagesFromUnits({
      messages,
      recentUnits: selectedUnits,
      maxUnitTokens: getMaxRawUnitTokens(this.recentTokenLimit, this.overflowObservationTokenLimit),
    });
  }

  async getState(): Promise<CheckpointedConversationState> {
    return this.sync();
  }

  private async consolidateOneOverflowBatch(): Promise<CheckpointedConversationObservation | null> {
    if (!this.observer) {
      await this.sync();
      return null;
    }

    const state = await this.sync();

    if ((state.overflowRawUnitIds?.length ?? 0) === 0) {
      return null;
    }

    const messages = await this.store.listMessages({
      threadId: this.threadId,
      order: 'asc',
    });
    const activeUnits = getRawUnitsAfterCursor({
      messages,
      state: normalizeCheckpointedConversationState(this.threadId, state),
      maxUnitTokens: getMaxRawUnitTokens(this.recentTokenLimit, this.overflowObservationTokenLimit),
    });
    const overflowUnitSet = new Set(state.overflowRawUnitIds ?? []);
    const overflowUnits = activeUnits.filter((unit) => overflowUnitSet.has(unit.id));
    const observationBatch = takeRawUnitBatch({
      units: overflowUnits,
      tokenLimit: this.overflowObservationTokenLimit,
    });

    if (observationBatch.units.length === 0) {
      return null;
    }

    const response = await this.observer.observe({
      threadId: this.threadId,
      messages: rebuildMessagesFromUnits({
        messages,
        recentUnits: observationBatch.units,
        maxUnitTokens: getMaxRawUnitTokens(this.recentTokenLimit, this.overflowObservationTokenLimit),
      }),
    });
    const observation: CheckpointedConversationObservation = {
      id: `observation:${randomUUID()}`,
      text: response.text,
      sourceMessageIds: Array.from(new Set(observationBatch.units.map((unit) => unit.parentMessageId))),
      createdAt: new Date().toISOString(),
      units: estimateTextUnits(response.text),
    };
    const nextState: NormalizedCheckpointedConversationState = {
      ...normalizeCheckpointedConversationState(this.threadId, state),
      checkpointMessageId: observationBatch.units.at(-1)?.parentMessageId ?? state.checkpointMessageId,
      cursorObservedAt: observationBatch.cursorObservedAt,
      cursorObservedRawUnitIds: observationBatch.cursorObservedRawUnitIds,
      observations: [...state.observations, observation].slice(-this.maxObservationCount),
      updatedAt: new Date().toISOString(),
    };

    await this.stateStore.save(nextState);
    await this.sync();
    return observation;
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
    cursorObservedAt: state?.cursorObservedAt ?? null,
    cursorObservedRawUnitIds: sanitizeRawUnitIds(state?.cursorObservedRawUnitIds),
    recentRawUnitIds: sanitizeRawUnitIds(state?.recentRawUnitIds),
    overflowRawUnitIds: sanitizeRawUnitIds(state?.overflowRawUnitIds),
    recentMessageIds: state?.recentMessageIds ?? [],
    overflowMessageIds: state?.overflowMessageIds ?? [],
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

function getMaxRawUnitTokens(
  recentTokenLimit: number | null,
  overflowObservationTokenLimit: number | null,
) {
  return Math.max(1, recentTokenLimit ?? overflowObservationTokenLimit ?? 1_000);
}

function sanitizeRawUnitIds(value: string[] | undefined) {
  return (value ?? []).filter((item) => typeof item === 'string' && item.includes(':'));
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

function cloneMessageWithParts(
  message: ConversationMessage,
  parts: ConversationMessage['parts'],
): ConversationMessage {
  return {
    ...message,
    parts,
  };
}

function cloneMessageWithContent(input: {
  message: ConversationMessage;
  parts: ConversationMessage['parts'];
  metadata?: Record<string, unknown>;
}): ConversationMessage {
  return {
    ...input.message,
    parts: input.parts,
    metadata: input.metadata,
  };
}

function splitMessageIntoRawUnits(
  message: ConversationMessage,
  _maxUnitTokens: number,
): RawConversationUnit[] {
  const toolInvocations = Array.isArray(message.metadata?.toolInvocations)
    ? message.metadata.toolInvocations
    : [];
  const toolResults = Array.isArray(message.metadata?.toolResults)
    ? message.metadata.toolResults
    : [];

  if (message.parts.length === 0 && toolInvocations.length === 0 && toolResults.length === 0) {
    return [{
      id: `${message.id}:whole`,
      groupId: `${message.id}:whole`,
      parentMessageId: message.id,
      createdAt: new Date(message.createdAt),
      tokenCount: estimateMessageUnits(message),
      promptMessage: message,
      kind: 'whole',
    }];
  }

  const partUnits = message.parts.flatMap((part, index) => {
    const partKey = String(index);
    const createdAt = new Date(message.createdAt);

    if (part.type === 'text') {
      const promptMessage = cloneMessageWithParts(message, [{
        type: 'text',
        text: part.text,
      }]);

      return [{
        id: `${message.id}:part:${partKey}`,
        groupId: `${message.id}:part:${partKey}`,
        parentMessageId: message.id,
        createdAt,
        tokenCount: estimateMessageUnits(promptMessage),
        promptMessage,
        kind: 'part',
      } satisfies RawConversationUnit];
    }

    if (part.type === 'reasoning') {
      const promptMessage = cloneMessageWithParts(message, [{
        type: 'reasoning',
        text: part.text,
        providerMetadata: part.providerMetadata,
      }]);

      return [{
        id: `${message.id}:part:${partKey}`,
        groupId: `${message.id}:part:${partKey}`,
        parentMessageId: message.id,
        createdAt,
        tokenCount: estimateMessageUnits(promptMessage),
        promptMessage,
        kind: 'part',
      } satisfies RawConversationUnit];
    }

    const promptMessage = cloneMessageWithParts(message, [part]);
    return [{
      id: `${message.id}:part:${partKey}`,
      groupId: `${message.id}:part:${partKey}`,
      parentMessageId: message.id,
      createdAt,
      tokenCount: estimateMessageUnits(promptMessage),
      promptMessage,
      kind: 'part',
    } satisfies RawConversationUnit];
  });

  const toolInvocationUnits = toolInvocations.flatMap((toolInvocation, index) => {
    if (typeof toolInvocation !== 'object' || toolInvocation === null) {
      return [];
    }

    const promptMessage = cloneMessageWithContent({
      message,
      parts: [],
      metadata: {
        ...message.metadata,
        toolInvocations: [toolInvocation],
      },
    });

    return [{
      id: `${message.id}:tool-invocation:${index}`,
      groupId: buildToolConversationGroupId(toolInvocation, `${message.id}:tool-invocation:${index}`),
      parentMessageId: message.id,
      createdAt: new Date(message.createdAt),
      tokenCount: estimateMessageUnits(promptMessage),
      promptMessage,
      kind: 'tool-invocation' as const,
    }];
  });

  const toolResultUnits = toolResults.flatMap((toolResult, index) => {
    if (typeof toolResult !== 'object' || toolResult === null) {
      return [];
    }

    const promptMessage = cloneMessageWithContent({
      message,
      parts: [],
      metadata: {
        ...message.metadata,
        toolResults: [toolResult],
      },
    });

    return [{
      id: `${message.id}:tool-result:${index}`,
      groupId: buildToolConversationGroupId(toolResult, `${message.id}:tool-result:${index}`),
      parentMessageId: message.id,
      createdAt: new Date(message.createdAt),
      tokenCount: estimateMessageUnits(promptMessage),
      promptMessage,
      kind: 'tool-result' as const,
    }];
  });

  return [
    ...partUnits,
    ...toolInvocationUnits,
    ...toolResultUnits,
  ];
}

function sortRawConversationUnitsChronologically(units: RawConversationUnit[]) {
  return units
    .map((unit, index) => ({ unit, index }))
    .sort((left, right) => {
      const timeDifference = left.unit.createdAt.getTime() - right.unit.createdAt.getTime();

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return left.index - right.index;
    })
    .map(({ unit }) => unit);
}

function isObservedRawUnit(
  state: NormalizedCheckpointedConversationState,
  unit: RawConversationUnit,
) {
  if (!state.cursorObservedAt) {
    return false;
  }

  const cursorTime = new Date(state.cursorObservedAt).getTime();
  const unitTime = unit.createdAt.getTime();

  if (unitTime < cursorTime) {
    return true;
  }

  if (unitTime > cursorTime) {
    return false;
  }

  return state.cursorObservedRawUnitIds.includes(unit.id);
}

function getRawUnitsAfterCursor(input: {
  messages: ConversationMessage[];
  state: NormalizedCheckpointedConversationState;
  maxUnitTokens: number;
}) {
  const units = sortRawConversationUnitsChronologically(
    input.messages.flatMap((message) => splitMessageIntoRawUnits(message, input.maxUnitTokens)),
  );

  return units.filter((unit) => !isObservedRawUnit(input.state, unit));
}

function splitRawUnitsByRecentReserve(input: {
  units: RawConversationUnit[];
  recentTokenLimit: number | null;
}) {
  const groups = groupRawConversationUnits(input.units);
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

  const recentUnits: RawConversationUnit[] = [];
  const overflowUnits: RawConversationUnit[] = [];
  let overflowTokenCount = 0;

  for (const unit of input.units) {
    if (recentGroupIds.has(unit.groupId)) {
      recentUnits.push(unit);
      continue;
    }

    overflowUnits.push(unit);
    overflowTokenCount += unit.tokenCount;
  }

  return {
    recentUnits,
    recentTokenCount,
    overflowUnits,
    overflowTokenCount,
  };
}

function takeRawUnitBatch(input: {
  units: RawConversationUnit[];
  tokenLimit: number | null;
}) {
  const units: RawConversationUnit[] = [];
  let tokenCount = 0;

  for (const group of groupRawConversationUnits(input.units)) {
    units.push(...group.units);
    tokenCount += group.tokenCount;

    if (input.tokenLimit !== null && tokenCount >= input.tokenLimit) {
      break;
    }
  }

  const cursorObservedAt = units.at(-1)?.createdAt?.toISOString() ?? null;
  const cursorObservedRawUnitIds = cursorObservedAt
    ? units
        .filter((unit) => unit.createdAt.toISOString() === cursorObservedAt)
        .map((unit) => unit.id)
    : [];

  return {
    units,
    tokenCount,
    cursorObservedAt,
    cursorObservedRawUnitIds,
  };
}

function groupRawConversationUnits(units: RawConversationUnit[]) {
  const orderedGroups: Array<{
    groupId: string;
    tokenCount: number;
    units: RawConversationUnit[];
  }> = [];
  const groupMap = new Map<string, {
    groupId: string;
    tokenCount: number;
    units: RawConversationUnit[];
  }>();

  for (const unit of units) {
    const existingGroup = groupMap.get(unit.groupId);

    if (existingGroup) {
      existingGroup.units.push(unit);
      existingGroup.tokenCount += unit.tokenCount;
      continue;
    }

    const nextGroup = {
      groupId: unit.groupId,
      tokenCount: unit.tokenCount,
      units: [unit],
    };

    groupMap.set(unit.groupId, nextGroup);
    orderedGroups.push(nextGroup);
  }

  return orderedGroups;
}

function buildToolConversationGroupId(value: unknown, fallbackId: string) {
  if (
    typeof value === 'object'
    && value !== null
    && 'toolCallId' in value
    && typeof value.toolCallId === 'string'
    && value.toolCallId.trim()
  ) {
    return `tool-call:${value.toolCallId}`;
  }

  return fallbackId;
}

function getPartIndex(unitId: string) {
  const match = unitId.match(/:part:(\d+)/);
  return match ? Number(match[1]) : null;
}

function getToolInvocationIndex(unitId: string) {
  const match = unitId.match(/:tool-invocation:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function getToolResultIndex(unitId: string) {
  const match = unitId.match(/:tool-result:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function rebuildMessagesFromUnits(input: {
  messages: ConversationMessage[];
  recentUnits: RawConversationUnit[];
  maxUnitTokens: number;
}) {
  const recentUnitMap = new Map<string, RawConversationUnit[]>();

  for (const unit of input.recentUnits) {
    const units = recentUnitMap.get(unit.parentMessageId) ?? [];

    units.push(unit);
    recentUnitMap.set(unit.parentMessageId, units);
  }

  return input.messages.flatMap((message) => {
    const units = recentUnitMap.get(message.id);

    if (!units || units.length === 0) {
      return [];
    }

    const originalUnits = splitMessageIntoRawUnits(message, input.maxUnitTokens);

    if (units.length === originalUnits.length) {
      return [message];
    }

    const rebuiltParts: ConversationMessage['parts'] = [];
    const sourceMetadata = message.metadata && typeof message.metadata === 'object'
      ? { ...message.metadata }
      : undefined;

    for (const [index, part] of message.parts.entries()) {
      const remainingUnits = units
        .filter((unit) => getPartIndex(unit.id) === index);

      if (remainingUnits.length === 0) {
        continue;
      }

      if (part.type === 'text' || part.type === 'reasoning') {
        const text = remainingUnits
          .map((unit) => unit.promptMessage.parts[0])
          .filter((unitPart): unitPart is Extract<ConversationMessage['parts'][number], { type: 'text' | 'reasoning' }> =>
            Boolean(unitPart) && (unitPart.type === 'text' || unitPart.type === 'reasoning'))
          .map((unitPart) => unitPart.text)
          .join('\n')
          .trim();

        if (!text) {
          continue;
        }

        rebuiltParts.push({
          type: part.type,
          text,
          ...(part.type === 'reasoning' && part.providerMetadata
            ? { providerMetadata: part.providerMetadata }
            : {}),
        });
        continue;
      }

      rebuiltParts.push(part);
    }

    const originalToolInvocations = Array.isArray(message.metadata?.toolInvocations)
      ? message.metadata.toolInvocations
      : [];
    const rebuiltToolInvocations = originalToolInvocations.filter((_toolInvocation, index) =>
      units.some((unit) => getToolInvocationIndex(unit.id) === index));
    if (sourceMetadata) {
      if (rebuiltToolInvocations.length > 0) {
        sourceMetadata.toolInvocations = rebuiltToolInvocations;
      } else {
        delete sourceMetadata.toolInvocations;
      }
    }

    const originalToolResults = Array.isArray(message.metadata?.toolResults)
      ? message.metadata.toolResults
      : [];
    const rebuiltToolResults = originalToolResults.filter((_toolResult, index) =>
      units.some((unit) => getToolResultIndex(unit.id) === index));
    if (sourceMetadata) {
      if (rebuiltToolResults.length > 0) {
        sourceMetadata.toolResults = rebuiltToolResults;
      } else {
        delete sourceMetadata.toolResults;
      }
    }

    const rebuiltMetadata = sourceMetadata && Object.keys(sourceMetadata).length > 0
      ? sourceMetadata
      : undefined;

    return rebuiltParts.length > 0 || rebuiltMetadata
      ? [cloneMessageWithContent({
          message,
          parts: rebuiltParts,
          metadata: rebuiltMetadata,
        })]
      : [];
  });
}

function createNextState(input: {
  previousState: NormalizedCheckpointedConversationState;
  rawBands: {
    recentUnits: RawConversationUnit[];
    recentTokenCount: number;
    overflowUnits: RawConversationUnit[];
    overflowTokenCount: number;
  };
}): NormalizedCheckpointedConversationState {
  const recentMessageIds = Array.from(new Set(input.rawBands.recentUnits.map((unit) => unit.parentMessageId)));
  const overflowMessageIds = Array.from(new Set(input.rawBands.overflowUnits.map((unit) => unit.parentMessageId)));

  return {
    ...input.previousState,
    recentRawUnitIds: input.rawBands.recentUnits.map((unit) => unit.id),
    overflowRawUnitIds: input.rawBands.overflowUnits.map((unit) => unit.id),
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
  if ((input.state.overflowRawUnitIds?.length ?? 0) === 0) {
    return false;
  }

  if (input.overflowObservationTokenLimit === null) {
    return true;
  }

  return input.state.metrics.overflowTokenCount >= input.overflowObservationTokenLimit;
}
