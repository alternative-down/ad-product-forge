import type { ConversationMessage, ConversationMessageListQuery, ConversationStore, ConversationThread } from './contracts.js';
export type FilesystemConversationStoreOptions = {
    filePath: string;
};
export declare class FilesystemConversationStore implements ConversationStore {
    private readonly filePath;
    constructor(options: FilesystemConversationStoreOptions);
    upsertThread(thread: ConversationThread): Promise<void>;
    getThread(threadId: string): Promise<ConversationThread | null>;
    listThreads(): Promise<ConversationThread[]>;
    appendMessage(message: ConversationMessage): Promise<void>;
    listMessages(query: ConversationMessageListQuery): Promise<ConversationMessage[]>;
    private readStoreFile;
    private writeStoreFile;
}
