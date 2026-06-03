import type { TextEmbedder } from '../embedding/contracts.js';
import { FilesystemLongTermMemoryStore } from '../persistence/filesystem-long-term-memory.js';
import { InMemoryBm25Index } from '../retrieval/in-memory-bm25-index.js';
import { InMemoryHybridRetrievalEngine } from '../retrieval/in-memory-hybrid-retrieval.js';
import { InMemoryVectorIndex } from '../retrieval/in-memory-vector-index.js';
import type {
  LongTermMemoryDocument,
  LongTermMemoryRecall,
  LongTermMemoryRecallRequest,
  LongTermMemoryStore,
} from './long-term-memory.js';

export type FilesystemLongTermMemoryOptions = {
  basePath: string;
  embedder: TextEmbedder;
  keywordWeight?: number;
  vectorWeight?: number;
};

export class FilesystemLongTermMemory implements LongTermMemoryStore, LongTermMemoryRecall {
  private readonly store: FilesystemLongTermMemoryStore;
  private readonly embedder: TextEmbedder;
  private readonly keywordWeight: number | undefined;
  private readonly vectorWeight: number | undefined;
  private keywordIndex = new InMemoryBm25Index();
  private vectorIndex = new InMemoryVectorIndex();
  private engine: InMemoryHybridRetrievalEngine;
  private initialized = false;

  constructor(options: FilesystemLongTermMemoryOptions) {
    this.store = new FilesystemLongTermMemoryStore({ basePath: options.basePath });
    this.embedder = options.embedder;
    this.keywordWeight = options.keywordWeight;
    this.vectorWeight = options.vectorWeight;
    this.engine = this.createEngine();
  }

  async write(document: LongTermMemoryDocument): Promise<void> {
    await this.store.write(document);
    await this.indexDocuments([document]);
    this.initialized = true;
  }

  async remove(documentId: string): Promise<void> {
    await this.store.remove(documentId);
    await this.rebuildIndexes();
  }

  async list(): Promise<LongTermMemoryDocument[]> {
    return await this.store.list();
  }

  async recall(request: LongTermMemoryRecallRequest) {
    await this.ensureInitialized();
    const results = await this.engine.search(request.query, {
      topK: request.topK,
    });
    const threshold = request.threshold ?? 0;

    return results.filter((result) => result.score >= threshold);
  }

  async refresh(): Promise<void> {
    await this.rebuildIndexes();
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

  private async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    await this.rebuildIndexes();
  }

  private async rebuildIndexes() {
    const documents = await this.store.list();

    this.keywordIndex = new InMemoryBm25Index();
    this.vectorIndex = new InMemoryVectorIndex();
    this.engine = this.createEngine();
    await this.keywordIndex.index(documents);
    await this.vectorIndex.index(await this.embedDocuments(documents));
    this.initialized = true;
  }

  private async indexDocuments(documents: LongTermMemoryDocument[]) {
    if (documents.length === 0) {
      return;
    }

    await this.keywordIndex.index(documents);
    await this.vectorIndex.index(await this.embedDocuments(documents));
  }

  private async embedDocuments(documents: LongTermMemoryDocument[]) {
    if (documents.length === 0) {
      return [];
    }

    const response = await this.embedder.embed({
      texts: documents.map((document) => document.text),
    });

    return documents.flatMap((document, index) => {
      const vector = response.vectors[index];

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
}
