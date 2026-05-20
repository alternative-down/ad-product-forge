/**
 * Agent debug/observability read model — extracted from agents.ts (phase 5c).
 * Covers: getAgentOmDebugExport, debugAgentLongTermMemoryRecallSearch.
 *
 * Issue: #2467 — extract submodules from admin/read-model/agents.ts
 */

import { eq } from 'drizzle-orm';
import { agents } from '../../database/schema';
import { readLongTermMemoryState, readLongTermMemoryRecallSnapshot } from './helpers-ltm';
import type { AgentLongTermMemoryRecallDebugSearchInput } from '../../agents/ltm/recall';
import type { Database } from '../../database/index';
import { forgeDebug } from '@forge-runtime/core';
import { createAgentsRuntimeMemoryReadModel } from './agents-runtime-memory';

export interface AgentDebugReadModelDeps {
  db: Database;
  workspaceBasePath: string;
  // Function dependencies (passed as thunks to avoid circular reference issues)
  getAgent: (agentId: string) => Promise<unknown>;
  getAgentRuntimeMemory?: (agentId: string) => Promise<unknown>;
  listRecentAgentHomeMetricSnapshots: (input: {
    agentId: string;
    limit: number;
  }) => Promise<unknown>;
  registry?: { get(agentId: string): unknown };
}

export function createAgentDebugReadModel(deps: AgentDebugReadModelDeps) {
  const {
    db,
    workspaceBasePath,
    getAgent,
    getAgentRuntimeMemory: getAgentRuntimeMemory_,
    listRecentAgentHomeMetricSnapshots,
    registry,
  } = deps;

  // Resolve getAgentRuntimeMemory — use provided or lazy-init from agents-runtime-memory
  let getAgentRuntimeMemoryFn = getAgentRuntimeMemory_;
  if (!getAgentRuntimeMemoryFn && registry) {
    const armRM = (createAgentsRuntimeMemoryReadModel as any)({ db, registry, workspaceBasePath });
    getAgentRuntimeMemoryFn = armRM.getAgentRuntimeMemory;
  }

  async function getAgentOmDebugExport(agentId: string) {
    const [agent, runtimeMemory, snapshots] = await Promise.all([
      getAgent(agentId),
      (
        getAgentRuntimeMemoryFn ??
        (async () => {
          await Promise.resolve();
          return null;
        })
      )(agentId).catch((err) => {
        forgeDebug({
          scope: 'admin-read-model',
          level: 'warn',
          message: 'getAgentRuntimeStatus: agent not loaded',
          context: { agentId, error: err instanceof Error ? err.message : String(err) },
        });
        return null;
      }),
      listRecentAgentHomeMetricSnapshots({ agentId, limit: 100 }),
    ]);
    if (agent === null || agent === undefined) return null;
    const ltm = await readLongTermMemoryState(db, agentId).catch((err) => {
      forgeDebug({
        scope: 'admin-read-model',
        level: 'warn',
        message: 'getAgentRuntimeStatus: LTM recall not available',
        context: { agentId, error: err instanceof Error ? err.message : String(err) },
      });
      return null;
    });
    return { agent, runtimeMemory, snapshots, ltm };
  }

  async function debugAgentLongTermMemoryRecallSearch(
    agentId: string,
    _input: AgentLongTermMemoryRecallDebugSearchInput,
  ) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (agent === null || agent === undefined) return null;
    const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId);
    return { ltmRecall };
  }

  return {
    getAgentOmDebugExport,
    debugAgentLongTermMemoryRecallSearch,
    getAgentRuntimeMemory: getAgentRuntimeMemoryFn,
  };
}
