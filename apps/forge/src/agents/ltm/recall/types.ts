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
export type AgentLongTermMemoryRecallDebugSearchInput = {
  query: string;
};

export type AgentLongTermMemoryRecallDebugSearchResult = {
  query: string;
  topK: number;
  searchMode: 'hybrid' | 'vector' | 'bm25';
  graphTopK: number;
  graphThreshold: number;
  graphScore: number | null;
  graphRandomWalkSteps: number;
  lastInitAt: string | null;
  workspaceCanBm25: boolean;
  workspaceCanVector: boolean;
  workspaceCanHybrid: boolean;
  availableIndexes: string[];
  activeIndexName: string;
  activeIndexStats: {
    dimension: number;
    count: number;
    metric: string | null;
  } | null;
  queryEmbedding: number[];
  queryEmbeddingDimension: number;
  workspaceFormattedContext: string;
  workspaceResults: Array<{
    id: string;
    content: string;
    score: number | null;
    relativePercent: number | null;
  }>;
  vectorResults: Array<{
    id: string;
    score: number;
    metadataJson: string | null;
    document: string;
  }>;
  graphHit: boolean;
  graphQuery: string;
  graphDimension: number;
  graphIncludeSources: boolean;
  graphContext: string;
  graphRelevantContextRaw: string | null;
  graphSourcesCount: number;
  graphSourcesJson: string | null;
  graphRawJson: string | null;
  graphError: string | null;
  injectedSystemMessage: string | null;
};
