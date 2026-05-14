import type { HttpHandler } from '../../../http/server';
import { z } from 'zod';
import type { Database } from '../../../database/client';
import type { AgentLoaderConfig } from '../../../agents/agent-loader';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../../../utils/id';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody, jsonResponse, normalizeJsonText, normalizeOptionalText } from '../helpers';
import { reloadAgentIfLoaded } from '../../../capabilities/runtime';
import { reloadAgentMcp } from '../../routes/mcp-helpers';
import { adminRouteError } from './admin-route-error-helper';
import { agentProviders, agentMcpConfigs, mcpServerConfigs } from '../../../database/schema';
import { parseProviderCredentials } from '../../../communication/provider-loader';
import { encryptSecret } from '../../../encryption/crypto';
import { discordProviderDeleteSignalSchema } from '../schemas/discord';

// Schemas co-located with routes (extracted from schemas.ts for locality)
const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.string().min(1),
  credentials: z.record(z.unknown()),
});
const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.string().min(1),
});
const createAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  transport: z.enum(['stdio', 'http_streamable']),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().default(false),
});
const updateAgentMcpServerSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  transport: z.enum(['stdio', 'http_streamable']).optional(),
  command: z.string().optional(),
  argsText: z.string().optional(),
  envVarsText: z.string().optional(),
  url: z.string().optional(),
  headersText: z.string().optional(),
  isActive: z.boolean().optional(),
});
const deleteAgentMcpServerSchema = z.object({ agentId: z.string().min(1), serverId: z.string().min(1) });
const assignAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  serverId: z.string().min(1),
  isActive: z.boolean().default(true),
});
const setAgentMcpServerActiveSchema = z.object({
  configId: z.string().min(1),
  isActive: z.boolean(),
});
const detachAgentMcpServerSchema = z.object({
  configId: z.string().min(1),
  agentId: z.string().min(1),
});

/**
 * Agent provider (credentials) and MCP server lifecycle routes.
 * Extracted from routes.ts #1874 — 8 routes: agent-provider/upsert, agent-provider/delete,
 * agent-mcp/create, agent-mcp/update, agent-mcp/delete, agent-mcp/assign,
 * agent-mcp/set-active, agent-mcp/detach.
 */
