export type CheckpointedConversationObservation = {
  id: string;
  text: string;
  sourceMessageIds: string[];
  createdAt: string;
  units: number;
};

export type CheckpointedConversationMetrics = {
  recentMessageCount: number;
  recentTokenCount: number;
  overflowMessageCount: number;
  overflowTokenCount: number;
  observationCount: number;
  totalActiveMessageCount: number;
};

export type CheckpointedConversationState = {
  threadId: string;
  checkpointMessageId: string | null;
  cursorObservedAt?: string | null;
  cursorObservedRawUnitIds?: string[];
  recentRawUnitIds?: string[];
  overflowRawUnitIds?: string[];
  recentMessageIds?: string[];
  overflowMessageIds?: string[];
  observations: CheckpointedConversationObservation[];
  metrics: CheckpointedConversationMetrics;
  updatedAt: string;
};

export interface CheckpointedConversationStateStore {
  load(threadId: string): Promise<CheckpointedConversationState | null>;
  save(state: CheckpointedConversationState): Promise<void>;
}

export class InMemoryCheckpointedConversationStateStore implements CheckpointedConversationStateStore {
  private readonly states = new Map<string, CheckpointedConversationState>();

  async load(threadId: string): Promise<CheckpointedConversationState | null> {
    return this.states.get(threadId) ?? null;
  }

  async save(state: CheckpointedConversationState): Promise<void> {
    this.states.set(state.threadId, state);
  }
}
