import type { RetrievedDocument } from '../retrieval/contracts.js';
import { RetrievalRefreshController, type RetrievalRefreshSnapshot } from '../retrieval/refresh-controller.js';
import type { LongTermMemoryDocument, LongTermMemoryRecall, LongTermMemoryRecallRequest, LongTermMemoryStore } from './long-term-memory.js';
export interface RefreshableRecallWorkspace {
    refresh(): Promise<void>;
    search(query: string, options?: {
        topK?: number;
    }): Promise<RetrievedDocument[]>;
}
export declare class RefreshableLongTermMemoryRecall implements LongTermMemoryRecall {
    private readonly workspace;
    private readonly refreshController;
    constructor(options: {
        workspace: RefreshableRecallWorkspace;
        refreshController?: RetrievalRefreshController;
    });
    markDirty(reason?: string): void;
    refresh(): Promise<void>;
    getRefreshSnapshot(): RetrievalRefreshSnapshot;
    recall(request: LongTermMemoryRecallRequest): Promise<RetrievedDocument[]>;
}
export declare class SourceBackedLongTermMemory implements LongTermMemoryStore, LongTermMemoryRecall {
    private readonly store;
    private readonly recallEngine;
    constructor(options: {
        store: LongTermMemoryStore;
        recall: RefreshableLongTermMemoryRecall;
    });
    write(document: LongTermMemoryDocument): Promise<void>;
    remove(documentId: string): Promise<void>;
    list(): Promise<LongTermMemoryDocument[]>;
    recall(request: LongTermMemoryRecallRequest): Promise<RetrievedDocument[]>;
    refresh(): Promise<void>;
    getRefreshSnapshot(): RetrievalRefreshSnapshot;
}
