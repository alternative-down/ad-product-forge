import type { CheckpointedConversationState, CheckpointedConversationStateStore } from '../memory/checkpointed-conversation-state-store.js';
export type FilesystemCheckpointedConversationStateStoreOptions = {
    rootDir: string;
};
export declare class FilesystemCheckpointedConversationStateStore implements CheckpointedConversationStateStore {
    private readonly rootDir;
    constructor(options: FilesystemCheckpointedConversationStateStoreOptions);
    load(threadId: string): Promise<CheckpointedConversationState | null>;
    save(state: CheckpointedConversationState): Promise<void>;
    private getFilePath;
}
