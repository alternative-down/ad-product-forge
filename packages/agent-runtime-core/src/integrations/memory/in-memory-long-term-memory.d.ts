import type { TextEmbedder } from '../embedding/contracts.js';
import type { RetrievedDocument } from '../retrieval/contracts.js';
import type { LongTermMemoryDocument, LongTermMemoryRecall, LongTermMemoryRecallRequest, LongTermMemoryStore } from './long-term-memory.js';
export type InMemoryLongTermMemoryOptions = {
    embedder: TextEmbedder;
    keywordWeight?: number;
    vectorWeight?: number;
};
export declare class InMemoryLongTermMemory implements LongTermMemoryStore, LongTermMemoryRecall {
    private readonly embedder;
    private readonly documents;
    private readonly keywordWeight;
    private readonly vectorWeight;
    private keywordIndex;
    private vectorIndex;
    private engine;
    constructor(options: InMemoryLongTermMemoryOptions);
    write(document: LongTermMemoryDocument): Promise<void>;
    remove(documentId: string): Promise<void>;
    list(): Promise<LongTermMemoryDocument[]>;
    recall(request: LongTermMemoryRecallRequest): Promise<RetrievedDocument[]>;
    private createEngine;
    private embedDocuments;
    private rebuildIndexes;
}
