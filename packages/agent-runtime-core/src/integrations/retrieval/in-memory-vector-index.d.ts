import type { RetrievedDocument, VectorIndex } from './contracts.js';
export declare class InMemoryVectorIndex implements VectorIndex {
    private readonly documents;
    index(documents: Array<{
        id: string;
        text: string;
        vector: number[];
        metadata?: Record<string, unknown>;
    }>): Promise<void>;
    search(vector: number[], options?: {
        topK?: number;
    }): Promise<RetrievedDocument[]>;
}
