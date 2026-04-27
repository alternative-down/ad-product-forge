/**
 * Agent Admin Action Routes - Phase 2 of #689
 * POST routes that perform agent actions extracted from routes.ts
 */

import { z } from 'zod';
import { jsonResponse, parseJsonBody } from '../index';

const clearAgentHistorySchema = z.object({
  agentId: z.string(),
  includeLongTermMemoryThread: z.boolean().optional(),
}).strict();

const agentLongTermMemoryRecallSearchSchema = z.object({
  agentId: z.string(),
  query: z.string(),
  limit: z.number().optional(),
}).strict();

const agentActionSchema = z.object({
  agentId: z.string(),
}).strict();

interface ReadModel {
  debugAgentLongTermMemoryRecallSearch: (agentId: string, opts: { query: string }) => Promise<unknown>;
}

interface AgentRoutesInput {
  db: unknown;
  workspaceBasePath: string;
  loaderConfig: unknown;
}

interface AgentHelpers {
  clearAgentHistory: (opts: {
    db: unknown;
    workspaceBasePath: string;
    agentId: string;
    includeLongTermMemoryThread?: boolean;
  }) => Promise<void>;
  reloadAgentIfLoaded: (db: unknown, loaderConfig: unknown, agentId: string) => Promise<void>;
}

/**
 * Register POST routes for agent write operations
 */
export function registerAgentWriteRoutes(
  httpServer: { registerRoute: (route: unknown) => void },
  readModel: ReadModel,
  input: AgentRoutesInput,
  helpers: AgentHelpers
) {
  // POST /admin/agent/clear-history
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/clear-history',
    handler: async (request) => {
      const body = parseJsonBody(request.bodyText, clearAgentHistorySchema);
      await helpers.clearAgentHistory({
        db: input.db,
        workspaceBasePath: input.workspaceBasePath,
        agentId: body.agentId,
        includeLongTermMemoryThread: body.includeLongTermMemoryThread,
      });
      await helpers.reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);
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