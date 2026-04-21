export type CheckpointedOmCheckpointSummary = {
  text: string;
  tokenCount: number;
  upToGeneration: number;
  updatedAt: string;
};

export type CheckpointedOmArchivedObservation = {
  blockId: string;
  tokenCount: number;
  createdAt: string;
  lastObservedAt: string;
  reflectedGeneration: number;
  text: string;
};

export type CheckpointedOmArchivedReflection = {
  recordId: string;
  generationCount: number;
  tokenCount: number;
  createdAt: string;
  text: string;
};

export type CheckpointedOmCheckpointPackageInput = {
  threadId: string;
  resourceId: string;
  fromGeneration: number | null;
  toGeneration: number;
  checkpointSummary: CheckpointedOmCheckpointSummary;
  reflections: CheckpointedOmArchivedReflection[];
  observations: CheckpointedOmArchivedObservation[];
};

export type CheckpointedOmObservationBlock = {
  id: string;
  tokenCount: number;
  createdAt: string;
  lastObservedAt: string;
  reflectedGeneration: number | null;
  text: string;
};

export type CheckpointedOmMetricsSnapshot = {
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

export type CheckpointedOmState = {
  version: 1;
  checkpointGeneration: number | null;
  checkpointSummary: CheckpointedOmCheckpointSummary | null;
  observationBlocks: CheckpointedOmObservationBlock[];
  activeReflectionBlocks: Array<{
    recordId: string;
    generationCount: number;
    tokenCount: number;
    createdAt: string;
  }>;
  latestMetrics: CheckpointedOmMetricsSnapshot | null;
};

export type CheckpointedOmStateStore = {
  loadState(input: {
    threadId: string;
    resourceId: string;
  }): Promise<CheckpointedOmState | null>;
  saveState(input: {
    threadId: string;
    resourceId: string;
    state: CheckpointedOmState;
  }): Promise<void>;
};
