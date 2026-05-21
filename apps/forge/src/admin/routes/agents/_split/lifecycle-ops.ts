/**
 * Agent Lifecycle Operations — Group 1 of 4
 * Routes: reload, force-idle, rewakeup
 * Split from write-ops.ts (#2180)
 */

import { parseJsonBody, jsonResponse } from '../../index';
import { agentActionSchema } from '../../schemas/agents';

export function registerLifecycleOps(
  httpServer: any,
  input: {
    db: unknown;
    loaderConfig: unknown;
  },
  ops: {
    loadAgent: (db: unknown, config: unknown) => Promise<unknown>;
    registry: {
      add: (db: unknown, runtime: unknown) => Promise<void>;
      get: (agentId: string) => unknown;
    };
  },
) {
  // POST /admin/agent/reload
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/reload',
    handler: async (request: { bodyText: string }) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
        const config = input.loaderConfig as Record<string, unknown>;
        const runtime = await ops.loadAgent(input.db, { ...config, agentId });
        await ops.registry.add(input.db, runtime);
        return jsonResponse({ success: true, agentId });
      } catch (error: unknown) {
        return jsonResponse({ error: String(serializeError(error)) }, 500);
      }
    },
  });

  // POST /admin/agent/force-idle
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/force-idle',
    handler: async (request: { bodyText: string }) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
        const entry = ops.registry.get(agentId);
        if (entry !== null) {
          const runner = (entry as { runner: { forceIdle: () => Promise<void> } }).runner;
          await runner.forceIdle();
        }
        return jsonResponse({ success: true, agentId });
      } catch (error: unknown) {
        return jsonResponse({ error: String(serializeError(error)) }, 500);
      }
    },
  });

  // POST /admin/agent/rewakeup
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/rewakeup',
    handler: async (request: { bodyText: string }) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
        let entry = ops.registry.get(agentId);

        if (entry !== null) {
          const runner = (entry as { runner: { forceIdle: () => Promise<void> } }).runner;
          await runner.forceIdle();
        } else {
          const config = input.loaderConfig as Record<string, unknown>;
          const runtime = await ops.loadAgent(input.db, { ...config, agentId });
          await ops.registry.add(input.db, runtime);
          entry = ops.registry.get(agentId);
        }

        const runner = (entry as { runner: { notifyExternalEvent: (opts: unknown) => void } }).runner;
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
        return jsonResponse({ error: String(serializeError(error)) }, 500);
      }
    },
  });
}
import { serializeError } from '../../../../agents/agent-runner-error-formatting';