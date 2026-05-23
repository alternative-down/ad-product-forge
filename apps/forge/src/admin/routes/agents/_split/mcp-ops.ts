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
import type { AgentLoaderConfig } from '../../../../agents/agent-loader';


// Extract error message for user-facing display
function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}

// ─── Request body schema ─────────────────────────────────────────────────────
const mcpCreateBodySchema = z.object({
  agentId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  transport: z.enum(['stdio', 'http_streamable']),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().optional(),
});

export function registerMcpOps(
  httpServer: {
    registerRoute: (route: { method: 'POST'; path: string; handler: HttpHandler }) => void;
  },
  db: Database,
  loaderConfig: AgentLoaderConfig,
) {
  // POST /admin/agent/mcp/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/mcp/create',
    handler: async (request) => {
      try {
        const body = parseJsonBody(request.bodyText ?? '', mcpCreateBodySchema);
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
          context: { error: errorMsg(err) },
        });
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });
}
