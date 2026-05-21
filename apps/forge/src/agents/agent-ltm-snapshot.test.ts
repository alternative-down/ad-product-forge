/**
 * Unit tests for agents/agent-ltm-snapshot.ts.
 * partitionRecallResults, buildNextRecallHistory, buildLtmRecallSnapshot.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  partitionRecallResults,
  buildNextRecallHistory,
  buildLtmRecallSnapshot,
  type LtmSnapshotContext,
  type LtmSnapshotDeps,
  type BuildSnapshotOptions,
  // type LongTermMemoryRecallSnapshot,
  type PartitionRecallResultsInput,
} from './agent-ltm-snapshot';

// ─── partitionRecallResults ─────────────────────────────────────────────────

describe('partitionRecallResults', () => {
  it('returns only workspace results when graph hit but fingerprint already seen', () => {
    // When graph has a hit AND the same content was already seen (same fingerprint),
    // graph results are excluded and only workspace results are returned.
    const ctx = 'shared context';
    const input: PartitionRecallResultsInput = {
      graph: { hit: true, context: ctx },
      results: [{ id: 'res-1', content: 'content-1' }],
      // The fingerprint here uses the same algorithm the production code uses
      recentFingerprints: [
        `graph:${require('node:crypto').createHash('sha1').update(ctx).digest('hex')}`,
      ],
    };

    const output = partitionRecallResults(input);

    expect(output.graph.hit).toBe(false);
    expect(output.results.map((r) => r.id)).toEqual(['res-1']);
    expect(output.graph.context).toBe('');
  });

  it('returns graph results when fingerprint not in recentFingerprints', () => {
    const input: PartitionRecallResultsInput = {
      graph: { hit: true, context: 'unique context' },
      results: [{ id: 'res-1', content: 'content-1' }],
      recentFingerprints: ['workspace:res-2', 'workspace:res-3'],
    };

    const output = partitionRecallResults(input);

    expect(output.graph.hit).toBe(true);
    expect(output.graph.context).toBe('unique context');
    expect(output.results.map((r) => r.id)).toEqual(['res-1']);
  });

  it('returns only workspace results when graph hit is false', () => {
    const input: PartitionRecallResultsInput = {
      graph: { hit: false },
      results: [
        { id: 'res-1', content: 'content-1' },
        { id: 'res-2', content: 'content-2' },
      ],
      recentFingerprints: [],
    };

    const output = partitionRecallResults(input);

    expect(output.results.map((r) => r.id)).toEqual(['res-1', 'res-2']);
    expect(output.graph.hit).toBe(false);
  });

  it('deduplicates workspace results whose fingerprints are in recentFingerprints', () => {
    const input: PartitionRecallResultsInput = {
      graph: { hit: false },
      results: [
        { id: 'res-seen', content: 'already seen' },
        { id: 'res-new', content: 'new' },
      ],
      recentFingerprints: ['workspace:res-seen'],
    };

    const output = partitionRecallResults(input);

    expect(output.results.map((r) => r.id)).toEqual(['res-new']);
  });

  it('collects workspace and graph fingerprints into historyFingerprints', () => {
    const graphCtx = 'new-unique-context';
    const input: PartitionRecallResultsInput = {
      graph: { hit: true, context: graphCtx },
      results: [{ id: 'res-a', content: 'a' }],
      recentFingerprints: [],
    };

    const output = partitionRecallResults(input);

    expect(output.historyFingerprints.some((fp) => fp.startsWith('workspace:'))).toBe(true);
    expect(output.historyFingerprints.some((fp) => fp.startsWith('graph:'))).toBe(true);
  });

  it('graph fingerprint is null-safe when graph hit is false', () => {
    const input: PartitionRecallResultsInput = {
      graph: { hit: false, context: undefined },
      results: [],
      recentFingerprints: [],
    };

    const output = partitionRecallResults(input);

    expect(output.graph.hit).toBe(false);
    expect(output.graph.context).toBe('');
  });

  it('preserves scores in results', () => {
    const input: PartitionRecallResultsInput = {
      graph: { hit: false },
      results: [{ id: 'res-1', content: 'c', score: 0.95 }],
      recentFingerprints: [],
    };

    const output = partitionRecallResults(input);

    expect(output.results[0].score).toBe(0.95);
  });
});

// ─── buildNextRecallHistory ─────────────────────────────────────────────────

describe('buildNextRecallHistory', () => {
  it('first loop adds nothing (all recentFingerprints are in seen); empty with no candidates', () => {
    // First loop: each fp is in seen (built from recentFingerprints), so nothing is added.
    // Second loop: no candidates provided.
    const result = buildNextRecallHistory({
      recentFingerprints: ['fp-1', 'fp-2', 'fp-1', 'fp-3'],
      candidateFingerprints: [],
      windowSize: 10,
    });

    // first loop adds nothing; second loop adds nothing → empty
    expect(result.recentFingerprints).toEqual([]);
  });

  it('second loop adds candidateFingerprints up to windowSize; first loop skips all recent', () => {
    // First loop: fp-1 is in seen, skipped.
    // Second loop: fp-2, fp-3, fp-4 added sequentially (stopped at windowSize=3).
    const result = buildNextRecallHistory({
      recentFingerprints: ['fp-1'],
      candidateFingerprints: ['fp-2', 'fp-3', 'fp-4'],
      windowSize: 3,
    });

    expect(result.recentFingerprints).toEqual(['fp-2', 'fp-3', 'fp-4']);
  });

  it('skips empty fingerprints', () => {
    const result = buildNextRecallHistory({
      recentFingerprints: [],
      candidateFingerprints: ['', 'fp-valid', ''],
      windowSize: 5,
    });

    expect(result.recentFingerprints).toEqual(['fp-valid']);
  });

  it('returns recentFingerprints as a plain array (not a Set)', () => {
    const result = buildNextRecallHistory({
      recentFingerprints: ['a', 'b'],
      candidateFingerprints: [],
      windowSize: 5,
    });

    expect(Array.isArray(result.recentFingerprints)).toBe(true);
  });

  it('returns ISO timestamp in updatedAt', () => {
    const result = buildNextRecallHistory({
      recentFingerprints: [],
      candidateFingerprints: [],
      windowSize: 5,
    });

    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─── buildLtmRecallSnapshot ─────────────────────────────────────────────────

describe('buildLtmRecallSnapshot', () => {
  const minimalDeps: any = {
    recallConfig: undefined,
    recallSearch: undefined,
    filteredResults: undefined,
    dedupedGraph: undefined,
    queryText: undefined,
    steps: undefined as any,
    lastInitAt: undefined as any,
  };

  const minimalContext: any = {
    // indexStats: undefined,
  };

  it('returns status and query from options/deps', () => {
    const result = buildLtmRecallSnapshot(
      { ...minimalDeps, queryText: 'test query' },
      minimalContext,
      { status: 'hit' },
    );

    expect(result.status).toBe('hit');
    expect(result.query).toBe('test query');
  });

  it('returns empty resultIds and zero counts when graphHit is true', () => {
    const deps: LtmSnapshotDeps = {
      ...minimalDeps,
      recallSearch: { graph: { hit: true }, results: [{ id: 'r', score: 0.9 }] },
      filteredResults: undefined,
    };

    const result = buildLtmRecallSnapshot(deps, minimalContext, { status: 'hit' });

    expect(result.graphHit).toBe(true);
    expect(result.resultIds).toEqual([]);
    expect(result.resultCount).toBe(0);
    expect(result.resultScores).toEqual([]);
  });

  it('uses dedupedGraph.hit over recallSearch.graph.hit when set', () => {
    const deps: LtmSnapshotDeps = {
      ...minimalDeps,
      dedupedGraph: { hit: true },
      recallSearch: { graph: { hit: false }, results: [{ id: 'r', content: 'c' }] },
    };

    const result = buildLtmRecallSnapshot(deps, minimalContext, { status: 'hit' });

    expect(result.graphHit).toBe(true);
    expect(result.resultIds).toEqual([]);
  });

  it('returns resultIds from filteredResults when graphHit is false', () => {
    const deps: LtmSnapshotDeps = {
      ...minimalDeps,
      dedupedGraph: undefined,
      recallSearch: { graph: { hit: false }, results: [{ id: 'r1', content: 'c' }] },
      filteredResults: [
        { id: 'r1', content: 'c', score: 0.5 },
        { id: 'r2', content: 'd', score: 0.4 },
      ],
    };

    const result = buildLtmRecallSnapshot(deps, minimalContext, { status: 'hit' });

    expect(result.resultIds).toEqual(['r1', 'r2']);
    expect(result.resultCount).toBe(2);
    expect(result.resultScores).toEqual([0.5, 0.4]);
  });

  it('sets searchMode from recallConfig.searchMode', () => {
    const deps: LtmSnapshotDeps = {
      ...minimalDeps,
      recallConfig: { searchMode: 'vector-hybrid', documentCount: 5, graphRandomWalkSteps: 0 },
    };

    const result = buildLtmRecallSnapshot(deps, minimalContext, { status: 'miss' });

    expect(result.searchMode).toBe('vector-hybrid');
  });

  it('sets graphTopK and graphThreshold from recallSearch', () => {
    const deps: LtmSnapshotDeps = {
      ...minimalDeps,
      recallSearch: {
        graph: { hit: false },
        results: [],
        effectiveGraphTopK: 20,
        effectiveGraphThreshold: 0.7,
      },
    };

    const result = buildLtmRecallSnapshot(deps, minimalContext, { status: 'miss' });

    expect(result.graphTopK).toBe(20);
    expect(result.graphThreshold).toBe(0.7);
  });

  it('sets error from options and passes through to snapshot', () => {
    const deps: LtmSnapshotDeps = { ...minimalDeps };
    const err = new Error('search failed');

    const result = buildLtmRecallSnapshot(deps, minimalContext, {
      status: 'error',
      error: err as any,
    });

    expect(result.status).toBe('error');
    expect(result.error).toBe(err);
  });

  it('returns ISO timestamp in updatedAt', () => {
    const result = buildLtmRecallSnapshot(minimalDeps, minimalContext, { status: 'miss' });

    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('sets lastInitAt from deps when provided', () => {
    const deps: LtmSnapshotDeps = { ...minimalDeps, lastInitAt: '2024-01-01T00:00:00Z' };

    const result = buildLtmRecallSnapshot(deps, minimalContext, { status: 'miss' });

    expect(result.lastInitAt).toBe('2024-01-01T00:00:00Z');
  });

  it('indexPaths is always RECALL_AUTO_INDEX_PATHS copy', () => {
    const result = buildLtmRecallSnapshot(minimalDeps, minimalContext, { status: 'miss' });

    expect(result.indexPaths).toEqual(['memory', 'checkpoints']);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal hash-like function to produce consistent fingerprint strings */
