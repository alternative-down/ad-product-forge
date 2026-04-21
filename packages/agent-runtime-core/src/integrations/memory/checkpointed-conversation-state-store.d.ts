export type CheckpointedConversationObservation = {
    id: string;
    text: string;
    sourceMessageIds: string[];
    createdAt: string;
    units: number;
};
export type CheckpointedConversationMetrics = {
    recentMessageCount: number;
    overflowMessageCount: number;
    observationCount: number;
    totalActiveMessageCount: number;
};
export type CheckpointedConversationState = {
    threadId: string;
    checkpointMessageId: string | null;
    recentMessageIds: string[];
    overflowMessageIds: string[];
    observations: CheckpointedConversationObservation[];
    metrics: CheckpointedConversationMetrics;
    updatedAt: string;
};
export interface CheckpointedConversationStateStore {
    load(threadId: string): Promise<CheckpointedConversationState | null>;
    save(state: CheckpointedConversationState): Promise<void>;
}
export declare class InMemoryCheckpointedConversationStateStore implements CheckpointedConversationStateStore {
    private readonly states;
    load(threadId: string): Promise<CheckpointedConversationState | null>;
    save(state: CheckpointedConversationState): Promise<void>;
}
