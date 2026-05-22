export type RecallConfig = {
  searchMode: 'hybrid' | 'vector' | 'bm25';
  scoreThreshold: number;
  documentCount: number;
  graphRandomWalkSteps: number;
  graphIncludeSources: boolean;
};

export type GraphSearchOptions = {
  topK: number;
  threshold: number;
  randomWalkSteps: number;
  includeSources: boolean;
  contextResults: Array<{ id: string; content: string; score?: number | null }>;
};

export type GraphSearchResult = {
  queryText: string;
  dimension: number;
  includeSources: boolean;
  hit: boolean;
  score: number | null;
  context: string;
  relevantContextRaw: string | null;
  sourcesCount: number;
  sourcesJson: string | null;
  rawJson: string | null;
  error: string | null;
};