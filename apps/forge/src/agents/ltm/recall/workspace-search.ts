import type { SqliteWorkspaceRetrieval } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../../agent-runner-error-formatting';
import type { LtmSearchResult } from '../../agent-ltm-helpers';

export type WorkspaceSearchOptions = {
  topK: number;
  resultCount: number;
  scoreThreshold: number;
  mode: 'hybrid' | 'vector' | 'bm25';
};

export type WorkspaceSearchResult = {
  formatted: string;
  results: LtmSearchResult[];
};

export type WorkspaceSearchDeps = {
  retrievalWorkspace: SqliteWorkspaceRetrieval;
  agentId: string;
  recallTimeoutMs: number;
  runTrackedRecallOperation: <T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<T>;
};

export async function runWorkspaceSearch(
  queryText: string,
  options: WorkspaceSearchOptions,
  deps: WorkspaceSearchDeps,
): Promise<WorkspaceSearchResult> {
  const stageStartedAt = Date.now();

  try {
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace search start',
      context: {
        agentId: deps.agentId,
        queryLength: queryText.length,
        topK: options.topK,
        mode: options.mode,
      },
    });
    const results = await deps.runTrackedRecallOperation<
      Array<{
        id: string;
        text: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>
    >(
      'retrieval.search',
      deps.retrievalWorkspace.search(queryText, {
        topK: options.topK,
        resultLimit: options.resultCount,
        scoreThreshold: options.scoreThreshold,
        mode: options.mode,
      }),
      deps.recallTimeoutMs,
      'ltm recall retrieval search timed out',
    );

    if (results.length === 0) {
      return { formatted: '', results: [] };
    }

    const searchResults: LtmSearchResult[] = results.map((result) => ({
      id: result.id,
      content: result.text.trim(),
      score: result.score,
    }));
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace search complete',
      context: {
        agentId: deps.agentId,
        durationMs: Date.now() - stageStartedAt,
        resultCount: searchResults.length,
      },
    });
    return { formatted: '', results: searchResults };
  } catch (error) {
    const errMsg = String(serializeError(error));
    if (errMsg.includes('SQLITE_ERROR: no such table') || errMsg.includes('no such table:')) {
      return { formatted: '', results: [] };
    }

    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace search failed',
      context: {
        agentId: deps.agentId,
        durationMs: Date.now() - stageStartedAt,
        error: String(serializeError(error)),
      },
    });
    throw error;
  }
}