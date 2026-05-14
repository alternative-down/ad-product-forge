/**
 * Agent Provider Operations — extracted from write-ops.ts
 */

import { z } from 'zod';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import type { HttpHandler } from '../../../../http/server';

const upsertAgentProviderSchema = z.object({
  agentId: z.string(),
  providerType: z.string(),
  credentials: z.record(z.string(), z.string()),
}).strict();

const deleteAgentProviderSchema = z.object({
  agentId: z.string(),
  providerType: z.string(),
}).strict();

export function registerProviderOps(
  httpServer: { registerRoute: (route: { method: "POST"; path: string; handler: HttpHandler }) => void },
) {
  // POST /admin/agent/providers/upsert
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/upsert',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
        return jsonResponse({ success: true, agentId: body.agentId });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/providers/upsert route handler failed', context: { path: '/admin/agent/providers/upsert', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });

  // POST /admin/agent/providers/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/providers/delete',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);
        return jsonResponse({ success: true, agentId: body.agentId });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: '/admin/agent/providers/delete route handler failed', context: { path: '/admin/agent/providers/delete', error: error instanceof Error ? error.message : String(error) } });
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
}