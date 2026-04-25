import type { Database } from '../database';
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

    await db.insert(agentHomeMetricSnapshots).values({
      id: createId(),
      agentId: input.agentId,
      stepId: input.stepId,
      stepCreatedAt: input.stepCreatedAt,
      snapshot: input.snapshot,
      createdAt,
    });

    return {
      createdAt,
    };
  }

  return {
    recordSnapshot,
  };
}
