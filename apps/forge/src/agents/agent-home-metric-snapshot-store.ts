import { errorMsg } from './error-formatting';
import type { Database } from '../database/client';
import { forgeDebug } from '@forge-runtime/core';
import { agentHomeMetricSnapshots } from '../database/schema';
import { createId } from '../utils/id';

export type AgentHomeMetricSnapshotStore = ReturnType<typeof createAgentHomeMetricSnapshotStore>;

export function createAgentHomeMetricSnapshotStore(db: Database) {
  async function recordSnapshot(input: {
    agentId: string;
    stepId: string;
    stepCreatedAt: number;
    snapshot: unknown;
  }) {
    const createdAt = Date.now();

    try {
      await (db.insert(agentHomeMetricSnapshots) as any).values({
        id: createId(),
        agentId: input.agentId,
        stepId: input.stepId,
        stepCreatedAt: input.stepCreatedAt,
        snapshot: input.snapshot,
        createdAt,
      });
    } catch (err) {
      forgeDebug({
        scope: 'agent-home-metric-snapshot',
        level: 'error',
        message: 'recordSnapshot DB insert failed',
        context: { agentId: input.agentId, stepId: input.stepId, error: errorMsg(err) },
      });
      throw err;
    }

    return {
      createdAt,
    };
  }

  return {
    recordSnapshot,
  };
}
