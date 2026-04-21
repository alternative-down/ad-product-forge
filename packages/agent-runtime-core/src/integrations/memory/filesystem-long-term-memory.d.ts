import type { TextEmbedder } from '../embedding/contracts.js';
import type { LongTermMemoryDocument, LongTermMemoryRecall, LongTermMemoryRecallRequest, LongTermMemoryStore } from './long-term-memory.js';
export type FilesystemLongTermMemoryOptions = {
    basePath: string;
    embedder: TextEmbedder;
    keywordWeight?: number;
    vectorWeight?: number;
};
export declare class FilesystemLongTermMemory implements LongTermMemoryStore, LongTermMemoryRecall {
    private readonly store;
    private readonly embedder;
    private readonly keywordWeight;
    private readonly vectorWeight;
    private keywordIndex;
    private vectorIndex;
    private engine;
    private initialized;
    constructor(options: FilesystemLongTermMemoryOptions);
    write(document: LongTermMemoryDocument): Promise<void>;
    remove(documentId: string): Promise<void>;
    list(): Promise<LongTermMemoryDocument[]>;
    recall(request: LongTermMemoryRecallRequest): Promise<import("../index.js").RetrievedDocument[]>;
    refresh(): Promise<void>;
    private createEngine;
    private ensureInitialized;
    private rebuildIndexes;
    private indexDocuments;
    private embedDocuments;
}
