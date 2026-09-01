import type { KeywordIndex, RetrievedDocument } from './contracts.js';

type IndexedDocument = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  terms: string[];
  termCounts: Map<string, number>;
  length: number;
};

const BM25_K1 = 1.5;
const BM25_B = 0.75;

export class InMemoryBm25Index implements KeywordIndex {
  private readonly documents = new Map<string, IndexedDocument>();
  private readonly documentFrequency = new Map<string, number>();
  private averageDocumentLength = 0;

  async index(
    documents: Array<{
      id: string;
      text: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    await Promise.resolve();
    for (const document of documents) {
      const terms = tokenize(document.text);

      this.documents.set(document.id, {
        id: document.id,
        text: document.text,
        metadata: document.metadata,
        terms,
        termCounts: countTerms(terms),
        length: terms.length,
      });
    }

    this.documentFrequency.clear();

    for (const document of this.documents.values()) {
      const uniqueTerms = new Set(document.terms);

      for (const term of uniqueTerms) {
        this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
      }
    }

    const totalLength = Array.from(this.documents.values()).reduce(
      (sum, document) => sum + document.length,
      0,
    );

    this.averageDocumentLength = this.documents.size === 0 ? 0 : totalLength / this.documents.size;
  }

  async search(query: string, options: { topK?: number } = {}): Promise<RetrievedDocument[]> {
    await Promise.resolve();
    const queryTerms = Array.from(new Set(tokenize(query)));
    const topK = options.topK ?? 5;
    const totalDocuments = this.documents.size;

    if (queryTerms.length === 0 || totalDocuments === 0) {
      return [];
    }

    return Array.from(this.documents.values())
      .map((document) => ({
        id: document.id,
        text: document.text,
        metadata: document.metadata,
        score: queryTerms.reduce((score, term) => {
          const termFrequency = document.termCounts.get(term) ?? 0;

          if (termFrequency === 0) {
            return score;
          }

          const documentFrequency = this.documentFrequency.get(term) ?? 0;
          const inverseDocumentFrequency = Math.log(
            1 + (totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5),
          );
          const normalizedLength =
            this.averageDocumentLength === 0 ? 1 : document.length / this.averageDocumentLength;
          const bm25 =
            inverseDocumentFrequency *
            ((termFrequency * (BM25_K1 + 1)) /
              (termFrequency + BM25_K1 * (1 - BM25_B + BM25_B * normalizedLength)));

          return score + bm25;
        }, 0),
      }))
      .filter((document) => document.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function countTerms(terms: string[]) {
  const termCounts = new Map<string, number>();

  for (const term of terms) {
    termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }

  return termCounts;
}
