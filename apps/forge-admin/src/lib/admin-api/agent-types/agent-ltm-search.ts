export type AgentLongTermMemoryRecallDebugSearchResult = {
  query: string;

  topK: number;

  searchMode: 'hybrid' | 'vector' | 'bm25';

  graphTopK: number;

  graphThreshold: number;

  graphRandomWalkSteps: number;

  lastInitAt: number | null;

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

    document: string | null;
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
