/**
 * System Admin Read Routes - Phase 4 of #719
 * GET routes extracted from routes.ts
 */

import { oauthStore } from '@forge-runtime/core';
import { mcpServerConfigs } from '../../../database/schema.js';
import { buildSystemHealthcheck } from './healthcheck.js';
import { listGlobalSkills } from '../../../agents/global-skills.js';
import { jsonResponse, fsPathExists } from '../helpers.js';
import type { InternalAgentRegistry } from '../../../agents/internal-agent-registry.js';
import type { createForgeHttpServer } from '../../../http/server.js';
import type { Database } from '../../../database/index.js';

interface SystemReadModel {
  listSystemIntegrations: () => Promise<unknown>;
  getSystemSettings: () => Promise<unknown>;
  getSystemLlm: () => Promise<unknown>;
  getApplicationMigrations: () => Promise<unknown>;
}

interface SystemReadRoutesInput {
  httpServer: ReturnType<typeof createForgeHttpServer>;
  db: Database;
  registry: InternalAgentRegistry;
  readModel: SystemReadModel;
  workspaceBasePath: string;
}

async function readOauthState() {
  const store = oauthStore;
  const state = await store.read();
  const result: Record<
    string,
    {
      sourcePath: string;
      sourcePresent: boolean;
      synced: boolean;
      hasRefresh: boolean;
      expiresAt: string | null;
      accountId: string | null;
    }
  > = {};

  for (const [providerId, credential] of Object.entries(state)) {
    const sourcePath = credential?.sourcePath ?? '';
    result[providerId] = {
      sourcePath,
      sourcePresent: sourcePath ? await fsPathExists(sourcePath) : false,
      synced: credential?.accountId != null,
      hasRefresh: Boolean(credential?.refreshToken),
      expiresAt: credential?.expiresAt ?? null,
      accountId: credential?.accountId ?? null,
    };
  }

  return result;
}

export function registerSystemReadRoutes(input: SystemReadRoutesInput) {
  const { httpServer, db, registry, readModel, workspaceBasePath } = input;

  // GET /admin/system/healthcheck
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/healthcheck',
    handler: async () => {
      const healthcheck = await buildSystemHealthcheck(registry, readModel);
      return jsonResponse(healthcheck);
    },
  });

  // GET /admin/system/integrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => jsonResponse(await readModel.listSystemIntegrations()),
  });

  // GET /admin/system/settings
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/settings',
    handler: async () => jsonResponse(await readModel.getSystemSettings()),
  });

  // GET /admin/system/llm
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm',
    handler: async () => jsonResponse(await readModel.getSystemLlm()),
  });

  // GET /admin/system/mcp
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/mcp',
    handler: async () => {
      const servers = await db.select().from(mcpServerConfigs);
      const formatted = servers
        .map((server) => ({
          serverId: server.id,
          name: server.name,
          description: server.description ?? undefined,
          transport: server.transport as 'stdio' | 'http_streamable',
          command: server.command ?? '',
          argsText: server.args ?? '',
          envVarsText: server.envVars ?? '',
          url: server.url ?? '',
          headersText: server.headers ?? '',
          isActive: server.isActive === 1,
          createdAt: server.createdAt,
          updatedAt: server.updatedAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return jsonResponse(formatted);
    },
  });

  // GET /admin/system/migrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: async () => jsonResponse(await readModel.getApplicationMigrations()),
  });

  // GET /admin/system/skills
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/skills',
    handler: async () => jsonResponse(await listGlobalSkills(workspaceBasePath)),
  });

  // GET /admin/system/oauth
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/oauth',
    handler: async () => jsonResponse(await readOauthState()),
  });
}
