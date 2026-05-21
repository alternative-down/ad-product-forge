/**
 * System Admin Read Routes
 *
 * Refactored from createAdminReadModel (#1575).
 * Each route creates only the stores it needs.
 *
 * Stores are passed directly instead of via a read-model wrapper.
 */
import { forgeDebug } from '../debug';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';

import { mcpServerConfigs } from '../../../database/schema';

import type {Database} from '../../../database/schema';
import type { InternalAgentRegistry } from '../../../agents/internal-agent-registry';
import type { createForgeHttpServer } from '../../../http/server';
import { buildOauthState } from './oauth-state';
import { buildSystemHealthcheck } from './healthcheck';
import { listGlobalSkills } from '../../../agents/global-skills';
import { jsonResponse } from '../index';
import type { CapabilityStore } from '../../../capabilities/store';
import type { SystemIntegrationStore } from '../../../system-integrations/store';
import type { LlmSettingsStore } from '../../../llm/settings-store';
import type { LlmModelPriceStore } from '../../../llm/model-price-store';
import type { SystemSettingsStore } from '../../../system-settings/store';

interface SystemReadRoutesInput {
  httpServer: ReturnType<typeof createForgeHttpServer>;
  db: Database;
  registry: InternalAgentRegistry;
  workspaceBasePath: string;
  // Individual stores instead of a read-model wrapper
  capabilities: CapabilityStore;
  integrations: SystemIntegrationStore;
  llmSettings: LlmSettingsStore;
  llmModelPrices: LlmModelPriceStore;
  systemSettings: SystemSettingsStore;
  readModel: {
    getAgent: (agentId: string) => Promise<unknown>;
    getApplicationMigrations: () => Promise<unknown>;
  };
}
import { serializeError } from '../../../agents/agent-runner-error-formatting';

export function registerSystemReadRoutes(input: SystemReadRoutesInput) {
  const { httpServer, db, registry, workspaceBasePath,
         capabilities, integrations, llmSettings, llmModelPrices,
         systemSettings, readModel } = input;

  // GET /admin/system/healthcheck
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/healthcheck',
    handler: async () => {
      try {
        const healthcheck = await buildSystemHealthcheck(registry, readModel);
        return jsonResponse(healthcheck);
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/system/healthcheck', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },  });

  // GET /admin/system/integrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => {
      try {
        return jsonResponse(await integrations.listIntegrations());
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'System integrations route failed', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // GET /admin/system/settings
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/settings',
    handler: async () => {
      try {
        return jsonResponse(await systemSettings.getSettings());
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'System settings route failed', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // GET /admin/system/llm
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/llm',
    handler: async () => {
      try {
        const [profiles, defaults, prices] = await Promise.all([
          llmSettings.listProfiles(),
          llmSettings.getDefaults(),
          llmModelPrices.listPrices(),
        ]);
        return jsonResponse({ profiles, defaults, prices });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/system/llm', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },  });

  // GET /admin/system/mcp
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/mcp',
    handler: async () => {
      try {
        const servers = await db.select().from(mcpServerConfigs).all();
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
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/system/mcp', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },  });

  // GET /admin/system/migrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: async () => {
      try {
        return jsonResponse(await readModel.getApplicationMigrations());
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'System migrations route failed', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // GET /admin/system/skills
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/skills',
    handler: async () => {
      try {
        return jsonResponse(await listGlobalSkills(workspaceBasePath));
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'System skills route failed', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });

  // GET /admin/system/oauth
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/oauth',
    handler: async () => {
      try {
        return jsonResponse(await buildOauthState());
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'System oauth route failed', context: { error: String(serializeError(err)) } });
        return jsonResponse({ error: String(serializeError(err)) }, 500);
      }
    },
  });
}
