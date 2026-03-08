import { MastraVector } from '@mastra/core/vector';
import { MDocument } from '@mastra/rag';
import { fastembed } from '@mastra/fastembed';

export class GraphIntegrator {
  private vectorStore: MastraVector;
  private embedder: any;
  private indexName: string;

  constructor({
    vectorStore,
    embedder,
    indexName = 'knowledge_index',
  }: {
    vectorStore: MastraVector;
    embedder?: any;
    indexName?: string;
  }) {
    this.vectorStore = vectorStore;
    this.embedder = embedder || fastembed;
    this.indexName = indexName;
  }

  async ingestReflection(reflection: string, metadata: Record<string, any> = {}) {
    if (!reflection) return;

    // 1. Chunking
    const doc = MDocument.fromText(reflection, metadata);
    const chunks = await doc.chunk({
      strategy: 'recursive',
      maxSize: 512, // Corrigido de 'size' para 'maxSize' seguindo @mastra/rag
      overlap: 50,
    });

    if (!chunks || chunks.length === 0) return;

    // 2. Embedding
    const texts = chunks.map((c) => c.text);
    
    // Wrapper para garantir compatibilidade com o fastembed se necessário
    const { embeddings } = await (this.embedder as any).embed({
        values: texts,
    });

    // 3. Storage (Upsert)
    // Garantir que o índice existe
    try {
        await this.vectorStore.createIndex({
            indexName: this.indexName,
            dimension: 384, // FastEmbed dimension default
            metric: 'cosine'
        });
    } catch (e) {
        // Index probably exists, ignore
    }

    await this.vectorStore.upsert({
      indexName: this.indexName,
      vectors: embeddings,
      metadata: chunks.map((c) => ({
        text: c.text,
        ...c.metadata,
        source: 'om_reflection',
        ingestedAt: new Date().toISOString(),
      })),
    });

    console.log(`[GraphIntegrator] Ingested ${chunks.length} reflection chunks into ${this.indexName}`);
  }
}
