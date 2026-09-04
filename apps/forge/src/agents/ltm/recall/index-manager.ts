import { forgeDebug, type SqliteWorkspaceRetrieval } from '@forge-runtime/core';

import type { InFlightRecallTracker } from './in-flight-tracker';
import type { RecallPersistence } from './persistence';

/**
 * IndexManager
 *
 * Encapsulates the workspace index lifecycle for LTM recall.
 * Extracted from `recall.ts` (#5352) — second of four planned extractions.
 *
 * Concerns:
 *  - Workspace initialization (one-shot, idempotent)
 *  - Explicit workspace reindexing
 *  - Last initialization timestamp
 *  - Read index stats (delegates to persistence)
 */

/**
 * Module-local debug helper for this file.
 * Bakes in scope=ltm so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 5 forgeDebug call-sites in this file all use scope=ltm
 *   - Inline pattern keeps TSC error count flat (no new TS7016)
 */
function ltmIndexManagerDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'ltm',
    level,
    message,
    context,
  });
}

export interface IndexManagerDeps {
  agentId: string;
  retrievalWorkspace: SqliteWorkspaceRetrieval;
  persistence: RecallPersistence;
  inFlightTracker: InFlightRecallTracker;
  initTimeoutMs: number;
}

export class IndexManager {
  private workspaceInitialized = false;
  private lastInitAt: string | null = null;

  constructor(private readonly deps: IndexManagerDeps) {}

  /**
   * Read-only access to the last initialization timestamp.
   * Used by callers that need to include `lastInitAt` in snapshots / debug output.
   */
  getLastInitAt(): string | null {
    return this.lastInitAt;
  }

  /**
   * Initialize the workspace retrieval index.
   * Idempotent: returns early if already initialized.
   */
  async initialize(): Promise<void> {
    if (this.workspaceInitialized) {
      return;
    }

    const stageStartedAt = Date.now();
    ltmIndexManagerDebug('info', 'ltm recall workspace init start', { agentId: this.deps.agentId });
    await this.deps.inFlightTracker.runTrackedRecallOperation(
      'retrieval.refresh',
      this.deps.retrievalWorkspace.refresh(),
      this.deps.initTimeoutMs,
      'ltm recall retrieval init timed out',
    );
    this.workspaceInitialized = true;
    this.lastInitAt = new Date().toISOString();
    this.deps.persistence.setLastInitAt(this.lastInitAt);
    ltmIndexManagerDebug('info', 'ltm recall workspace init complete', {
      agentId: this.deps.agentId,
      durationMs: Date.now() - stageStartedAt,
    });
  }

  /**
   * Refresh the workspace retrieval index.
   * Ensures init has run, then re-runs the workspace refresh so manually edited
   * memory files are available to the next semantic/BM25/graph recall.
   */
  async refreshIndex(): Promise<void> {
    await this.initialize();

    const stageStartedAt = Date.now();
    ltmIndexManagerDebug('info', 'ltm recall workspace reindex start', {
      agentId: this.deps.agentId,
    });
    await this.deps.inFlightTracker.runTrackedRecallOperation(
      'retrieval.refresh',
      this.deps.retrievalWorkspace.refresh(),
      this.deps.initTimeoutMs,
      'ltm recall retrieval refresh timed out',
    );
    this.lastInitAt = new Date().toISOString();
    this.deps.persistence.setLastInitAt(this.lastInitAt);
    ltmIndexManagerDebug('info', 'ltm recall workspace reindex complete', {
      agentId: this.deps.agentId,
      durationMs: Date.now() - stageStartedAt,
    });
  }

  /**
   * Read workspace index state (for debugSearch output).
   * Combines the retrieval stats with static capability flags.
   */
  async getWorkspaceIndexState(): Promise<{
    workspaceCanBm25: boolean;
    workspaceCanVector: boolean;
    workspaceCanHybrid: boolean;
    availableIndexes: string[];
    activeIndexStats: { dimension: number; count: number; metric: string } | null;
    [key: string]: unknown;
  }> {
    return {
      workspaceCanBm25: true,
      workspaceCanVector: true,
      workspaceCanHybrid: true,
      ...(await this.deps.retrievalWorkspace.getStats()),
    };
  }

  /**
   * Read index stats (file counts).
   * Delegates to persistence.
   */
  async getIndexStats(): Promise<{
    workspaceFileCount: number;
    memoryFileCount: number;
    checkpointFileCount: number;
  }> {
    return await this.deps.persistence.getIndexStats();
  }
}

export function createIndexManager(deps: IndexManagerDeps) {
  return new IndexManager(deps);
}
