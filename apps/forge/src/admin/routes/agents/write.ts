/**
 * Agent Admin Write Routes - Phase 2 of #689
 * POST routes that perform agent write operations extracted from routes.ts
 */

import { z } from 'zod';
import type { HttpHandler } from '../../../http/server';
import type { Database } from '../../../database/index';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import { jsonResponse, parseJsonBody } from '../index';
import { clearAgentHistory } from '../helpers';
import { clearAgentHistorySchema, agentLongTermMemoryRecallSearchSchema, agentActionSchema } from '../schemas';
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
    },
  });
  // POST /admin/agent/ltm-recall-search
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/ltm-recall-search',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, agentLongTermMemoryRecallSearchSchema);
      return jsonResponse(
        await readModel.debugAgentLongTermMemoryRecallSearch(body.agentId, {
          query: body.query,
        }),
      );
    },
  });
}