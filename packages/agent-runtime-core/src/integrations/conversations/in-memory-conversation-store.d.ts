import type { ConversationMessage, ConversationMessageListQuery, ConversationStore, ConversationThread } from './contracts.js';
export declare class InMemoryConversationStore implements ConversationStore {
    private readonly threads;
    private readonly messagesByThread;
    upsertThread(thread: ConversationThread): Promise<void>;
    getThread(threadId: string): Promise<ConversationThread | null>;
    listThreads(): Promise<ConversationThread[]>;
    appendMessage(message: ConversationMessage): Promise<void>;
    listMessages(query: ConversationMessageListQuery): Promise<ConversationMessage[]>;
}
