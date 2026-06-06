/**
 * Agent Lifecycle Operations — Group 1 of 4
 * Routes: reload, force-idle, rewakeup
 * Split from write-ops.ts (#2180)
 */

import { parseJsonBody, jsonResponse } from '../../index';
import type { Database } from '../../../../database/client';
import type { HttpHandler } from '../../../../http/server';

// ─── Typed interfaces for lifecycle ops ────────────────────────────────────
interface RegistryEntry {
  runner: {
    notifyExternalEvent: (opts: unknown) => void;
    forceIdle: () => Promise<void>;
  };
}

interface Registry {
  get(agentId: string): RegistryEntry | null;
  add(db: Database, runtime: unknown): Promise<void>;
}

interface Ops {
  loadAgent: (db: Database, config: Record<string, unknown>) => Promise<unknown>;
  registry: Registry;
}

import { agentActionSchema } from '../../schemas/agents';
import { errorMsg } from '../../../../agents/error-formatting';

export function registerLifecycleOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  input: {
    db: Database;
    loaderConfig: Record<string, unknown>;
  },
  ops: Ops,
) {
  // POST /admin/agent/reload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request: { bodyText: string }) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText ?? '', agentActionSchema);
        const config = input.loaderConfig;
        const runtime = await ops.loadAgent(input.db, { ...config, agentId });
        await ops.registry.add(input.db, runtime);
        return jsonResponse({ success: true, agentId });
      } catch (error: unknown) {
        return jsonResponse({ error: errorMsg(error) }, 500);
      }
    },
  });

  // POST /admin/agent/force-idle
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/force-idle',
    handler: async (request: { bodyText: string }) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText ?? '', agentActionSchema);
        const entry = ops.registry.get(agentId);
        if (entry !== null) {
          const runner = (entry as { runner: { forceIdle: () => Promise<void> } }).runner;
          await runner.forceIdle();
        }
        return jsonResponse({ success: true, agentId });
      } catch (error: unknown) {
        return jsonResponse({ error: errorMsg(error) }, 500);
      }
    },
  });

  // POST /admin/agent/rewakeup
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/rewakeup',
    handler: async (request: { bodyText: string }) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText ?? '', agentActionSchema);
        let entry = ops.registry.get(agentId);

        if (entry !== null) {
          const runner = (entry as { runner: { forceIdle: () => Promise<void> } }).runner;
          await runner.forceIdle();
        } else {
          const config = input.loaderConfig;
          const runtime = await ops.loadAgent(input.db, { ...config, agentId });
          await ops.registry.add(input.db, runtime);
          entry = ops.registry.get(agentId);
        }

        const runner = (entry as { runner: { notifyExternalEvent: (opts: unknown) => void } })
          .runner;
        runner.notifyExternalEvent({
          type: 'admin-rewakeup',
          groupKey: `admin-rewakeup:${agentId}`,
          groupMetadata: { source: 'admin' },
          idempotencyKey: `admin-rewakeup:${agentId}:${Date.now()}`,
          text: 'Admin requested a forced rewakeup. Rebuild context and continue work from the current state.',
          timestamp: Date.now(),
        });

        return jsonResponse({ success: true, agentId });
      } catch (error: unknown) {
        return jsonResponse({ error: errorMsg(error) }, 500);
      }
    },
  });
}
