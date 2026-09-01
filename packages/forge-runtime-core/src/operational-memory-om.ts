export type OperationalMemoryOmCheckpointSummary = {
  text: string;
  tokenCount: number;
  upToGeneration: number;
  updatedAt: string;
};

export type OperationalMemoryOmArchivedObservation = {
  blockId: string;
  tokenCount: number;
  createdAt: string;
  lastObservedAt: string;
  reflectedGeneration: number;
  text: string;
};

export type OperationalMemoryOmArchivedReflection = {
  recordId: string;
  generationCount: number;
  tokenCount: number;
  createdAt: string;
  text: string;
};

export type OperationalMemoryOmCheckpointPackageInput = {
  threadId: string;
  resourceId: string;
  fromGeneration: number | null;
  toGeneration: number;
  checkpointSummary: OperationalMemoryOmCheckpointSummary;
  reflections: OperationalMemoryOmArchivedReflection[];
  observations: OperationalMemoryOmArchivedObservation[];
};

export type OperationalMemoryOmObservationBlock = {
  id: string;
  tokenCount: number;
  createdAt: string;
  lastObservedAt: string;
  reflectedGeneration: number | null;
  text: string;
  sourceMessageIds: string[];
};

export type OperationalMemoryOmMetricsSnapshot = {
  rawMessageCount: number;
  recentRawMessageCount: number;
  recentRawTokenCount: number;
  recentRawTokenLimit: number;
  overflowMessageCount: number;
  overflowTokenCount: number;
  observationTriggerTokenLimit: number;
  activeObservationBlockCount: number;
  observationTokenCount: number;
  reflectionTriggerTokenLimit: number;
  activeReflectionBlockCount: number;
  reflectionTokenCount: number;
  reflectionBudget: number;
  checkpointTokenCount: number;
  checkpointSummaryUpToGeneration: number | null;
  latestThreadMessageAt: string | null;
  updatedAt: string;
};

export type OperationalMemoryOmState = {
  version: 1;
  checkpointGeneration: number | null;
  checkpointSummary: OperationalMemoryOmCheckpointSummary | null;
  observationBlocks: OperationalMemoryOmObservationBlock[];
  activeReflectionBlocks: Array<{
    recordId: string;
    generationCount: number;
    tokenCount: number;
    createdAt: string;
    text: string;
  }>;
  latestMetrics: OperationalMemoryOmMetricsSnapshot | null;
};

export type OperationalMemoryOmStateStore = {
  loadState(input: {
    threadId: string;
    resourceId: string;
  }): Promise<OperationalMemoryOmState | null>;
  saveState(input: {
    threadId: string;
    resourceId: string;
    state: OperationalMemoryOmState;
  }): Promise<void>;
};
