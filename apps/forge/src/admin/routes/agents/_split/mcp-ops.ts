/**
 * Agent MCP Operations — extracted from write-ops.ts
 */

import { z } from 'zod';
import { createId } from '../../../../utils/id';
import { forgeDebug } from '../../debug';
import { jsonResponse, parseJsonBody } from '../../index';
import { reloadAgentMcp } from '../../../routes/mcp-helpers';
import type { HttpHandler } from '../../../../http/server';

export function registerMcpOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  db: any,
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

        await db.insert(db.schema.mcpServerConfigs).values({
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

        await db.insert(db.schema.agentMcpConfigs).values({
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
          context: { error: err instanceof Error ? err.message : String(err) },
        });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },
  });
}
