/**
 * Agent metrics read model — extracted from agents.ts (phase 5a).
 * Covers: listRecentAgentHomeMetricSnapshots.
 *
 * Issue: #2467 — extract submodules from admin/read-model/agents.ts
 */

import { desc, eq } from 'drizzle-orm';
import { agentHomeMetricSnapshots } from '../../database/schema';
import type { Database } from '../../database/index';

export interface AgentMetricSnapshot {
  id: number;
  agentId: string;
  snapshotType: string;
  snapshotData: object;
  createdAt: Date;
}

export interface AgentMetricsReadModelDeps {
  db: Database;
}

export function createAgentMetricsReadModel(deps: AgentMetricsReadModelDeps) {
  const { db } = deps;

  async function listRecentAgentHomeMetricSnapshots(input: { agentId: string; limit: number }) {
    const rows = await db.query.agentHomeMetricSnapshots.findMany({
      where: eq(agentHomeMetricSnapshots.agentId, input.agentId),
      orderBy: desc(agentHomeMetricSnapshots.createdAt),
      limit: input.limit,
    });
    return rows.map((row) => {
      const { id, ...rest } = row;
      return { ...rest, snapshotId: id };
    });
  }

  return { listRecentAgentHomeMetricSnapshots };
}
