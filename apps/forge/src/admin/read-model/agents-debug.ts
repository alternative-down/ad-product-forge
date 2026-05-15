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
import { withTimeout } from '../../utils/async';
import { forgeDebug } from '@forge-runtime/core';
import { createAgentsRuntimeMemoryReadModel } from './agents-runtime-memory';
import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';

export interface AgentDebugReadModelDeps {
  db: Database;
  // Function dependencies (passed as thunks to avoid circular reference issues)
  getAgent: (agentId: string) => Promise<unknown>;
  getAgentRuntimeMemory: (agentId: string) => Promise<unknown>;
  listRecentAgentHomeMetricSnapshots: (input: { agentId: string; limit: number }) => Promise<unknown>;
}

export function createAgentDebugReadModel(deps: AgentDebugReadModelDeps) {
  const { db, getAgent, getAgentRuntimeMemory: getAgentRuntimeMemory_, listRecentAgentHomeMetricSnapshots } = deps;

  async function getAgentOmDebugExport(agentId: string) {

    let getAgentRuntimeMemory = getAgentRuntimeMemory_;
    if (!getAgentRuntimeMemory) {
      const armRM = createAgentsRuntimeMemoryReadModel({ db, workspaceBasePath });
      getAgentRuntimeMemory = armRM.getAgentRuntimeMemory;
    }

    const [agent, runtimeMemory, snapshots] = await Promise.all([
      getAgent(agentId),
      withTimeout(
        getAgentRuntimeMemory(agentId),
        ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
        'getAgentOmDebugExport: runtime memory timed out',
      ).catch((err) => {
        forgeDebug({ scope: 'admin-read-model', level: 'warn', message: 'getAgentRuntimeStatus: agent not loaded', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
        return null;
      }),
      listRecentAgentHomeMetricSnapshots({ agentId, limit: 100 }),
    ]);
    if (!agent) return null;
    const ltm = await withTimeout(
      readLongTermMemoryState(db, agentId),
      ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
      'getAgentOmDebugExport: LTM state timed out',
    ).catch((err) => {
      forgeDebug({ scope: 'admin-read-model', level: 'warn', message: 'getAgentRuntimeStatus: LTM recall not available', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      return null;
    });
    return { agent, runtimeMemory, snapshots, ltm };
  }

  async function debugAgentLongTermMemoryRecallSearch(
    agentId: string,
    input: AgentLongTermMemoryRecallDebugSearchInput,
  ) {
    let agent;
      agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;
    const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId, input);
    return { ltmRecall };
  }

  return { getAgentOmDebugExport, debugAgentLongTermMemoryRecallSearch };
}
