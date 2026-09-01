import type { RetrievedDocument, VectorIndex } from './contracts.js';

type VectorDocument = {
  id: string;
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
};

export class InMemoryVectorIndex implements VectorIndex {
  private readonly documents = new Map<string, VectorDocument>();

  async index(
    documents: Array<{
      id: string;
      text: string;
      vector: number[];
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    await Promise.resolve();
    for (const document of documents) {
      this.documents.set(document.id, document);
    }
  }

  async search(vector: number[], options: { topK?: number } = {}): Promise<RetrievedDocument[]> {
    await Promise.resolve();
    const topK = options.topK ?? 5;

    return Array.from(this.documents.values())
      .map((document) => ({
        id: document.id,
        text: document.text,
        metadata: document.metadata,
        score: cosineSimilarity(vector, document.vector),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  const dotProduct = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (leftMagnitude * rightMagnitude);
}
