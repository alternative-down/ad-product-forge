import type { KeywordIndex, RetrievedDocument, VectorIndex } from './contracts.js';
export type InMemoryHybridRetrievalOptions = {
    keywordIndex: KeywordIndex;
    vectorIndex: VectorIndex;
    queryEmbedder(query: string): Promise<number[]>;
    keywordWeight?: number;
    vectorWeight?: number;
};
export declare class InMemoryHybridRetrievalEngine {
    private readonly keywordIndex;
    private readonly vectorIndex;
    private readonly queryEmbedder;
    private readonly keywordWeight;
    private readonly vectorWeight;
    constructor(options: InMemoryHybridRetrievalOptions);
    search(query: string, options?: {
        topK?: number;
    }): Promise<RetrievedDocument[]>;
}
