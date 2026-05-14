/**
 * Agent Admin Write Routes - Phase 2 of #689
 * POST routes that perform agent write operations extracted from routes.ts
 */

import { z, ZodError } from 'zod';
import { forgeDebug } from '../debug';
import type { HttpHandler } from '../../../http/server';

import type {Database} from '../../../database/schema';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import { jsonResponse, parseJsonBody } from '../index';
import { clearAgentHistory } from '../helpers';
import { clearAgentHistorySchema, agentLongTermMemoryRecallSearchSchema, agentActionSchema } from '../schemas/agents';
import { reloadAgentIfLoaded } from '../../../capabilities/runtime';

interface ReadModel {
  debugAgentLongTermMemoryRecallSearch: (agentId: string, opts: { query: string }) => Promise<unknown>;
}

interface AgentRoutesInput {
  db: Database;
  workspaceBasePath: string;
  loaderConfig: AgentLoaderConfig;
}

/**
 * Register POST routes for agent write operations
 */
export function registerAgentWriteRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  readModel: ReadModel,
  input: AgentRoutesInput
) {
  // POST /admin/agent/clear-history
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/clear-history',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, clearAgentHistorySchema);
        await clearAgentHistory({
          db: input.db,
          workspaceBasePath: input.workspaceBasePath,
          agentId: body.agentId,
          includeLongTermMemoryThread: body.includeLongTermMemoryThread,
        });
        await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);
        return jsonResponse({
          success: true,
          agentId: body.agentId,
          includeLongTermMemoryThread: body.includeLongTermMemoryThread,
        });
      } catch (err) {
        if (error instanceof ZodError) throw error;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent clear-history route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });

  // POST /admin/agent/ltm-recall-search
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/ltm-recall-search',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, agentLongTermMemoryRecallSearchSchema);
        return jsonResponse(
          await readModel.debugAgentLongTermMemoryRecallSearch(body.agentId, {
            query: body.query,
          }),
        );
      } catch (err) {
        if (error instanceof ZodError) throw error;
        forgeDebug({ scope: 'admin', level: 'error', message: 'Agent ltm-recall-search route failed', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}
