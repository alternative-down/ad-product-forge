import { forgeDebug, type SqliteWorkspaceRetrieval } from '@forge-runtime/core';

import type { createAgentLongTermMemoryStore } from '../store';
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
 *  - Reindex on stamp change
 *  - Last-init / last-indexed stamp state
 *  - Read index stats (delegates to persistence)
 *  - Read current index stamp (delegates to persistence store)
 */
export interface IndexManagerDeps {
  agentId: string;
  retrievalWorkspace: SqliteWorkspaceRetrieval;
  persistence: RecallPersistence;
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  inFlightTracker: InFlightRecallTracker;
  initTimeoutMs: number;
}

export class IndexManager {
  private workspaceInitialized = false;
  private lastIndexedStamp: string | null = null;
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
    const currentStamp = await this.readCurrentIndexStamp();

    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace init start',
      context: {
        agentId: this.deps.agentId,
        stamp: currentStamp,
      },
    });
    await this.deps.inFlightTracker.runTrackedRecallOperation(
      'retrieval.refresh',
      this.deps.retrievalWorkspace.refresh(),
      this.deps.initTimeoutMs,
      'ltm recall retrieval init timed out',
    );
    this.workspaceInitialized = true;
    this.lastIndexedStamp = currentStamp;
    this.lastInitAt = new Date().toISOString();
    this.deps.persistence.setLastInitAt(this.lastInitAt);
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace init complete',
      context: {
        agentId: this.deps.agentId,
        durationMs: Date.now() - stageStartedAt,
        stamp: currentStamp,
      },
    });
  }

  /**
   * Refresh the workspace retrieval index.
   * Ensures init has run, then re-runs the workspace refresh if the stamp changed.
   */
  async refreshIndex(): Promise<void> {
    await this.initialize();

    const stageStartedAt = Date.now();
    const currentStamp = await this.readCurrentIndexStamp();

    if (currentStamp === this.lastIndexedStamp) {
      forgeDebug({
        scope: 'ltm',
        level: 'info',
        message: 'ltm recall workspace index unchanged',
        context: {
          agentId: this.deps.agentId,
          durationMs: Date.now() - stageStartedAt,
          stamp: currentStamp,
        },
      });
      return;
    }

    const previousStamp = this.lastIndexedStamp;
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace reindex start',
      context: {
        agentId: this.deps.agentId,
        previousStamp,
        nextStamp: currentStamp,
      },
    });
    await this.deps.inFlightTracker.runTrackedRecallOperation(
      'retrieval.refresh',
      this.deps.retrievalWorkspace.refresh(),
      this.deps.initTimeoutMs,
      'ltm recall retrieval refresh timed out',
    );
    this.lastIndexedStamp = currentStamp;
    this.lastInitAt = new Date().toISOString();
    this.deps.persistence.setLastInitAt(this.lastInitAt);
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace reindex complete',
      context: {
        agentId: this.deps.agentId,
        durationMs: Date.now() - stageStartedAt,
        stamp: currentStamp,
      },
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

  /**
   * Read the current index stamp from the persistence store.
   */
  async readCurrentIndexStamp(): Promise<string | null> {
    return await this.deps.persistenceStore.readRecallIndexStamp();
  }
}

export function createIndexManager(deps: IndexManagerDeps) {
  return new IndexManager(deps);
}
