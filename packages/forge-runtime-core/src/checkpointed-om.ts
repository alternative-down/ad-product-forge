export type CheckpointedOmArchivedObservation = {
  id: string;
  text: string;
  tokenCount: number;
  createdAt: string;
  lastObservedAt: string;
  reflectedGeneration: number | null;
};

export type CheckpointedOmArchivedReflection = {
  id: string;
  text: string;
  tokenCount: number;
  createdAt: string;
  sourceObservationIds: string[];
};

export type CheckpointedOmMetricsSnapshot = {
  recentRawMessageCount?: number;
  recentRawTokenCount?: number;
  observationCount?: number;
  observationTokenCount?: number;
  reflectionCount?: number;
  reflectionTokenCount?: number;
  checkpointTokenCount?: number;
};

export type CheckpointedOmState = {
  version: number;
  checkpointGeneration: number | null;
  checkpointSummary: {
    text: string;
    tokenCount: number;
    upToGeneration: number;
    updatedAt: string;
  } | null;
  observationBlocks: CheckpointedOmArchivedObservation[];
  activeReflectionBlocks: CheckpointedOmArchivedReflection[];
  latestMetrics: CheckpointedOmMetricsSnapshot | null;
};

export type CheckpointedOmStateStore = {
  loadState(input: {
    threadId: string;
    resourceId: string;
  }): Promise<CheckpointedOmState>;
  saveState(input: {
    threadId: string;
    resourceId: string;
    state: CheckpointedOmState;
  }): Promise<void>;
};
