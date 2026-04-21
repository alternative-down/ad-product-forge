export type RetrievedDocument = {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export type RetrievalSourceDocument = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
};

export interface RetrievalDocumentSource {
  loadDocuments(): Promise<RetrievalSourceDocument[]>;
}

export interface KeywordIndex {
  index(documents: Array<{
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void>;
  search(query: string, options?: { topK?: number }): Promise<RetrievedDocument[]>;
}

export interface VectorIndex {
  index(documents: Array<{
    id: string;
    text: string;
    vector: number[];
    metadata?: Record<string, unknown>;
  }>): Promise<void>;
  search(vector: number[], options?: { topK?: number }): Promise<RetrievedDocument[]>;
}

export interface HybridRetrievalEngine {
  search(query: string, options?: { topK?: number }): Promise<RetrievedDocument[]>;
}
