import type { TextEmbedder } from '../embedding/contracts.js';
import type { HybridRetrievalEngine, KeywordIndex, RetrievalDocumentSource, RetrievalSourceDocument, RetrievedDocument, VectorIndex } from './contracts.js';
export type RefreshableRetrievalWorkspaceOptions = {
    source: RetrievalDocumentSource;
    keywordIndex: KeywordIndex;
    vectorIndex?: VectorIndex;
    embedder?: TextEmbedder;
};
export declare class RefreshableRetrievalWorkspace implements HybridRetrievalEngine {
    private readonly source;
    private readonly keywordIndex;
    private readonly vectorIndex;
    private readonly embedder;
    private readonly hybridEngine;
    private documents;
    constructor(options: RefreshableRetrievalWorkspaceOptions);
    refresh(): Promise<void>;
    search(query: string, options?: {
        topK?: number;
    }): Promise<RetrievedDocument[]>;
    listDocuments(): RetrievalSourceDocument[];
}
