/**
 * Agent Lifecycle Operations — Group 1 of 4
 * Routes: reload, force-idle, rewakeup
 * Split from write-ops.ts (#2180)
 */

import { adminRoutesParseJsonBody, jsonResponse } from '../../index';
import type { Database } from '../../../../database/client';
import type { HttpHandler } from '../../../../http/server';
import type { AgentLoaderConfig } from '../../../../agents/agent-loader-types';
import type { loadAgent } from '../../../../agents/agent-loader';
import type { Registry } from '../../../../agents/internal-agent-registry';

// ─── Ops interface (D54 #6631 Phase 2b v2 — canonical types) ───────────────
// loadAgent signature matches canonical `loadAgent` from agent-loader.ts
// (SingleAgentLoaderConfig). Registry matches canonical InternalAgentRegistry
// (InternalAgentEntry | undefined for get). This eliminates the boundary cast
// at write-ops.ts:81-82.
interface Ops {
  loadAgent: typeof loadAgent;
  registry: Registry;
}

import { agentActionSchema } from '../../schemas/agents';

export function registerLifecycleOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  input: {
    db: Database;
    loaderConfig: AgentLoaderConfig;
  },
  ops: Ops,
) {
  // POST /admin/agent/reload — D66 #6785: no safeRoute wrapper so ZodError
  // (validation) AND other domain errors propagate naturally to the HTTP layer.
  // Test `throws if agentId missing` expects schema validation to throw.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request: { bodyText: string }) => {
      const { agentId } = adminRoutesParseJsonBody(request.bodyText ?? '', agentActionSchema);
      const config = input.loaderConfig;
      const runtime = await ops.loadAgent(input.db, { ...config, agentId });
      await ops.registry.add(input.db, runtime);
      return jsonResponse({ success: true, agentId });
    },
  });

  // POST /admin/agent/force-idle
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/force-idle',
    handler: async (request: { bodyText: string }) => {
      const { agentId } = adminRoutesParseJsonBody(request.bodyText ?? '', agentActionSchema);
      const entry = ops.registry.get(agentId);
      if (entry != null && entry.runner !== null) {
        await entry.runner.forceIdle();
      }
      return jsonResponse({ success: true, agentId });
    },
  });

  // POST /admin/agent/rewakeup — D66 #6785: throws when loadAgent is missing.
  // Test `throws if agent not in registry and loadAgent missing` passes empty ops
  // and expects the handler to reject with a message containing 'loadAgent'.
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/rewakeup',
    handler: async (request: { bodyText: string }) => {
      const { agentId } = adminRoutesParseJsonBody(request.bodyText ?? '', agentActionSchema);
      let entry = ops.registry.get(agentId);

      if (entry != null && entry.runner !== null) {
        await entry.runner.forceIdle();
      } else {
        if (ops.loadAgent === undefined) {
          throw new Error('loadAgent is required to rewakeup an agent that is not in the registry');
        }
        const config = input.loaderConfig;
        const runtime = await ops.loadAgent(input.db, { ...config, agentId });
        await ops.registry.add(input.db, runtime);
        entry = ops.registry.get(agentId);
      }

      if (entry == null || entry.runner === null) {
        return jsonResponse({ success: false, error: 'agent not found' }, 404);
      }
      const runner = entry.runner;
      runner.notifyExternalEvent({
        type: 'admin-rewakeup',
        groupKey: `admin-rewakeup:${agentId}`,
        groupMetadata: { source: 'admin' },
        idempotencyKey: `admin-rewakeup:${agentId}:${Date.now()}`,
        text: 'Admin requested a forced rewakeup. Rebuild context and continue work from the current state.',
        timestamp: Date.now(),
      });

      return jsonResponse({ success: true, agentId });
    },
  });
}

// ─── Named type exports (D54 #6631 Phase 2b infrastructure) ────────────
// Exported for write-ops.ts to use as cast targets. Refactor-safe: when
// registerLifecycleOps signature changes, the aliases propagate automatically.
//
// Casts in write-ops.ts still require `as unknown as` because the local
// _split signatures intentionally use Record<string, unknown> / local
// interfaces (backward-compat). Future refactor: upgrade _split signatures
// to canonical types (AgentLoaderConfig, InternalAgentRegistry, loadAgent)
// AND update body code (loadAgent expects SingleAgentLoaderConfig; Registry
// null vs undefined) — see write-ops.ts:73-74 comment for context.
export type RegisterLifecycleOpsInput = Parameters<typeof registerLifecycleOps>[1];
export type RegisterLifecycleOpsOps = Parameters<typeof registerLifecycleOps>[2];
