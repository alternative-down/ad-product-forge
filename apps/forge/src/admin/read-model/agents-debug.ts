/**
 * Agent debug/observability read model — extracted from agents.ts (phase 5c).
 * Covers operational-memory debug exports.
 *
 * Issue: #2467 — extract submodules from admin/read-model/agents.ts
 */

import type { Database } from '../../database/index';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/error-formatting';
import { createAgentsRuntimeMemoryReadModel } from './agents-runtime-memory';
import type { InternalAgentRegistry } from '../../agents/internal-agent-registry';

/**
 * Module-local debug helper. Centralizes the admin-read-model scope
 * so call sites only specify the level, message, and context.
 */
function adminReadModelAgentsDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
) {
  forgeDebug({ scope: 'admin-read-model', level, message, context });
}

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
  registry?: InternalAgentRegistry;
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
    const armRM = createAgentsRuntimeMemoryReadModel({ db, registry, workspaceBasePath });
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
        adminReadModelAgentsDebug('warn', 'getAgentRuntimeStatus: agent not loaded', {
          agentId,
          error: errorMsg(err),
        });
        return null;
      }),
      listRecentAgentHomeMetricSnapshots({ agentId, limit: 100 }),
    ]);
    if (agent === null || agent === undefined) return null;
    return { agent, runtimeMemory, snapshots };
  }

  return {
    getAgentOmDebugExport,
    getAgentRuntimeMemory: getAgentRuntimeMemoryFn,
  };
}
