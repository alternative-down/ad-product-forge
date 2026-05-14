export type AgentRuntimeMemorySnapshot = {

  workingMemory: string | null;

  agentContext: string | null;

  executionState: 'idle' | 'running' | 'absent';

  lastExecutionError: string | null;

  lastExecutionErrorAt: number | null;

  observations: string | null;

  reflection: string | null;

  generationCount: number;

  updatedAt: number;

  lastObservedAt: number | null;

  checkpointMessageId: string | null;

  checkpointGeneration: number | null;

  checkpointSummary: string | null;

  checkpointUpdatedAt: number | null;

  ltmRecall: {

    status: 'hit' | 'miss' | 'error';

    query: string;

    resultIds: string[];

    resultCount: number;

    resultScores: number[];

    graphHit: boolean;

    stepsJson: string;

    updatedAt: number;

    lastInitAt: number | null;

    searchMode: string;

    topK: number;

    graphTopK: number;

    graphThreshold: number;

    graphRandomWalkSteps: number;

    indexPaths: string[];

    workspaceFileCount: number;

    memoryFileCount: number;

    checkpointFileCount: number;

    error: string | null;

  } | null;

  ltm: {

    running: boolean;

    queued: boolean;

    lastRunAt: number | null;

    lastRunError: string | null;

    lastRunErrorAt: number | null;

    lastWrittenPackageId: string | null;

    lastWrittenAt: number | null;

    packageCount: number;

  } | null;

  metrics: {

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

    latestThreadMessageAt: number | null;

  };

};


