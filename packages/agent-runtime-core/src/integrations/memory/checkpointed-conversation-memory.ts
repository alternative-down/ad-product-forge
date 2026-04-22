import { randomUUID } from 'node:crypto';

import { createTextStepContextEntry } from '../../core/step-context.js';
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
  maxObservationCount?: number;
  observer?: CheckpointedConversationObserver;
};

export class CheckpointedConversationMemory {
  private readonly threadId: string;
  private readonly store: ConversationStore;
  private readonly stateStore: CheckpointedConversationStateStore;
  private readonly recentMessageLimit: number;
  private readonly maxObservationCount: number;
  private readonly observer: CheckpointedConversationObserver | null;

  constructor(options: CheckpointedConversationMemoryOptions) {
    this.threadId = options.threadId;
    this.store = options.store;
    this.stateStore = options.stateStore;
    this.recentMessageLimit = options.recentMessageLimit ?? 20;
    this.maxObservationCount = options.maxObservationCount ?? 20;
    this.observer = options.observer ?? null;
  }

  async sync(): Promise<CheckpointedConversationState> {
    const previousState = await this.loadState();
    const activeMessages = await this.store.listMessages({
      threadId: this.threadId,
      afterMessageId: previousState.checkpointMessageId ?? undefined,
    });
    const recentMessages = activeMessages.slice(-this.recentMessageLimit);
    const overflowMessages = activeMessages.slice(0, Math.max(0, activeMessages.length - recentMessages.length));
    const nextState: CheckpointedConversationState = {
      ...previousState,
      recentMessageIds: recentMessages.map((message) => message.id),
      overflowMessageIds: overflowMessages.map((message) => message.id),
      metrics: {
        recentMessageCount: recentMessages.length,
        overflowMessageCount: overflowMessages.length,
        observationCount: previousState.observations.length,
        totalActiveMessageCount: activeMessages.length,
      },
      updatedAt: new Date().toISOString(),
    };

    await this.stateStore.save(nextState);
    return nextState;
  }

  async createCheckpoint(messageId: string): Promise<CheckpointedConversationState> {
    const currentState = await this.loadState();
    const nextState: CheckpointedConversationState = {
      ...currentState,
      checkpointMessageId: messageId,
      recentMessageIds: [],
      overflowMessageIds: [],
      updatedAt: new Date().toISOString(),
      metrics: {
        recentMessageCount: 0,
        overflowMessageCount: 0,
        observationCount: currentState.observations.length,
        totalActiveMessageCount: 0,
      },
    };

    await this.stateStore.save(nextState);
    return this.sync();
  }

  async consolidateOverflow(): Promise<CheckpointedConversationObservation | null> {
    if (!this.observer) {
      await this.sync();
      return null;
    }

    const state = await this.sync();

    if (state.overflowMessageIds.length === 0) {
      return null;
    }

    const overflowMessages = await this.store.listMessages({
      threadId: this.threadId,
      afterMessageId: state.checkpointMessageId ?? undefined,
      beforeMessageId: state.recentMessageIds[0],
    });

    if (overflowMessages.length === 0) {
      return null;
    }

    const response = await this.observer.observe({
      threadId: this.threadId,
      messages: overflowMessages,
    });
    const observation: CheckpointedConversationObservation = {
      id: `observation:${randomUUID()}`,
      text: response.text,
      sourceMessageIds: overflowMessages.map((message) => message.id),
      createdAt: new Date().toISOString(),
      units: estimateTextUnits(response.text),
    };
    const nextState: CheckpointedConversationState = {
      ...state,
      checkpointMessageId: overflowMessages[overflowMessages.length - 1]?.id ?? state.checkpointMessageId,
      observations: [...state.observations, observation].slice(-this.maxObservationCount),
      updatedAt: new Date().toISOString(),
    };

    await this.stateStore.save(nextState);
    await this.sync();
    return observation;
  }

  async renderContext(): Promise<StepContextEntry[]> {
    const state = await this.sync();
    const recentMessages = state.recentMessageIds.length === 0
      ? []
      : await this.store.listMessages({
        threadId: this.threadId,
        afterMessageId: state.checkpointMessageId ?? undefined,
      });
    const recentMessageMap = new Map(recentMessages.map((message) => [message.id, message]));
    const context: StepContextEntry[] = [];

    for (const observation of state.observations) {
      context.push(createTextStepContextEntry({
        id: observation.id,
        kind: 'checkpointed-conversation-observation',
        title: 'Conversation Observation',
        text: observation.text,
      }));
    }

    for (const messageId of state.recentMessageIds) {
      const message = recentMessageMap.get(messageId);

      if (message) {
        context.push(createConversationMessageContextEntry(message));
      }
    }

    return context;
  }

  async getState(): Promise<CheckpointedConversationState> {
    return this.sync();
  }

  private async loadState(): Promise<CheckpointedConversationState> {
    return (await this.stateStore.load(this.threadId)) ?? {
      threadId: this.threadId,
      checkpointMessageId: null,
      recentMessageIds: [],
      overflowMessageIds: [],
      observations: [],
      metrics: {
        recentMessageCount: 0,
        overflowMessageCount: 0,
        observationCount: 0,
        totalActiveMessageCount: 0,
      },
      updatedAt: new Date(0).toISOString(),
    };
  }
}

function estimateTextUnits(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
