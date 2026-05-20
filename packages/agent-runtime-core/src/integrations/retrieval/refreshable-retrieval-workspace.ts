import type { TextEmbedder } from '../embedding/contracts.js';

import type {
  HybridRetrievalEngine,
  KeywordIndex,
  RetrievalDocumentSource,
  RetrievalSourceDocument,
  RetrievedDocument,
  VectorIndex,
} from './contracts.js';
import { InMemoryHybridRetrievalEngine } from './in-memory-hybrid-retrieval.js';

export type RefreshableRetrievalWorkspaceOptions = {
  source: RetrievalDocumentSource;
  keywordIndex: KeywordIndex;
  vectorIndex?: VectorIndex;
  embedder?: TextEmbedder;
};

export class RefreshableRetrievalWorkspace implements HybridRetrievalEngine {
  private readonly source: RetrievalDocumentSource;
  private readonly keywordIndex: KeywordIndex;
  private readonly vectorIndex: VectorIndex | null;
  private readonly embedder: TextEmbedder | null;
  private readonly hybridEngine: InMemoryHybridRetrievalEngine | null;
  private documents: RetrievalSourceDocument[] = [];

  constructor(options: RefreshableRetrievalWorkspaceOptions) {
    this.source = options.source;
    this.keywordIndex = options.keywordIndex;
    this.vectorIndex = options.vectorIndex ?? null;
    this.embedder = options.embedder ?? null;
    this.hybridEngine =
      this.vectorIndex && this.embedder
        ? new InMemoryHybridRetrievalEngine({
            keywordIndex: this.keywordIndex,
            vectorIndex: this.vectorIndex,
            queryEmbedder: async (query) => {
              const response = await this.embedder!.embed({
                texts: [query],
              });

              return response.vectors[0] ?? [];
            },
          })
        : null;
  }

  async refresh(): Promise<void> {
    const documents = await this.source.loadDocuments();

    this.documents = documents;
    await this.keywordIndex.index(documents);

    if (this.vectorIndex && this.embedder && documents.length > 0) {
      const response = await this.embedder.embed({
        texts: documents.map((document) => document.text),
      });

      await this.vectorIndex.index(
        documents.map((document, index) => ({
          id: document.id,
          text: document.text,
          vector: response.vectors[index] ?? [],
          metadata: document.metadata,
        })),
      );
    }
  }

  async search(query: string, options: { topK?: number } = {}): Promise<RetrievedDocument[]> {
    if (this.hybridEngine) {
      return this.hybridEngine.search(query, options);
    }

    return this.keywordIndex.search(query, options);
  }

  listDocuments() {
    return [...this.documents];
  }
}
