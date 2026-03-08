import { MastraVector } from '@mastra/core/vector';
import { MDocument } from '@mastra/rag';
import { fastembed } from '@mastra/fastembed';
import { Workspace } from '@mastra/core/workspace';

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

  /**
   * Ingere um bloco de texto (reflexão, mensagem ou observação) no índice do grafo.
   */
  async ingestText(text: string, metadata: Record<string, any> = {}) {
    if (!text || text.trim().length === 0) return;

    try {
        const doc = MDocument.fromText(text, metadata);
        const chunks = await doc.chunk({
          strategy: 'recursive',
          maxSize: 512,
          overlap: 50,
        });

        if (!chunks || chunks.length === 0) return;

        const texts = chunks.map((c) => c.text);
        
        // Batch embeddings to avoid OOM
        const batchSize = 5;
        const allEmbeddings = [];
        
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const { embeddings } = await (this.embedder as any).doEmbed({
                values: batch,
            });
            allEmbeddings.push(...embeddings);
        }

        await this.ensureIndex();

        await this.vectorStore.upsert({
          indexName: this.indexName,
          vectors: allEmbeddings,
          metadata: chunks.map((c) => ({
            text: c.text,
            ...metadata,
            ...c.metadata,
            ingestedAt: new Date().toISOString(),
          })),
        });

        console.log(`[GraphIntegrator] ✅ Ingested ${chunks.length} chunks into ${this.indexName} (${metadata.source || 'unknown'})`);
    } catch (e) {
        console.error(`[GraphIntegrator] ❌ Failed to ingest text:`, e);
    }
  }

  /**
   * Ingere arquivos do Workspace.
   */
  async ingestWorkspace(workspace: Workspace) {
    if (!workspace.filesystem) return;

    try {
        const entries = await workspace.filesystem.readdir('/');
        console.log(`[GraphIntegrator] 📂 Workspace "${workspace.id}" has ${entries.length} root entries.`);
        
        for (const entry of entries) {
          if (entry.type === 'file' && !entry.name.endsWith('.db') && !entry.name.startsWith('.')) {
            const content = await workspace.filesystem.readFile(entry.name);
            const textContent = typeof content === 'string' ? content : content.toString('utf-8');
            
            if (textContent) {
              await this.ingestText(textContent, {
                source: 'workspace_file',
                fileName: entry.name,
              });
            }
          }
        }
    } catch (e) {
        console.error(`[GraphIntegrator] ❌ Workspace ingestion failed:`, e);
    }
  }

  private async ensureIndex() {
    try {
        await this.vectorStore.createIndex({
            indexName: this.indexName,
            dimension: 384,
            metric: 'cosine'
        });
    } catch (e) {
    }
  }
}