export function registerAgentProviderMcpRoutes({
  httpServer,
  db,
  loaderConfig,
}: {
  httpServer: { registerRoute(opts: object): void };
  db: Database;
  loaderConfig: AgentLoaderConfig;
}) {
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/upsert',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, upsertAgentProviderSchema);
        if (body.providerType === 'discord') {
          const deleteSignal = discordProviderDeleteSignalSchema.parse(body.credentials);

          if (deleteSignal.token.trim().length === 0) {
            await db
              .delete(agentProviders)
              .where(
                and(
                  eq(agentProviders.agentId, body.agentId),
                  eq(agentProviders.providerType, body.providerType),
                ),
              );

            await reloadAgentIfLoaded(db, loaderConfig, body.agentId);

            return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
          }
        }

        const credentials = parseProviderCredentials(body.providerType, body.credentials);
        const encryptedCredentials = encryptSecret(JSON.stringify(credentials));
        const existing = await db.query.agentProviders.findFirst({
          where: and(
            eq(agentProviders.agentId, body.agentId),
            eq(agentProviders.providerType, body.providerType),
          ),
        });

        if (existing) {
          await db
            .update(agentProviders)
            .set({
              encryptedCredentials,
            })
            .where(eq(agentProviders.id, existing.id));
        } else {
          await db.insert(agentProviders).values({
            id: createId(),
            agentId: body.agentId,
            providerType: body.providerType,
            encryptedCredentials,
            createdAt: Date.now(),
          });
        }

        await reloadAgentIfLoaded(db, loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-provider/delete',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentProviderSchema);

        await db
          .delete(agentProviders)
          .where(
            and(
              eq(agentProviders.agentId, body.agentId),
              eq(agentProviders.providerType, body.providerType),
            ),
          );

        await reloadAgentIfLoaded(db, loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, providerType: body.providerType });
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/create',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, createAgentMcpServerSchema);
        const serverId = createId();
        const configId = createId();

        await db.insert(mcpServerConfigs).values({
          id: serverId,
          name: body.name,
          description: normalizeOptionalText(body.description),
          transport: body.transport,
          command: body.transport === 'stdio' ? body.command : null,
          args: body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null,
          envVars: body.transport === 'stdio' ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object') : null,
          url: body.transport === 'http_streamable' ? body.url : null,
          headers: body.transport === 'http_streamable' ? normalizeJsonText(body.headersText, 'headersText', 'object') : null,
          version: 1,
          isActive: body.isActive ? 1 : 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await db.insert(agentMcpConfigs).values({
          id: configId,
          agentId: body.agentId,
          serverId,
          isActive: body.isActive ? 1 : 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await reloadAgentMcp(db, loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId, serverId }, 201);
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/update',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, updateAgentMcpServerSchema);
        await db
          .update(mcpServerConfigs)
          .set({
            name: body.name,
            description: normalizeOptionalText(body.description),
            transport: body.transport,
            command: body.transport === 'stdio' ? body.command : null,
            args: body.transport === 'stdio' ? normalizeJsonText(body.argsText, 'argsText', 'array') : null,
            envVars: body.transport === 'stdio' ? normalizeJsonText(body.envVarsText, 'envVarsText', 'object') : null,
            url: body.transport === 'http_streamable' ? body.url : null,
            headers: body.transport === 'http_streamable' ? normalizeJsonText(body.headersText, 'headersText', 'object') : null,
            isActive: body.isActive ? 1 : 0,
            updatedAt: Date.now(),
          })
          .where(eq(mcpServerConfigs.id, body.serverId));

        await db
          .update(agentMcpConfigs)
          .set({
            isActive: body.isActive ? 1 : 0,
            updatedAt: Date.now(),
          })
          .where(and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)));

        await reloadAgentMcp(db, loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId: body.configId, serverId: body.serverId });
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/delete',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteAgentMcpServerSchema);

        await db
          .delete(agentMcpConfigs)
          .where(and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)));

        const remainingLinks = await db.query.agentMcpConfigs.findMany({
          where: eq(agentMcpConfigs.serverId, body.serverId),
          columns: {
            id: true,
          },
        });

        if (remainingLinks.length === 0) {
          await db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, body.serverId));
        }

        await reloadAgentMcp(db, loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId: body.configId, serverId: body.serverId });
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/assign',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, assignAgentMcpServerSchema);
        const existing = await db.query.agentMcpConfigs.findFirst({
          where: and(
            eq(agentMcpConfigs.agentId, body.agentId),
            eq(agentMcpConfigs.serverId, body.serverId),
          ),
        });

        if (existing) {
          await db
            .update(agentMcpConfigs)
            .set({
              isActive: body.isActive ? 1 : 0,
              updatedAt: Date.now(),
            })
            .where(eq(agentMcpConfigs.id, existing.id));

          await reloadAgentMcp(db, loaderConfig, body.agentId);

          return jsonResponse({
            success: true,
            agentId: body.agentId,
            configId: existing.id,
            serverId: body.serverId,
          });
        }

        const configId = createId();

        await db.insert(agentMcpConfigs).values({
          id: configId,
          agentId: body.agentId,
          serverId: body.serverId,
          isActive: body.isActive ? 1 : 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await reloadAgentMcp(db, loaderConfig, body.agentId);

        return jsonResponse({ success: true, agentId: body.agentId, configId, serverId: body.serverId }, 201);
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/set-active',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, setAgentMcpServerActiveSchema);

        await db
          .update(agentMcpConfigs)
          .set({
            isActive: body.isActive ? 1 : 0,
            updatedAt: Date.now(),
          })
          .where(and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)));

        await reloadAgentMcp(db, loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          configId: body.configId,
          isActive: body.isActive,
        });
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });

  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent-mcp/detach',
    handler: async (request: HttpRequest) => {
      try {
        const body = parseJsonBody(request.bodyText, detachAgentMcpServerSchema);
        const config = await db.query.agentMcpConfigs.findFirst({
          where: and(eq(agentMcpConfigs.id, body.configId), eq(agentMcpConfigs.agentId, body.agentId)),
        });

        if (!config) {
          return jsonResponse({ error: `Agent MCP config not found: ${body.configId}` }, 404);
        }

        await db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, body.configId));
        await reloadAgentMcp(db, loaderConfig, body.agentId);

        return jsonResponse({
          success: true,
          agentId: body.agentId,
          configId: body.configId,
        });
      } catch (error) {
        return adminRouteError(error);
      }
    },
  });
}
