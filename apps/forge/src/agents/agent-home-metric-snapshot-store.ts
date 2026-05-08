import type { Database } from '../database';
import { forgeDebug } from '@forge-runtime/core';
import { agentHomeMetricSnapshots } from '../database/schema';
import { createId } from '../utils/id';

export function createAgentHomeMetricSnapshotStore(db: Database) {
  async function recordSnapshot(input: {
    agentId: string;
    stepId: string;
    stepCreatedAt: number;
    snapshot: unknown;
  }) {
    const createdAt = Date.now();

    try {
      await db.insert(agentHomeMetricSnapshots).values({
        id: createId(),
        agentId: input.agentId,
        stepId: input.stepId,
        stepCreatedAt: input.stepCreatedAt,
        snapshot: input.snapshot,
        createdAt,
      });
    } catch (err) {
      forgeDebug({
        scope: 'agent-home-metric-snapshot-store',
        level: 'error',
        runtimeId: input.agentId,
        message: 'recordSnapshot failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      throw err;
      forgeDebug({ scope: 'agent-home-metric-snapshot', level: 'error', message: 'agent-home-metric-snapshot operation failed', error: err instanceof Error ? err.message : String(err) });
    }

    return {
      createdAt,
    };
  }

  return {
    recordSnapshot,
  };
}
