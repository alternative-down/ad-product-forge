import type { RetrievedDocument } from '../retrieval/contracts.js';
export type LongTermMemoryDocument = {
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
};
export interface LongTermMemoryStore {
    write(document: LongTermMemoryDocument): Promise<void>;
    remove(documentId: string): Promise<void>;
    list(): Promise<LongTermMemoryDocument[]>;
}
export type LongTermMemoryRecallRequest = {
    query: string;
    topK?: number;
    threshold?: number;
};
export interface LongTermMemoryRecall {
    recall(request: LongTermMemoryRecallRequest): Promise<RetrievedDocument[]>;
}
