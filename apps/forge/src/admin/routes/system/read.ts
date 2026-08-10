/**
 * System Admin Read Routes
 *
 * Refactored from createAdminReadModel (#1575).
 * Each route creates only the stores it needs.
 *
 * Stores are passed directly instead of via a read-model wrapper.
 */
import { forgeDebug } from '../debug';
import { errorMsg } from '../../../agents/error-formatting';

import { mcpServerConfigs } from '../../../database/schema';

import type { Database } from '../../../database/client';
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
function adminSystemReadDebug(message: string, error: unknown): void {
  forgeDebug({
    scope: 'admin',
    level: 'error',
    message,
    context: { error: errorMsg(error) },
  });
}


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

export function registerSystemReadRoutes(input: SystemReadRoutesInput) {
  const {
    httpServer,
    db,
    registry,
    workspaceBasePath,
    capabilities: _capabilities,
    integrations,
    llmSettings,
    llmModelPrices,
    systemSettings,
    readModel,
  } = input;

  // GET /admin/system/healthcheck
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/healthcheck',
    handler: async () => {
      try {
        const healthcheck = await buildSystemHealthcheck(registry, readModel);
        return jsonResponse(healthcheck);
      } catch (err) {
        adminSystemReadDebug(
          'Admin route failed: /admin/system/healthcheck',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

  // GET /admin/system/integrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/integrations',
    handler: async () => {
      try {
        return jsonResponse(await integrations.listIntegrations());
      } catch (err) {
        adminSystemReadDebug(
          'System integrations route failed',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
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
        adminSystemReadDebug(
          'System settings route failed',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
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
        adminSystemReadDebug(
          'Admin route failed: /admin/system/llm',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

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
        adminSystemReadDebug(
          'Admin route failed: /admin/system/mcp',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });

  // GET /admin/system/migrations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/system/migrations',
    handler: async () => {
      try {
        return jsonResponse(await readModel.getApplicationMigrations());
      } catch (err) {
        adminSystemReadDebug(
          'System migrations route failed',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
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
        adminSystemReadDebug(
          'System skills route failed',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
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
        adminSystemReadDebug(
          'System oauth route failed',
          errorMsg(err),
        );
        return jsonResponse({ error: errorMsg(err) }, 500);
      }
    },
  });
}
