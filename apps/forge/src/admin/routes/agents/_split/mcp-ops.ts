/**
 * Agent MCP Operations — extracted from write-ops.ts
 */

import { z } from 'zod';
import { createId } from '../../../../utils/id';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import { reloadAgentMcp } from '../../../routes/mcp-helpers';
import type { HttpHandler } from '../../../../http/server';
import { mcpServerConfigs, agentMcpConfigs } from '../../../../database/schema';
import type { Database } from '../../../../database/schema';

export function registerMcpOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  db: Database,
  loaderConfig: any,
) {
  // POST /admin/agent/mcp/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText, z.any());
        const serverId = createId();
        const configId = createId();

        await db.insert(mcpServerConfigs).values({
          id: serverId,
          name: body.name,
          description: body.description ?? '',
          transport: body.transport,
          command: body.transport === 'stdio' ? body.command : null,
          args: body.transport === 'stdio' ? (body.argsText ?? '[]') : null,
          envVars: body.transport === 'stdio' ? (body.envVarsText ?? '{}') : null,
          url: body.transport === 'http_streamable' ? body.url : null,
          headers: body.transport === 'http_streamable' ? (body.headersText ?? '{}') : null,
          version: 1,
          isActive: body.isActive === true ? 1 : 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await db.insert(agentMcpConfigs).values({
          id: configId,
          agentId: body.agentId,
          serverId,
          isActive: body.isActive === true ? 1 : 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await reloadAgentMcp(db, loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId, serverId }, 201);
      } catch (err) {
        forgeDebug({
          scope: 'admin',
          level: 'error',
          message: 'Admin route failed: /admin/agent/mcp/create',
          context: { error: String(serializeError(err)) },
        });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });
}
import { serializeError } from '../../../../agents/agent-runner-error-formatting';
