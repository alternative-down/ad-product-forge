import type { StepContextEntry } from '../../core/types.js';
import type { ConversationMessage, ConversationStore } from '../conversations/contracts.js';
import type { CheckpointedConversationObservation, CheckpointedConversationState, CheckpointedConversationStateStore } from './checkpointed-conversation-state-store.js';
export type CheckpointedConversationObserverRequest = {
    threadId: string;
    messages: ConversationMessage[];
};
export type CheckpointedConversationObserverResponse = {
    text: string;
};
export interface CheckpointedConversationObserver {
    observe(request: CheckpointedConversationObserverRequest): Promise<CheckpointedConversationObserverResponse>;
}
export type CheckpointedConversationMemoryOptions = {
    threadId: string;
    store: ConversationStore;
    stateStore: CheckpointedConversationStateStore;
    recentMessageLimit?: number;
    maxObservationCount?: number;
    observer?: CheckpointedConversationObserver;
};
export declare class CheckpointedConversationMemory {
    private readonly threadId;
    private readonly store;
    private readonly stateStore;
    private readonly recentMessageLimit;
    private readonly maxObservationCount;
    private readonly observer;
    constructor(options: CheckpointedConversationMemoryOptions);
    sync(): Promise<CheckpointedConversationState>;
    createCheckpoint(messageId: string): Promise<CheckpointedConversationState>;
    consolidateOverflow(): Promise<CheckpointedConversationObservation | null>;
    renderContext(): Promise<StepContextEntry[]>;
    getState(): Promise<CheckpointedConversationState>;
    private loadState;
}
