import type { KeywordIndex, RetrievedDocument } from './contracts.js';
export declare class InMemoryBm25Index implements KeywordIndex {
    private readonly documents;
    private readonly documentFrequency;
    private averageDocumentLength;
    index(documents: Array<{
        id: string;
        text: string;
        metadata?: Record<string, unknown>;
    }>): Promise<void>;
    search(query: string, options?: {
        topK?: number;
    }): Promise<RetrievedDocument[]>;
}
