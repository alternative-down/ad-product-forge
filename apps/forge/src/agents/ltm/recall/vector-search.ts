import type { SqliteWorkspaceRetrieval } from '@forge-runtime/core';

export type VectorSearchDeps = {
  retrievalWorkspace: SqliteWorkspaceRetrieval;
  recallTimeoutMs: number;
  runTrackedRecallOperation: <T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<T>;
};

export type VectorSearchResult = {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export async function runVectorQuery(
  queryVector: number[],
  topK: number,
  deps: VectorSearchDeps,
): Promise<VectorSearchResult[]> {
  return await deps.runTrackedRecallOperation<VectorSearchResult[]>(
    'vector.query',
    deps.retrievalWorkspace.queryVector(queryVector, topK),
    deps.recallTimeoutMs,
    'ltm vector query timed out',
  );
}