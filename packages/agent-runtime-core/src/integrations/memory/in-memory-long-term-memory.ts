import type { TextEmbedder } from '../embedding/contracts.js';
import type { RetrievedDocument } from '../retrieval/contracts.js';
import { InMemoryBm25Index } from '../retrieval/in-memory-bm25-index.js';
import { InMemoryHybridRetrievalEngine } from '../retrieval/in-memory-hybrid-retrieval.js';
import { InMemoryVectorIndex } from '../retrieval/in-memory-vector-index.js';
import type {
  LongTermMemoryDocument,
  LongTermMemoryRecall,
  LongTermMemoryRecallRequest,
  LongTermMemoryStore,
} from './long-term-memory.js';

export type InMemoryLongTermMemoryOptions = {
  embedder: TextEmbedder;
  keywordWeight?: number;
  vectorWeight?: number;
};

export class InMemoryLongTermMemory implements LongTermMemoryStore, LongTermMemoryRecall {
  private readonly embedder: TextEmbedder;
  private readonly documents = new Map<string, LongTermMemoryDocument>();
  private readonly keywordWeight: number | undefined;
  private readonly vectorWeight: number | undefined;
  private keywordIndex = new InMemoryBm25Index();
  private vectorIndex = new InMemoryVectorIndex();
  private engine: InMemoryHybridRetrievalEngine;

  constructor(options: InMemoryLongTermMemoryOptions) {
    this.embedder = options.embedder;
    this.keywordWeight = options.keywordWeight;
    this.vectorWeight = options.vectorWeight;
    this.engine = this.createEngine();
  }

  async write(document: LongTermMemoryDocument): Promise<void> {
    const embedding = await this.embedder.embed({
      texts: [document.text],
    });
    const vector = embedding.vectors[0];

    if (vector == null) {
      throw new Error(`Embedder returned no vector for long-term memory document ${document.id}`);
    }

    this.documents.set(document.id, document);
    await this.keywordIndex.index([document]);
    await this.vectorIndex.index([
      {
        id: document.id,
        text: document.text,
        metadata: document.metadata,
        vector,
      },
    ]);
  }

  async remove(documentId: string): Promise<void> {
    this.documents.delete(documentId);
    await this.rebuildIndexes();
  }

  async list(): Promise<LongTermMemoryDocument[]> {
    await Promise.resolve();
    return Array.from(this.documents.values());
  }

  async recall(request: LongTermMemoryRecallRequest): Promise<RetrievedDocument[]> {
    const results = await this.engine.search(request.query, {
      topK: request.topK,
    });
    const threshold = request.threshold ?? 0;

    return results.filter((result) => result.score >= threshold);
  }

  private createEngine() {
    return new InMemoryHybridRetrievalEngine({
      keywordIndex: this.keywordIndex,
      vectorIndex: this.vectorIndex,
      queryEmbedder: async (query) => {
        const response = await this.embedder.embed({
          texts: [query],
        });

        return response.vectors[0] ?? [];
      },
      keywordWeight: this.keywordWeight,
      vectorWeight: this.vectorWeight,
    });
  }

  private async embedDocuments(documents: LongTermMemoryDocument[]) {
    if (documents.length === 0) {
      return [];
    }

    const embedding = await this.embedder.embed({
      texts: documents.map((document) => document.text),
    });

    return documents.flatMap((document, index) => {
      const vector = embedding.vectors[index];

      if (vector == null) {
        return [];
      }

      return [
        {
          id: document.id,
          text: document.text,
          metadata: document.metadata,
          vector,
        },
      ];
    });
  }

  private async rebuildIndexes() {
    this.keywordIndex = new InMemoryBm25Index();
    this.vectorIndex = new InMemoryVectorIndex();
    this.engine = this.createEngine();

    const documents = Array.from(this.documents.values());
    await this.keywordIndex.index(documents);
    await this.vectorIndex.index(await this.embedDocuments(documents));
  }
}
