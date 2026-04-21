import type { KeywordIndex, RetrievedDocument, VectorIndex } from './contracts.js';

export type InMemoryHybridRetrievalOptions = {
  keywordIndex: KeywordIndex;
  vectorIndex: VectorIndex;
  queryEmbedder(query: string): Promise<number[]>;
  keywordWeight?: number;
  vectorWeight?: number;
};

export class InMemoryHybridRetrievalEngine {
  private readonly keywordIndex: KeywordIndex;
  private readonly vectorIndex: VectorIndex;
  private readonly queryEmbedder: (query: string) => Promise<number[]>;
  private readonly keywordWeight: number;
  private readonly vectorWeight: number;

  constructor(options: InMemoryHybridRetrievalOptions) {
    this.keywordIndex = options.keywordIndex;
    this.vectorIndex = options.vectorIndex;
    this.queryEmbedder = options.queryEmbedder;
    this.keywordWeight = options.keywordWeight ?? 0.5;
    this.vectorWeight = options.vectorWeight ?? 0.5;
  }

  async search(query: string, options: { topK?: number } = {}): Promise<RetrievedDocument[]> {
    const topK = options.topK ?? 5;
    const queryVector = await this.queryEmbedder(query);
    const [keywordResults, vectorResults] = await Promise.all([
      this.keywordIndex.search(query, { topK }),
      this.vectorIndex.search(queryVector, { topK }),
    ]);

    const allIds = new Set([
      ...keywordResults.map((result) => result.id),
      ...vectorResults.map((result) => result.id),
    ]);
    const keywordScores = normalizeScores(keywordResults);
    const vectorScores = normalizeScores(vectorResults);

    return Array.from(allIds)
      .map((id) => {
        const keywordResult = keywordResults.find((result) => result.id === id);
        const vectorResult = vectorResults.find((result) => result.id === id);
        const keywordScore = keywordScores.get(id) ?? 0;
        const vectorScore = vectorScores.get(id) ?? 0;
        const base = keywordResult ?? vectorResult;

        if (!base) {
          throw new Error(`Hybrid retrieval lost document ${id}`);
        }

        return {
          id,
          text: base.text,
          metadata: base.metadata,
          score: keywordScore * this.keywordWeight + vectorScore * this.vectorWeight,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}

function normalizeScores(results: RetrievedDocument[]) {
  const maxScore = results.reduce((max, result) => Math.max(max, result.score), 0);
  const scores = new Map<string, number>();

  for (const result of results) {
    scores.set(result.id, maxScore === 0 ? 0 : result.score / maxScore);
  }

  return scores;
}
