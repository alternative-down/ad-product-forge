export type OperationalMemoryConversationObservation = {
  id: string;
  text: string;
  sourceMessageIds: string[];
  createdAt: string;
  units: number;
};

export type OperationalMemoryConversationMetrics = {
  recentMessageCount: number;
  recentTokenCount: number;
  overflowMessageCount: number;
  overflowTokenCount: number;
  observationCount: number;
  totalActiveMessageCount: number;
};

export type OperationalMemoryConversationState = {
  threadId: string;
  checkpointMessageId: string | null;
  recentMessageIds?: string[];
  overflowMessageIds?: string[];
  observations: OperationalMemoryConversationObservation[];
  metrics: OperationalMemoryConversationMetrics;
  updatedAt: string;
};

export interface OperationalMemoryConversationStateStore {
  load(threadId: string): Promise<OperationalMemoryConversationState | null>;
  save(state: OperationalMemoryConversationState): Promise<void>;
}

export class InMemoryOperationalMemoryConversationStateStore implements OperationalMemoryConversationStateStore {
  private readonly states = new Map<string, OperationalMemoryConversationState>();

  async load(threadId: string): Promise<OperationalMemoryConversationState | null> {
    return this.states.get(threadId) ?? null;
  }

  async save(state: OperationalMemoryConversationState): Promise<void> {
    this.states.set(state.threadId, state);
  }
}
