import { createHash } from 'node:crypto';

import { safeSerializeRecallSteps } from './ltm/helpers';
import type { LongTermMemoryRecallHistory, LongTermMemoryRecallSnapshot } from './ltm/store';

const RECALL_AUTO_INDEX_PATHS = ['memory', 'checkpoints'] as const;

export interface LtmSnapshotContext {
  threadId: string | null;
  resourceId?: string;
}

export interface LtmSnapshotDeps {
  filteredResults?: Array<{ id: string; score?: number }>;
  dedupedGraph?: { hit: boolean; score?: number; context: string };
  lastInitAt: string | null;
  steps: unknown[];
  queryText?: string;
  recallConfig?: {
    searchMode: string;
    documentCount: number;
    graphRandomWalkSteps: number;
  };
  recallSearch?: {
    results: Array<{ id: string; score?: number }>;
    graph: { hit: boolean };
    effectiveGraphTopK: number;
    effectiveGraphThreshold: number;
  };
  indexStats?: {
    workspaceFileCount: number;
    memoryFileCount: number;
    checkpointFileCount: number;
  };
  history?: LongTermMemoryRecallHistory;
}

export type LtmSnapshotStatus = 'miss' | 'hit' | 'error';

export interface BuildSnapshotOptions {
  status: LtmSnapshotStatus;
  error?: string | null;
}

function buildIndexStats(indexStats: LtmSnapshotDeps['indexStats']) {
  return {
    workspaceFileCount: indexStats?.workspaceFileCount ?? 0,
    memoryFileCount: indexStats?.memoryFileCount ?? 0,
    checkpointFileCount: indexStats?.checkpointFileCount ?? 0,
  };
}

export function buildLtmRecallSnapshot(
  deps: LtmSnapshotDeps,
  context: LtmSnapshotContext,
  options: BuildSnapshotOptions,
): LongTermMemoryRecallSnapshot {
  const { status, error = null } = options;
  const { recallConfig, recallSearch, indexStats } = deps;
  const allResults = recallSearch?.results ?? [];
  // dedupedGraph reflects what partitionRecallResults decided; prefer it so the
  // snapshot correctly records whether graph results were actually injected
  // after deduplication filtering.
  const graphHit = deps.dedupedGraph?.hit ?? recallSearch?.graph?.hit ?? false;
  const results = deps.filteredResults ?? allResults;

  return {
    status,
    query: deps.queryText ?? '',
    resultIds: graphHit ? [] : results.map((r) => r.id),
    resultCount: graphHit ? 0 : results.length,
    resultScores: graphHit ? [] : results.map((r) => r.score ?? 0),
    graphHit,
    stepsJson: safeSerializeRecallSteps(deps.steps),
    updatedAt: new Date().toISOString(),
    lastInitAt: deps.lastInitAt,
    searchMode: recallConfig?.searchMode ?? 'unknown',
    topK: recallConfig?.documentCount ?? 0,
    graphTopK: recallSearch?.effectiveGraphTopK ?? 0,
    graphThreshold: recallSearch?.effectiveGraphThreshold ?? 0,
    graphRandomWalkSteps: recallConfig?.graphRandomWalkSteps ?? 0,
    indexPaths: [...RECALL_AUTO_INDEX_PATHS],
    ...buildIndexStats(indexStats),
    error,
  };
}

// =============================================================================
// RecallSearchResult partition helpers
// =============================================================================

export interface PartitionRecallResultsInput {
  graph: { hit: boolean; context?: string };
  results: Array<{ id: string; content: string; score?: number }>;
  recentFingerprints: string[];
}

export interface PartitionRecallResultsOutput {
  results: Array<{ id: string; content: string; score?: number }>;
  graph: { hit: boolean; score?: number; context: string };
  historyFingerprints: string[];
}

export function partitionRecallResults(
  input: PartitionRecallResultsInput,
): PartitionRecallResultsOutput {
  const seenFingerprints = new Set(input.recentFingerprints);
  const workspaceEntries = input.results.map((result) => ({
    result,
    fingerprint: `workspace:${result.id}`,
  }));
  const workspaceResults = workspaceEntries
    .filter((entry) => !seenFingerprints.has(entry.fingerprint))
    .map((entry) => entry.result);
  const workspaceFingerprints = workspaceEntries.map((e) => e.fingerprint);

  const graphFingerprint =
    input.graph.hit === true && input.graph.context !== null && input.graph.context !== undefined
      ? `graph:${createHash('sha1').update(input.graph.context).digest('hex')}`
      : null;

  const graphAllowed = graphFingerprint !== null && !seenFingerprints.has(graphFingerprint);
  const historyFingerprints = [
    ...(graphFingerprint !== null && graphFingerprint !== undefined ? [graphFingerprint] : []),
    ...workspaceFingerprints,
  ];

  return {
    graph: graphAllowed
      ? { hit: input.graph.hit, score: 0, context: input.graph.context ?? '' }
      : { hit: false, score: 0, context: '' },
    results: graphAllowed ? input.results : workspaceResults,
    historyFingerprints,
  };
}

// =============================================================================
// Recall history helpers
// =============================================================================

export function buildNextRecallHistory(input: {
  recentFingerprints: string[];
  candidateFingerprints: string[];
  windowSize: number;
}): LongTermMemoryRecallHistory {
  const seen = new Set(input.recentFingerprints);
  const next: string[] = [];
  for (const fp of input.recentFingerprints) {
    if (!seen.has(fp)) next.push(fp);
  }
  for (const fp of input.candidateFingerprints) {
    if (fp.length > 0 && !seen.has(fp) && next.length < input.windowSize) next.push(fp);
  }
  return {
    recentFingerprints: next,
    updatedAt: new Date().toISOString(),
  };
}
