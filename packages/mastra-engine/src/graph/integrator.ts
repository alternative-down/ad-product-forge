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

    // 1. Chunking recursivo para manter o contexto semântico
    const doc = MDocument.fromText(text, metadata);
    const chunks = await doc.chunk({
      strategy: 'recursive',
      maxSize: 512,
      overlap: 50,
    });

    if (!chunks || chunks.length === 0) return;

    // 2. Embedding dos chunks usando o método correto do AI SDK (doEmbed)
    const texts = chunks.map((c) => c.text);
    
    // O objeto fastembed do Mastra implementa doEmbed
    const { embeddings } = await (this.embedder as any).doEmbed({
        values: texts,
    });

    // 3. Garantir existência do índice e Upsert
    await this.ensureIndex();

    await this.vectorStore.upsert({
      indexName: this.indexName,
      vectors: embeddings,
      metadata: chunks.map((c) => ({
        text: c.text,
        ...metadata,
        ...c.metadata,
        ingestedAt: new Date().toISOString(),
      })),
    });

    console.log(`[GraphIntegrator] Ingested ${chunks.length} chunks from text into ${this.indexName} (${metadata.source || 'unknown'})`);
  }

  /**
   * Ingere todos os arquivos relevantes de um Workspace no índice do grafo.
   */
  async ingestWorkspace(workspace: Workspace) {
    if (!workspace.filesystem) {
        console.log(`[GraphIntegrator] Workspace ${workspace.id} has no filesystem, skipping ingestion.`);
        return;
    }

    console.log(`[GraphIntegrator] Starting workspace ingestion for: ${workspace.id}`);
    
    try {
        // Lista os arquivos do filesystem do workspace (readdir na raiz)
        const entries = await workspace.filesystem.readdir('/');
        
        for (const entry of entries) {
          // Ignora bancos de dados e arquivos ocultos
          if (entry.type === 'file' && !entry.name.endsWith('.db') && !entry.name.startsWith('.')) {
            try {
              const content = await workspace.filesystem.readFile(entry.name);
              const textContent = typeof content === 'string' ? content : content.toString('utf-8');
              
              if (textContent) {
                await this.ingestText(textContent, {
                  source: 'workspace_file',
                  fileName: entry.name,
                });
              }
            } catch (e) {
              console.warn(`[GraphIntegrator] Failed to ingest file ${entry.name}:`, e);
            }
          }
        }
    } catch (e) {
        console.error(`[GraphIntegrator] Workspace ingestion failed:`, e);
    }
  }

  private async ensureIndex() {
    try {
        await this.vectorStore.createIndex({
            indexName: this.indexName,
            dimension: 384, // FastEmbed dimension
            metric: 'cosine'
        });
    } catch (e) {
        // Ignora se o índice já existir
    }
  }
}
