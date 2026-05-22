import type { SqliteWorkspaceRetrieval } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';
import { serializeError } from '../../agent-runner-error-formatting';
import type { GraphSearchOptions, GraphSearchResult } from './types';

export type GraphSearchDeps = {
  retrievalWorkspace: SqliteWorkspaceRetrieval;
  agentId: string;
  recallTimeoutMs: number;
  runTrackedRecallOperation: <T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<T>;
  getGraphDimension: () => Promise<number>;
};

export async function runGraphSearch(
  queryText: string,
  workspaceResults: Array<{ id: string; content: string; score?: number | null }>,
  options: GraphSearchOptions,
  deps: GraphSearchDeps,
): Promise<GraphSearchResult> {
  const stageStartedAt = Date.now();
  const workspaceContextBase =
    options.contextResults.length > 0 ? options.contextResults : workspaceResults;
  const workspaceContext = workspaceContextBase
    .map((result) => result.content)
    .filter(Boolean)
    .join('\n');
  const graphQueryText = workspaceContext
    ? `${queryText}\nContext: ${workspaceContext}`
    : queryText;
  const graphDimension = await deps.getGraphDimension();

  try {
    const result = await deps.runTrackedRecallOperation(
      'retrieval.graph',
      deps.retrievalWorkspace.searchGraph({
        query: graphQueryText,
        topK: options.topK,
        threshold: options.threshold,
        randomWalkSteps: options.randomWalkSteps,
        includeSources: options.includeSources,
      }),
      deps.recallTimeoutMs,
      'ltm recall graph search timed out',
    );

    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall graph search complete',
      context: {
        agentId: deps.agentId,
        durationMs: Date.now() - stageStartedAt,
        hit: result.hit,
        sourcesCount: result.sourcesCount,
      },
    });

    return {
      queryText: graphQueryText,
      dimension: graphDimension,
      includeSources: options.includeSources,
      hit: result.hit,
      score: result.score,
      context: result.context,
      relevantContextRaw: result.relevantContextRaw,
      sourcesCount: result.sourcesCount,
      sourcesJson: result.sourcesJson,
      rawJson: result.rawJson,
      error: null,
    };
  } catch (error) {
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall graph search failed',
      context: {
        agentId: deps.agentId,
        durationMs: Date.now() - stageStartedAt,
        error: String(serializeError(error)),
      },
    });

    return {
      queryText: graphQueryText,
      dimension: graphDimension,
      includeSources: options.includeSources,
      hit: false,
      score: null,
      context: '',
      relevantContextRaw: null,
      sourcesCount: 0,
      sourcesJson: null,
      rawJson: null,
      error: String(serializeError(error)),
    };
  }
}