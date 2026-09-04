/**
 * Agent Admin Write Routes - Phase 2 of #689
 * POST routes that perform agent write operations extracted from routes.ts
 */

import type { HttpHandler } from '../../../http/server';

import type { Database } from '../../../database/client';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import { jsonResponse, adminRoutesParseJsonBody } from '../index';
import { clearAgentHistorySchema } from '../schemas/agents';
import { reloadAgentIfLoaded } from '../../../capabilities/runtime';
import { labeledRoute } from './admin-route-error-helper';
import { clearAgentHistory } from './agent-history';

interface AgentRoutesInput {
  db: Database;
  workspaceBasePath: string;
  loaderConfig: AgentLoaderConfig;
}

/**
 * Register POST routes for agent write operations
 */
export function registerAgentWriteRoutes(
  httpServer: {
    registerRoute: (route: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      handler: HttpHandler;
    }) => void;
  },
  _readModel: object,
  input: AgentRoutesInput,
) {
  // POST /admin/agent/clear-history
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/clear-history',
    handler: labeledRoute('Agent clear-history route', async (request) => {
      const body = adminRoutesParseJsonBody(request.bodyText, clearAgentHistorySchema);
      await clearAgentHistory({
        db: input.db,
        workspaceBasePath: input.workspaceBasePath,
        agentId: body.agentId,
      });
      await reloadAgentIfLoaded(input.db, input.loaderConfig, body.agentId);
      return jsonResponse({
        success: true,
        agentId: body.agentId,
      });
    }),
  });
}
